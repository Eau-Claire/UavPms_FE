import { NotificationsRealtime, AssessmentRealtimeEvent } from '../../../notifications/data-access/notifications-realtime';
import { Subscription } from 'rxjs';
import { DatePipe, Location } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import * as L from 'leaflet';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Auth } from '../../../../core/auth/auth';
import {
  DroneTechnicalInspectionResult,
  PersonnelCandidate,
  PreMissionAssessment,
  UavCandidate,
} from '../../../../models/pre-mission.models';
import { statusLabel, statusTone } from '../../../../shared/status/status';
import { defaultSiteChecks, PreMissionApi, RealtimeWeatherSnapshot } from '../../data-access/pre-mission-api';
import { GisApi, GisTower } from '../../../gis/data-access/gis-api';

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
  private readonly router = inject(Router);
  private readonly auth = inject(Auth);
  private readonly location = inject(Location);
  private readonly gisApi = inject(GisApi);
  private readonly realtime = inject(NotificationsRealtime);
  private realtimeSub: Subscription | null = null;
  protected readonly availableTowers = signal<readonly GisTower[]>([]);

  protected readonly scopeMapContainer = viewChild<ElementRef<HTMLDivElement>>('scopeMapContainer');
  protected readonly siteMapContainer = viewChild<ElementRef<HTMLDivElement>>('siteMapContainer');

  protected readonly currentUser = this.auth.user;
  protected readonly canManage = computed(() => {
    const role = this.currentUser()?.role;
    return !role || role === 'SystemAdmin' || role === 'Manager';
  });
  protected readonly canInspectDrone = computed(() => {
    const role = this.currentUser()?.role;
    return !role || role === 'SystemAdmin' || role === 'Technician' || role === 'Inspector' || role === 'Manager';
  });

  protected readonly item = signal<PreMissionAssessment | null>(null);
  protected readonly error = signal('');
  protected readonly actionMessage = signal('');
  protected readonly isStaleConflict = signal(false);
  protected readonly busy = signal(false);
  protected readonly activeTab = signal<WorkspaceTab>('overview');

  // Personnel filter in Tab 3
  protected readonly personnelSearch = signal('');

  // Drone Technical Inspection in Tab 5
  protected readonly selectedDroneId = signal<string>('');
  protected readonly inspectionResult = signal<DroneTechnicalInspectionResult | null>(null);
  protected readonly inspecting = signal(false);

  // Real-time weather observation
  protected readonly realtimeWeather = signal<RealtimeWeatherSnapshot | null>(null);
  protected readonly loadingWeather = signal(false);

  // Leaflet map
  private map: L.Map | null = null;
  private currentTileLayer: L.TileLayer | null = null;
  private markersLayer = L.layerGroup();
  private polylineLayer = L.layerGroup();
  private bufferLayer = L.layerGroup();
  private resizeObserver: ResizeObserver | null = null;
  protected readonly currentMapType = signal<'google-streets' | 'google-hybrid' | 'google-terrain' | 'carto'>('google-streets');

  protected readonly isReady = computed(() => {
    const a = this.item();
    return a?.status?.toUpperCase() === 'READY';
  });

  protected readonly isExpired = computed(() => {
    const a = this.item();
    if (!a || !a.validUntil) return false;
    return new Date(a.validUntil).getTime() < Date.now();
  });

  protected readonly isEvaluating = computed(() => {
    return this.item()?.status?.toUpperCase() === 'EVALUATING';
  });

  protected readonly isCancelled = computed(() => {
    return this.item()?.status?.toUpperCase() === 'CANCELLED';
  });

  protected readonly isCompleted = computed(() => {
    const s = this.item()?.status?.toUpperCase();
    return s === 'COMPLETED' || s === 'CONSUMED';
  });

  protected readonly isConsumed = this.isCompleted;

  protected readonly selectedRoleFilter = signal<'ALL' | 'INSPECTOR' | 'ANALYST' | 'TECHNICIAN'>('ALL');
  protected readonly onlyAvailableFilter = signal<boolean>(true);
  protected readonly editingQuotas = signal<boolean>(false);
  protected readonly editReqInspectors = signal<number>(1);
  protected readonly editReqAnalysts = signal<number>(1);
  protected readonly editReqTechnicians = signal<number>(1);
  protected readonly savingQuotas = signal<boolean>(false);

  // Multi-role breakdown check (Inspector, Analyst, Technician against Manager quotas with 5 AND criteria)
  protected readonly roleBreakdown = computed(() => {
    const a = this.item();
    const reqInspectors = a?.requiredInspectors ?? 1;
    const reqAnalysts = a?.requiredAnalysts ?? 1;
    const reqTechnicians = a?.requiredTechnicians ?? 1;

    if (!a) {
      return {
        inspectors: [] as PersonnelCandidate[],
        analysts: [] as PersonnelCandidate[],
        technicians: [] as PersonnelCandidate[],
        allAvailable: [] as PersonnelCandidate[],
        reqInspectors,
        reqAnalysts,
        reqTechnicians,
        hasAllThree: false,
        missingDetails: ['Chưa tải được dữ liệu nhân sự'],
        missingRoles: ['Chưa tải dữ liệu'],
        totalEligible: 0,
        totalRequired: reqInspectors + reqAnalysts + reqTechnicians,
      };
    }
    const candidates = a.personnelCandidates || [];

    // 5-point AND criteria check (Chỉ người đang rảnh, active, eligible, scope)
    const isCandidateEligibleAndFree = (c: PersonnelCandidate) => {
      const activeOk = c.isActive !== false;
      const scopeOk = c.isWithinScope !== false;
      const eligOk = c.isEligible !== false && (c.eligibility?.toUpperCase() === 'ELIGIBLE' || c.overallEligibility === 'ELIGIBLE' || c.overallEligibility === true);
      const availOk = c.isAvailable !== false && c.availability?.toUpperCase() === 'AVAILABLE' && !c.conflict;
      return activeOk && scopeOk && eligOk && availOk;
    };

    const allAvailable = candidates.filter(isCandidateEligibleAndFree);

    const inspectors = candidates.filter((c) => {
      const r = (c.role || '').toUpperCase();
      return (r.includes('INSPECT') || r.includes('PILOT')) && isCandidateEligibleAndFree(c);
    });

    const analysts = candidates.filter((c) => {
      const r = (c.role || '').toUpperCase();
      return r.includes('ANALYST') && isCandidateEligibleAndFree(c);
    });

    const technicians = candidates.filter((c) => {
      const r = (c.role || '').toUpperCase();
      return (r.includes('TECH') || r.includes('MAINTENANCE')) && isCandidateEligibleAndFree(c);
    });

    const missingDetails: string[] = [];
    const missingRoles: string[] = [];
    if (inspectors.length < reqInspectors) {
      missingDetails.push(`Inspector: thiếu ${reqInspectors - inspectors.length} người (${inspectors.length}/${reqInspectors} khả dụng)`);
      missingRoles.push(`Inspector (${inspectors.length}/${reqInspectors})`);
    }
    if (analysts.length < reqAnalysts) {
      missingDetails.push(`Analyst: thiếu ${reqAnalysts - analysts.length} người (${analysts.length}/${reqAnalysts} khả dụng)`);
      missingRoles.push(`Analyst (${analysts.length}/${reqAnalysts})`);
    }
    if (technicians.length < reqTechnicians) {
      missingDetails.push(`Technician: thiếu ${reqTechnicians - technicians.length} người (${technicians.length}/${reqTechnicians} khả dụng)`);
      missingRoles.push(`Technician (${technicians.length}/${reqTechnicians})`);
    }

    return {
      inspectors,
      analysts,
      technicians,
      allAvailable,
      reqInspectors,
      reqAnalysts,
      reqTechnicians,
      hasAllThree: missingDetails.length === 0,
      missingDetails,
      missingRoles,
      totalEligible: inspectors.length + analysts.length + technicians.length,
      totalRequired: reqInspectors + reqAnalysts + reqTechnicians,
    };
  });

  protected readonly canProceedToMf02 = computed(() => {
    return (
      this.isReady() &&
      !this.isExpired() &&
      !this.isCompleted() &&
      !this.isCancelled() &&
      this.roleBreakdown().hasAllThree
    );
  });

  protected readonly failedConditions = computed(() => {
    const a = this.item();
    if (!a) return [];
    const list: { pillar: string; reason: string; actionTab: WorkspaceTab; actionLabel: string }[] = [];

    if (a.site.status !== 'PASS' && a.site.status !== 'FEASIBLE') {
      list.push({
        pillar: 'Mặt bằng & Khí tượng',
        reason: a.site.reason || 'Điều kiện sức gió vượt ngưỡng an toàn cho phép hoặc khoảng cách hành lang chưa đảm bảo.',
        actionTab: 'site',
        actionLabel: 'Xem chi tiết mặt bằng & khí tượng',
      });
    }

    const roles = this.roleBreakdown();
    if ((a.personnel.status !== 'PASS' && a.personnel.status !== 'READY') || !roles.hasAllThree) {
      const reasonMsg = roles.missingDetails.length > 0
        ? `Không đạt định mức nhân sự đang rảnh: ${roles.missingDetails.join('; ')}.`
        : (a.personnel.reason || 'Chưa đủ ứng viên đạt chuẩn.');
      list.push({
        pillar: 'Nhân sự vận hành (Không đủ định mức)',
        reason: `${reasonMsg} Hệ thống kiểm tra CSDL và chỉ tính nhân sự đang rảnh thỏa mãn đồng thời 5 tiêu chuẩn: Eligible AND Active AND Within Region/Scope AND Available during proposed time AND Has required role/qualification.`,
        actionTab: 'personnel',
        actionLabel: 'Kiểm tra & Điều chỉnh định mức',
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
    let list = a.personnelCandidates || [];

    // Filter "chỉ ra những người đang rảnh thôi"
    if (this.onlyAvailableFilter()) {
      list = list.filter((p) => p.isAvailable !== false && p.availability?.toUpperCase() === 'AVAILABLE' && !p.conflict);
    }

    const roleFilter = this.selectedRoleFilter();
    if (roleFilter !== 'ALL') {
      list = list.filter((p) => {
        const r = (p.role || '').toUpperCase();
        if (roleFilter === 'INSPECTOR') return r.includes('INSPECT') || r.includes('PILOT');
        if (roleFilter === 'ANALYST') return r.includes('ANALYST');
        if (roleFilter === 'TECHNICIAN') return r.includes('TECH') || r.includes('MAINTENANCE');
        return true;
      });
    }

    const q = this.personnelSearch().trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q) ||
        (p.region && p.region.toLowerCase().includes(q)) ||
        (p.qualificationDetails && p.qualificationDetails.toLowerCase().includes(q))
    );
  });

  protected startEditingQuotas(): void {
    const a = this.item();
    if (!a) return;
    this.editReqInspectors.set(a.requiredInspectors ?? 1);
    this.editReqAnalysts.set(a.requiredAnalysts ?? 1);
    this.editReqTechnicians.set(a.requiredTechnicians ?? 1);
    this.editingQuotas.set(true);
  }

  protected cancelEditingQuotas(): void {
    this.editingQuotas.set(false);
  }

  protected saveQuotas(): void {
    const a = this.item();
    if (!a || this.savingQuotas()) return;
    this.savingQuotas.set(true);
    const quotas = {
      requiredInspectors: Math.max(1, this.editReqInspectors()),
      requiredAnalysts: Math.max(1, this.editReqAnalysts()),
      requiredTechnicians: Math.max(1, this.editReqTechnicians()),
    };

    this.api.updateQuotas(a.id, quotas).subscribe({
      next: (updated) => {
        this.savingQuotas.set(false);
        this.editingQuotas.set(false);
        this.item.set(updated);
        this.actionMessage.set(`Đã cập nhật định mức: ${quotas.requiredInspectors} Inspector, ${quotas.requiredAnalysts} Analyst, ${quotas.requiredTechnicians} Technician.`);
        setTimeout(() => this.actionMessage.set(''), 4000);
      },
      error: () => {
        this.savingQuotas.set(false);
      }
    });
  }

  constructor() {
    this.load();

    // Reactive effect: mount or update map as soon as assessment data is loaded and DOM container is rendered
    effect(() => {
      const a = this.item();
      const tab = this.activeTab();
      const scopeEl = this.scopeMapContainer();
      const siteEl = this.siteMapContainer();
      if (a && (tab === 'overview' || tab === 'site') && (scopeEl || siteEl)) {
        setTimeout(() => this.initOrUpdateMap(), 60);
      }
    });
  }

  ngAfterViewInit(): void {
    if (this.activeTab() === 'overview' || this.activeTab() === 'site') {
      setTimeout(() => this.initOrUpdateMap(), 150);
    }
  }

  ngOnDestroy(): void {
    const a = this.item();
    if (a?.id) {
      this.realtime.leaveAssessment(a.id);
    }
    this.realtimeSub?.unsubscribe();
    this.cleanupMap();
  }

  private initRealtimeSubscription(): void {
    this.realtimeSub = this.realtime.assessmentEvents$.subscribe((evt) => {
      const current = this.item();
      if (!current) return;
      if (evt.assessmentId && evt.assessmentId !== current.id) {
        return;
      }

      switch (evt.type) {
        case 'DroneInspectionCompleted': {
          const isPass = (evt.status || '').toUpperCase() === 'PASS';
          if (isPass) {
            this.item.update((curr) => {
              if (!curr) return curr;
              return {
                ...curr,
                technical: {
                  ...curr.technical,
                  status: 'PASS',
                  reason: 'Kiểm định kỹ thuật UAV đạt tiêu chuẩn (BIST/Telemetry Passed).',
                },
              };
            });
            const droneId = evt.droneId || this.selectedDroneId();
            if (droneId) {
              this.loadLatestInspection(droneId);
            }
            this.api.reEvaluate(current.id).subscribe({
              next: (updated) => {
                this.item.set(updated);
                this.actionMessage.set(
                  `Kỹ thuật viên vừa hoàn tất chẩn đoán UAV ${evt.droneCode || ''}: ĐẠT. Trụ cột Kỹ thuật đã chuyển sang PASS, sẵn sàng tạo nhiệm vụ MF02.`
                );
              },
            });
          } else {
            this.item.update((curr) => {
              if (!curr) return curr;
              return {
                ...curr,
                technical: {
                  ...curr.technical,
                  status: 'FAIL',
                  reason: evt.message || 'Kiểm định kỹ thuật UAV không đạt tiêu chuẩn.',
                },
              };
            });
            this.error.set(`Cảnh báo: Kiểm định kỹ thuật UAV ${evt.droneCode || ''} KHÔNG ĐẠT. Trụ cột kỹ thuật đã bị khóa.`);
          }
          break;
        }

        case 'AssessmentStatusChanged': {
          if (evt.status) {
            this.api.get(current.id).subscribe({
              next: (updated) => {
                this.item.set(updated);
                this.actionMessage.set(evt.message || `Trạng thái thẩm định vừa cập nhật: ${evt.status}`);
              },
            });
          }
          break;
        }

        case 'AssessmentCompleted': {
          this.item.update((curr) => {
            if (!curr) return curr;
            return {
              ...curr,
              status: 'COMPLETED',
              consumedMissionId: evt.consumedMissionId || curr.consumedMissionId,
              consumedMissionCode: evt.consumedMissionCode || curr.consumedMissionCode,
            };
          });
          const mCode = evt.consumedMissionCode || evt.consumedMissionId || '';
          this.actionMessage.set(`Bản thẩm định đã được tạo nhiệm vụ thành công: #${mCode}.`);
          break;
        }

        case 'MeteoAlertTriggered': {
          const wind = evt.windSpeed ?? 10.5;
          this.item.update((curr) => {
            if (!curr) return curr;
            return {
              ...curr,
              status: 'NOT_READY',
              site: {
                ...curr.site,
                status: 'FAIL',
                reason: evt.message || `Cảnh báo khí tượng: Sức gió bề mặt ${wind} m/s vượt ngưỡng an toàn (10.0 m/s).`,
              },
            };
          });
          this.error.set(
            evt.message || `CẢNH BÁO KHÍ TƯỢNG: Sức gió bề mặt ${wind} m/s vượt ngưỡng an toàn (> 10.0 m/s). Nút Tạo nhiệm vụ đã tự động khóa lại.`
          );
          break;
        }
      }
    });
  }

  protected load(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Không tìm thấy mã định danh đánh giá.');
      return;
    }
    this.busy.set(true);
    this.isStaleConflict.set(false);
    this.error.set('');
    this.api.get(id).subscribe({
      next: (res) => {
        this.item.set(res);
        this.realtime.joinAssessment(res.id);
        if (res.uavCandidates.length > 0 && !this.selectedDroneId()) {
          this.selectedDroneId.set(res.uavCandidates[0].id || res.uavCandidates[0].code);
        }
        if (res.droneInspection) {
          this.inspectionResult.set(res.droneInspection);
        }
        this.loadWeatherForAssessment(res);
        if (res.regionId) {
          this.gisApi.getAllGisData({ administrativeAreaId: res.regionId }).subscribe({
            next: (snapshot) => {
              this.availableTowers.set(snapshot.towers);
              this.renderScopeOnMap();
            },
            error: () => {},
          });
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

  protected goBack(): void {
    const a = this.item();
    const id = a?.id || this.route.snapshot.paramMap.get('id');
    if (id) {
      this.router.navigate(['/pre-mission/new'], { queryParams: { assessmentId: id } });
    } else if (window.history.length > 1) {
      this.location.back();
    } else {
      this.router.navigate(['/pre-mission/new']);
    }
  }

  private loadWeatherForAssessment(a: PreMissionAssessment): void {
    let lat = 16.0544;
    let lng = 108.2022;
    const reg = (a.regionName || a.regionId || '').toLowerCase();
    if (reg.includes('bắc') || reg.includes('north') || reg.includes('hn') || reg.includes('npc')) {
      lat = 21.0285;
      lng = 105.8542;
    } else if (reg.includes('nam') || reg.includes('south') || reg.includes('hcm') || reg.includes('spc')) {
      lat = 10.8231;
      lng = 106.6297;
    } else if (reg.includes('trung') || reg.includes('central') || reg.includes('cpc') || reg.includes('dn')) {
      lat = 16.0544;
      lng = 108.2022;
    }

    this.loadingWeather.set(true);
    this.api.getRealtimeWeather(lat, lng).subscribe({
      next: (weather) => {
        this.realtimeWeather.set(weather);
        this.loadingWeather.set(false);

        // Update site checks with live weather & configured corridor buffer
        const geom = (a.scopeGeometry && typeof a.scopeGeometry === 'object' ? a.scopeGeometry : {}) as Record<string, unknown>;
        const buf = Number(geom['corridorBufferMeters'] ?? 50);
        const alt = Number(geom['maxFlightAltitudeMeters'] ?? 120);
        const updatedChecks = defaultSiteChecks(weather.isSafeToFly, buf, alt, weather);
        this.item.update((curr) => (curr ? { ...curr, siteChecks: updatedChecks } : curr));

        if (weather.windSpeed > 10.0 || (weather.windGust && weather.windGust > 10.0)) {
          this.item.update((curr) => {
            if (!curr) return curr;
            return {
              ...curr,
              status: 'NOT_READY',
              site: {
                ...curr.site,
                status: 'FAIL',
                reason: `Cảnh báo khí tượng: Sức gió bề mặt ${weather.windSpeed} m/s vượt ngưỡng an toàn (10.0 m/s).`,
              },
            };
          });
          this.error.set(`CẢNH BÁO KHÍ TƯỢNG: Sức gió bề mặt ${weather.windSpeed} m/s vượt ngưỡng an toàn (> 10.0 m/s). Nút Tạo nhiệm vụ đã tự động khóa.`);
          this.realtime.broadcastAssessmentEvent({
            assessmentId: a.id,
            type: 'MeteoAlertTriggered',
            status: 'FAIL',
            windSpeed: weather.windSpeed,
            windGust: weather.windGust,
            isMeteoSafe: false,
            message: `Cảnh báo khí tượng: Sức gió bề mặt ${weather.windSpeed} m/s vượt ngưỡng an toàn (10.0 m/s).`,
            timestamp: new Date().toISOString(),
          });
        }
      },
      error: () => {
        this.loadingWeather.set(false);
      },
    });
  }

  protected reevaluate(): void {
    const a = this.item();
    if (!a || this.busy()) return;
    this.busy.set(true);
    this.actionMessage.set('');
    this.error.set('');
    this.isStaleConflict.set(false);

    this.api.reEvaluate(a.id).subscribe({
      next: (updated) => {
        this.item.set(updated);
        this.actionMessage.set('Đã hoàn tất đánh giá lại tính khả thi và tài nguyên.');
        this.realtime.broadcastAssessmentEvent({
          assessmentId: updated.id,
          type: 'AssessmentStatusChanged',
          status: updated.status,
          technicalHealth: updated.technical?.status,
          message: `Quản lý đã kích hoạt đánh giá lại: ${updated.status}`,
          timestamp: new Date().toISOString(),
        });
      },
      error: (err) => {
        if (err?.status === 409) {
          this.isStaleConflict.set(true);
          this.error.set('Dữ liệu đánh giá đã bị thay đổi bởi phiên làm việc khác (HTTP 409 Conflict). Vui lòng bấm "Làm mới dữ liệu" để tải thông tin mới nhất.');
        } else {
          this.error.set(err?.error?.message || 'Không thể thực hiện đánh giá lại. Vui lòng thử lại sau.');
        }
      },
      complete: () => {
        this.busy.set(false);
      },
    });
  }

  protected readonly showCancelModal = signal<boolean>(false);
  protected readonly cancelReason = signal<string>('');

  protected openCancelModal(): void {
    const a = this.item();
    if (!a || this.busy()) return;
    if (a.status === 'COMPLETED' || (a.status as string) === 'CONSUMED') {
      this.error.set('Không thể hủy đánh giá đã hoàn thành / tạo nhiệm vụ.');
      return;
    }
    this.cancelReason.set('');
    this.showCancelModal.set(true);
  }

  protected closeCancelModal(): void {
    if (this.busy()) return;
    this.showCancelModal.set(false);
  }

  protected executeCancel(): void {
    const a = this.item();
    if (!a || this.busy()) return;

    this.busy.set(true);
    this.error.set('');
    this.isStaleConflict.set(false);
    const reason = this.cancelReason().trim() || 'Người dùng hủy tại trang chi tiết';

    this.api.cancel(a.id, reason).subscribe({
      next: (updated) => {
        this.item.set(updated);
        this.showCancelModal.set(false);
        this.actionMessage.set(`Đã hủy bản đánh giá ${a.assessmentCode}.`);
      },
      error: (err) => {
        if (err?.status === 409) {
          this.isStaleConflict.set(true);
          this.error.set('Dữ liệu đánh giá đã bị thay đổi bởi phiên làm việc khác (HTTP 409 Conflict). Vui lòng bấm "Làm mới dữ liệu".');
        } else {
          this.error.set(err?.error?.message || 'Không thể hủy bản đánh giá.');
        }
        this.busy.set(false);
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
    } else {
      this.cleanupMap();
      if (tab === 'technical') {
        const droneId = this.selectedDroneId();
        if (droneId && !this.inspectionResult()) {
          this.loadLatestInspection(droneId);
        }
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
        const isPass = res.overallHealth === 'HEALTHY';
        this.realtime.broadcastAssessmentEvent({
          assessmentId: a?.id || '',
          type: 'DroneInspectionCompleted',
          status: isPass ? 'PASS' : 'FAIL',
          droneId: res.droneId,
          droneCode: res.droneCode,
          technicalHealth: res.overallHealth,
          technicalStatus: isPass ? 'Passed' : 'Failed',
          message: `Kỹ thuật viên vừa hoàn tất chẩn đoán kỹ thuật UAV ${res.droneCode}: ${isPass ? 'ĐẠT' : 'KHÔNG ĐẠT'}.`,
          timestamp: new Date().toISOString(),
        });
        if (a && isPass) {
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

  protected setMapType(type: 'google-streets' | 'google-hybrid' | 'google-terrain' | 'carto'): void {
    this.currentMapType.set(type);
    if (!this.map) return;

    if (this.currentTileLayer) {
      this.map.removeLayer(this.currentTileLayer);
      this.currentTileLayer = null;
    }

    let tileUrl: string;
    let maxZoom = 20;
    let subdomains = ['mt0', 'mt1', 'mt2', 'mt3'];
    let attribution = '© Google Maps | UAV-PMS GIS';

    switch (type) {
      case 'google-hybrid':
        tileUrl = 'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
        attribution = '© Google Maps Vệ Tinh | UAV-PMS GIS';
        break;
      case 'google-terrain':
        tileUrl = 'https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}';
        attribution = '© Google Maps Địa Hình | UAV-PMS GIS';
        break;
      case 'carto':
        tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        subdomains = ['a', 'b', 'c'];
        maxZoom = 19;
        attribution = '© OpenStreetMap contributors | EVN UAV-PMS';
        break;
      case 'google-streets':
      default:
        tileUrl = 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
        attribution = '© Google Maps | UAV-PMS GIS';
        break;
    }

    const tileLayer = L.tileLayer(tileUrl, {
      maxZoom,
      subdomains,
      attribution,
      updateWhenIdle: false,
      updateWhenZooming: false,
      keepBuffer: 6,
    });

    // Resilient fallback: If Google tile endpoint fails or is blocked, switch seamlessly to CartoDB Voyager
    let hasFallenBack = false;
    tileLayer.on('tileerror', () => {
      if (!hasFallenBack) {
        hasFallenBack = true;
        tileLayer.setUrl('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
      }
    });

    this.currentTileLayer = tileLayer;
    this.currentTileLayer.addTo(this.map);
  }

  private initOrUpdateMap(): void {
    const container = (this.activeTab() === 'overview'
      ? (this.scopeMapContainer()?.nativeElement ?? document.getElementById('workspaceScopeMapContainer'))
      : (this.siteMapContainer()?.nativeElement ?? document.getElementById('workspaceSiteMapContainer'))) as HTMLDivElement | null;
    if (!container) return;

    if (this.map) {
      if (this.map.getContainer() !== container) {
        this.cleanupMap();
      }
    }

    if (!this.map) {
      if ((container as any)._leaflet_id) {
        (container as any)._leaflet_id = null;
      }

      this.map = L.map(container, {
        center: [16.0544, 108.2022],
        zoom: 13,
        zoomControl: true,
      });

      this.bufferLayer = L.layerGroup().addTo(this.map);
      this.polylineLayer = L.layerGroup().addTo(this.map);
      this.markersLayer = L.layerGroup().addTo(this.map);

      this.setMapType(this.currentMapType());

      if (typeof ResizeObserver !== 'undefined') {
        if (this.resizeObserver) {
          this.resizeObserver.disconnect();
        }
        this.resizeObserver = new ResizeObserver(() => {
          this.map?.invalidateSize();
        });
        this.resizeObserver.observe(container);
      }
    }

    this.map.whenReady(() => {
      this.map?.invalidateSize();
      this.renderScopeOnMap();
    });

    setTimeout(() => {
      this.map?.invalidateSize();
      this.renderScopeOnMap();
    }, 80);

    setTimeout(() => {
      this.map?.invalidateSize();
    }, 280);
  }

  private renderScopeOnMap(): void {
    if (!this.map) return;
    this.markersLayer.clearLayers();
    this.polylineLayer.clearLayers();
    this.bufferLayer.clearLayers();

    const a = this.item();
    if (!a || !a.scopeAssetIds || a.scopeAssetIds.length === 0) return;

    const geom = (a.scopeGeometry && typeof a.scopeGeometry === 'object' ? a.scopeGeometry : {}) as Record<string, unknown>;
    const bufferMeters = Number(geom['corridorBufferMeters'] ?? 50);

    // Determine region anchor coordinates
    let baseLat = 16.0544;
    let baseLng = 108.2022;
    const reg = (a.regionName || a.regionId || '').toLowerCase();
    if (reg.includes('bắc') || reg.includes('north') || reg.includes('hn') || reg.includes('npc')) {
      baseLat = 21.0285;
      baseLng = 105.8542;
    } else if (reg.includes('nam') || reg.includes('south') || reg.includes('hcm') || reg.includes('spc')) {
      baseLat = 10.8231;
      baseLng = 106.6297;
    } else if (reg.includes('trung') || reg.includes('central') || reg.includes('cpc') || reg.includes('dn')) {
      baseLat = 16.0544;
      baseLng = 108.2022;
    }

    const allTowers = this.availableTowers();
    const latLngs: [number, number][] = [];

    a.scopeAssetIds.forEach((code, idx) => {
      const matched = allTowers.find(
        (t) =>
          t.id.toLowerCase() === code.toLowerCase() ||
          t.towerCode.toLowerCase() === code.toLowerCase()
      );

      const lat = matched?.latitude && Number.isFinite(matched.latitude) && Math.abs(matched.latitude) > 0.1
        ? matched.latitude
        : baseLat + idx * 0.0035;

      const lng = matched?.longitude && Number.isFinite(matched.longitude) && Math.abs(matched.longitude) > 0.1
        ? matched.longitude
        : baseLng + idx * 0.0055;

      const displayCode = matched?.towerCode || (code.length > 20 ? `Cột #${idx + 1}` : code);
      const lineName = matched?.transmissionLineName || a.lineName || 'Theo danh mục khảo sát';

      latLngs.push([lat, lng]);

      // Safety buffer circle around tower
      const circle = L.circle([lat, lng], {
        radius: bufferMeters,
        color: '#0284c7',
        fillColor: '#38bdf8',
        fillOpacity: 0.18,
        weight: 1.5,
        dashArray: '4, 4',
      });
      this.bufferLayer.addLayer(circle);

      // Circle marker for tower
      const marker = L.circleMarker([lat, lng], {
        radius: 7,
        fillColor: '#0052cc',
        color: '#ffffff',
        weight: 2,
        fillOpacity: 1,
      });

      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 11px; line-height: 1.4;">
          <strong style="color: #003f99;">Vị trí cột: ${displayCode}</strong><br/>
          <span>Tuyến: ${lineName}</span><br/>
          <span>Tọa độ: ${lat.toFixed(5)}, ${lng.toFixed(5)}</span><br/>
          <span>Hành lang an toàn: ${bufferMeters}m</span>
        </div>
      `);
      marker.bindTooltip(displayCode, { permanent: true, direction: 'top', className: 'evn-map-tooltip', offset: [0, -6] });
      this.markersLayer.addLayer(marker);
    });

    if (latLngs.length > 1) {
      const poly = L.polyline(latLngs, {
        color: '#0052cc',
        weight: 3.5,
        dashArray: '6, 6',
      });
      this.polylineLayer.addLayer(poly);
    }

    if (latLngs.length > 0) {
      const bounds = L.latLngBounds(latLngs);
      this.map.fitBounds(bounds, { padding: [35, 35], maxZoom: 16 });
    }
  }

  protected refreshMap(): void {
    if (this.map) {
      this.map.invalidateSize();
      this.renderScopeOnMap();
    } else {
      this.initOrUpdateMap();
    }
  }

  private cleanupMap(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.map) {
      try {
        this.map.remove();
      } catch {}
      this.map = null;
      this.currentTileLayer = null;
    }
  }

  protected statusTone = statusTone;
  protected statusLabel = statusLabel;
}
