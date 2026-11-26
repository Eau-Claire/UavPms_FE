import { DatePipe } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Feature, FeatureCollection, LineString, Polygon } from 'geojson';
import {
  GeoJSONSource,
  Map as MapLibreMap,
  MapMouseEvent,
  Marker,
  Popup,
} from 'maplibre-gl';
import { finalize } from 'rxjs';
import {
  LocalMapMode,
  buildLocalGisStyle,
  createLocalGisMap,
  filterValidCoordinates,
  fitLocalGisBounds,
  isValidCoordinate,
  resolveLocalMapMode,
} from '../../../../shared/gis/local-gis';
import { ToastService } from '../../../../core/toast/toast.service';
import { GeoJsonPolygon, RegionLookup, SelectableAsset } from '../../../../models/assets.models';
import { Auth } from '../../../../core/auth/auth';
import { isManagerRole } from '../../../../core/auth/roles';
import { canAccess, ROUTE_ROLES } from '../../../../core/auth/route-access';
import { MissionTargetSelection, MissionTargetTower } from '../../../missions/data-access/mission-target-selection';
import { NotificationsStore } from '../../../notifications/data-access/notifications-store';
import { anomalyStatusLabel } from '../../../towers/data-access/tower-labels';
import { AnomalyItem, AnomalyValidationStatus } from '../../../analyst-review/data-access/anomaly-api';
import { AnomalyHistoryService } from '../../../analyst-review/data-access/anomaly-history.service';
import {
  GisAlert,
  GisAnomalyFeature,
  GisApi,
  GisTower,
} from '../../data-access/gis-api';

export type MapType = LocalMapMode;
export type SelectionDrawMode = 'none' | 'rectangle' | 'polygon';
export type SelectionUxState = 'idle' | 'choosing' | 'drawing-rectangle' | 'drawing-polygon' | 'editing' | 'querying' | 'success' | 'empty' | 'error';

interface GisLatLng {
  lat: number;
  lng: number;
}

const SELECTION_SOURCE_ID = 'gis-selection-overlay';
const SELECTION_FILL_LAYER_ID = 'gis-selection-fill';
const SELECTION_LINE_LAYER_ID = 'gis-selection-line';
const SVG_NS = 'http://www.w3.org/2000/svg';

export const rectangleToPolygon = (first: { lat: number; lng: number }, second: { lat: number; lng: number }): GeoJsonPolygon => {
  const west = Math.min(first.lng, second.lng); const east = Math.max(first.lng, second.lng);
  const south = Math.min(first.lat, second.lat); const north = Math.max(first.lat, second.lat);
  return { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] };
};

type SelectedGisEntity =
  | { type: 'tower'; data: GisTower }
  | { type: 'anomaly'; data: GisAnomalyFeature }
  | { type: 'alert'; data: GisAlert };

