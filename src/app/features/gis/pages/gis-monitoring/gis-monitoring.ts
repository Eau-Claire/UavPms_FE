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
import * as L from 'leaflet';
import 'leaflet-draw';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { finalize } from 'rxjs';
import { GeoJsonPolygon, RegionLookup, SelectableAsset } from '../../../../models/assets.models';
import { Auth } from '../../../../core/auth/auth';
import { isManagerRole } from '../../../../core/auth/roles';
import { canAccess, ROUTE_ROLES } from '../../../../core/auth/route-access';
import { MissionTargetSelection, MissionTargetTower } from '../../../missions/data-access/mission-target-selection';
import { anomalyStatusLabel } from '../../../towers/data-access/tower-labels';
import {
  GisAlert,
  GisAnomalyFeature,
  GisApi,
  GisTower,
} from '../../data-access/gis-api';

export type MapType = 'google-streets' | 'google-hybrid' | 'google-terrain' | 'osm';
export type SelectionDrawMode = 'none' | 'rectangle' | 'polygon';
export type SelectionUxState = 'idle' | 'choosing' | 'drawing-rectangle' | 'drawing-polygon' | 'editing' | 'querying' | 'success' | 'empty' | 'error';

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
  imports: [DatePipe, RouterLink, FormsModule, NzIconModule],
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
  protected readonly targetSelection = inject(MissionTargetSelection);
  private readonly mapContainer = viewChild<ElementRef<HTMLDivElement>>('mapContainer');

  /** Area selection / target towers is a manager planning tool (it feeds `/pre-mission/new`). */
  protected readonly canCreateMission = computed(() => isManagerRole(this.auth.user()?.role));
  /** The anomaly drawer links to `/ai-review/:id` only for roles that route allows. */
  protected readonly canReviewAnomalies = computed(() => canAccess(this.auth.user()?.role, ROUTE_ROLES.aiReview));

  private map: L.Map | null = null;
  private currentTileLayer: L.TileLayer | null = null;
  private towersLayer = L.layerGroup();
  private defectsLayer = L.layerGroup();
  private alertsLayer = L.layerGroup();
  private selectionResultsLayer = L.layerGroup();
  private confirmedTargetsLayer = L.layerGroup();
  private selectionBoundary: L.Polygon | L.Rectangle | null = null;
  private readonly editableLayers = L.featureGroup();
  private editHandler: L.EditToolbar.Edit | null = null;
  private currentGeometry: GeoJsonPolygon | null = null;

  // Custom Live Drawing Layers & State
  private tempDrawLayer = L.layerGroup();
  private tempRect: L.Rectangle | null = null;
  private rectStartLatLng: L.LatLng | null = null;
  private isRectDragging = false;
  protected readonly polygonVertices = signal<L.LatLng[]>([]);
  private tempPolyline: L.Polyline | null = null;
  private tempRubberband: L.Polyline | null = null;
  private tempVertexMarkers: L.Marker[] = [];

  // Map type state
  protected readonly currentMapType = signal<MapType>('google-streets');

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

  // Filters
  protected readonly searchCode = signal('');
  protected readonly severityFilter = signal<string>('');
  protected readonly statusFilter = signal<string>('');

  // Computed metrics
  protected readonly totalTowersCount = computed(() => this.towers().length);
  protected readonly activeDefectsCount = computed(() => this.anomalies().length);
  /** GET /gis/infrastructure only returns alerts that are still Active. */
  protected readonly activeAlertsCount = computed(() => this.alerts().length);

  protected readonly filteredAnomalies = computed(() => {
    const list = this.anomalies();
    const query = this.searchCode().trim().toLowerCase();
    const minSeverity = Number(this.severityFilter() || 0);
    const status = this.statusFilter();

    return list.filter((item) => {
      if (query && !item.towerCode.toLowerCase().includes(query) && !item.category.toLowerCase().includes(query)) {
        return false;
      }
      if (minSeverity && item.severity < minSeverity - 0.5) {
        return false;
      }
      if (status && item.status.toLowerCase() !== status.toLowerCase()) {
        return false;
      }
      return true;
    });
  });

  ngAfterViewInit(): void {
    this.initLeafletMap();

    // 1. Initialize empty map layers
    this.renderAllLayers();
    this.fitMapBounds();

    // 2. Multi-stage layout synchronization across browser paint lifecycle
    requestAnimationFrame(() => {
      if (!this.map) return;
      this.map.invalidateSize();
      this.renderAllLayers();
      this.fitMapBounds();
    });

    setTimeout(() => {
      if (!this.map) return;
      this.map.invalidateSize();
      this.renderAllLayers();
      this.fitMapBounds();
    }, 200);

    setTimeout(() => {
      if (!this.map) return;
      this.map.invalidateSize();
      this.renderAllLayers();
      this.fitMapBounds();
    }, 500);

    // 3. Refresh live data from server asynchronously
    this.loadRegions();
    this.loadGisData();

    // 4. Responsive map resize synchronization
    const onResize = () => {
      this.map?.invalidateSize();
    };
    window.addEventListener('resize', onResize);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('resize', onResize);
    });
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  private initLeafletMap(): void {
    const container = this.mapContainer()?.nativeElement;
    if (!container) return;

    const vietnamBounds = L.latLngBounds([8.15, 102.0], [23.5, 110.0]);
    this.map = L.map(container, {
      center: [10.7769, 106.7009],
      zoom: 12,
      zoomControl: false,
      maxBounds: vietnamBounds,
      maxBoundsViscosity: 1,
    });

    // Custom zoom control in bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Apply initial Tile Layer (Google Maps Streets)
    this.setMapType('google-streets');

    // Add Layer Groups
    this.towersLayer.addTo(this.map);
    this.defectsLayer.addTo(this.map);
    this.alertsLayer.addTo(this.map);
    this.selectionResultsLayer.addTo(this.map);
    this.confirmedTargetsLayer.addTo(this.map);
    this.editableLayers.addTo(this.map);
    this.tempDrawLayer.addTo(this.map);

    // When map is ready in DOM, force immediate projection and layer rendering
    this.map.whenReady(() => {
      this.map?.invalidateSize();
      this.map?.fitBounds(vietnamBounds);
      this.renderAllLayers();
      this.fitMapBounds();
    });

    // Register Map Event Listeners for Live Custom Drawing
    this.map.on('mousedown', (e: L.LeafletMouseEvent) => this.onMapMouseDown(e));
    this.map.on('mousemove', (e: L.LeafletMouseEvent) => this.onMapMouseMove(e));
    this.map.on('mouseup', (e: L.LeafletMouseEvent) => this.onMapMouseUp(e));
    this.map.on('click', (e: L.LeafletMouseEvent) => this.onMapClick(e));
    this.map.on('dblclick', (e: L.LeafletMouseEvent) => this.onMapDblClick(e));
    this.map.on(L.Draw.Event.EDITED, () => this.onEditCompleted());
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
    this.editableLayers.clearLayers();
    this.selectionBoundary?.remove();
    this.selectionBoundary = null;
    this.currentGeometry = null;
    this.hasBoundary.set(false);
    this.spatialAssets.set([]);
    this.selectionResultsLayer.clearLayers();
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
        this.map.dragging.disable();
      } else if (mode === 'polygon') {
        this.map.doubleClickZoom.disable();
        this.polygonVertices.set([]);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Custom Live Rectangle & Polygon Drawing Handlers
  // ─────────────────────────────────────────────────────────────

  private onMapMouseDown(e: L.LeafletMouseEvent): void {
    if (this.drawMode() !== 'rectangle' || !this.map) return;
    if (e.originalEvent) {
      L.DomEvent.preventDefault(e.originalEvent);
    }
    this.isRectDragging = true;
    this.rectStartLatLng = e.latlng;

    if (this.tempRect) {
      this.tempRect.remove();
    }

    const bounds = L.latLngBounds(e.latlng, e.latlng);
    this.tempRect = L.rectangle(bounds, {
      color: '#4f46e5',
      weight: 2,
      fillColor: '#6366f1',
      fillOpacity: 0.16,
      dashArray: '6 4',
    }).addTo(this.tempDrawLayer);
  }

  private onMapMouseMove(e: L.LeafletMouseEvent): void {
    if (!this.map) return;

    // Rectangle live preview during drag
    if (this.drawMode() === 'rectangle' && this.isRectDragging && this.rectStartLatLng && this.tempRect) {
      if (e.originalEvent) {
        L.DomEvent.preventDefault(e.originalEvent);
      }
      const bounds = L.latLngBounds(this.rectStartLatLng, e.latlng);
      this.tempRect.setBounds(bounds);
      return;
    }

    // Polygon live rubberband guide line
    if (this.drawMode() === 'polygon') {
      const points = this.polygonVertices();
      if (points.length > 0) {
        const lastPoint = points[points.length - 1];
        if (!this.tempRubberband) {
          this.tempRubberband = L.polyline([lastPoint, e.latlng], {
            color: '#4f46e5',
            weight: 2,
            dashArray: '4 4',
            opacity: 0.8,
          }).addTo(this.tempDrawLayer);
        } else {
          this.tempRubberband.setLatLngs([lastPoint, e.latlng]);
        }
      }
    }
  }

  private onMapMouseUp(e: L.LeafletMouseEvent): void {
    if (this.drawMode() !== 'rectangle' || !this.isRectDragging || !this.rectStartLatLng || !this.map) return;
    if (e.originalEvent) {
      L.DomEvent.preventDefault(e.originalEvent);
    }
    this.isRectDragging = false;

    const bounds = L.latLngBounds(this.rectStartLatLng, e.latlng);
    const startPoint = this.map.latLngToLayerPoint(this.rectStartLatLng);
    const endPoint = this.map.latLngToLayerPoint(e.latlng);
    const distance = startPoint.distanceTo(endPoint);

    this.tempRect?.remove();
    this.tempRect = null;
    this.rectStartLatLng = null;

    if (distance >= 8) {
      const geojson = rectangleToPolygon(bounds.getNorthEast(), bounds.getSouthWest());
      this.resolveGeometry(geojson);
    }
  }

  private onMapClick(e: L.LeafletMouseEvent): void {
    if (this.drawMode() !== 'polygon' || !this.map) return;

    const currentPoints = this.polygonVertices();

    // Check if clicked near the first point to close polygon
    if (currentPoints.length >= 3) {
      const firstPointPx = this.map.latLngToLayerPoint(currentPoints[0]);
      const clickPx = this.map.latLngToLayerPoint(e.latlng);
      if (firstPointPx.distanceTo(clickPx) <= 18) {
        this.completePolygon();
        return;
      }
    }

    // Add new vertex to polygon
    const newPoints = [...currentPoints, e.latlng];
    this.polygonVertices.set(newPoints);

    // Create marker for this vertex
    const isFirst = newPoints.length === 1;
    const markerIcon = L.divIcon({
      className: `leaflet-editing-icon ${isFirst ? 'first-vertex-marker' : ''}`,
      iconSize: isFirst ? [14, 14] : [10, 10],
      iconAnchor: isFirst ? [7, 7] : [5, 5],
    });

    const marker = L.marker(e.latlng, { icon: markerIcon }).addTo(this.tempDrawLayer);

    if (isFirst) {
      marker.bindTooltip('Nhấp vào đây để hoàn tất vùng', { direction: 'top', offset: [0, -8] });
      marker.on('click', (ev: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(ev);
        if (this.polygonVertices().length >= 3) {
          this.completePolygon();
        }
      });
    }

    this.tempVertexMarkers.push(marker);

    // Update connecting polyline
    if (!this.tempPolyline) {
      this.tempPolyline = L.polyline(newPoints, {
        color: '#4f46e5',
        weight: 2.5,
        opacity: 0.9,
      }).addTo(this.tempDrawLayer);
    } else {
      this.tempPolyline.setLatLngs(newPoints);
    }
  }

  private onMapDblClick(e: L.LeafletMouseEvent): void {
    if (this.drawMode() === 'polygon' && this.polygonVertices().length >= 3) {
      L.DomEvent.stopPropagation(e);
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
    if (!this.map) return;
    this.selectionBoundary?.remove();
    const points = geometry.coordinates[0].map(([lng, lat]) => [lat, lng] as L.LatLngTuple);
    this.selectionBoundary = L.polygon(points, {
      color: '#4f46e5',
      weight: 2.5,
      fillColor: '#6366f1',
      fillOpacity: 0.14,
      dashArray: '6 4',
    }).addTo(this.map);
    this.editableLayers.clearLayers();
    this.editableLayers.addLayer(this.selectionBoundary);
    this.hasBoundary.set(true);
  }

  private queryLayer(layer: L.Polygon | L.Rectangle): void {
    const geoJson = layer.toGeoJSON().geometry;
    if (geoJson.type !== 'Polygon') return;
    this.resolveGeometry({ type: 'Polygon', coordinates: geoJson.coordinates as unknown as GeoJsonPolygon['coordinates'] });
  }

  protected startEditing(): void {
    if (!this.hasBoundary()) return;
    this.cancelActiveTool();
    this.uxState.set('editing');
    if (!this.map) return;
    this.editHandler = new L.EditToolbar.Edit(this.map as unknown as L.DrawMap, {
      featureGroup: this.editableLayers,
      selectedPathOptions: { color: '#4338ca', weight: 3, fillOpacity: 0.18, dashArray: undefined },
    });
    this.editHandler.enable();
  }

  protected finishEditing(): void {
    if (!this.editHandler) return;
    this.editHandler.save();
    this.editHandler.disable();
    this.editHandler = null;
  }

  protected onEditCompleted(): void {
    const layer = this.editableLayers.getLayers()[0];
    if (layer instanceof L.Polygon) this.queryLayer(layer);
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
    // Reset Custom Drawing State
    this.isRectDragging = false;
    this.rectStartLatLng = null;
    this.tempRect?.remove();
    this.tempRect = null;
    this.tempPolyline?.remove();
    this.tempPolyline = null;
    this.tempRubberband?.remove();
    this.tempRubberband = null;
    this.tempVertexMarkers.forEach((m) => m.remove());
    this.tempVertexMarkers = [];
    this.polygonVertices.set([]);
    this.tempDrawLayer.clearLayers();

    if (this.map) {
      this.map.dragging.enable();
      this.map.doubleClickZoom.enable();
    }

    this.editHandler?.revertLayers();
    this.editHandler?.disable();
    this.editHandler = null;
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
    this.editableLayers.clearLayers();
    this.selectionBoundary?.remove();
    this.selectionBoundary = null;
    this.currentGeometry = null;
    this.hasBoundary.set(false);
    this.spatialAssets.set([]);
    this.selectionResultsLayer.clearLayers();
    this.renderConfirmedTargetMarkers();
    this.spatialMessage.set('');
    this.uxState.set(this.showSelectionPopup() ? 'choosing' : 'idle');
  }

  protected renderSpatialAssets(): void {
    this.selectionResultsLayer.clearLayers();
    this.spatialAssets().forEach((asset) => {
      const selected = this.targetSelection.has(asset.towerId);
      const marker = L.circleMarker([asset.latitude, asset.longitude], {
        radius: 8, color: selected ? '#15803d' : '#7c3aed', fillColor: selected ? '#22c55e' : '#a78bfa', fillOpacity: 0.9,
      });
      marker.bindTooltip(`<strong>${asset.code}</strong><br>${asset.name}`);
      marker.on('click', () => { this.toggleAsset(asset); });
      this.selectionResultsLayer.addLayer(marker);
    });
    this.renderConfirmedTargetMarkers();
  }

  private renderConfirmedTargetMarkers(): void {
    this.confirmedTargetsLayer.clearLayers();
    this.targetSelection.selected().forEach((asset) => {
      const icon = L.divIcon({ className: 'confirmed-target-marker', html: '<span>✓</span>', iconSize: [24, 24], iconAnchor: [12, 12] });
      L.marker([asset.latitude, asset.longitude], { icon, zIndexOffset: 900 })
        .bindTooltip(`<strong>Đã chọn: ${asset.towerCode}</strong>`)
        .addTo(this.confirmedTargetsLayer);
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

  protected setMapType(type: MapType): void {
    if (!this.map) return;
    this.currentMapType.set(type);

    if (this.currentTileLayer) {
      this.map.removeLayer(this.currentTileLayer);
      this.currentTileLayer = null;
    }

    let tileUrl: string;
    let maxZoom = 20;
    let subdomains: string[] = ['mt0', 'mt1', 'mt2', 'mt3'];
    let attribution = '© Google Maps | UAV-PMS Power Grid GIS';

    switch (type) {
      case 'google-streets':
        tileUrl = 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
        break;
      case 'google-hybrid':
        tileUrl = 'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
        break;
      case 'google-terrain':
        tileUrl = 'https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}';
        break;
      case 'osm':
      default:
        tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        subdomains = ['a', 'b', 'c'];
        maxZoom = 19;
        attribution = '© OpenStreetMap contributors | UAV-PMS Power Grid GIS';
        break;
    }

    this.currentTileLayer = L.tileLayer(tileUrl, {
      maxZoom,
      subdomains,
      attribution,
      updateWhenIdle: false,
      updateWhenZooming: false,
      keepBuffer: 6,
    });

    this.currentTileLayer.addTo(this.map);
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
          this.renderAllLayers();
          this.fitMapBounds();
        },
        error: (error: unknown) => {
          const status = error instanceof Object && 'status' in error ? Number(error.status) : 0;
          this.error.set(status === 403 ? '403 — Bạn không có quyền xem dữ liệu GIS.' : 'Không thể tải dữ liệu GIS. Vui lòng thử lại.');
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

  private renderTowers(): void {
    this.towersLayer.clearLayers();
    if (!this.showTowersLayer()) return;

    this.towers().forEach((tower) => {
      const icon = L.divIcon({
        className: 'custom-tower-marker',
        html: `<svg class="tower-node-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l6.5 19H5.5L12 2z"/><path d="M7.5 14h9"/><path d="M9.5 9h5"/></svg>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      const marker = L.marker([tower.latitude, tower.longitude], { icon });
      marker.on('click', () => {
        this.selectedEntity.set({ type: 'tower', data: tower });
        this.targetSelection.add({ towerId: tower.id, towerCode: tower.towerCode, regionId: tower.regionId, latitude: tower.latitude, longitude: tower.longitude });
        this.renderSpatialAssets();
      });

      const subtitle = [this.regionName(tower.regionId), tower.poleType].filter(Boolean).join(' · ');
      marker.bindTooltip(
        `<div style="font-weight: 700; font-size: 13px;">${escapeHtml(tower.towerCode)}</div><div style="font-size: 11px; color: #64748b;">${escapeHtml(subtitle)}</div>`,
        { direction: 'top', offset: [0, -10] },
      );

      this.towersLayer.addLayer(marker);
    });
  }

  private renderDefects(): void {
    this.defectsLayer.clearLayers();
    if (!this.showDefectsLayer()) return;

    const defects = this.filteredAnomalies();
    defects.forEach((defect) => {
      const sevClass = defect.severity >= 4.5 ? 'sev-critical' : defect.severity >= 3.5 ? 'sev-high' : 'sev-med';
      const icon = L.divIcon({
        className: `custom-defect-marker ${sevClass}`,
        html: `<span>!</span>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([defect.latitude, defect.longitude], { icon });
      marker.on('click', () => {
        this.selectedEntity.set({ type: 'anomaly', data: defect });
      });

      marker.bindTooltip(
        `<div style="font-weight: 700; color: #dc2626;">${escapeHtml(defect.category)}</div><div style="font-size: 11px;">${escapeHtml(defect.towerCode)} · Mức độ ${this.severityLabel(defect.severity)}/5 · AI ${this.confidencePercent(defect.confidenceScore)}%</div>`,
        { direction: 'top', offset: [0, -10] },
      );

      this.defectsLayer.addLayer(marker);
    });
  }

  private renderAlerts(): void {
    this.alertsLayer.clearLayers();
    if (!this.showAlertsLayer()) return;

    this.alerts().forEach((alert) => {
      const icon = L.divIcon({
        className: 'custom-alert-marker',
        html: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([alert.latitude, alert.longitude], { icon, zIndexOffset: 1000 });
      marker.on('click', () => {
        this.selectedEntity.set({ type: 'alert', data: alert });
      });

      marker.bindTooltip(
        `<div style="font-weight: 800; color: #dc2626;">${escapeHtml(alert.title)}</div><div style="font-size: 11px;">Ưu tiên: ${escapeHtml(alert.priority)}</div>`,
        { direction: 'top', offset: [0, -14] },
      );

      this.alertsLayer.addLayer(marker);
    });
  }

  protected applyFilters(): void {
    this.renderDefects();
  }

  protected resetFilters(): void {
    this.searchCode.set('');
    this.severityFilter.set('');
    this.statusFilter.set('');
    this.renderDefects();
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
      this.renderAlerts();
    }
  }

  protected fitMapBounds(): void {
    if (!this.map) return;
    const points = this.towers().map((tower) => L.latLng(tower.latitude, tower.longitude));
    if (points.length) {
      this.map.fitBounds(L.latLngBounds(points).pad(0.15), { maxZoom: 15 });
      return;
    }
    this.map.fitBounds(L.latLngBounds([8.15, 102.0], [23.5, 110.0]));
  }

  protected closeDrawer(): void {
    this.selectedEntity.set(null);
  }

  protected navigateToReview(anomalyId: string): void {
    void this.router.navigate(['/ai-review', anomalyId]);
  }

  protected regionName(regionId: string | undefined): string {
    return regionId ? this.regionNames().get(regionId) ?? '' : '';
  }

  protected openAnomaliesForTower(towerId: string): number {
    return this.anomalies().filter((anomaly) => anomaly.towerId === towerId).length;
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

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
