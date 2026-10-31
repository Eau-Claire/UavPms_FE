import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import * as L from 'leaflet';
import { finalize } from 'rxjs';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { AssessmentTowerOption, RegionOption } from '../../../../models/pre-mission.models';
import { MissionTargetSelection } from '../../../missions/data-access/mission-target-selection';
import { generateGuid, isValidGuid, PreMissionApi } from '../../data-access/pre-mission-api';

function formatDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dateWindowValidator(control: AbstractControl): ValidationErrors | null {
  const start = control.get('plannedStart')?.value;
  const end = control.get('plannedEnd')?.value;
  if (!start || !end) return null;
  return new Date(end) <= new Date(start) ? { endBeforeStart: true } : null;
}

function notInPastValidator(control: AbstractControl): ValidationErrors | null {
  const start = control.get('plannedStart')?.value;
  if (!start) return null;
  // Cho phép lệch đồng hồ 15 phút.
  return new Date(start).getTime() < Date.now() - 15 * 60 * 1000 ? { startInPast: true } : null;
}

/**
 * Lập hồ sơ đánh giá tiền khả thi (MF01): chọn khu vực, các cột điện cần kiểm tra và khung giờ bay dự kiến.
 * Gửi `POST /pre-mission-assessments` với `{ regionId, plannedStart, plannedEnd, towerIds }`.
 */