@Component({
  selector: 'app-gis-monitoring',
  imports: [DatePipe, RouterLink, FormsModule],
  templateUrl: './gis-monitoring.html',
  styleUrl: './gis-monitoring.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export class GisMonitoring implements AfterViewInit, OnDestroy {
  private readonly gisApi = inject(GisApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(Auth);
  private readonly toast = inject(ToastService);
  protected readonly targetSelection = inject(MissionTargetSelection);
  private readonly anomalyHistory = inject(AnomalyHistoryService);
  private readonly notificationsStore = inject(NotificationsStore, { optional: true });
  private readonly mapContainer = viewChild<ElementRef<HTMLDivElement>>('mapContainer');

  /** Area selection / target towers is a manager planning tool (it feeds `/pre-mission/new`). */
  protected readonly canCreateMission = computed(() => isManagerRole(this.auth.user()?.role));
  /** The anomaly drawer links to `/ai-review/:id` only for roles that route allows. */
  protected readonly canReviewAnomalies = computed(() => canAccess(this.auth.user()?.role, ROUTE_ROLES.aiReview));

  private map: MapLibreMap | null = null;
  private towerMarkers: Marker[] = [];
  private selectionResultMarkers: Marker[] = [];
  private confirmedTargetMarkers: Marker[] = [];
  private tempVertexMarkers: Marker[] = [];
  private activeTooltipPopup: Popup | null = null;
  private rafId: number | null = null;
  private layoutTimers: ReturnType<typeof setTimeout>[] = [];
  private currentGeometry: GeoJsonPolygon | null = null;

  // Custom Live Drawing State
  private tempRectGeometry: GeoJsonPolygon | null = null;
  private tempRubberbandEnd: GisLatLng | null = null;
  private rectStartLatLng: GisLatLng | null = null;
  private isRectDragging = false;
  protected readonly polygonVertices = signal<GisLatLng[]>([]);

  // Local-only map mode state (PMTiles / Schematic)
  protected readonly mapMode = signal<LocalMapMode>('pmtiles');

  // GIS remains empty until authorized API data arrives.
  protected readonly towers = signal<readonly GisTower[]>([]);
  protected readonly anomalies = signal<readonly GisAnomalyFeature[]>([]);
  protected readonly alerts = signal<readonly GisAlert[]>([]);
  protected readonly regions = signal<readonly RegionLookup[]>([]);
  protected readonly regionFilter = signal('');
  private readonly regionNames = computed(() => new Map(this.regions().map((region) => [region.id, region.name])));

  // State signals
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly showFilterPanel = signal(false);
  protected readonly showLegendPanel = signal(false);
  protected readonly selectedEntity = signal<SelectedGisEntity | null>(null);
  protected readonly selectedMarkerId = signal<string>('');
  protected readonly drawMode = signal<SelectionDrawMode>('none');
  protected readonly uxState = signal<SelectionUxState>('idle');
  protected readonly showSelectionPopup = signal(false);
  protected readonly hasBoundary = signal(false);
  protected readonly spatialLoading = signal(false);
  protected readonly spatialMessage = signal('');
  protected readonly spatialAssets = signal<readonly SelectableAsset[]>([]);
  protected readonly drawingInstruction = computed(() => this.drawMode() === 'rectangle'
    ? 'Nhấn và kéo trên bản đồ để tạo vùng.'
    : this.drawMode() === 'polygon' ? 'Nhấp để đặt từng điểm.\nNhấp điểm đầu để hoàn tất.' : '');
  protected readonly missionCtaLabel = computed(() => this.targetSelection.count() ? `Lập đánh giá tiền bay (${this.targetSelection.count()})` : 'Lập đánh giá tiền bay');

  // Popup title computed
  protected readonly popupTitle = computed(() => {
    const state = this.uxState();
    if (state === 'editing') return 'Chỉnh sửa vùng';
    if (state === 'querying') return 'Cột điện trong vùng';
    if (state === 'success') {
      const count = this.spatialAssets().length;
      return `Cột điện trong vùng (${count})`;
    }
    if (state === 'empty') return 'Cột điện trong vùng (0)';
    if (state === 'error') return 'Cột điện trong vùng';
    return 'Chọn cột điện theo vùng';
  });

  // Check if all spatial candidates are selected
  protected readonly isAllSpatialSelected = computed(() => {
    const list = this.spatialAssets();
    if (!list.length) return false;
    return list.every((a) => this.targetSelection.has(a.towerId));
  });

  // Toggle select all / deselect all spatial candidates
  protected toggleSelectAllSpatial(): void {
    if (this.isAllSpatialSelected()) {
      this.spatialAssets().forEach((a) => this.targetSelection.remove(a.towerId));
    } else {
      this.targetSelection.addMany(this.spatialAssets().map((a) => this.toTargetTower(a)));
    }
    this.renderSpatialAssets();
  }

  private toTargetTower(asset: SelectableAsset): MissionTargetTower {
    return {
      towerId: asset.towerId,
      towerCode: asset.code,
      latitude: asset.latitude,
      longitude: asset.longitude,
    };
  }

  // Layer Visibility
  protected readonly showTowersLayer = signal(true);
  protected readonly showDefectsLayer = signal(true);
  protected readonly showAlertsLayer = signal(true);

  // Assets panel state
  protected readonly showAssetsPanel = signal(false);
  protected readonly assetSearchQuery = signal('');
  protected readonly filteredAssets = computed(() => {
    const q = this.assetSearchQuery().trim().toLowerCase();
    const list = this.towers();
    if (!q) return list;
    return list.filter((t) =>
      t.towerCode.toLowerCase().includes(q) ||
      (t.poleType || '').toLowerCase().includes(q) ||
      (t.address || '').toLowerCase().includes(q) ||
      this.regionName(t.regionId).toLowerCase().includes(q),
    );
  });

  protected toggleAssetsPanel(): void {
    this.showAssetsPanel.update((v) => !v);
    if (this.showAssetsPanel()) {
      this.showFilterPanel.set(false);
      this.showLegendPanel.set(false);
    }
  }

  protected focusTowerAsset(tower: GisTower): void {
    if (this.map && isValidCoordinate(tower.latitude, tower.longitude)) {
      this.map.flyTo({ center: [tower.longitude, tower.latitude], zoom: 17, duration: 800 });
      this.selectedEntity.set({ type: 'tower', data: tower });
    }
  }

  // Filters
  protected readonly searchCode = signal('');
  protected readonly severityFilter = signal<string>('');
  protected readonly statusFilter = signal<string>('');

  // Computed metrics
  protected readonly totalTowersCount = computed(() => this.towers().length);
  /** Chỉ đếm các sự cố đang mở (loại trừ Resolved và Rejected / Báo động giả) */
  protected readonly activeDefectsCount = computed(() =>
    this.anomalies().filter((a) => !this.isAnomalyClosed(a)).length,
  );
  /** GET /gis/infrastructure only returns alerts that are still Active. */
  protected readonly activeAlertsCount = computed(() => this.alerts().length);

  protected readonly filteredAnomalies = computed(() => {
    const list = this.anomalies();
    const query = this.searchCode().trim().toLowerCase();
    const minSeverity = Number(this.severityFilter() || 0);
    const status = (this.statusFilter() || '').trim().toLowerCase();

    return list.filter((item) => {
      const effectiveStatus = this.effectiveAnomalyStatus(item).toLowerCase();
      const isClosed = this.isAnomalyClosed(item);

      if (query && !item.towerCode.toLowerCase().includes(query) && !item.category.toLowerCase().includes(query)) {
        return false;
      }
      if (minSeverity && item.severity < minSeverity - 0.5) {
        return false;
      }
      if (!status || status === 'open') {
        // Mặc định: Chỉ hiển thị các bất thường đang mở (Pending, InReview, Confirmed), loại bỏ Resolved & Rejected (báo động giả)
        if (isClosed) return false;
      } else if (status !== 'all') {
        if (status === 'pending') {
          if (effectiveStatus !== 'pending' && effectiveStatus !== 'inreview') return false;
        } else if (effectiveStatus !== status) {
          return false;
        }
      }
      return true;
    });
  });

  ngAfterViewInit(): void {
    this.initLocalGisMap();

    // 1. Initialize empty map layers
    this.renderAllLayers();
    this.fitMapBounds();

    // 2. Multi-stage layout synchronization across browser paint lifecycle
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      if (!this.map) return;
      this.map.resize();
      this.renderAllLayers();
      this.fitMapBounds();
    });

    this.layoutTimers.push(
      setTimeout(() => {
        if (!this.map) return;
        this.map.resize();
        this.renderAllLayers();
        this.fitMapBounds();
      }, 200),
      setTimeout(() => {
        if (!this.map) return;
        this.map.resize();
        this.renderAllLayers();
        this.fitMapBounds();
      }, 500),
    );

    // 3. Refresh live data from server asynchronously
    this.loadRegions();
    this.loadGisData();

    // 4. Responsive map resize synchronization
    const onResize = () => {
      this.map?.resize();
    };
    window.addEventListener('resize', onResize);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('resize', onResize);
    });
  }

  ngOnDestroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    for (const timer of this.layoutTimers) {
      clearTimeout(timer);
    }
    this.layoutTimers = [];
    this.clearMarkers(this.towerMarkers);
    this.clearMarkers(this.selectionResultMarkers);
    this.clearMarkers(this.confirmedTargetMarkers);
    this.clearMarkers(this.tempVertexMarkers);
    this.activeTooltipPopup?.remove();
    this.activeTooltipPopup = null;
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  private initLocalGisMap(): void {
    const container = this.mapContainer()?.nativeElement;
    if (!container) return;

    const map = createLocalGisMap(container, {
      mode: this.mapMode(),
      zoom: 12,
      onFallbackToSchematic: () => {
        this.mapMode.set('schematic');
        this.syncSelectionOverlay();
      },
    });
    this.map = map;
    if (!map) return;

    map.on('load', () => {
      this.map?.resize();
      this.renderAllLayers();
      this.syncSelectionOverlay();
      this.fitMapBounds();
    });

    // Register Map Event Listeners for Live Custom Drawing
    map.on('mousedown', (e: MapMouseEvent) => this.onMapMouseDown(e));
    map.on('mousemove', (e: MapMouseEvent) => this.onMapMouseMove(e));
    map.on('mouseup', (e: MapMouseEvent) => this.onMapMouseUp(e));
    map.on('click', (e: MapMouseEvent) => this.onMapClick(e));
    map.on('dblclick', (e: MapMouseEvent) => this.onMapDblClick(e));
  }

  /** Bật/tắt bảng bộ lọc (tự động đóng chú giải & khoanh vùng để tránh đè lấn) */
  protected toggleFilterPanel(): void {
    const next = !this.showFilterPanel();
    if (next) {
      this.showLegendPanel.set(false);
      if (this.showSelectionPopup()) {
        this.closeSelectionPopup();
      }
    }
    this.showFilterPanel.set(next);
  }

  /** Bật/tắt bảng chú giải (tự động đóng bộ lọc & khoanh vùng để tránh đè lấn) */
  protected toggleLegendPanel(): void {
    const next = !this.showLegendPanel();
    if (next) {
      this.showFilterPanel.set(false);
      if (this.showSelectionPopup()) {
        this.closeSelectionPopup();
      }
    }
    this.showLegendPanel.set(next);
  }

  /** Toggle the selection tool: open/close the popup, closing other floating panels. */
  protected toggleSelectionTool(): void {
    if (this.showSelectionPopup()) {
      this.closeSelectionPopup();
    } else {
      this.showFilterPanel.set(false);
      this.showLegendPanel.set(false);
      this.showSelectionPopup.set(true);
      if (!this.hasBoundary()) {
        this.uxState.set('choosing');
      }
    }
  }

  /** Close the selection popup. Handles different states per spec. */
  protected closeSelectionPopup(): void {
    const state = this.uxState();
    if (state === 'drawing-rectangle' || state === 'drawing-polygon' || state === 'editing') {
      this.cancelActiveTool();
    }
    this.showSelectionPopup.set(false);
  }

  /** Redraw: clear candidates + geometry, return to shape chooser, preserve confirmed targets. */
  protected redraw(): void {
    this.cancelActiveTool();
    this.currentGeometry = null;
    this.hasBoundary.set(false);
    this.spatialAssets.set([]);
    this.clearMarkers(this.selectionResultMarkers);
    this.syncSelectionOverlay();
    this.renderConfirmedTargetMarkers();
    this.spatialMessage.set('');
    this.uxState.set('choosing');
  }

  protected startDrawing(mode: Exclude<SelectionDrawMode, 'none'>): void {
    this.cancelActiveTool();
    this.drawMode.set(mode);
    this.uxState.set(mode === 'rectangle' ? 'drawing-rectangle' : 'drawing-polygon');

    if (this.map) {
      if (mode === 'rectangle') {
        this.map.dragPan.disable();
      } else if (mode === 'polygon') {
        this.map.doubleClickZoom.disable();
        this.polygonVertices.set([]);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Custom Live Rectangle & Polygon Drawing Handlers
  // ─────────────────────────────────────────────────────────────

  private onMapMouseDown(e: MapMouseEvent): void {
    if (this.drawMode() !== 'rectangle' || !this.map) return;
    e.preventDefault();
    this.isRectDragging = true;
    this.rectStartLatLng = { lat: e.lngLat.lat, lng: e.lngLat.lng };
    this.tempRectGeometry = rectangleToPolygon(this.rectStartLatLng, this.rectStartLatLng);
    this.syncSelectionOverlay();
  }

  private onMapMouseMove(e: MapMouseEvent): void {
    if (!this.map) return;
    const current = { lat: e.lngLat.lat, lng: e.lngLat.lng };

    if (this.drawMode() === 'rectangle' && this.isRectDragging && this.rectStartLatLng) {
      e.preventDefault();
      this.tempRectGeometry = rectangleToPolygon(this.rectStartLatLng, current);
      this.syncSelectionOverlay();
      return;
    }

    if (this.drawMode() === 'polygon' && this.polygonVertices().length > 0) {
      this.tempRubberbandEnd = current;
      this.syncSelectionOverlay();
    }
  }

  private onMapMouseUp(e: MapMouseEvent): void {
    if (this.drawMode() !== 'rectangle' || !this.isRectDragging || !this.rectStartLatLng || !this.map) return;
    e.preventDefault();
    this.isRectDragging = false;

    const startPoint = this.map.project([this.rectStartLatLng.lng, this.rectStartLatLng.lat]);
    const distance = Math.hypot(startPoint.x - e.point.x, startPoint.y - e.point.y);
    const start = this.rectStartLatLng;
    this.tempRectGeometry = null;
    this.rectStartLatLng = null;
    this.syncSelectionOverlay();

    if (distance >= 8) {
      this.resolveGeometry(rectangleToPolygon(start, { lat: e.lngLat.lat, lng: e.lngLat.lng }));
    }
  }

  private onMapClick(e: MapMouseEvent): void {
    if (this.drawMode() !== 'polygon' || !this.map) return;

    const currentPoints = this.polygonVertices();
    if (currentPoints.length >= 3) {
      const firstPx = this.map.project([currentPoints[0].lng, currentPoints[0].lat]);
      if (Math.hypot(firstPx.x - e.point.x, firstPx.y - e.point.y) <= 18) {
        this.completePolygon();
        return;
      }
    }

    const point: GisLatLng = { lat: e.lngLat.lat, lng: e.lngLat.lng };
    const newPoints = [...currentPoints, point];
    this.polygonVertices.set(newPoints);

    const isFirst = newPoints.length === 1;
    const vertexEl = document.createElement('div');
    vertexEl.className = isFirst ? 'leaflet-editing-icon first-vertex-marker' : 'leaflet-editing-icon';
    vertexEl.style.width = isFirst ? '14px' : '10px';
    vertexEl.style.height = isFirst ? '14px' : '10px';

    if (isFirst) {
      vertexEl.title = 'Nhấp vào đây để hoàn tất vùng';
      vertexEl.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (this.polygonVertices().length >= 3) this.completePolygon();
      });
    }

    this.tempVertexMarkers.push(new Marker({ element: vertexEl }).setLngLat([point.lng, point.lat]).addTo(this.map));
    this.syncSelectionOverlay();
  }

  private onMapDblClick(e: MapMouseEvent): void {
    if (this.drawMode() === 'polygon' && this.polygonVertices().length >= 3) {
      e.preventDefault();
      this.completePolygon();
    }
  }

  /** Complete the custom polygon drawing and submit to spatial query. */
  protected completePolygon(): void {
    const points = this.polygonVertices();
    if (points.length < 3) return;

    const ringCoords = points.map((p) => [p.lng, p.lat] as [number, number]);
    ringCoords.push([points[0].lng, points[0].lat]); // Close the ring

    const geojson: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [ringCoords],
    };

    this.resolveGeometry(geojson);
  }

  protected resolveGeometry(geometry: GeoJsonPolygon): void {
    if (!geometry.coordinates[0] || geometry.coordinates[0].length < 4) {
      this.spatialMessage.set('Hình học vùng chọn không hợp lệ.');
      return;
    }
    this.cancelActiveTool();
    this.drawMode.set('none');
    this.uxState.set('querying');
    this.currentGeometry = geometry;
    this.hasBoundary.set(true);
    this.drawSelectionBoundary(geometry);
    this.spatialLoading.set(true);
    this.spatialMessage.set('');
    const regionId = this.regionFilter();
    this.gisApi.spatialQuery(regionId ? { geometry, filters: { regionId } } : { geometry }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.spatialLoading.set(false)),
    ).subscribe({
      next: (assets) => {
        const uniqueAssets = assets.filter((asset, index, list) => list.findIndex((item) => item.towerId === asset.towerId) === index);
        this.spatialAssets.set(uniqueAssets);
        this.uxState.set(uniqueAssets.length ? 'success' : 'empty');
        this.spatialMessage.set(uniqueAssets.length ? '' : 'Không có cột điện trong vùng này.');
        this.renderSpatialAssets();
      },
      error: (error: unknown) => {
        const status = error instanceof Object && 'status' in error ? Number(error.status) : 0;
        this.uxState.set('error');
        this.spatialMessage.set(status === 401 || status === 403 ? 'Bạn không có quyền truy vấn cột điện trong vùng này.' : 'Không thể truy vấn cột điện trong vùng.');
      },
    });
  }

  /** Open the tower drawer for a spatial-query candidate. */
  protected inspectAsset(asset: SelectableAsset): void {
    const tower = this.towers().find((t) => t.id === asset.towerId || t.towerCode === asset.code) ?? {
      id: asset.towerId,
      regionId: '',
      towerCode: asset.code,
      latitude: asset.latitude,
      longitude: asset.longitude,

    };
    this.selectedEntity.set({ type: 'tower', data: tower });
  }

  private drawSelectionBoundary(geometry: GeoJsonPolygon): void {
    this.currentGeometry = geometry;
    this.hasBoundary.set(true);
    this.syncSelectionOverlay();
  }

  private syncSelectionOverlay(): void {
    if (!this.map) return;
    const features: Feature<Polygon | LineString>[] = [];
    const activePolygon = this.tempRectGeometry ?? this.currentGeometry;
    if (activePolygon) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: activePolygon.coordinates.map((ring) => ring.map(([lng, lat]) => [lng, lat])),
        },
      });
    }
    const vertices = this.polygonVertices();
    if (vertices.length > 0) {
      const lineCoords = vertices.map((p) => [p.lng, p.lat]);
      if (this.tempRubberbandEnd) lineCoords.push([this.tempRubberbandEnd.lng, this.tempRubberbandEnd.lat]);
      if (lineCoords.length > 1) {
        features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: lineCoords } });
      }
    }

    const data: FeatureCollection<Polygon | LineString> = { type: 'FeatureCollection', features };
    const map = this.map;
    const apply = () => {
      const existing = map.getSource<GeoJSONSource>(SELECTION_SOURCE_ID);
      if (existing) {
        existing.setData(data);
        return;
      }
      map.addSource(SELECTION_SOURCE_ID, { type: 'geojson', data });
      map.addLayer({
        id: SELECTION_FILL_LAYER_ID,
        type: 'fill',
        source: SELECTION_SOURCE_ID,
        filter: ['==', '$type', 'Polygon'],
        paint: { 'fill-color': '#6366f1', 'fill-opacity': 0.14 },
      });
      map.addLayer({
        id: SELECTION_LINE_LAYER_ID,
        type: 'line',
        source: SELECTION_SOURCE_ID,
        paint: { 'line-color': '#4f46e5', 'line-width': 2.5, 'line-dasharray': [6, 4] },
      });
    };

    if (map.isStyleLoaded()) apply();
    else map.once('style.load', apply);
  }

  protected startEditing(): void {
    if (!this.hasBoundary()) return;
    this.cancelActiveTool();
    this.uxState.set('editing');
  }

  protected finishEditing(): void {
    if (this.currentGeometry) this.resolveGeometry(this.currentGeometry);
  }

  protected completeEditedGeometry(geometry: GeoJsonPolygon): void {
    this.resolveGeometry(geometry);
  }

  protected retrySpatialQuery(): void {
    if (this.currentGeometry) this.resolveGeometry(this.currentGeometry);
  }

  protected createMission(): void {
    // POST /missions is gone: towers go into a pre-mission assessment, which reads MissionTargetSelection.
    if (this.canCreateMission() && this.targetSelection.count()) void this.router.navigate(['/pre-mission/new']);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && (this.drawMode() !== 'none' || this.uxState() === 'editing')) this.cancelActiveTool();
  }

  protected cancelActiveTool(): void {
    this.isRectDragging = false;
    this.rectStartLatLng = null;
    this.tempRectGeometry = null;
    this.tempRubberbandEnd = null;
    this.clearMarkers(this.tempVertexMarkers);
    this.polygonVertices.set([]);
    this.syncSelectionOverlay();

    if (this.map) {
      this.map.dragPan.enable();
      this.map.doubleClickZoom.enable();
    }

    this.drawMode.set('none');

    if (this.spatialAssets().length) {
      this.uxState.set('success');
    } else if (this.hasBoundary()) {
      this.uxState.set('empty');
    } else if (this.showSelectionPopup()) {
      this.uxState.set('choosing');
    } else {
      this.uxState.set('idle');
    }
  }

  protected clearBoundary(): void {
    this.cancelActiveTool();
    this.currentGeometry = null;
    this.hasBoundary.set(false);
    this.spatialAssets.set([]);
    this.clearMarkers(this.selectionResultMarkers);
    this.syncSelectionOverlay();
    this.renderConfirmedTargetMarkers();
    this.spatialMessage.set('');
    this.uxState.set(this.showSelectionPopup() ? 'choosing' : 'idle');
  }

  protected renderSpatialAssets(): void {
    this.clearMarkers(this.selectionResultMarkers);
    if (!this.map) {
      this.renderConfirmedTargetMarkers();
      return;
    }

    const validAssets = filterValidCoordinates(this.spatialAssets(), (asset) => ({
      latitude: asset.latitude,
      longitude: asset.longitude,
    }));
    validAssets.forEach((asset) => {
      const selected = this.targetSelection.has(asset.towerId);
      const dot = document.createElement('div');
      dot.style.cssText = `width:16px;height:16px;border-radius:50%;cursor:pointer;border:2px solid ${selected ? '#15803d' : '#7c3aed'};background:${selected ? '#22c55e' : '#a78bfa'};opacity:0.9;`;
      dot.title = `${asset.code} — ${asset.name}`;
      dot.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.toggleAsset(asset);
      });
      this.selectionResultMarkers.push(new Marker({ element: dot }).setLngLat([asset.longitude, asset.latitude]).addTo(this.map!));
    });
    this.renderConfirmedTargetMarkers();
  }

  private renderConfirmedTargetMarkers(): void {
    this.clearMarkers(this.confirmedTargetMarkers);
    if (!this.map) return;

    const validSelected = filterValidCoordinates(this.targetSelection.selected(), (asset) => ({
      latitude: asset.latitude,
      longitude: asset.longitude,
    }));
    validSelected.forEach((asset) => {
      const el = document.createElement('div');
      el.className = 'confirmed-target-marker';
      el.style.zIndex = '900';
      el.title = `Đã chọn: ${asset.towerCode}`;
      const ring = document.createElement('span');
      ring.className = 'target-select-ring';
      el.append(ring);
      this.confirmedTargetMarkers.push(new Marker({ element: el }).setLngLat([asset.longitude, asset.latitude]).addTo(this.map!));
    });
  }

  protected toggleAsset(asset: SelectableAsset): void {
    if (this.targetSelection.has(asset.towerId)) this.targetSelection.remove(asset.towerId);
    else this.targetSelection.add(this.toTargetTower(asset));
    this.renderSpatialAssets();
  }

  protected addAllSpatialAssets(): void {
    this.targetSelection.addMany(this.spatialAssets().map((a) => this.toTargetTower(a)));
    this.renderSpatialAssets();
  }

  protected setMapMode(mode: LocalMapMode): void {
    this.mapMode.set(mode);
    if (!this.map) return;
    this.map.setStyle(buildLocalGisStyle(mode));
    this.syncSelectionOverlay();
  }

  protected loadGisData(): void {
    this.loading.set(true);
    this.error.set('');

    this.towers.set([]);
    this.anomalies.set([]);
    this.alerts.set([]);
    this.selectedEntity.set(null);
    this.targetSelection.clear();
    this.clearBoundary();
    this.renderAllLayers();
    const regionId = this.regionFilter();
    this.gisApi.getAllGisData(regionId ? { administrativeAreaId: regionId } : {})
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (data) => {
          this.towers.set(data.towers);
          this.anomalies.set(data.anomalies);
          this.alerts.set(data.alerts);
          const validTowers = filterValidCoordinates(data.towers, (t) => ({ latitude: t.latitude, longitude: t.longitude }));
          const resolvedMode = resolveLocalMapMode(validTowers, this.mapMode());
          if (resolvedMode !== this.mapMode()) {
            this.setMapMode(resolvedMode);
          }
          this.renderAllLayers();
          this.fitMapBounds();
        },
        error: (error: unknown) => {
          const status = error instanceof Object && 'status' in error ? Number(error.status) : 0;
          const msg = status === 403 ? '403 — Bạn không có quyền xem dữ liệu GIS.' : 'Không thể tải dữ liệu GIS. Vui lòng thử lại.';
          this.error.set(msg);
          this.toast.error(msg);
          this.towers.set([]);
          this.anomalies.set([]);
          this.alerts.set([]);
          this.renderAllLayers();
        },
      });
  }

  private loadRegions(): void {
    this.gisApi.getRegions().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (regions) => {
        this.regions.set(regions);
        this.renderTowers();
      },
      error: () => this.regions.set([]),
    });
  }

  private renderAllLayers(): void {
    this.renderTowers();
    this.renderDefects();
    this.renderAlerts();
  }

  private clearMarkers(list: Marker[]): void {
    list.forEach((marker) => marker.remove());
    list.length = 0;
  }

  private renderTowers(): void {
    this.clearMarkers(this.towerMarkers);
    this.activeTooltipPopup?.remove();
    this.activeTooltipPopup = null;
    if (!this.map || !this.showTowersLayer()) return;

    const validTowers = filterValidCoordinates(this.towers(), (tower) => ({
      latitude: tower.latitude,
      longitude: tower.longitude,
    }));

    validTowers.forEach((tower) => {
      const isSelected = this.selectedMarkerId() === tower.id;
      const towerAlerts = this.alertsForTower(tower.id, tower.towerCode);
      const allTowerAnomalies = this.anomaliesForTower(tower.id, tower.towerCode);
      const openAnomalies = allTowerAnomalies.filter((a) => !this.isAnomalyClosed(a));

      const hasAlert =
        (this.showAlertsLayer() && towerAlerts.length > 0) ||
        (this.showDefectsLayer() && openAnomalies.some((a) => a.severity >= 4.5));
      const hasAnomaly = this.showDefectsLayer() && !hasAlert && openAnomalies.length > 0;

      let markerClass = 'custom-tower-marker';
      if (hasAlert) markerClass += ' has-alert';
      else if (hasAnomaly) markerClass += ' has-anomaly';
      if (isSelected) markerClass += ' is-selected';

      const markerEl = document.createElement('div');
      markerEl.className = markerClass;
      markerEl.style.zIndex = String(isSelected ? 1200 : hasAlert ? 800 : hasAnomaly ? 400 : 100);
      markerEl.append(createTowerSvgIcon());

      const subtitle = [this.regionName(tower.regionId), tower.poleType].filter(Boolean).join(' · ');
      const tooltipEl = document.createElement('div');
      const codeEl = document.createElement('div');
      codeEl.style.cssText = 'font-weight:700;font-size:13px;';
      codeEl.textContent = tower.towerCode;
      tooltipEl.append(codeEl);

      if (hasAlert || hasAnomaly) {
        const badgeEl = document.createElement('div');
        badgeEl.style.cssText = hasAlert ? 'color:#dc2626;font-weight:600;' : 'color:#b45309;font-weight:600;';
        badgeEl.textContent = hasAlert ? 'Cảnh báo khẩn cấp' : `Có ${openAnomalies.length} sự cố phát hiện`;
        tooltipEl.append(badgeEl);
      }

      if (subtitle) {
        const subEl = document.createElement('div');
        subEl.style.cssText = 'font-size:11px;color:#64748b;';
        subEl.textContent = subtitle;
        tooltipEl.append(subEl);
      }

      markerEl.addEventListener('mouseenter', () => {
        if (!this.map) return;
        this.activeTooltipPopup?.remove();
        this.activeTooltipPopup = new Popup({ offset: 14, closeButton: false, closeOnClick: false })
          .setLngLat([tower.longitude, tower.latitude])
          .setDOMContent(tooltipEl)
          .addTo(this.map);
      });
      markerEl.addEventListener('mouseleave', () => {
        this.activeTooltipPopup?.remove();
        this.activeTooltipPopup = null;
      });
      markerEl.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.selectedMarkerId.set(tower.id);
        this.selectedEntity.set({ type: 'tower', data: tower });
        this.renderAllLayers();
      });

      this.towerMarkers.push(new Marker({ element: markerEl }).setLngLat([tower.longitude, tower.latitude]).addTo(this.map!));
    });
  }

  private renderDefects(): void {
    // Toàn bộ bất thường gắn với cột điện được thể hiện trực quan bằng cột điện màu vàng (hoặc đỏ nếu khẩn cấp).
  }

  private renderAlerts(): void {
    // Toàn bộ cảnh báo khẩn cấp gắn với cột điện được thể hiện trực quan bằng cột điện màu đỏ (renderTowers).
  }

  protected applyFilters(): void {
    this.renderTowers();
  }

  protected resetFilters(): void {
    this.searchCode.set('');
    this.severityFilter.set('');
    this.statusFilter.set('');
    this.renderTowers();
  }

  /** Region filter is applied server-side by GET /gis/infrastructure?administrativeAreaId=. */
  protected changeRegion(regionId: string): void {
    if (this.regionFilter() === regionId) return;
    this.regionFilter.set(regionId);
    this.loadGisData();
  }

  protected toggleLayer(type: 'towers' | 'defects' | 'alerts'): void {
    if (type === 'towers') {
      this.showTowersLayer.update((v) => !v);
      this.renderTowers();
    } else if (type === 'defects') {
      this.showDefectsLayer.update((v) => !v);
      this.renderDefects();
    } else if (type === 'alerts') {
      this.showAlertsLayer.update((v) => !v);
      this.renderTowers();
      this.renderAlerts();
    }
  }

  protected fitMapBounds(): void {
    if (!this.map) return;
    const validTowers = filterValidCoordinates(this.towers(), (tower) => ({
      latitude: tower.latitude,
      longitude: tower.longitude,
    }));
    const coords: [number, number][] = validTowers.map((tower) => [tower.longitude, tower.latitude]);
    fitLocalGisBounds(this.map, coords, 48, 15);
  }

  protected closeDrawer(): void {
    this.selectedEntity.set(null);
    this.selectedMarkerId.set('');
    this.renderAllLayers();
  }

  protected effectiveAnomalyStatus(anomaly: GisAnomalyFeature): string {
    const fromHistory =
      this.anomalyHistory.getReview(anomaly.anomalyId) ||
      this.anomalyHistory.getReview(anomaly.id);
    if (fromHistory) {
      return fromHistory.validationStatus;
    }
    return anomaly.status;
  }

  protected isAnomalyClosed(anomaly: GisAnomalyFeature): boolean {
    const status = this.effectiveAnomalyStatus(anomaly).toLowerCase();
    return status === 'resolved' || status === 'rejected' || status === 'dismissed';
  }

  protected toAnomalyItem(feature: GisAnomalyFeature): AnomalyItem {
    const effectiveStatus = this.effectiveAnomalyStatus(feature);
    const score = feature.confidenceScore > 1 ? feature.confidenceScore : Math.round(feature.confidenceScore * 100);
    return {
      id: feature.anomalyId || feature.id,
      mediaUrl: feature.imageUrl || '/images/defect-preview-frame.png',
      towerId: feature.towerId ?? null,
      towerCode: feature.towerCode || null,
      missionCode: null,
      missionName: feature.towerCode ? `Khảo sát vị trí ${feature.towerCode}` : 'Kiểm tra lưới điện',
      categoryName: feature.category,
      categoryCode: null,
      confidenceScore: Number.isFinite(score) ? score : 80,
      validationStatus: (effectiveStatus as AnomalyValidationStatus) || 'Pending',
      analystNotes: '',
      aiSource: 'Cloud (Server)',
      analysisRunId: null,
      executionLocation: 'Cloud',
      supersededById: null,
      createdAt: feature.detectedAt || new Date().toISOString(),
      severity: Math.round(feature.severity),
      isEmergency: feature.severity >= 4,
    };
  }

  protected navigateToReview(anomalyId: string, anomalyFeature?: GisAnomalyFeature): void {
    this.notificationsStore?.markReadByReference('detectedanomaly', anomalyId);
    const feature = anomalyFeature ?? this.anomalies().find((a) => a.anomalyId === anomalyId || a.id === anomalyId);
    let anomalyItem: AnomalyItem | undefined;
    if (feature) {
      anomalyItem = this.toAnomalyItem(feature);
      const aliasIds = [anomalyId, feature.id, feature.anomalyId].filter((id): id is string => Boolean(id));
      this.anomalyHistory.cacheItem(anomalyItem, aliasIds);
    }
    void this.router.navigate(['/ai-review', anomalyId], {
      state: anomalyItem ? { anomaly: anomalyItem } : undefined,
    });
  }

  protected regionName(regionId: string | undefined): string {
    return regionId ? this.regionNames().get(regionId) ?? '' : '';
  }

  protected openAnomaliesForTower(towerId: string, towerCode?: string): number {
    return this.anomalies().filter(
      (anomaly) =>
        (anomaly.towerId === towerId || Boolean(towerCode && anomaly.towerCode === towerCode)) &&
        !this.isAnomalyClosed(anomaly),
    ).length;
  }

  protected alertsForTower(towerId: string, towerCode?: string): readonly GisAlert[] {
    return this.alerts().filter((alert) => alert.towerId === towerId || Boolean(towerCode && alert.towerCode === towerCode));
  }

  protected anomaliesForTower(towerId: string, towerCode?: string): readonly GisAnomalyFeature[] {
    return this.anomalies().filter(
      (anomaly) => anomaly.towerId === towerId || Boolean(towerCode && anomaly.towerCode === towerCode),
    );
  }

  protected needsAiReview(anomaly: GisAnomalyFeature): boolean {
    const status = this.effectiveAnomalyStatus(anomaly).toLowerCase();
    return status === 'pending' || status === 'inreview';
  }

  /** GIS severity = category severity weight × 5 (0–5). */
  protected severityLabel(severity: number): string {
    return (Math.round(severity * 10) / 10).toString();
  }

  protected confidencePercent(score: number): number {
    return Math.round(score <= 1 ? score * 100 : score);
  }

  protected anomalyStatusLabel(status: string): string {
    return anomalyStatusLabel(status);
  }
}

function createTowerSvgIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'tower-node-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '13');
  svg.setAttribute('height', '13');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ['M12 2l6.5 19H5.5L12 2z', 'M7.5 14h9', 'M9.5 9h5']) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
