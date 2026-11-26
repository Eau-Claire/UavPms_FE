import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Map as MapLibreMap, Marker, Popup } from 'maplibre-gl';
import {
  LocalMapMode,
  buildLocalGisStyle,
  createLocalGisMap,
  filterValidCoordinates,
  fitLocalGisBounds,
  isValidCoordinate,
  resolveLocalMapMode,
  setLocalGisRouteLine,
} from '../../../../shared/gis/local-gis';
import { Mission, MissionAssignment, missionStatusLabel, normalizeMissionStatus } from '../../../../models/missions.models';
import { NotificationsRealtime } from '../../../notifications/data-access/notifications-realtime';
import { MissionsApi } from '../../data-access/missions-api';
import { Auth } from '../../../../core/auth/auth';
import { ToastService } from '../../../../core/toast/toast.service';
import { isAnalystRole, isInspectorRole, isTechnicianRole, roleLabel } from '../../../../core/auth/roles';
import { priorityColorClass, statusColorClass, statusLabel as sharedStatusLabel } from '../../../../shared/status/status';
import {
  AcceptanceState,
  acceptanceState,
  activitySenderKind,
  assignmentRoleLabel,
  findMyAssignment,
  missionPriorityLabel,
  towerInspectionStatusLabel,
} from '../../data-access/mission-access';
import { describeHttpError, readBackendError } from '../../../../shared/errors/business-error-messages';

/** Which role-specific panel the summary column shows. */
type InspectorFocus = 'flight' | 'analysis' | 'maintenance' | 'other';

