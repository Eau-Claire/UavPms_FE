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
import * as L from 'leaflet';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Mission, MissionAssignment, missionStatusLabel, normalizeMissionStatus } from '../../../../models/missions.models';
import { NotificationsRealtime } from '../../../notifications/data-access/notifications-realtime';
import { MissionsApi } from '../../data-access/missions-api';
import { Auth } from '../../../../core/auth/auth';
import { isAnalystRole, isInspectorRole, isTechnicianRole, roleLabel } from '../../../../core/auth/roles';
import {
  AcceptanceState,
  acceptanceState,
  activitySenderKind,
  assignmentRoleLabel,
  findMyAssignment,
  missionPriorityLabel,
  towerInspectionStatusLabel,
} from '../../data-access/mission-access';

/** Which role-specific panel the summary column shows. */
type InspectorFocus = 'flight' | 'analysis' | 'maintenance' | 'other';

@Component({
  selector: 'app-mission-inspector',
  imports: [DatePipe, RouterLink, NzIconModule],
  templateUrl: './mission-inspector.html',
  styleUrl: './mission-inspector.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionInspector {
  private readonly api = inject(MissionsApi);
  private readonly realtime = inject(NotificationsRealtime);
  private readonly auth = inject(Auth);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly mapContainer = viewChild<ElementRef<HTMLDivElement>>('inspectorMap');

  private map: L.Map | null = null;
  private currentTileLayer: L.TileLayer | null = null;
  private markers: L.Marker[] = [];
  private routeLine: L.Polyline | null = null;
  private resizeObserver: ResizeObserver | null = null;

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
  protected readonly mapType = signal<'satellite' | 'streets'>('satellite');

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
    return status === 'Assigned' || status === 'Preparing' || status === 'Ready';
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

  protected readonly targetsWithCoordinates = computed(() => {
    return this.mission()?.targets.filter((target) =>
      Number.isFinite(target.latitude) && Number.isFinite(target.longitude)
      && Math.abs(target.latitude!) <= 90 && Math.abs(target.longitude!) <= 180,
    ) ?? [];
  });

  protected readonly selectedTarget = computed(() => {
    const targets = this.mission()?.targets ?? [];
    return targets.find((t) => t.towerId === this.selectedTargetId()) ?? targets[0] ?? null;
  });

  private readonly mapEffect = effect(() => {
    const mission = this.mission();
    const container = this.mapContainer()?.nativeElement;
    if (!mission || !container) return;
    setTimeout(() => this.initOrUpdateMap(), 50);
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
          this.mission.update((curr) => curr ? { ...curr, status: 'Assigned' } : null);
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
        error: () => {
          this.actionBusy.set(false);
          this.actionMessage.set('Lỗi khi gửi xác nhận. Vui lòng thử lại.');
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
            status: 'Postponed',
            reason,
            actorRole: role,
            assignmentId: assign.id,
            actorId: this.currentUser()?.id,
            actorName: this.currentUser()?.fullName || this.currentUser()?.email || 'Thành viên đội bay',
            timestamp: new Date().toISOString(),
          });
        },
        error: () => {
          this.actionBusy.set(false);
          this.actionMessage.set('Không thể gửi yêu cầu dời lịch. Vui lòng thử lại.');
        },
      });
  }

  protected selectTarget(towerId: string): void {
    this.selectedTargetId.set(towerId);
    const target = this.mission()?.targets.find((t) => t.towerId === towerId);
    if (!target || !target.latitude || !target.longitude || !this.map) return;
    this.map.panTo([target.latitude, target.longitude], { animate: true, duration: 0.5 });
  }

  protected setMapType(type: 'satellite' | 'streets'): void {
    this.mapType.set(type);
    if (!this.map) return;
    if (this.currentTileLayer) {
      this.map.removeLayer(this.currentTileLayer);
      this.currentTileLayer = null;
    }

    const tileUrl = type === 'satellite'
      ? 'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
      : 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';

    const tileLayer = L.tileLayer(tileUrl, {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: '© Google Maps | EVN UAV-PMS',
      keepBuffer: 6,
    });

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
    const container = this.mapContainer()?.nativeElement;
    if (!container) return;

    if (this.map && this.map.getContainer() !== container) {
      this.cleanupMap();
    }

    if (!this.map) {
      (container as unknown as { _leaflet_id: number | null })._leaflet_id = null;
      this.map = L.map(container, {
        zoomControl: false,
        attributionControl: false,
      });

      L.control.zoom({ position: 'topright' }).addTo(this.map);
      this.setMapType(this.mapType());

      this.resizeObserver = new ResizeObserver(() => {
        this.map?.invalidateSize();
      });
      this.resizeObserver.observe(container);
    }

    this.renderTargetsOnMap();
  }

  private renderTargetsOnMap(): void {
    if (!this.map) return;

    this.markers.forEach((m) => m.remove());
    this.markers = [];
    if (this.routeLine) {
      this.routeLine.remove();
      this.routeLine = null;
    }

    const targets = [...this.targetsWithCoordinates()].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    if (!targets.length) {
      this.map.setView([16.0, 107.5], 6);
      return;
    }

    const latLngs: L.LatLngExpression[] = [];

    targets.forEach((target, index) => {
      const lat = target.latitude!;
      const lng = target.longitude!;
      latLngs.push([lat, lng]);

      const sequence = target.sequence || index + 1;
      const code = target.towerCode || `Cột ${sequence}`;

      const icon = L.divIcon({
        className: 'custom-tower-marker',
        html: `
          <div class="tower-pin">
            <span class="pin-badge">${sequence}</span>
            <span class="pin-code">${code}</span>
          </div>
        `,
        iconSize: [48, 48],
        iconAnchor: [24, 24],
      });

      const marker = L.marker([lat, lng], { icon })
        .addTo(this.map!)
        .bindPopup(`<strong>${code}</strong><br/>GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);

      marker.on('click', () => this.selectTarget(target.towerId));
      this.markers.push(marker);
    });

    if (latLngs.length > 1) {
      this.routeLine = L.polyline(latLngs, {
        color: '#0284c7',
        weight: 3,
        dashArray: '6, 6',
        opacity: 0.9,
      }).addTo(this.map);
    }

    const bounds = L.latLngBounds(latLngs);
    this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
    setTimeout(() => this.map?.invalidateSize(), 100);
    setTimeout(() => this.map?.invalidateSize(), 300);
  }

  private cleanupMap(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.markers.forEach((m) => m.remove());
    this.markers = [];
    if (this.routeLine) {
      this.routeLine.remove();
      this.routeLine = null;
    }
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  protected statusLabel(status: string): string {
    return missionStatusLabel(status);
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