@Component({
  selector: 'app-assessment-create',
  imports: [ReactiveFormsModule, RouterLink, NzIconModule, DatePipe],
  templateUrl: './assessment-create.html',
  styleUrl: './assessment-create.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssessmentCreate implements AfterViewInit, OnDestroy {
  private readonly api = inject(PreMissionApi);
  private readonly targetSelection = inject(MissionTargetSelection);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  private readonly mapContainer = viewChild<ElementRef<HTMLDivElement>>('createMapContainer');
  private map: L.Map | null = null;
  private currentTileLayer: L.TileLayer | null = null;
  private markersLayer = L.layerGroup();
  private polylineLayer = L.layerGroup();
  private resizeObserver: ResizeObserver | null = null;

  protected readonly currentMapType = signal<'google-streets' | 'google-hybrid' | 'carto'>('google-streets');
  protected readonly draggedIndex = signal<number | null>(null);

  protected readonly busy = signal(false);
  protected readonly loadingTowers = signal(false);
  protected readonly error = signal('');

  protected readonly regions = signal<readonly RegionOption[]>([]);
  protected readonly towers = signal<readonly AssessmentTowerOption[]>([]);
  protected readonly selectedTowerIds = signal<readonly string[]>([]);
  protected readonly towerSearch = signal('');

  /** Khóa idempotency cho một lần mở biểu mẫu, tránh tạo trùng hồ sơ khi gửi lại. */
  private readonly idempotencyKey = generateGuid();

  protected readonly form = this.fb.nonNullable.group(
    {
      regionId: ['', [Validators.required]],
      plannedStart: [formatDatetimeLocal(new Date(Date.now() + 60 * 60 * 1000)), [Validators.required]],
      plannedEnd: [formatDatetimeLocal(new Date(Date.now() + 4 * 60 * 60 * 1000)), [Validators.required]],
    },
    { validators: [dateWindowValidator, notInPastValidator] },
  );

  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  protected readonly selectedRegion = computed(() => {
    const id = this.formValue().regionId;
    return this.regions().find((r) => r.id === id) ?? null;
  });

  protected readonly plannedStartValue = computed(() => this.formValue().plannedStart ?? '');
  protected readonly plannedEndValue = computed(() => this.formValue().plannedEnd ?? '');

  protected readonly filteredTowers = computed(() => {
    const q = this.towerSearch().trim().toLowerCase();
    const list = this.towers();
    if (!q) return list;
    return list.filter((t) => t.towerCode.toLowerCase().includes(q) || (t.address ?? '').toLowerCase().includes(q));
  });

  protected readonly selectedTowers = computed(() => {
    const byId = new Map(this.towers().map((t) => [t.id, t]));
    return this.selectedTowerIds()
      .map((id) => byId.get(id))
      .filter((t): t is AssessmentTowerOption => !!t);
  });

  constructor() {
    this.api
      .getRegions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => this.regions.set(list),
        error: () => this.error.set('Không thể tải danh sách khu vực.'),
      });

    const sourceId = this.route.snapshot.queryParamMap.get('assessmentId');
    if (sourceId && isValidGuid(sourceId)) {
      this.prefillFromAssessment(sourceId);
    } else {
      // Cột đã chọn trên bản đồ GIS: tự chọn khu vực của cột đầu tiên.
      const gisRegionId = this.targetSelection.selected().find((t) => t.regionId)?.regionId;
      if (gisRegionId) {
        this.form.controls.regionId.setValue(gisRegionId);
        this.loadTowers(gisRegionId);
      }
    }
  }

  ngAfterViewInit(): void {
    this.initMap();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.map) {
      try {
        this.map.remove();
      } catch {}
      this.map = null;
      this.currentTileLayer = null;
    }
  }

  protected onRegionSelect(event: Event): void {
    const regionId = (event.target as HTMLSelectElement).value;
    this.form.controls.regionId.setValue(regionId);
    this.form.controls.regionId.markAsTouched();
    this.selectedTowerIds.set([]);
    this.loadTowers(regionId);
  }

  protected onTowerSearch(event: Event): void {
    this.towerSearch.set((event.target as HTMLInputElement).value);
  }

  protected isTowerSelected(id: string): boolean {
    return this.selectedTowerIds().includes(id);
  }

  protected getTowerSequence(id: string): number | null {
    const idx = this.selectedTowerIds().indexOf(id);
    return idx >= 0 ? idx + 1 : null;
  }

  protected toggleTower(id: string): void {
    this.selectedTowerIds.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    this.renderMap(false);
  }

  protected selectAllFiltered(): void {
    const current = new Set(this.selectedTowerIds());
    const added = this.filteredTowers()
      .map((t) => t.id)
      .filter((id) => !current.has(id));
    this.selectedTowerIds.set([...this.selectedTowerIds(), ...added]);
    this.renderMap(true);
  }

  protected clearSelection(): void {
    this.selectedTowerIds.set([]);
    this.renderMap(false);
  }

  protected moveTower(index: number, direction: 'up' | 'down'): void {
    const current = [...this.selectedTowerIds()];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= current.length) return;
    const temp = current[index];
    current[index] = current[targetIndex];
    current[targetIndex] = temp;
    this.selectedTowerIds.set(current);
    this.renderMap(false);
  }

  protected removeSelectedTower(id: string): void {
    this.selectedTowerIds.update((ids) => ids.filter((x) => x !== id));
    this.renderMap(false);
  }

  protected reverseSequence(): void {
    const current = [...this.selectedTowerIds()];
    current.reverse();
    this.selectedTowerIds.set(current);
    this.renderMap(false);
  }

  protected onDragStart(index: number, event: DragEvent): void {
    this.draggedIndex.set(index);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    }
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  protected onDrop(targetIndex: number, event: DragEvent): void {
    event.preventDefault();
    const sourceIndex = this.draggedIndex();
    this.draggedIndex.set(null);
    if (sourceIndex === null || sourceIndex === targetIndex) return;
    const current = [...this.selectedTowerIds()];
    const [removed] = current.splice(sourceIndex, 1);
    current.splice(targetIndex, 0, removed);
    this.selectedTowerIds.set(current);
    this.renderMap(false);
  }

  protected submit(): void {
    this.error.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const towerIds = [...this.selectedTowerIds()];
    if (!towerIds.length) {
      this.error.set('Vui lòng chọn ít nhất một cột điện trong phạm vi đánh giá.');
      return;
    }
    const raw = this.form.getRawValue();
    this.busy.set(true);
    this.api
      .create({
        regionId: raw.regionId,
        plannedStart: raw.plannedStart,
        plannedEnd: raw.plannedEnd,
        towerIds,
        idempotencyKey: this.idempotencyKey,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (created) => {
          this.targetSelection.clear();
          void this.router.navigate(['/pre-mission', created.id]);
        },
        error: (err: unknown) =>
          this.error.set(
            extractErrorMessage(err, 'Không thể tạo đánh giá tiền nhiệm vụ. Vui lòng kiểm tra lại phạm vi và thời gian.'),
          ),
      });
  }

  protected setMapType(type: 'google-streets' | 'google-hybrid' | 'carto'): void {
    this.currentMapType.set(type);
    if (!this.map) return;
    if (this.currentTileLayer) {
      this.map.removeLayer(this.currentTileLayer);
      this.currentTileLayer = null;
    }

    let tileUrl = 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
    let subdomains = ['mt0', 'mt1', 'mt2', 'mt3'];
    let maxZoom = 20;
    let attribution = '© Google Maps | UAV-PMS GIS';

    if (type === 'google-hybrid') {
      tileUrl = 'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
    } else if (type === 'carto') {
      tileUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
      subdomains = ['a', 'b', 'c', 'd'];
      maxZoom = 19;
      attribution = '© CARTO · OpenStreetMap | UAV-PMS';
    }

    const tileLayer = L.tileLayer(tileUrl, { maxZoom, subdomains, attribution, keepBuffer: 6 });
    let hasFallenBack = false;
    tileLayer.on('tileerror', () => {
      if (!hasFallenBack) {
        hasFallenBack = true;
        // Fallback to CartoDB Voyager which works reliably in all networks
        tileLayer.setUrl('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png');
      }
    });
    this.currentTileLayer = tileLayer;
    this.currentTileLayer.addTo(this.map);
  }

  protected refreshMap(): void {
    if (this.map) {
      setTimeout(() => {
        this.map?.invalidateSize();
        this.fitMapToBounds();
      }, 50);
    } else {
      this.initMap();
    }
  }

  private fitMapToBounds(): void {
    if (!this.map) return;
    const selectedIds = this.selectedTowerIds();
    const allTowers = this.towers();
    if (!allTowers.length) {
      this.map.setView([16.0, 107.5], 6);
      return;
    }

    const byId = new Map(allTowers.map((t) => [t.id, t]));
    const targetTowers = selectedIds.length
      ? selectedIds.map((id) => byId.get(id)).filter((t): t is AssessmentTowerOption => !!t)
      : allTowers;

    const points: [number, number][] = targetTowers
      .filter((t) => Number.isFinite(t.latitude) && Number.isFinite(t.longitude) && Math.abs(t.latitude) > 0.1)
      .map((t) => [t.latitude, t.longitude] as [number, number]);

    if (points.length) {
      this.map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 16 });
    } else {
      this.map.setView([16.0, 107.5], 6);
    }
  }

  private loadTowers(regionId: string, preselect: readonly string[] = []): void {
    this.towers.set([]);
    if (!regionId) {
      this.renderMap(true);
      return;
    }
    this.loadingTowers.set(true);
    this.api
      .getRegionTowers(regionId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingTowers.set(false)),
      )
      .subscribe({
        next: (list) => {
          this.towers.set(list);
          const available = new Set(list.map((t) => t.id));
          // Cột đã chọn trên bản đồ GIS (nếu có) được chọn sẵn.
          const fromGis = this.targetSelection.selected().map((t) => t.towerId);
          const wanted = [...preselect, ...fromGis].filter((id, i, all) => available.has(id) && all.indexOf(id) === i);
          if (wanted.length) this.selectedTowerIds.set(wanted);
          setTimeout(() => {
            this.map?.invalidateSize();
            this.renderMap(true);
          }, 100);
        },
        error: () => this.error.set('Không thể tải danh sách cột điện của khu vực.'),
      });
  }

  /** Tạo lại hồ sơ từ một hồ sơ cũ (ví dụ hồ sơ đã hết hạn): kế thừa khu vực và danh sách cột. */
  private prefillFromAssessment(id: string): void {
    this.api
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (a) => {
          this.form.controls.regionId.setValue(a.regionId);
          this.loadTowers(
            a.regionId,
            a.towers.map((t) => t.towerId),
          );
        },
        error: () => this.error.set('Không thể tải hồ sơ đánh giá nguồn để sao chép phạm vi.'),
      });
  }

  private initMap(): void {
    const container =
      this.mapContainer()?.nativeElement ??
      (document.getElementById('createScopeMapContainer') as HTMLDivElement | null);
    if (!container) return;

    if (this.map) {
      try {
        this.map.remove();
      } catch {}
      this.map = null;
    }

    const el = container as unknown as { _leaflet_id?: number | null };
    if (el._leaflet_id) {
      el._leaflet_id = null;
    }

    this.map = L.map(container, {
      center: [16.0, 107.5],
      zoom: 6,
      zoomControl: true,
    });
    this.polylineLayer = L.layerGroup().addTo(this.map);
    this.markersLayer = L.layerGroup().addTo(this.map);
    this.setMapType(this.currentMapType());

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.map?.invalidateSize();
      });
      this.resizeObserver.observe(container);
    }

    setTimeout(() => {
      this.map?.invalidateSize();
      this.renderMap(true);
    }, 100);

    setTimeout(() => {
      this.map?.invalidateSize();
    }, 300);
  }

  private renderMap(fit: boolean = false): void {
    if (!this.map) {
      this.initMap();
      return;
    }
    this.markersLayer.clearLayers();
    this.polylineLayer.clearLayers();

    const selectedIds = this.selectedTowerIds();
    const selectedSet = new Set(selectedIds);
    const allTowers = this.towers();

    // Determine region anchor coordinates for towers with missing coordinates
    let baseLat = 16.0544;
    let baseLng = 108.2022;
    const regionName = (this.selectedRegion()?.name || '').toLowerCase();
    if (regionName.includes('bắc') || regionName.includes('hà nội')) {
      baseLat = 21.0285;
      baseLng = 105.8542;
    } else if (regionName.includes('nam') || regionName.includes('hồ chí minh')) {
      baseLat = 10.8231;
      baseLng = 106.6297;
    } else if (regionName.includes('trung') || regionName.includes('đà nẵng')) {
      baseLat = 16.0544;
      baseLng = 108.2022;
    }

    const firstValid = allTowers.find(
      (t) => Number.isFinite(t.latitude) && Number.isFinite(t.longitude) && Math.abs(t.latitude) > 0.1,
    );
    if (firstValid) {
      baseLat = firstValid.latitude;
      baseLng = firstValid.longitude;
    }

    // Build coordinates map
    const towerCoords = new Map<string, [number, number]>();
    allTowers.forEach((t, idx) => {
      const hasCoords = Number.isFinite(t.latitude) && Number.isFinite(t.longitude) && Math.abs(t.latitude) > 0.1;
      const lat = hasCoords ? t.latitude : baseLat + idx * 0.0035;
      const lng = hasCoords ? t.longitude : baseLng + idx * 0.0055;
      towerCoords.set(t.id, [lat, lng]);
    });

    // Draw route polyline in sequence
    const orderedCoords: [number, number][] = [];
    for (const id of selectedIds) {
      const coords = towerCoords.get(id);
      if (coords) orderedCoords.push(coords);
    }

    if (orderedCoords.length > 1) {
      const line = L.polyline(orderedCoords, {
        color: '#0052cc',
        weight: 3.5,
        opacity: 0.85,
        dashArray: '6, 6',
      });
      this.polylineLayer.addLayer(line);
    }

    // Draw markers
    for (const t of allTowers) {
      const coords = towerCoords.get(t.id);
      if (!coords) continue;
      const isSelected = selectedSet.has(t.id);

      if (isSelected) {
        const seq = selectedIds.indexOf(t.id) + 1;
        const marker = L.marker(coords, {
          icon: L.divIcon({
            className: 'tower-pin-wrapper',
            html: `<div class="evn-tower-pin"><span class="pin-number">${seq}</span></div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          }),
        });
        marker.bindTooltip(`Thứ tự #${seq}: ${t.towerCode}${t.poleType ? ' · ' + t.poleType : ''}`, {
          direction: 'top',
          className: 'evn-map-tooltip',
          offset: [0, -12],
        });
        marker.on('click', () => this.toggleTower(t.id));
        this.markersLayer.addLayer(marker);
      } else {
        const marker = L.circleMarker(coords, {
          radius: 6,
          fillColor: '#94a3b8',
          color: '#475569',
          weight: 1.5,
          fillOpacity: 0.85,
        });
        marker.bindTooltip(`${t.towerCode}${t.poleType ? ' · ' + t.poleType : ''}`, {
          direction: 'top',
          className: 'evn-map-tooltip',
          offset: [0, -6],
        });
        marker.on('click', () => this.toggleTower(t.id));
        this.markersLayer.addLayer(marker);
      }
    }

    if (fit) {
      this.fitMapToBounds();
    }
  }
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof HttpErrorResponse)) return fallback;
  const body = err.error;
  if (typeof body === 'string' && body.trim()) return body;
  if (body && typeof body === 'object') {
    const e = body as Record<string, unknown>;
    for (const key of ['message', 'detail', 'title']) {
      const value = e[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
  }
  return fallback;
}
