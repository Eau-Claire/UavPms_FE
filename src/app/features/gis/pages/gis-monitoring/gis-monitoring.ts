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
import { NzIconModule } from 'ng-zorro-antd/icon';
import { finalize, forkJoin } from 'rxjs';
import {
  GisAlert,
  GisAnomalyFeature,
  GisApi,
  GisTower,
  GisTransmissionLine,
} from '../../data-access/gis-api';

export type MapType = 'google-streets' | 'google-hybrid' | 'google-terrain' | 'osm';

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
})
export class GisMonitoring implements AfterViewInit, OnDestroy {
  private readonly gisApi = inject(GisApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly mapContainer = viewChild<ElementRef<HTMLDivElement>>('mapContainer');

  private map: L.Map | null = null;
  private currentTileLayer: L.TileLayer | null = null;
  private towersLayer = L.layerGroup();
  private linesLayer = L.layerGroup();
  private defectsLayer = L.layerGroup();
  private alertsLayer = L.layerGroup();

  // Map type state
  protected readonly currentMapType = signal<MapType>('google-streets');

  // Raw data signals
  protected readonly towers = signal<readonly GisTower[]>([]);
  protected readonly lines = signal<readonly GisTransmissionLine[]>([]);
  protected readonly anomalies = signal<readonly GisAnomalyFeature[]>([]);
  protected readonly alerts = signal<readonly GisAlert[]>([]);

  // State signals
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly showFilterPanel = signal(false);
  protected readonly showLegendPanel = signal(true);
  protected readonly selectedEntity = signal<SelectedGisEntity | null>(null);

  // Layer Visibility
  protected readonly showTowersLayer = signal(true);
  protected readonly showLinesLayer = signal(true);
  protected readonly showDefectsLayer = signal(true);
  protected readonly showAlertsLayer = signal(true);

  // Filters
  protected readonly searchCode = signal('');
  protected readonly severityFilter = signal<string>('');
  protected readonly statusFilter = signal<string>('');

  // Computed metrics
  protected readonly totalTowersCount = computed(() => this.towers().length);
  protected readonly activeDefectsCount = computed(() => this.anomalies().length);
  protected readonly criticalAlertsCount = computed(
    () => this.alerts().filter((a) => a.priority === 'Critical' && a.status === 'Active').length,
  );

  protected readonly filteredAnomalies = computed(() => {
    const list = this.anomalies();
    const query = this.searchCode().trim().toLowerCase();
    const sev = this.severityFilter();
    const status = this.statusFilter();

    return list.filter((item) => {
      if (query && !item.assetCode.toLowerCase().includes(query) && !item.towerCode.toLowerCase().includes(query)) {
        return false;
      }
      if (sev && String(item.severity) !== sev) {
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
    this.loadGisData();

    // Ensure map tiles resize correctly
    setTimeout(() => {
      this.map?.invalidateSize();
    }, 250);
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

    // Hanoi / Hoa Binh default grid coordinates
    this.map = L.map(container, {
      center: [21.015, 105.815],
      zoom: 13,
      zoomControl: false,
    });

    // Custom zoom control in bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Apply initial Tile Layer (Google Maps Streets)
    this.setMapType('google-streets');

    // Add Layer Groups
    this.linesLayer.addTo(this.map);
    this.towersLayer.addTo(this.map);
    this.defectsLayer.addTo(this.map);
    this.alertsLayer.addTo(this.map);
  }

  protected setMapType(type: MapType): void {
    if (!this.map) return;
    this.currentMapType.set(type);

    if (this.currentTileLayer) {
      this.map.removeLayer(this.currentTileLayer);
      this.currentTileLayer = null;
    }

    let tileUrl = '';
    let maxZoom = 20;
    let subdomains: string[] = ['mt0', 'mt1', 'mt2', 'mt3'];
    let attribution = '© Google Maps | UAV-PMS Power Grid GIS';

    switch (type) {
      case 'google-streets':
        // Google Maps Standard Road / Street Map
        tileUrl = 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
        break;
      case 'google-hybrid':
        // Google Maps Satellite with Street Names & Labels
        tileUrl = 'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
        break;
      case 'google-terrain':
        // Google Maps Terrain / Topography
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
    });

    this.currentTileLayer.addTo(this.map);
  }

  protected loadGisData(): void {
    this.loading.set(true);
    this.error.set('');

    forkJoin({
      towers: this.gisApi.getTowersInBBox({ minLat: 20.9, minLng: 105.7, maxLat: 21.1, maxLng: 105.9 }),
      anomalies: this.gisApi.getAnomaliesGeoJson(),
      alerts: this.gisApi.getActiveAlerts(),
      allData: this.gisApi.getAllGisData(),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (data) => {
          this.towers.set(data.towers.length ? data.towers : data.allData.towers);
          this.lines.set(data.allData.lines);
          this.anomalies.set(data.anomalies.length ? data.anomalies : data.allData.anomalies);
          this.alerts.set(data.alerts.length ? data.alerts : data.allData.alerts);

          this.renderAllLayers();
          this.fitMapBounds();
        },
        error: () => {
          this.error.set('Không thể tải dữ liệu bản đồ từ máy chủ.');
        },
      });
  }

  private renderAllLayers(): void {
    this.renderTransmissionLines();
    this.renderTowers();
    this.renderDefects();
    this.renderAlerts();
  }

  private renderTransmissionLines(): void {
    this.linesLayer.clearLayers();
    if (!this.showLinesLayer()) return;

    this.lines().forEach((line) => {
      const is500kV = line.voltage.includes('500');
      const coords = line.coordinates as unknown as L.LatLngExpression[];
      const polyline = L.polyline(coords, {
        color: is500kV ? '#dc2626' : '#0284c7',
        weight: is500kV ? 5 : 4,
        opacity: 0.9,
        dashArray: is500kV ? '10, 5' : undefined,
      });

      polyline.bindTooltip(
        `<div style="font-weight: 700; font-size: 13px;">${line.lineName}</div><div style="font-size: 11px; color: #64748b;">Cấp điện áp: ${line.voltage}</div>`,
        { sticky: true },
      );

      this.linesLayer.addLayer(polyline);
    });
  }

  private renderTowers(): void {
    this.towersLayer.clearLayers();
    if (!this.showTowersLayer()) return;

    this.towers().forEach((tower) => {
      const icon = L.divIcon({
        className: 'custom-tower-marker',
        html: `<span class="tower-label" style="font-size: 11px; font-weight: 800;">⚡</span>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const marker = L.marker([tower.latitude, tower.longitude], { icon });
      marker.on('click', () => {
        this.selectedEntity.set({ type: 'tower', data: tower });
      });

      marker.bindTooltip(
        `<div style="font-weight: 700; font-size: 13px;">${tower.towerCode}</div><div style="font-size: 11px; color: #64748b;">${tower.transmissionLineName || ''}</div>`,
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
      const sevClass = defect.severity >= 5 ? 'sev-critical' : defect.severity >= 4 ? 'sev-high' : 'sev-med';
      const icon = L.divIcon({
        className: `custom-defect-marker ${sevClass}`,
        html: `<span>!</span>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([defect.latitude, defect.longitude], { icon });
      marker.on('click', () => {
        this.selectedEntity.set({ type: 'anomaly', data: defect });
      });

      marker.bindTooltip(
        `<div style="font-weight: 700; color: #dc2626;">⚠️ ${defect.category}</div><div style="font-size: 11px;">Mức độ: Cấp ${defect.severity}/5 (${defect.confidenceScore}% AI)</div>`,
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
        html: `<span>🔥</span>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const marker = L.marker([alert.latitude, alert.longitude], { icon, zIndexOffset: 1000 });
      marker.on('click', () => {
        this.selectedEntity.set({ type: 'alert', data: alert });
      });

      marker.bindTooltip(
        `<div style="font-weight: 800; color: #dc2626;">🔥 ${alert.title}</div><div style="font-size: 11px;">Ưu tiên: ${alert.priority}</div>`,
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

  protected toggleLayer(type: 'towers' | 'lines' | 'defects' | 'alerts'): void {
    if (type === 'towers') {
      this.showTowersLayer.update((v) => !v);
      this.renderTowers();
    } else if (type === 'lines') {
      this.showLinesLayer.update((v) => !v);
      this.renderTransmissionLines();
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
    const towerCoords = this.towers().map((t) => [t.latitude, t.longitude] as [number, number]);
    if (towerCoords.length) {
      const bounds = L.latLngBounds(towerCoords);
      this.map.fitBounds(bounds, { padding: [60, 60] });
    }
  }

  protected closeDrawer(): void {
    this.selectedEntity.set(null);
  }

  protected navigateToReview(anomalyId: string): void {
    void this.router.navigate(['/ai-review', anomalyId]);
  }
}
