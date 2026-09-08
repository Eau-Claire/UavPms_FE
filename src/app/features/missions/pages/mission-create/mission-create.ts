import { HttpErrorResponse } from '@angular/common/http';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import * as L from 'leaflet';
import { catchError, finalize, of } from 'rxjs';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { DatePipe } from '@angular/common';
import { Auth } from '../../../../core/auth/auth';
import { GeoJsonPolygon, SelectableAsset } from '../../../../models/assets.models';
import { DroneDto } from '../../../../models/drones.models';
import { UserRecord } from '../../../../models/users.models';
import { GisApi, GisDataSnapshot, GisTower, GisTransmissionLine } from '../../../gis/data-access/gis-api';
import { UsersApi } from '../../../users/data-access/users-api';
import { DronesApi } from '../../data-access/drones-api';
import { MissionsApi } from '../../data-access/missions-api';
import { MissionTargetSelection } from '../../data-access/mission-target-selection';

export type DrawingTool = 'select' | 'rectangle' | 'polygon';

@Component({
  selector: 'app-mission-create',
  imports: [ReactiveFormsModule, FormsModule, RouterLink, NzIconModule, DatePipe],
  templateUrl: './mission-create.html',
  styleUrl: './mission-create.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionCreate implements OnInit, AfterViewInit, OnDestroy {
  private readonly api = inject(MissionsApi);
  private readonly gisApi = inject(GisApi);
  private readonly dronesApi = inject(DronesApi);
  private readonly usersApi = inject(UsersApi);
  private readonly auth = inject(Auth);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly targetSelection = inject(MissionTargetSelection);

  private readonly mapContainer = viewChild<ElementRef<HTMLDivElement>>('mapContainer');
  private readonly reviewMapContainer = viewChild<ElementRef<HTMLDivElement>>('reviewMapContainer');

  // Wizard Steps: 1..6
  protected readonly currentStep = signal<number>(1);

  protected readonly busy = signal(false);
  protected readonly usersLoading = signal(false);
  protected readonly dronesLoading = signal(false);
  protected readonly gisLoading = signal(false);
  protected readonly spatialLoading = signal(false);
  protected readonly spatialMessage = signal('');
  protected readonly error = signal('');

  protected readonly users = signal<readonly UserRecord[]>([]);
  protected readonly drones = signal<readonly DroneDto[]>([]);
  protected readonly towers = signal<readonly GisTower[]>([]);
  protected readonly lines = signal<readonly GisTransmissionLine[]>([]);
  protected readonly currentUser = this.auth.user;

  // Drawing mode on Map
  protected readonly activeTool = signal<DrawingTool>('select');
  protected readonly searchQuery = signal('');

  // Leaflet Map state for Step 2
  private map: L.Map | null = null;
  private reviewMap: L.Map | null = null;
  private towersLayer = L.layerGroup();
  private linesLayer = L.layerGroup();
  private targetMarkersLayer = L.layerGroup();
  private userLocationLayer = L.layerGroup();
  private drawPreviewLayer = L.layerGroup();
  private reviewTargetsLayer = L.layerGroup();
  private reviewPolyline: L.Polyline | null = null;

  // Live drawing tracking
  private rectStartLatLng: L.LatLng | null = null;
  private tempRect: L.Rectangle | null = null;
  private isRectDragging = false;
  private polygonPoints: L.LatLng[] = [];
  private tempPolyline: L.Polyline | null = null;
  private tempRubberband: L.Polyline | null = null;
  private polygonMarkers: L.Marker[] = [];

  // Reactive Form
  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    scheduledAt: ['', Validators.required],
    inspectorId: ['', Validators.required],
    droneId: ['', Validators.required],
    description: [''],
    enableRgb: [true],
    enableThermal: [false],
    enableCorona: [false],
    checklistNotes: [''],
  });

  // Client-side instant search for assets
  protected readonly searchResults = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return [];
    return this.towers()
      .filter((t) => t.towerCode.toLowerCase().includes(q) || (t.transmissionLineName && t.transmissionLineName.toLowerCase().includes(q)))
      .slice(0, 10);
  });

  // Selected Drone details
  protected readonly selectedDrone = computed(() => {
    const id = this.form.controls.droneId.value;
    return this.drones().find((d) => d.id === id || d.droneCode === id);
  });

  // Selected Inspector details
  protected readonly selectedInspector = computed(() => {
    const id = this.form.controls.inspectorId.value;
    return this.users().find((u) => u.id === id);
  });

  constructor() {
    const currentUserId = this.currentUser()?.id ?? '';
    if (currentUserId) this.form.controls.inspectorId.setValue(currentUserId);
  }

  ngOnInit(): void {
    this.loadUsers();
    this.loadDrones();
    this.loadGisData();
  }

  ngAfterViewInit(): void {
    // Initialized when user arrives at Step 2
    if (this.currentStep() === 2) {
      this.initStep2Map();
    }
  }

  ngOnDestroy(): void {
    this.cleanupMaps();
  }

  // Stepper navigation
  protected goToStep(step: number): void {
    if (step < 1 || step > 6) return;

    // Validation before moving forward from step 1
    if (this.currentStep() === 1 && step > 1) {
      if (this.form.controls.name.invalid || this.form.controls.scheduledAt.invalid) {
        this.form.controls.name.markAsTouched();
        this.form.controls.scheduledAt.markAsTouched();
        this.error.set('Vui lòng điền đầy đủ Tên nhiệm vụ và Lịch thực hiện.');
        return;
      }
    }

    // Validation before moving forward from step 2
    if (this.currentStep() === 2 && step > 2) {
      if (this.targetSelection.count() === 0) {
        this.error.set('Vui lòng chọn ít nhất một tài sản mục tiêu trên bản đồ GIS.');
        return;
      }
    }

    // Validation before moving to final step
    if (this.currentStep() === 5 && step > 5) {
      if (this.form.controls.inspectorId.invalid || this.form.controls.droneId.invalid) {
        this.form.controls.inspectorId.markAsTouched();
        this.form.controls.droneId.markAsTouched();
        this.error.set('Vui lòng phân công Thanh tra viên và Phương tiện UAV.');
        return;
      }
    }

    this.error.set('');
    this.currentStep.set(step);

    if (step === 2) {
      setTimeout(() => this.initStep2Map(), 50);
    } else if (step === 6) {
      setTimeout(() => this.initReviewMap(), 50);
    }
  }

  // --- MAP LOGIC (Step 2) ---
  private initStep2Map(): void {
    const container = this.mapContainer()?.nativeElement;
    if (!container) return;

    if (this.map) {
      this.map.invalidateSize();
      this.renderTargetMarkers();
      return;
    }

    const vietnamBounds = L.latLngBounds([8.15, 102.0], [23.5, 110.0]);
    this.map = L.map(container, {
      center: [16.2, 106.2],
      zoom: 6,
      zoomControl: true,
      maxBounds: vietnamBounds,
    });

    L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: '© Google Maps | UAV-PMS GIS',
    }).addTo(this.map);

    this.linesLayer.addTo(this.map);
    this.towersLayer.addTo(this.map);
    this.targetMarkersLayer.addTo(this.map);
    this.userLocationLayer.addTo(this.map);
    this.drawPreviewLayer.addTo(this.map);

    this.renderTransmissionLines();
    this.renderTowers();
    this.renderTargetMarkers();

    // Map drawing event listeners
    this.map.on('mousedown', (e: L.LeafletMouseEvent) => this.onMapMouseDown(e));
    this.map.on('mousemove', (e: L.LeafletMouseEvent) => this.onMapMouseMove(e));
    this.map.on('mouseup', (e: L.LeafletMouseEvent) => this.onMapMouseUp(e));
    this.map.on('click', (e: L.LeafletMouseEvent) => this.onMapClick(e));
    this.map.on('dblclick', (e: L.LeafletMouseEvent) => this.onMapDblClick(e));

    // Invalidate size once visible and locate
    setTimeout(() => {
      this.map?.invalidateSize();
      if (!this.targetSelection.count()) {
        this.locateUserLocation();
      } else {
        this.autoFitMap();
      }
    }, 200);
  }

  // Tool Switching
  protected setTool(tool: DrawingTool): void {
    this.clearDrawings();
    this.activeTool.set(tool);
    if (!this.map) return;

    if (tool === 'rectangle') {
      this.map.dragging.disable();
    } else if (tool === 'polygon') {
      this.map.dragging.enable();
      this.map.doubleClickZoom.disable();
    } else {
      this.map.dragging.enable();
      this.map.doubleClickZoom.enable();
    }
  }

  protected clearDrawings(): void {
    this.drawPreviewLayer.clearLayers();
    this.tempRect = null;
    this.rectStartLatLng = null;
    this.isRectDragging = false;
    this.polygonPoints = [];
    this.tempPolyline = null;
    this.tempRubberband = null;
    this.polygonMarkers = [];
    this.spatialMessage.set('');
    if (this.map) {
      this.map.dragging.enable();
      this.map.doubleClickZoom.enable();
    }
  }

  protected clearAllTargets(): void {
    this.targetSelection.clear();
    this.clearDrawings();
    this.renderTargetMarkers();
    this.renderTowers();
  }

  // --- DRAWING HANDLERS ---
  private onMapMouseDown(e: L.LeafletMouseEvent): void {
    if (this.activeTool() !== 'rectangle' || !this.map) return;
    this.isRectDragging = true;
    this.rectStartLatLng = e.latlng;

    if (this.tempRect) {
      this.tempRect.remove();
    }
    const bounds = L.latLngBounds(e.latlng, e.latlng);
    this.tempRect = L.rectangle(bounds, {
      color: '#0284c7',
      weight: 2,
      fillColor: '#38bdf8',
      fillOpacity: 0.2,
      dashArray: '5, 5',
    }).addTo(this.drawPreviewLayer);
  }

  private onMapMouseMove(e: L.LeafletMouseEvent): void {
    if (!this.map) return;

    // Rectangle drag
    if (this.activeTool() === 'rectangle' && this.isRectDragging && this.rectStartLatLng && this.tempRect) {
      this.tempRect.setBounds(L.latLngBounds(this.rectStartLatLng, e.latlng));
      return;
    }

    // Polygon rubberband
    if (this.activeTool() === 'polygon' && this.polygonPoints.length > 0) {
      const lastPoint = this.polygonPoints[this.polygonPoints.length - 1];
      if (!this.tempRubberband) {
        this.tempRubberband = L.polyline([lastPoint, e.latlng], {
          color: '#0284c7',
          weight: 2,
          dashArray: '4, 4',
        }).addTo(this.drawPreviewLayer);
      } else {
        this.tempRubberband.setLatLngs([lastPoint, e.latlng]);
      }
    }
  }

  private onMapMouseUp(e: L.LeafletMouseEvent): void {
    if (this.activeTool() !== 'rectangle' || !this.isRectDragging || !this.rectStartLatLng || !this.map) return;
    this.isRectDragging = false;

    const bounds = L.latLngBounds(this.rectStartLatLng, e.latlng);
    const nw = bounds.getNorthWest();
    const se = bounds.getSouthEast();

    // Prevent zero-size clicks
    if (Math.abs(nw.lat - se.lat) < 0.0001 && Math.abs(nw.lng - se.lng) < 0.0001) {
      this.clearDrawings();
      return;
    }

    // 5-point closed GeoJSON Polygon
    const west = Math.min(nw.lng, se.lng);
    const east = Math.max(nw.lng, se.lng);
    const south = Math.min(nw.lat, se.lat);
    const north = Math.max(nw.lat, se.lat);

    const geometry: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
    };

    this.executeSpatialQuery(geometry);
    this.setTool('select');
  }

  private onMapClick(e: L.LeafletMouseEvent): void {
    if (this.activeTool() !== 'polygon' || !this.map) return;

    // Check if clicked close to start point to complete
    if (this.polygonPoints.length >= 3) {
      const first = this.polygonPoints[0];
      const dist = this.map.latLngToLayerPoint(first).distanceTo(this.map.latLngToLayerPoint(e.latlng));
      if (dist < 15) {
        this.completePolygon();
        return;
      }
    }

    this.polygonPoints.push(e.latlng);

    // Marker at vertex
    const marker = L.circleMarker(e.latlng, {
      radius: 5,
      color: '#0284c7',
      fillColor: '#ffffff',
      fillOpacity: 1,
    }).addTo(this.drawPreviewLayer);
    this.polygonMarkers.push(marker as unknown as L.Marker);

    if (this.tempPolyline) {
      this.tempPolyline.setLatLngs(this.polygonPoints);
    } else {
      this.tempPolyline = L.polyline(this.polygonPoints, {
        color: '#0284c7',
        weight: 2,
      }).addTo(this.drawPreviewLayer);
    }
  }

  private onMapDblClick(e: L.LeafletMouseEvent): void {
    if (this.activeTool() !== 'polygon') return;
    L.DomEvent.stopPropagation(e);
    if (this.polygonPoints.length >= 3) {
      this.completePolygon();
    }
  }

  private completePolygon(): void {
    if (this.polygonPoints.length < 3) return;

    // Close ring
    const coords: [number, number][] = this.polygonPoints.map((p) => [p.lng, p.lat]);
    coords.push([this.polygonPoints[0].lng, this.polygonPoints[0].lat]);

    const geometry: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [coords],
    };

    // Draw final closed polygon
    L.polygon(this.polygonPoints, {
      color: '#0284c7',
      fillColor: '#38bdf8',
      fillOpacity: 0.2,
      weight: 2,
    }).addTo(this.drawPreviewLayer);

    this.executeSpatialQuery(geometry);
    this.setTool('select');
  }

  private executeSpatialQuery(geometry: GeoJsonPolygon): void {
    this.spatialLoading.set(true);
    this.spatialMessage.set('Đang tìm kiếm tài sản trong vùng chọn...');

    this.gisApi.spatialQuery({ geometry })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.spatialLoading.set(false)),
      )
      .subscribe({
        next: (assets) => {
          if (!assets.length) {
            // Fallback: client-side point in polygon check over loaded towers
            const clientAssets = this.findTowersInPolygon(geometry);
            if (clientAssets.length) {
              this.targetSelection.addMany(clientAssets);
              this.spatialMessage.set(`Đã chọn ${clientAssets.length} cột điện trong vùng.`);
            } else {
              this.spatialMessage.set('Không tìm thấy cột điện nào trong khu vực này. Hãy thử chọn vùng khác.');
            }
          } else {
            this.targetSelection.addMany(assets);
            this.mergeAssetsIntoTowers(assets);
            this.spatialMessage.set(`Đã chọn ${assets.length} cột điện trong vùng.`);
          }
          this.renderTargetMarkers();
          this.renderTowers();
        },
        error: () => {
          // Client-side fallback if spatial endpoint fails
          const clientAssets = this.findTowersInPolygon(geometry);
          if (clientAssets.length) {
            this.targetSelection.addMany(clientAssets);
            this.spatialMessage.set(`Đã chọn ${clientAssets.length} cột điện trong vùng.`);
          } else {
            this.spatialMessage.set('Không thể truy vấn tài sản. Vui lòng thử lại.');
          }
          this.renderTargetMarkers();
          this.renderTowers();
        },
      });
  }

  private findTowersInPolygon(geometry: GeoJsonPolygon): readonly SelectableAsset[] {
    const ring = geometry.coordinates[0];
    if (!ring || ring.length < 4) return [];

    return this.towers()
      .filter((tower) => this.isPointInside(tower.longitude, tower.latitude, ring))
      .map((t) => ({
        assetId: t.id,
        code: t.towerCode,
        name: t.transmissionLineName || t.towerCode,
        latitude: t.latitude,
        longitude: t.longitude,
        status: 'Operational',
      }));
  }

  private isPointInside(x: number, y: number, ring: readonly (readonly [number, number])[]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Map layer rendering
  private renderTransmissionLines(): void {
    this.linesLayer.clearLayers();
    this.lines().forEach((line) => {
      if (line.coordinates && line.coordinates.length > 1) {
        L.polyline(line.coordinates as [number, number][], {
          color: '#0284c7',
          weight: 3,
          opacity: 0.6,
          dashArray: '6, 6',
        }).bindTooltip(line.lineName || line.lineCode).addTo(this.linesLayer);
      }
    });
  }

  private renderTowers(): void {
    this.towersLayer.clearLayers();
    const selectedIds = new Set(this.targetSelection.selected().map((a) => a.assetId));

    this.towers().forEach((tower) => {
      // Selected ones are rendered by renderTargetMarkers with priority
      if (selectedIds.has(tower.id)) return;

      const icon = L.divIcon({
        className: 'marker-tower-container',
        html: `
          <div class="gis-pylon-marker unselected" title="Cột điện: ${tower.towerCode}">
            <div class="pylon-box">
              <svg viewBox="0 0 24 24" class="pylon-icon" fill="currentColor">
                <path d="M12 2L8 22h2.2l.9-4.5h1.8l.9 4.5H16L12 2zm0 4.2l1.1 5.3h-2.2L12 6.2zM5.5 8.5h13v1.5h-2.3l-.5 2.5h2.8v1.5h-3.1l-.5 2.5h2.6v1.5H14l-.4 2h-3.2l-.4-2H6.5v-1.5h2.6l-.5-2.5H5.5V14h2.8l-.5-2.5H5.5v-1.5h2.3l-.5-2.5H5.5V8.5z"/>
              </svg>
            </div>
            <span class="pylon-tag">${tower.towerCode}</span>
          </div>
        `,
        iconSize: [36, 44],
        iconAnchor: [18, 22],
      });

      const marker = L.marker([tower.latitude, tower.longitude], { icon });

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        this.toggleTower(tower);
      });

      marker.bindTooltip(`
        <div class="pylon-tooltip">
          <strong>⚡ Cột điện: ${tower.towerCode}</strong><br>
          <small>${tower.transmissionLineName || 'Lưới điện khu vực'}</small><br>
          <span style="color: #0284c7; font-weight: 700;">👉 Nhấp để chọn vào nhiệm vụ</span>
        </div>
      `, { direction: 'top', offset: [0, -18] });

      this.towersLayer.addLayer(marker);
    });
  }

  private renderTargetMarkers(): void {
    this.targetMarkersLayer.clearLayers();
    const targets = this.targetSelection.selected();

    targets.forEach((target, index) => {
      const icon = L.divIcon({
        className: 'marker-tower-container',
        html: `
          <div class="gis-pylon-marker selected" title="Đã chọn: #${index + 1} - ${target.code}">
            <div class="pylon-box selected">
              <svg viewBox="0 0 24 24" class="pylon-icon" fill="currentColor">
                <path d="M12 2L8 22h2.2l.9-4.5h1.8l.9 4.5H16L12 2zm0 4.2l1.1 5.3h-2.2L12 6.2zM5.5 8.5h13v1.5h-2.3l-.5 2.5h2.8v1.5h-3.1l-.5 2.5h2.6v1.5H14l-.4 2h-3.2l-.4-2H6.5v-1.5h2.6l-.5-2.5H5.5V14h2.8l-.5-2.5H5.5v-1.5h2.3l-.5-2.5H5.5V8.5z"/>
              </svg>
              <div class="pylon-seq-badge">#${index + 1}</div>
            </div>
            <span class="pylon-tag selected">✓ #${index + 1} ${target.code}</span>
          </div>
        `,
        iconSize: [42, 50],
        iconAnchor: [21, 25],
      });

      const marker = L.marker([target.latitude, target.longitude], { icon, zIndexOffset: 1200 });

      marker.bindTooltip(`
        <div class="pylon-tooltip">
          <strong style="color: #15803d;">✓ ĐÃ CHỌN - Thứ tự kiểm tra: #${index + 1}</strong><br>
          <strong>Mã cột: ${target.code}</strong><br>
          <small>${target.name || ''}</small><br>
          <span style="color: #ef4444; font-weight: 700;">👉 Nhấp để bỏ chọn</span>
        </div>
      `, { direction: 'top', offset: [0, -22] });

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        this.targetSelection.remove(target.assetId);
        this.renderTargetMarkers();
        this.renderTowers();
      });

      this.targetMarkersLayer.addLayer(marker);
    });
  }

  private mergeAssetsIntoTowers(assets: readonly SelectableAsset[]): void {
    const existingIds = new Set(this.towers().map((t) => t.id));
    const newTowers: GisTower[] = assets
      .filter((a) => !existingIds.has(a.assetId))
      .map((a) => ({
        id: a.assetId,
        towerCode: a.code,
        lineAssetId: 'line-detected',
        latitude: a.latitude,
        longitude: a.longitude,
        towerType: 'Cột điện cao thế',
        transmissionLineName: a.name || 'Lưới điện khu vực',
        voltageLevel: '220kV',
      }));
    if (newTowers.length) {
      this.towers.update((prev) => [...prev, ...newTowers]);
    }
  }

  protected toggleTower(tower: GisTower): void {
    if (this.targetSelection.has(tower.id)) {
      this.targetSelection.remove(tower.id);
    } else {
      this.targetSelection.add({
        assetId: tower.id,
        code: tower.towerCode,
        name: tower.transmissionLineName || tower.towerCode,
        latitude: tower.latitude,
        longitude: tower.longitude,
        status: 'Operational',
      });
    }
    this.renderTargetMarkers();
    this.renderTowers();
  }

  // Search actions
  protected locateTower(tower: GisTower): void {
    if (this.map) {
      this.map.setView([tower.latitude, tower.longitude], 15, { animate: true });
    }
  }

  protected addTowerFromSearch(tower: GisTower): void {
    this.toggleTower(tower);
    this.locateTower(tower);
  }

  protected locateTarget(target: SelectableAsset): void {
    if (this.map && this.currentStep() === 2) {
      this.map.setView([target.latitude, target.longitude], 16, { animate: true });
    } else if (this.reviewMap && this.currentStep() === 6) {
      this.reviewMap.setView([target.latitude, target.longitude], 16, { animate: true });
    }
  }

  protected locateUserLocation(): void {
    if (!('geolocation' in navigator)) {
      this.spatialMessage.set('Trình duyệt của bạn không hỗ trợ định vị GPS.');
      this.autoFitMap();
      return;
    }

    this.spatialMessage.set('Đang lấy vị trí GPS hiện tại của bạn...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        if (this.map) {
          this.map.setView([lat, lng], 15, { animate: true });
          this.renderUserLocationMarker(lat, lng);
          this.spatialMessage.set(`Đã định vị đến tọa độ của bạn (${lat.toFixed(4)}, ${lng.toFixed(4)}).`);
        }
      },
      () => {
        this.spatialMessage.set('Không thể lấy vị trí GPS. Bản đồ sẽ tự động căn chỉnh theo các cột điện.');
        this.autoFitMap();
      },
      { timeout: 7000, enableHighAccuracy: true },
    );
  }

  private renderUserLocationMarker(lat: number, lng: number): void {
    this.userLocationLayer.clearLayers();
    const icon = L.divIcon({
      className: 'user-location-pin',
      html: `<div class="user-pulse-ring"></div><div class="user-center-dot"></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
    const marker = L.marker([lat, lng], { icon, zIndexOffset: 2500 })
      .bindTooltip('<strong>Vị trí GPS của bạn</strong>');
    this.userLocationLayer.addLayer(marker);
  }

  private autoFitMap(): void {
    if (!this.map) return;
    const targets = this.targetSelection.selected();
    if (targets.length) {
      const bounds = L.latLngBounds(targets.map((t) => [t.latitude, t.longitude]));
      this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      return;
    }
    const towers = this.towers();
    if (towers.length) {
      const bounds = L.latLngBounds(towers.map((t) => [t.latitude, t.longitude]));
      this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }

  private fitTargetBounds(): void {
    this.autoFitMap();
  }

  // --- REVIEW MAP (Step 6) ---
  private initReviewMap(): void {
    const container = this.reviewMapContainer()?.nativeElement;
    if (!container) return;

    if (this.reviewMap) {
      this.reviewMap.invalidateSize();
      this.renderReviewMapLayers();
      return;
    }

    const vietnamBounds = L.latLngBounds([8.15, 102.0], [23.5, 110.0]);
    this.reviewMap = L.map(container, {
      center: [16.2, 106.2],
      zoom: 6,
      zoomControl: true,
      maxBounds: vietnamBounds,
    });

    L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: '© Google Maps',
    }).addTo(this.reviewMap);

    this.reviewTargetsLayer.addTo(this.reviewMap);
    this.renderReviewMapLayers();

    setTimeout(() => {
      this.reviewMap?.invalidateSize();
      this.fitReviewBounds();
    }, 200);
  }

  private renderReviewMapLayers(): void {
    this.reviewTargetsLayer.clearLayers();
    if (this.reviewPolyline) {
      this.reviewPolyline.remove();
      this.reviewPolyline = null;
    }

    const targets = this.targetSelection.selected();
    if (!targets.length || !this.reviewMap) return;

    const latLngs: [number, number][] = [];

    targets.forEach((target, index) => {
      latLngs.push([target.latitude, target.longitude]);

      const icon = L.divIcon({
        className: 'marker-target-highlight',
        html: `<div class="target-badge"><span>${index + 1}</span></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([target.latitude, target.longitude], { icon });
      marker.bindTooltip(`<strong>${index + 1}. ${target.code}</strong>`);
      this.reviewTargetsLayer.addLayer(marker);
    });

    // Draw connecting Suggested Inspection Sequence line
    if (latLngs.length > 1) {
      this.reviewPolyline = L.polyline(latLngs, {
        color: '#16a34a',
        weight: 3,
        dashArray: '6, 6',
        opacity: 0.85,
      }).bindTooltip('Tuyến kiểm tra đề xuất (Suggested Inspection Sequence)').addTo(this.reviewMap);
    }
  }

  private fitReviewBounds(): void {
    const targets = this.targetSelection.selected();
    if (!targets.length || !this.reviewMap) return;
    const bounds = L.latLngBounds(targets.map((t) => [t.latitude, t.longitude]));
    this.reviewMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }

  private cleanupMaps(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    if (this.reviewMap) {
      this.reviewMap.remove();
      this.reviewMap = null;
    }
  }

  // --- SUBMISSION (Step 7) ---
  protected save(): void {
    if (this.form.invalid || !this.targetSelection.count()) {
      this.form.markAllAsTouched();
      if (!this.targetSelection.count()) {
        this.error.set('Vui lòng chọn ít nhất một tài sản mục tiêu trên bản đồ GIS.');
      } else {
        this.error.set('Vui lòng điền đầy đủ các trường bắt buộc.');
      }
      return;
    }

    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');

    // Package Inspection Types & Checklist
    const inspectionTypes: string[] = [];
    if (value.enableRgb) inspectionTypes.push('RGB');
    if (value.enableThermal) inspectionTypes.push('THERMAL');
    if (value.enableCorona) inspectionTypes.push('CORONA');

    const routeDataObj = {
      inspectionTypes,
      checklist: value.checklistNotes.trim(),
    };

    this.api.create({
      name: value.name.trim(),
      scheduledAt: new Date(value.scheduledAt).toISOString(),
      inspectorId: value.inspectorId,
      droneId: value.droneId.trim(),
      description: value.description.trim(),
      targetAssetIds: this.targetSelection.selected().map((asset) => asset.assetId),
      routeData: JSON.stringify(routeDataObj),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (mission) => {
          this.targetSelection.clear();
          void this.router.navigate(mission.id ? ['/missions', mission.id] : ['/missions']);
        },
        error: (error: unknown) => this.error.set(this.errorMessage(error)),
      });
  }

  // Data loaders
  private loadUsers(): void {
    this.usersLoading.set(true);
    this.usersApi.getAssignable()
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.usersLoading.set(false)))
      .subscribe({
        next: (users) => {
          this.users.set(users);
          const selected = this.form.controls.inspectorId.value;
          if (!selected && users[0]) this.form.controls.inspectorId.setValue(users[0].id);
        },
        error: () => {
          const currentUserId = this.currentUser()?.id ?? '';
          if (!this.form.controls.inspectorId.value && currentUserId) {
            this.form.controls.inspectorId.setValue(currentUserId);
          }
        },
      });
  }

  private loadDrones(): void {
    this.dronesLoading.set(true);
    this.dronesApi.getAvailableDrones()
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.dronesLoading.set(false)))
      .subscribe({
        next: (drones) => {
          this.drones.set(drones);
          const current = this.form.controls.droneId.value;
          if (!current && drones[0]) {
            this.form.controls.droneId.setValue(drones[0].id);
          }
        },
      });
  }

  private loadGisData(): void {
    this.gisLoading.set(true);

    // Load baseline grid data (realistic towers across HCMC and Northern lines)
    const demoSnapshot = this.getDemoGisData();
    this.towers.set(demoSnapshot.towers);
    this.lines.set(demoSnapshot.lines);

    // Query backend GIS infrastructure if available
    this.gisApi.getAllGisData()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => of(demoSnapshot)),
        finalize(() => this.gisLoading.set(false)),
      )
      .subscribe({
        next: (data) => {
          if (data.towers.length || data.lines.length) {
            this.towers.set(data.towers.length ? data.towers : demoSnapshot.towers);
            this.lines.set(data.lines.length ? data.lines : demoSnapshot.lines);
          }
          if (this.map) {
            this.renderTransmissionLines();
            this.renderTowers();
          }
        },
      });
  }

  private getDemoGisData(): GisDataSnapshot {
    const lines: GisTransmissionLine[] = [
      {
        id: 'line-demo-01',
        lineCode: 'DZ-220-HB-NQ',
        lineName: 'Đường dây 220kV Hòa Bình - Nho Quan',
        voltage: '220kV',
        coordinates: [
          [20.8080, 105.3350],
          [20.8124, 105.3421],
          [20.8168, 105.3489],
          [20.8212, 105.3556],
          [20.8256, 105.3623],
          [20.8320, 105.3710],
          [20.8380, 105.3810],
        ],
      },
      {
        id: 'line-demo-02',
        lineCode: 'DZ-220-CL-LT',
        lineName: 'Đường dây 220kV Cát Lái - Long Thành - Nhơn Trạch',
        voltage: '220kV',
        coordinates: [
          [10.762622, 106.660172],
          [10.7650, 106.6680],
          [10.7710, 106.6780],
          [10.7760, 106.6890],
          [10.7810, 106.7000],
          [10.7860, 106.7110],
          [10.7920, 106.7210],
          [10.7850, 106.7320],
          [10.7780, 106.7450],
          [10.7700, 106.7600],
          [10.7620, 106.7780],
          [10.7550, 106.7980],
          [10.7480, 106.8200],
          [10.7420, 106.8450],
          [10.7380, 106.8750],
        ],
      },
    ];

    const towers: GisTower[] = [
      // HCMC & Dong Nai 220kV Corridor (Cát Lái -> Quận 2 -> Long Thành)
      {
        id: 'e3b0c442-98fc-1c14-9afbf4c8996fb924',
        towerCode: 'EVN-P101',
        lineAssetId: 'line-demo-02',
        latitude: 10.762622,
        longitude: 106.660172,
        towerType: 'Cột néo góc 101',
        transmissionLineName: 'Đường dây 220kV Cát Lái - Long Thành',
        voltageLevel: '220kV',
      },
      {
        id: 'a1b2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
        towerCode: 'EVN-P102',
        lineAssetId: 'line-demo-02',
        latitude: 10.7650,
        longitude: 106.6680,
        towerType: 'Cột đỡ 102',
        transmissionLineName: 'Đường dây 220kV Cát Lái - Long Thành',
        voltageLevel: '220kV',
      },
      {
        id: 'b2c3d4e5-6f7a-8b9c-0d1e-2f3a4b5c6d7e',
        towerCode: 'EVN-P103',
        lineAssetId: 'line-demo-02',
        latitude: 10.7710,
        longitude: 106.6780,
        towerType: 'Cột đỡ néo 103',
        transmissionLineName: 'Đường dây 220kV Cát Lái - Long Thành',
        voltageLevel: '220kV',
      },
      {
        id: 'c3d4e5f6-7a8b-9c0d-1e2f-3a4b5c6d7e8f',
        towerCode: 'EVN-P104',
        lineAssetId: 'line-demo-02',
        latitude: 10.7760,
        longitude: 106.6890,
        towerType: 'Cột đỡ 104',
        transmissionLineName: 'Đường dây 220kV Cát Lái - Long Thành',
        voltageLevel: '220kV',
      },
      {
        id: 'd4e5f6a7-8b9c-0d1e-2f3a-4b5c6d7e8f9a',
        towerCode: 'EVN-P105',
        lineAssetId: 'line-demo-02',
        latitude: 10.7810,
        longitude: 106.7000,
        towerType: 'Cột néo góc 105',
        transmissionLineName: 'Đường dây 220kV Cát Lái - Long Thành',
        voltageLevel: '220kV',
      },
      {
        id: 'e5f6a7b8-9c0d-1e2f-3a4b-5c6d7e8f9a0b',
        towerCode: 'EVN-P106',
        lineAssetId: 'line-demo-02',
        latitude: 10.7860,
        longitude: 106.7110,
        towerType: 'Cột đỡ 106',
        transmissionLineName: 'Đường dây 220kV Cát Lái - Long Thành',
        voltageLevel: '220kV',
      },
      {
        id: 'f6a7b8c9-0d1e-2f3a-4b5c-6d7e8f9a0b1c',
        towerCode: 'EVN-P107',
        lineAssetId: 'line-demo-02',
        latitude: 10.7920,
        longitude: 106.7210,
        towerType: 'Cột néo 107',
        transmissionLineName: 'Đường dây 220kV Cát Lái - Long Thành',
        voltageLevel: '220kV',
      },
      {
        id: 'a7b8c9d0-1e2f-3a4b-5c6d-7e8f9a0b1c2d',
        towerCode: 'EVN-P108',
        lineAssetId: 'line-demo-02',
        latitude: 10.7850,
        longitude: 106.7320,
        towerType: 'Cột đỡ néo 108',
        transmissionLineName: 'Đường dây 220kV Cát Lái - Long Thành',
        voltageLevel: '220kV',
      },
      {
        id: 'b8c9d0e1-2f3a-4b5c-6d7e-8f9a0b1c2d3e',
        towerCode: 'EVN-P109',
        lineAssetId: 'line-demo-02',
        latitude: 10.7780,
        longitude: 106.7450,
        towerType: 'Cột đỡ 109',
        transmissionLineName: 'Đường dây 220kV Cát Lái - Long Thành',
        voltageLevel: '220kV',
      },
      {
        id: 'c9d0e1f2-3a4b-5c6d-7e8f-9a0b1c2d3e4f',
        towerCode: 'EVN-P110',
        lineAssetId: 'line-demo-02',
        latitude: 10.7700,
        longitude: 106.7600,
        towerType: 'Cột néo góc 110',
        transmissionLineName: 'Đường dây 220kV Cát Lái - Long Thành',
        voltageLevel: '220kV',
      },
      {
        id: 'd0e1f2a3-4b5c-6d7e-8f9a-0b1c2d3e4f5a',
        towerCode: 'EVN-P111',
        lineAssetId: 'line-demo-02',
        latitude: 10.7620,
        longitude: 106.7780,
        towerType: 'Cột đỡ 111',
        transmissionLineName: 'Đường dây 220kV Cát Lái - Long Thành',
        voltageLevel: '220kV',
      },
      {
        id: 'e1f2a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b',
        towerCode: 'EVN-P112',
        lineAssetId: 'line-demo-02',
        latitude: 10.7550,
        longitude: 106.7980,
        towerType: 'Cột néo 112',
        transmissionLineName: 'Đường dây 220kV Cát Lái - Long Thành',
        voltageLevel: '220kV',
      },
      {
        id: 'f2a3b4c5-6d7e-8f9a-0b1c-2d3e4f5a6b7c',
        towerCode: 'EVN-P113',
        lineAssetId: 'line-demo-02',
        latitude: 10.7480,
        longitude: 106.8200,
        towerType: 'Cột đỡ néo 113',
        transmissionLineName: 'Đường dây 220kV Cát Lái - Long Thành',
        voltageLevel: '220kV',
      },
      {
        id: 'a3b4c5d6-7e8f-9a0b-1c2d-3e4f5a6b7c8d',
        towerCode: 'EVN-P114',
        lineAssetId: 'line-demo-02',
        latitude: 10.7420,
        longitude: 106.8450,
        towerType: 'Cột đỡ 114',
        transmissionLineName: 'Đường dây 220kV Cát Lái - Long Thành',
        voltageLevel: '220kV',
      },
      {
        id: 'b4c5d6e7-8f9a-0b1c-2d3e-4f5a6b7c8d9e',
        towerCode: 'EVN-P115',
        lineAssetId: 'line-demo-02',
        latitude: 10.7380,
        longitude: 106.8750,
        towerType: 'Cột néo góc 115',
        transmissionLineName: 'Đường dây 220kV Cát Lái - Long Thành',
        voltageLevel: '220kV',
      },

      // Northern 220kV Corridor (Hòa Bình -> Nho Quan)
      {
        id: 'ast-hb-040',
        towerCode: 'EVN-P040',
        lineAssetId: 'line-demo-01',
        latitude: 20.8080,
        longitude: 105.3350,
        towerType: 'Cột néo đầu tuyến 040',
        transmissionLineName: 'Đường dây 220kV Hòa Bình - Nho Quan',
        voltageLevel: '220kV',
      },
      {
        id: 'ast-hb-041',
        towerCode: 'EVN-P041',
        lineAssetId: 'line-demo-01',
        latitude: 20.8124,
        longitude: 105.3421,
        towerType: 'Cột néo góc 041',
        transmissionLineName: 'Đường dây 220kV Hòa Bình - Nho Quan',
        voltageLevel: '220kV',
      },
      {
        id: 'ast-hb-042',
        towerCode: 'EVN-P042',
        lineAssetId: 'line-demo-01',
        latitude: 20.8168,
        longitude: 105.3489,
        towerType: 'Cột đỡ 042',
        transmissionLineName: 'Đường dây 220kV Hòa Bình - Nho Quan',
        voltageLevel: '220kV',
      },
      {
        id: 'ast-hb-043',
        towerCode: 'EVN-P043',
        lineAssetId: 'line-demo-01',
        latitude: 20.8212,
        longitude: 105.3556,
        towerType: 'Cột đỡ néo 043',
        transmissionLineName: 'Đường dây 220kV Hòa Bình - Nho Quan',
        voltageLevel: '220kV',
      },
      {
        id: 'ast-hb-044',
        towerCode: 'EVN-P044',
        lineAssetId: 'line-demo-01',
        latitude: 20.8256,
        longitude: 105.3623,
        towerType: 'Cột néo góc 044',
        transmissionLineName: 'Đường dây 220kV Hòa Bình - Nho Quan',
        voltageLevel: '220kV',
      },
      {
        id: 'ast-hb-045',
        towerCode: 'EVN-P045',
        lineAssetId: 'line-demo-01',
        latitude: 20.8320,
        longitude: 105.3710,
        towerType: 'Cột đỡ 045',
        transmissionLineName: 'Đường dây 220kV Hòa Bình - Nho Quan',
        voltageLevel: '220kV',
      },
    ];

    return { towers, lines, anomalies: [], alerts: [] };
  }

  private errorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return 'Không thể tạo nhiệm vụ.';
    const body = error.error && typeof error.error === 'object' ? (error.error as Record<string, unknown>) : {};
    const errors = body['errors'] && typeof body['errors'] === 'object'
      ? Object.values(body['errors'] as Record<string, unknown>).flat().find(Boolean)
      : '';
    return String(errors || body['message'] || error.message || 'Không thể tạo nhiệm vụ.');
  }
}
