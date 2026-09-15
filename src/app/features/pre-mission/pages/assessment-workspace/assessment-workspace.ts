import { DatePipe } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import * as L from 'leaflet';
import { NzIconModule } from 'ng-zorro-antd/icon';
import {
  DroneTechnicalInspectionResult,
  PreMissionAssessment,
  UavCandidate,
} from '../../../../models/pre-mission.models';
import { statusLabel, statusTone } from '../../../../shared/status/status';
import { PreMissionApi } from '../../data-access/pre-mission-api';

export type WorkspaceTab = 'overview' | 'site' | 'personnel' | 'uav' | 'technical';

@Component({
  selector: 'app-assessment-workspace',
  imports: [RouterLink, DatePipe, NzIconModule],
  templateUrl: './assessment-workspace.html',
  styleUrl: './assessment-workspace.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssessmentWorkspace implements AfterViewInit, OnDestroy {
  private readonly api = inject(PreMissionApi);
  private readonly route = inject(ActivatedRoute);

  protected readonly mapContainer = viewChild<ElementRef<HTMLDivElement>>('scopeMapContainer');

  protected readonly item = signal<PreMissionAssessment | null>(null);
  protected readonly error = signal('');
  protected readonly actionMessage = signal('');
  protected readonly busy = signal(false);
  protected readonly activeTab = signal<WorkspaceTab>('overview');

  // Personnel filter in Tab 3
  protected readonly personnelSearch = signal('');

  // Drone Technical Inspection in Tab 5
  protected readonly selectedDroneId = signal<string>('');
  protected readonly inspectionResult = signal<DroneTechnicalInspectionResult | null>(null);
  protected readonly inspecting = signal(false);

  // Leaflet map
  private map: L.Map | null = null;
  private markersLayer = L.layerGroup();
  private polylineLayer = L.layerGroup();

  protected readonly isReady = computed(() => {
    const a = this.item();
    return a?.status === 'READY';
  });

  protected readonly isExpired = computed(() => {
    const a = this.item();
    if (!a || !a.validUntil) return false;
    return new Date(a.validUntil).getTime() < Date.now();
  });

  protected readonly isEvaluating = computed(() => {
    return this.item()?.status === 'EVALUATING';
  });

  protected readonly isCancelled = computed(() => {
    return this.item()?.status === 'CANCELLED';
  });

  protected readonly isConsumed = computed(() => {
    return this.item()?.status === 'CONSUMED';
  });

  protected readonly canProceedToMf02 = computed(() => {
    return this.isReady() && !this.isExpired() && !this.isConsumed() && !this.isCancelled();
  });

  protected readonly failedConditions = computed(() => {
    const a = this.item();
    if (!a) return [];
    const list: { pillar: string; reason: string; actionTab: WorkspaceTab; actionLabel: string }[] = [];

    if (a.site.status !== 'PASS' && a.site.status !== 'FEASIBLE') {
      list.push({
        pillar: 'Mặt bằng khảo sát',
        reason: a.site.reason || 'Chưa thỏa mãn tĩnh không hoặc điều kiện thời tiết gió vượt ngưỡng.',
        actionTab: 'site',
        actionLabel: 'Xem chi tiết mặt bằng',
      });
    }

    if (a.personnel.status !== 'PASS' && a.personnel.status !== 'READY') {
      list.push({
        pillar: 'Nhân sự vận hành',
        reason: a.personnel.reason || 'Chưa có đủ ứng viên phi công / cán bộ giám sát đạt chuẩn khả dụng.',
        actionTab: 'personnel',
        actionLabel: 'Kiểm tra ứng viên nhân sự',
      });
    }

    if (a.uav.status !== 'PASS' && a.uav.status !== 'READY') {
      list.push({
        pillar: 'Phương tiện UAV',
        reason: a.uav.reason || 'Chưa có UAV nào đạt hạn kiểm định hoặc khả dụng trong khung giờ này.',
        actionTab: 'uav',
        actionLabel: 'Xem danh sách thiết bị bay',
      });
    }

    if (a.technical.status !== 'PASS' && a.technical.status !== 'HEALTHY') {
      list.push({
        pillar: 'Sức khỏe kỹ thuật',
        reason: a.technical.reason || 'Cần thực hiện kiểm định kỹ thuật tự động (BIST/Telemetry) trước khi bay.',
        actionTab: 'technical',
        actionLabel: 'Chạy kiểm định kỹ thuật',
      });
    }

    return list;
  });

  protected readonly filteredPersonnel = computed(() => {
    const a = this.item();
    if (!a) return [];
    const q = this.personnelSearch().trim().toLowerCase();
    if (!q) return a.personnelCandidates;
    return a.personnelCandidates.filter(
      (p) => p.name.toLowerCase().includes(q) || p.role.toLowerCase().includes(q) || (p.region && p.region.toLowerCase().includes(q))
    );
  });

  constructor() {
    this.load();
  }

  ngAfterViewInit(): void {
    if (this.activeTab() === 'overview' || this.activeTab() === 'site') {
      setTimeout(() => this.initOrUpdateMap(), 150);
    }
  }

  ngOnDestroy(): void {
    this.cleanupMap();
  }

  protected load(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Không tìm thấy mã định danh đánh giá.');
      return;
    }
    this.busy.set(true);
    this.api.get(id).subscribe({
      next: (res) => {
        this.item.set(res);
        if (res.uavCandidates.length > 0 && !this.selectedDroneId()) {
          this.selectedDroneId.set(res.uavCandidates[0].id || res.uavCandidates[0].code);
        }
        if (res.droneInspection) {
          this.inspectionResult.set(res.droneInspection);
        }
        setTimeout(() => this.initOrUpdateMap(), 200);
      },
      error: () => {
        this.error.set('Đánh giá tiền nhiệm vụ không tồn tại hoặc bạn không có quyền truy cập.');
      },
      complete: () => {
        this.busy.set(false);
      },
    });
  }

  protected reevaluate(): void {
    const a = this.item();
    if (!a || this.busy()) return;
    this.busy.set(true);
    this.actionMessage.set('');
    this.error.set('');

    this.api.reEvaluate(a.id).subscribe({
      next: (updated) => {
        this.item.set(updated);
        this.actionMessage.set('Đã hoàn tất đánh giá lại tính khả thi và tài nguyên.');
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Không thể thực hiện đánh giá lại. Vui lòng thử lại sau.');
      },
      complete: () => {
        this.busy.set(false);
      },
    });
  }

  protected cancelAssessment(): void {
    const a = this.item();
    if (!a || this.busy()) return;
    if (a.status === 'CONSUMED') {
      this.error.set('Không thể hủy đánh giá đã được chuyển tiếp tạo nhiệm vụ.');
      return;
    }

    const confirmed = window.confirm(`Bạn có chắc muốn hủy bản đánh giá tiền nhiệm vụ ${a.assessmentCode}? Thao tác này không thể đảo ngược.`);
    if (!confirmed) return;

    this.busy.set(true);
    this.error.set('');
    this.api.cancel(a.id, 'Người dùng hủy tại trang chi tiết').subscribe({
      next: (updated) => {
        this.item.set(updated);
        this.actionMessage.set(`Đã hủy bản đánh giá ${a.assessmentCode}.`);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Không thể hủy bản đánh giá.');
      },
      complete: () => {
        this.busy.set(false);
      },
    });
  }

  protected setTab(tab: WorkspaceTab): void {
    this.activeTab.set(tab);
    if (tab === 'overview' || tab === 'site') {
      setTimeout(() => this.initOrUpdateMap(), 150);
    } else if (tab === 'technical') {
      const droneId = this.selectedDroneId();
      if (droneId && !this.inspectionResult()) {
        this.loadLatestInspection(droneId);
      }
    }
  }

  protected selectDroneForInspection(drone: UavCandidate): void {
    const droneId = drone.id || drone.code;
    this.selectedDroneId.set(droneId);
    this.setTab('technical');
    this.loadLatestInspection(droneId);
  }

  protected loadLatestInspection(droneId: string): void {
    this.inspecting.set(true);
    this.api.getLatestTechnicalInspection(droneId).subscribe({
      next: (res) => {
        this.inspectionResult.set(res);
        this.inspecting.set(false);
      },
      error: () => {
        this.inspecting.set(false);
      },
    });
  }

  protected runInspectionNow(): void {
    const droneId = this.selectedDroneId() || (this.item()?.uavCandidates[0]?.id ?? 'UAV-01');
    this.inspecting.set(true);
    this.actionMessage.set('');
    this.error.set('');

    this.api.runTechnicalInspection(droneId).subscribe({
      next: (res) => {
        this.inspectionResult.set(res);
        this.inspecting.set(false);
        this.actionMessage.set(`Đã hoàn tất kiểm định kỹ thuật cho thiết bị ${res.droneCode}. Kết quả: ${res.overallHealth}.`);

        // If inspection passes, trigger re-evaluation to update assessment overall status
        const a = this.item();
        if (a && res.overallHealth === 'HEALTHY') {
          this.api.reEvaluate(a.id).subscribe({
            next: (updated) => this.item.set(updated),
          });
        }
      },
      error: () => {
        this.inspecting.set(false);
        this.error.set('Lỗi kết nối khi gửi lệnh kiểm định UAV.');
      },
    });
  }

  private initOrUpdateMap(): void {
    const container = this.mapContainer()?.nativeElement;
    if (!container) return;

    if (!this.map) {
      this.map = L.map(container, {
        center: [10.8231, 106.6297], // Default southern region
        zoom: 13,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap EVN-UAV',
      }).addTo(this.map);

      this.markersLayer.addTo(this.map);
      this.polylineLayer.addTo(this.map);
    }

    this.map.invalidateSize();
    this.renderScopeOnMap();
  }

  private renderScopeOnMap(): void {
    if (!this.map) return;
    this.markersLayer.clearLayers();
    this.polylineLayer.clearLayers();

    const a = this.item();
    if (!a || !a.scopeAssetIds || a.scopeAssetIds.length === 0) return;

    // Generate coordinated sample waypoints along line
    const baseLat = 10.82;
    const baseLng = 106.63;
    const latLngs: L.LatLngExpression[] = [];

    a.scopeAssetIds.forEach((code, idx) => {
      const lat = baseLat + idx * 0.005;
      const lng = baseLng + idx * 0.007;
      latLngs.push([lat, lng]);

      const marker = L.circleMarker([lat, lng], {
        radius: 7,
        fillColor: '#1d4f91',
        color: '#ffffff',
        weight: 2,
        fillOpacity: 0.9,
      });
      marker.bindPopup(`<strong>Vị trí cột:</strong> ${code}<br/><strong>Tuyến:</strong> ${a.lineName || 'N/A'}`);
      marker.bindTooltip(code, { permanent: true, direction: 'top', className: 'evn-map-tooltip' });
      this.markersLayer.addLayer(marker);
    });

    if (latLngs.length > 1) {
      const poly = L.polyline(latLngs, {
        color: '#0284c7',
        weight: 3,
        dashArray: '6, 6',
      });
      this.polylineLayer.addLayer(poly);
    }

    if (latLngs.length > 0) {
      const bounds = L.latLngBounds(latLngs);
      this.map.fitBounds(bounds, { padding: [30, 30] });
    }
  }

  private cleanupMap(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  protected statusTone = statusTone;
  protected statusLabel = statusLabel;
}