@Component({
  selector: 'app-mission-inspector',
  imports: [DatePipe, RouterLink],
  templateUrl: './mission-inspector.html',
  styleUrl: './mission-inspector.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionInspector {
  private readonly api = inject(MissionsApi);
  private readonly realtime = inject(NotificationsRealtime);
  private readonly auth = inject(Auth);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly mapContainer = viewChild<ElementRef<HTMLDivElement>>('inspectorMap');

  private map: MapLibreMap | null = null;
  private markers: Marker[] = [];
  private routeCoords: [number, number][] = [];
  private resizeObserver: ResizeObserver | null = null;
  private mapInitTimer: ReturnType<typeof setTimeout> | null = null;
  private mapResizeTimers: ReturnType<typeof setTimeout>[] = [];

  protected readonly currentUser = this.auth.user;
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly mission = signal<Mission | null>(null);
  protected readonly actionBusy = signal(false);
  protected readonly actionMessage = signal('');
  protected readonly showPostponeModal = signal(false);
  protected readonly postponeReason = signal('');
  protected readonly currentTime = signal(Date.now());
  protected readonly selectedTargetId = signal('');
  protected readonly mapMode = signal<LocalMapMode>('pmtiles');

  /** The signed-in user's assignment on this mission (null when they are not part of the team). */
  protected readonly myAssignment = computed<MissionAssignment | null>(() =>
    findMyAssignment(this.mission(), this.currentUser()?.id),
  );

  /** Drives which banner shows: accept/postpone only while the mission is still before execution. */
  protected readonly state = computed<AcceptanceState>(() => acceptanceState(this.mission(), this.myAssignment()));

  /** Vietnamese label of the user's assignment role, or of their account role when they have no assignment. */
  protected readonly currentRoleTitle = computed<string>(() => {
    const a = this.myAssignment();
    return a ? assignmentRoleLabel(a.assignmentRole) : roleLabel(this.currentUser()?.role);
  });

  /** Flight crew sees the pre-flight checklist; Analyst and Technician get links to their own work. */
  protected readonly focus = computed<InspectorFocus>(() => {
    const a = this.myAssignment();
    if (a) {
      const kind = activitySenderKind(a.assignmentRole);
      if (kind === 'INSPECTOR') return 'flight';
      if (kind === 'ANALYST') return 'analysis';
      if (kind === 'TECHNICIAN') return 'maintenance';
    }
    const role = this.currentUser()?.role;
    if (isInspectorRole(role)) return 'flight';
    if (isAnalystRole(role)) return 'analysis';
    if (isTechnicianRole(role)) return 'maintenance';
    return 'other';
  });

  protected readonly priorityText = computed(() => missionPriorityLabel(this.mission()?.priority));

  /** Team confirmation progress from the real assignment list. */
  protected readonly teamProgress = computed(() => {
    const m = this.mission();
    return { confirmed: m?.confirmedCount ?? 0, total: m?.totalRequiredCount ?? 0 };
  });

  protected readonly isReadyToFly = computed(() => {
    const status = normalizeMissionStatus(this.mission()?.status);
    return status === 'Confirmed' || status === 'Ready' || status === 'Assigned' || status === 'Preparing';
  });

  protected readonly confirmationDeadlineDate = computed(() => {
    const m = this.mission();
    if (!m) return null;
    return m.confirmationDeadline ? new Date(m.confirmationDeadline) : null;
  });

  protected readonly isDeadlineOverdue = computed(() => {
    const deadline = this.confirmationDeadlineDate();
    const m = this.mission();
    if (!deadline || !m) return false;
    return m.status === 'PendingAcceptance' && this.currentTime() > deadline.getTime();
  });

  protected readonly deadlineRemainingText = computed(() => {
    const deadline = this.confirmationDeadlineDate();
    if (!deadline) return null;
    const now = this.currentTime();
    const diffMs = deadline.getTime() - now;
    const isPast = diffMs < 0;
    const absDiffMs = Math.abs(diffMs);
    const hours = Math.floor(absDiffMs / (1000 * 60 * 60));
    const minutes = Math.floor((absDiffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (isPast) {
      return `Quá hạn ${hours > 0 ? `${hours} giờ ` : ''}${minutes} phút`;
    }
    return `Còn ${hours > 0 ? `${hours} giờ ` : ''}${minutes} phút`;
  });

  protected readonly targetsWithCoordinates = computed(() =>
    filterValidCoordinates(this.mission()?.targets ?? [], (target) => ({
      latitude: target.latitude,
      longitude: target.longitude,
    })),
  );

  protected readonly selectedTarget = computed(() => {
    const targets = this.mission()?.targets ?? [];
    return targets.find((t) => t.towerId === this.selectedTargetId()) ?? targets[0] ?? null;
  });

  private readonly mapEffect = effect(() => {
    const mission = this.mission();
    const container = this.mapContainer()?.nativeElement;
    if (!mission || !container) return;
    if (this.mapInitTimer !== null) clearTimeout(this.mapInitTimer);
    this.mapInitTimer = setTimeout(() => {
      this.mapInitTimer = null;
      this.initOrUpdateMap();
    }, 50);
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    const timer = setInterval(() => this.currentTime.set(Date.now()), 15000);

    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      this.realtime.leaveMission(id);
      this.cleanupMap();
    });

    this.realtime.connect();
    this.realtime.joinMission(id);
    this.realtime.missionEvents$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        const m = this.mission();
        if (!m || (event.missionId !== m.id && event.missionId !== m.missionCode)) return;

        if (event.type === 'SUSPENDED') {
          this.mission.update((curr) => curr ? {
            ...curr,
            status: 'Suspended',
            suspendedReason: event.reason || curr.suspendedReason,
          } : null);
          this.actionMessage.set(`[CẢNH BÁO KHẨN CẤP] Quản lý đã tạm đình chỉ bay: ${event.reason || 'Kiểm tra an toàn.'}`);
        } else if (event.type === 'RESUMED') {
          this.mission.update((curr) => curr ? { ...curr, status: event.status ? normalizeMissionStatus(event.status) : 'Assigned' } : null);
          this.actionMessage.set('[THÔNG BÁO] Quản lý đã dỡ bỏ lệnh tạm đình chỉ. Bạn có thể tiếp tục nhiệm vụ.');
        } else if (event.type === 'CANCELLED') {
          this.mission.update((curr) => curr ? { ...curr, status: 'Cancelled' } : null);
          this.actionMessage.set(`[HỦY BỎ] Nhiệm vụ đã bị hủy bởi Quản lý: ${event.reason || ''}`);
        } else if (event.type === 'REMINDER') {
          if (this.state() === 'awaiting') {
            this.actionMessage.set('[NHẮC NHỞ] Quản lý yêu cầu bạn xác nhận tiếp nhận nhiệm vụ.');
          }
        } else if (event.type === 'COMMUNICATION') {
          if (event.message && event.actorId !== this.currentUser()?.id) {
            this.actionMessage.set(`[TIN NHẮN] ${event.actorName || 'Thành viên'}: ${event.message}`);
          }
        }
      });

    this.api
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (mission) => {
          this.mission.set(mission);
          this.loading.set(false);
          this.selectedTargetId.set(mission.targets[0]?.towerId ?? '');
        },
        error: (err: unknown) => {
          this.loading.set(false);
          const status = err instanceof HttpErrorResponse ? err.status : -1;
          this.error.set(
            status === 403 || status === 401
              ? 'Bạn không có quyền xem nhiệm vụ này.'
              : status === 404
                ? 'Không tìm thấy nhiệm vụ.'
                : 'Không thể tải thông tin nhiệm vụ.',
          );
        },
      });
  }

  protected confirmMission(): void {
    const m = this.mission();
    const assign = this.myAssignment();
    if (!m || !assign || this.state() !== 'awaiting' || this.actionBusy()) return;
    this.actionBusy.set(true);

    const role = assign.assignmentRole;
    const note = `${this.currentRoleTitle()} xác nhận sẵn sàng tham gia thực hiện nhiệm vụ.`;

    this.api.acceptAssignment(m.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.mission.set(updated);
          this.actionBusy.set(false);
          const total = updated.totalRequiredCount ?? 0;
          const conf = updated.confirmedCount ?? 0;
          this.actionMessage.set(
            `Đã xác nhận tiếp nhận vai trò ${assignmentRoleLabel(role)} (${conf}/${total} thành viên đã xác nhận).`,
          );

          // Broadcast real-time event to Manager console & Mission lists
          this.realtime.broadcastMissionEvent({
            missionId: updated.id,
            type: 'CONFIRMED',
            status: updated.status,
            actorRole: role,
            assignmentId: assign.id,
            actorId: this.currentUser()?.id,
            actorName: this.currentUser()?.fullName || this.currentUser()?.email || 'Thành viên đội bay',
            reason: note,
            allConfirmed: updated.allConfirmed,
            confirmedCount: conf,
            totalRequiredCount: total,
            pendingRoles: updated.pendingRoles,
            timestamp: new Date().toISOString(),
          });
        },
        error: (err: unknown) => {
          this.actionBusy.set(false);
          this.actionMessage.set(describeHttpError(err, 'Lỗi khi gửi xác nhận. Vui lòng thử lại.'));
          this.reloadAfterConflict(m.id, err);
        },
      });
  }

  /**
   * After `409 INVALID_MISSION_STATE` (the mission left PendingAcceptance/Assigned/Preparing/Ready) or
   * `403 USER_NOT_ASSIGNED` (removed from the team), reload so the page shows the current state.
   */
  private reloadAfterConflict(missionId: string, err: unknown): void {
    const { status } = readBackendError(err);
    if (status !== 409 && status !== 403) return;
    this.api
      .get(missionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (mission) => this.mission.set(mission), error: () => undefined });
  }

  protected checkInAtSite(): void {
    const m = this.mission();
    if (!m || this.actionBusy()) return;
    this.actionBusy.set(true);
    this.api
      .checkIn(m.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.actionBusy.set(false);
          this.toast.success('Đã hoàn tất check-in tại điểm bay.');
          this.api
            .get(m.id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({ next: (updated) => this.mission.set(updated), error: () => undefined });
        },
        error: (err: unknown) => {
          this.actionBusy.set(false);
          this.toast.error(describeHttpError(err, 'Không thể check-in tại điểm bay.'));
        },
      });
  }

  protected openPostponeModal(): void {
    this.postponeReason.set('');
    this.showPostponeModal.set(true);
  }

  protected closePostponeModal(): void {
    this.showPostponeModal.set(false);
  }

  protected submitPostpone(): void {
    const m = this.mission();
    const reason = this.postponeReason().trim();
    const assign = this.myAssignment();
    if (!m || !assign || !reason || this.state() !== 'awaiting' || this.actionBusy()) return;

    this.actionBusy.set(true);
    const role = assign.assignmentRole;

    this.api.postponeAssignment(m.id, reason)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.mission.set(updated);
          this.actionBusy.set(false);
          this.showPostponeModal.set(false);
          this.actionMessage.set(`Đã gửi yêu cầu hoãn vai trò ${assignmentRoleLabel(role)} tới Quản lý vận hành.`);

          // Broadcast real-time event to Manager console
          this.realtime.broadcastMissionEvent({
            missionId: updated.id,
            type: 'POSTPONED',
            status: updated.status,
            reason,
            actorRole: role,
            assignmentId: assign.id,
            actorId: this.currentUser()?.id,
            actorName: this.currentUser()?.fullName || this.currentUser()?.email || 'Thành viên đội bay',
            timestamp: new Date().toISOString(),
          });
        },
        error: (err: unknown) => {
          this.actionBusy.set(false);
          this.actionMessage.set(describeHttpError(err, 'Không thể gửi yêu cầu dời lịch. Vui lòng thử lại.'));
          this.reloadAfterConflict(m.id, err);
        },
      });
  }

  protected selectTarget(towerId: string): void {
    this.selectedTargetId.set(towerId);
    const target = this.mission()?.targets.find((t) => t.towerId === towerId);
    if (!target || !isValidCoordinate(target.latitude, target.longitude) || !this.map) return;
    this.map.easeTo({ center: [target.longitude!, target.latitude!], duration: 500 });
  }

  protected setMapMode(mode: LocalMapMode): void {
    this.mapMode.set(mode);
    if (!this.map) return;
    this.map.setStyle(buildLocalGisStyle(mode));
    if (this.routeCoords.length > 1) {
      setLocalGisRouteLine(this.map, this.routeCoords, { color: '#0284c7', width: 3 });
    }
  }

  private initOrUpdateMap(): void {
    const container = this.mapContainer()?.nativeElement;
    if (!container) return;

    if (this.map && this.map.getContainer() !== container) {
      this.cleanupMap();
    }

    const targets = [...this.targetsWithCoordinates()].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

    if (!this.map) {
      const effectiveMode = resolveLocalMapMode(
        targets.map((target) => ({ latitude: target.latitude!, longitude: target.longitude! })),
        this.mapMode(),
      );
      if (effectiveMode !== this.mapMode()) {
        this.mapMode.set(effectiveMode);
      }

      const map = createLocalGisMap(container, {
        mode: effectiveMode,
        onFallbackToSchematic: () => {
          this.mapMode.set('schematic');
          if (this.map && this.routeCoords.length > 1) {
            setLocalGisRouteLine(this.map, this.routeCoords, { color: '#0284c7', width: 3 });
          }
        },
      });
      this.map = map;
      if (!map) return;

      this.resizeObserver = new ResizeObserver(() => {
        this.map?.resize();
      });
      this.resizeObserver.observe(container);
    }

    this.renderTargetsOnMap(targets);
  }

  private renderTargetsOnMap(targets: readonly Mission['targets'][number][]): void {
    if (!this.map) return;

    this.markers.forEach((m) => m.remove());
    this.markers = [];
    this.mapResizeTimers.forEach((timer) => clearTimeout(timer));
    this.mapResizeTimers = [];

    const coords: [number, number][] = targets.map((target) => [target.longitude!, target.latitude!]);
    this.routeCoords = coords;

    if (!coords.length) {
      setLocalGisRouteLine(this.map, []);
      fitLocalGisBounds(this.map, []);
      return;
    }

    targets.forEach((target, index) => {
      const lat = target.latitude!;
      const lng = target.longitude!;
      const sequence = target.sequence || index + 1;
      const code = target.towerCode || `Cột ${sequence}`;

      const wrapper = document.createElement('div');
      wrapper.className = 'custom-tower-marker';
      wrapper.style.cursor = 'pointer';
      const pin = document.createElement('div');
      pin.className = 'tower-pin';
      const badge = document.createElement('span');
      badge.className = 'pin-badge';
      badge.textContent = String(sequence);
      const label = document.createElement('span');
      label.className = 'pin-code';
      label.textContent = code;
      pin.append(badge, label);
      wrapper.append(pin);
      wrapper.addEventListener('click', () => this.selectTarget(target.towerId));

      const popupContent = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = code;
      const gpsLine = document.createElement('div');
      gpsLine.textContent = `GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      popupContent.append(title, gpsLine);

      const popup = new Popup({ offset: 20 }).setDOMContent(popupContent);
      const marker = new Marker({ element: wrapper })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(this.map!);

      this.markers.push(marker);
    });

    setLocalGisRouteLine(this.map, coords, { color: '#0284c7', width: 3 });
    fitLocalGisBounds(this.map, coords, 50, 17);
    this.mapResizeTimers.push(
      setTimeout(() => this.map?.resize(), 100),
      setTimeout(() => this.map?.resize(), 300),
    );
  }

  private cleanupMap(): void {
    if (this.mapInitTimer !== null) {
      clearTimeout(this.mapInitTimer);
      this.mapInitTimer = null;
    }
    this.mapResizeTimers.forEach((timer) => clearTimeout(timer));
    this.mapResizeTimers = [];
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.markers.forEach((m) => m.remove());
    this.markers = [];
    this.routeCoords = [];
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  protected readonly statusColorClass = statusColorClass;
  protected readonly priorityColorClass = priorityColorClass;

  protected statusLabel(status: string): string {
    return sharedStatusLabel(status) || missionStatusLabel(status);
  }

  protected towerStatusLabel(status: string): string {
    return towerInspectionStatusLabel(status);
  }

  protected statusClass(status: string): string {
    switch (status) {
      case 'PendingAcceptance':
        return 'status-pending';
      case 'Assigned':
      case 'Preparing':
      case 'Ready':
        return 'status-confirmed';
      case 'Postponed':
        return 'status-postponed';
      case 'Suspended':
        return 'status-suspended';
      case 'Completed':
        return 'status-completed';
      default:
        return 'status-default';
    }
  }
}
