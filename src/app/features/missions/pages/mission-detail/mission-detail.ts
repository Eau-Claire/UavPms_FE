import { DatePipe } from '@angular/common';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import * as L from 'leaflet';
import { catchError, concatMap, finalize, from, of, tap } from 'rxjs';
import { NzIconModule } from 'ng-zorro-antd/icon';
import {
  InspectionObjective,
  Mission,
  MissionAssignment,
  MissionBackendDetection,
  MissionCommunicationLog,
  MissionPriority,
  MissionTarget,
  PRIORITY_DEFECT_CATEGORIES,
  UpdateMissionPriorityRequest,
  missionStatusLabel,
  normalizeMissionStatus,
} from '../../../../models/missions.models';
import { UserRecord } from '../../../../models/users.models';
import {
  AiAnalysisStatusChangedEvent,
  MissionLifecycleRealtimeEvent,
  NotificationsRealtime,
} from '../../../notifications/data-access/notifications-realtime';
import { MissionsApi } from '../../data-access/missions-api';
import { UsersApi } from '../../../users/data-access/users-api';
import { NotificationsStore } from '../../../notifications/data-access/notifications-store';
import { Auth } from '../../../../core/auth/auth';

export type MissionDetailTab = 'overview' | 'upload' | 'processing' | 'results' | 'towers' | 'maintenance' | 'activity';
export type DetectionReviewDecision = 'Approved' | 'Rejected';
export type MediaKind = 'image' | 'video';

export interface MissionMediaPreview {
  readonly id: string;
  readonly file: File;
  readonly url: string;
  readonly thumbnailUrl: string;
  readonly kind: MediaKind;
  readonly name: string;
  readonly size: string;
  readonly resolution: string;
  readonly fps: string;
  readonly duration: string;
  readonly durationSeconds: number;
  readonly status: string;
  readonly progress: number;
  readonly requestId?: string;
  readonly batchId?: string;
  readonly accepted?: boolean;
  readonly savedDetections?: number;
  readonly createdAlerts?: number;
  readonly completedAt?: string;
  readonly errorMessage?: string;
}

export interface MissionDetectionView {
  readonly id: string;
  readonly mediaId: string;
  readonly title: string;
  readonly confidence: number;
  readonly timestampLabel: string;
  readonly timestampSeconds: number | null;
  readonly frameIndex: number | null;
  readonly videoDurationLabel: string;
  readonly status: string;
  readonly mediaStatus: string;
  readonly categoryCode: string;
  readonly severityWeight: number;
  readonly isEmergency: boolean;
  readonly aiSource: string;
  readonly mediaType: string;
  readonly sourceUrl?: string;
  readonly imageUrl?: string;
  readonly cropImageUrl?: string;
  readonly boundingBox?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly missionId: string;
  readonly towerId: string;
  readonly tower: string;
  readonly gps: string;
  readonly description: string;
  readonly notes: string;
  readonly detectedAt: string;
  readonly validatedAt: string;
}

export interface MissionTimelineMarker {
  readonly id: string;
  readonly detectionId: string;
  readonly timestampSeconds: number;
  readonly timestampLabel: string;
  readonly percent: number;
  readonly title: string;
  readonly confidence: number;
  readonly isEmergency: boolean;
}

/** Cột điện của nhiệm vụ kèm số khuyết tật đã được duyệt. */
export interface MissionTowerItem {
  readonly towerId: string;
  readonly towerCode: string;
  readonly sequence: number;
  readonly inspectionStatus: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly defectCount: number;
}

export interface MissionMaintenanceTask {
  readonly id: string;
  readonly title: string;
  readonly priority: 'Urgent' | 'High' | 'Medium' | 'Scheduled';
  readonly towerCode: string;
  readonly defectDescription: string;
  readonly suggestedAction: string;
  readonly status: 'Pending' | 'Approved' | 'InProgress' | 'Completed';
  readonly assignedTeam: string;
}

@Component({
  selector: 'app-mission-detail',
  imports: [DatePipe, RouterLink, NzIconModule, FormsModule],
  templateUrl: './mission-detail.html',
  styleUrl: './mission-detail.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionDetail {
  private readonly api = inject(MissionsApi);
  private readonly usersApi = inject(UsersApi);
  private readonly realtime = inject(NotificationsRealtime);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notificationsStore = inject(NotificationsStore);
  protected readonly auth = inject(Auth);
  protected readonly isInspector = computed(() => {
    const role = (this.auth.user()?.role || '').toLowerCase();
    return (
      role === 'inspector' ||
      role === 'pilot' ||
      role === 'admin' ||
      role === 'systemadmin' ||
      role === 'administrator'
    );
  });
  private readonly aiStatusEvents = new Map<string, AiAnalysisStatusChangedEvent>();
  private readonly missionMapContainer = viewChild<ElementRef<HTMLDivElement>>('missionMap');
  private map: L.Map | null = null;
  private currentTileLayer: L.TileLayer | null = null;
  private targetMarkers: L.Marker[] = [];
  private routePolyline: L.Polyline | null = null;
  private mapResizeObserver: ResizeObserver | null = null;
  protected readonly mapType = signal<'satellite' | 'streets'>('satellite');

  @ViewChild('resultVideo') private readonly resultVideo?: ElementRef<HTMLVideoElement>;

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly mission = signal<Mission | null>(null);

  // MF02 Communication & Lifecycle State
  protected readonly isManager = computed(() => {
    const role = (this.auth.user()?.role || '').toLowerCase();
    return ['admin', 'systemadmin', 'administrator', 'manager', 'supervisor'].includes(role);
  });

  protected readonly showPriorityModal = signal(false);
  protected readonly editPriority = signal<MissionPriority>('NORMAL');
  protected readonly editObjective = signal<InspectionObjective>('PERIODIC_INSPECTION');
  protected readonly editEmergencyReason = signal('');
  protected readonly editPriorityDefects = signal<string[]>([]);
  protected readonly priorityDefectCategories = PRIORITY_DEFECT_CATEGORIES;

  protected readonly activeRole = signal<'MANAGER' | 'INSPECTOR'>('MANAGER');
  protected readonly actionBusy = signal(false);
  protected readonly actionMessage = signal('');
  protected readonly showPostponeModal = signal(false);
  protected readonly selectedAssignmentToPostpone = signal<MissionAssignment | null>(null);
  protected readonly postponeReason = signal('');
  protected readonly showSuspendModal = signal(false);
  protected readonly suspendReason = signal('');
  protected readonly showCancelModal = signal(false);
  protected readonly cancelReason = signal('');
  protected readonly chatMessage = signal('');
  protected readonly currentTime = signal(Date.now());

  // Multi-Role Team & Reassign State (MF02)
  protected readonly availableUsers = signal<readonly UserRecord[]>([]);
  protected readonly showReassignModal = signal<boolean>(false);
  protected readonly selectedAssignmentToReassign = signal<MissionAssignment | null>(null);
  protected readonly reassignNewUserId = signal<string>('');
  protected readonly reassignReason = signal<string>('');

  protected readonly multiRoleTeam = computed<readonly MissionAssignment[]>(() => {
    return this.mission()?.team ?? [];
  });

  protected readonly allRolesConfirmed = computed<boolean>(() => {
    return this.mission()?.allConfirmed ?? false;
  });

  protected readonly confirmationProgressPct = computed<number>(() => {
    const m = this.mission();
    if (!m) return 0;
    const total = m.totalRequiredCount || 3;
    const count = m.confirmedCount || 0;
    return Math.round((count / Math.max(1, total)) * 100);
  });

  protected readonly postponedMember = computed<MissionAssignment | null>(() => {
    return this.multiRoleTeam().find((m) => m.responseStatus === 'POSTPONED') ?? null;
  });

  protected readonly reassignCandidatePool = computed<readonly UserRecord[]>(() => {
    const assignment = this.selectedAssignmentToReassign();
    if (!assignment) return this.availableUsers();
    const targetRole = (assignment.assignmentRole || '').toLowerCase();
    return this.availableUsers().filter((u) => {
      const userRole = (u.role || '').toLowerCase();
      if (targetRole.includes('inspector') || targetRole.includes('pilot')) {
        return userRole.includes('inspector') || userRole.includes('pilot') || userRole.includes('phi công');
      }
      if (targetRole.includes('analyst')) {
        return userRole.includes('analyst') || userRole.includes('phân tích') || userRole.includes('dữ liệu');
      }
      if (targetRole.includes('tech')) {
        return userRole.includes('tech') || userRole.includes('kỹ thuật') || userRole.includes('bảo trì');
      }
      return true;
    });
  });

  protected getMemberDisplayName(member: MissionAssignment): string {
    const users = this.availableUsers();
    if (member.userId && users.length > 0) {
      const found = users.find((u) => u.id === member.userId || u.username === member.userId);
      if (found) {
        return found.fullName || found.username || found.email;
      }
    }
    if (member.userName && users.length > 0) {
      const found = users.find(
        (u) => u.username.toLowerCase() === member.userName.toLowerCase() || u.id === member.userName,
      );
      if (found) {
        return found.fullName || found.username || found.email;
      }
    }
    return member.userFullName || member.userName || member.assignmentRole || 'Thành viên';
  }

  protected getAssignedPilotDisplayName(): string {
    const m = this.mission();
    if (!m) return 'Chưa phân công';
    const users = this.availableUsers();
    if (m.assignedToUserId && users.length > 0) {
      const found = users.find((u) => u.id === m.assignedToUserId || u.username === m.assignedToUserId);
      if (found) {
        return found.fullName || found.username || found.email;
      }
    }
    if (m.assignedToUsername && users.length > 0) {
      const found = users.find(
        (u) => u.username.toLowerCase() === m.assignedToUsername.toLowerCase() || u.id === m.assignedToUsername,
      );
      if (found) {
        return found.fullName || found.username || found.email;
      }
    }
    return m.assignedToUsername || 'Chưa phân công';
  }

  protected canAcceptMemberAssignment(member: MissionAssignment): boolean {
    const user = this.auth.user();
    if (!user) return false;
    const userRole = (user.role || '').toLowerCase();
    // Managers or Administrators cannot accept assignments on behalf of assigned roles
    if (['manager', 'supervisor', 'admin', 'systemadmin', 'administrator'].includes(userRole)) return false;

    return !!member.userId && user.id === member.userId;
  }

  protected canPostponeMemberAssignment(member: MissionAssignment): boolean {
    return this.canAcceptMemberAssignment(member);
  }

  protected canReassignMember(member: MissionAssignment): boolean {
    return member.responseStatus === 'POSTPONED' && this.isManager();
  }

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

  protected readonly isLinearUploadBlocked = computed(() => {
    const m = this.mission();
    if (!m) return true;
    return ['Draft', 'PendingAcceptance', 'Postponed', 'Suspended', 'Cancelled'].includes(m.status);
  });

  protected readonly deadlineTimeRemaining = computed(() => {
    const deadline = this.confirmationDeadlineDate();
    if (!deadline) return null;
    const now = this.currentTime();
    const diffMs = deadline.getTime() - now;
    const isPast = diffMs < 0;
    const absDiffMs = Math.abs(diffMs);
    const hours = Math.floor(absDiffMs / (1000 * 60 * 60));
    const minutes = Math.floor((absDiffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (isPast) {
      return `Quá hạn ${hours > 0 ? `${hours}h ` : ''}${minutes} phút`;
    }
    return `Còn ${hours > 0 ? `${hours}h ` : ''}${minutes} phút`;
  });

  protected readonly communicationLogs = computed(() => {
    const m = this.mission();
    if (!m) return [];
    return m.communicationLogs ?? [];
  });
  protected readonly targetsWithCoordinates = computed(() => this.mission()?.targets.filter((target) =>
    Number.isFinite(target.latitude) && Number.isFinite(target.longitude)
      && Math.abs(target.latitude!) <= 90 && Math.abs(target.longitude!) <= 180,
  ) ?? []);
  protected readonly targetsInEvnspcCoverage = computed(() => this.targetsWithCoordinates().filter((target) =>
    target.latitude! >= 8 && target.latitude! <= 16.2 && target.longitude! >= 102 && target.longitude! <= 109.6,
  ));
  protected readonly hasTargetsOutsideEvnspcCoverage = computed(
    () => this.targetsInEvnspcCoverage().length !== this.targetsWithCoordinates().length,
  );
  protected readonly selectedTargetId = signal('');
  protected readonly selectedTarget = computed(() => {
    const targets = this.mission()?.targets ?? [];
    return targets.find((target) => target.towerId === this.selectedTargetId()) ?? targets[0] ?? null;
  });
  /** Cột được gắn với tệp tải lên; để trống khi là video quét hành lang qua nhiều cột. */
  protected readonly uploadTowerId = signal('');
  protected readonly activeTab = signal<MissionDetailTab>('overview');
  protected readonly mediaQueue = signal<readonly MissionMediaPreview[]>([]);
  protected readonly activeMediaId = signal('');
  protected readonly selectedMedia = computed<MissionMediaPreview | null>(
    () => this.mediaQueue().find((media) => media.id === this.activeMediaId()) ?? this.mediaQueue()[0] ?? null,
  );
  protected readonly lightboxMedia = signal<MissionMediaPreview | null>(null);
  protected readonly dragActive = signal(false);
  protected readonly uploadProgress = signal(0);
  protected readonly uploadBusy = signal(false);
  protected readonly uploadMessage = signal('');
  protected readonly lastUploadBatchId = signal('');
  protected readonly aiRealtimeStatus = signal<'connected' | 'disconnected' | 'reconnecting'>('disconnected');

  // Detections & AI Results State
  protected readonly detectionsLoading = signal(false);
  protected readonly detections = signal<readonly MissionDetectionView[]>([]);
  protected readonly displayedDetections = computed(() => {
    return this.detections();
  });

  protected readonly resultPage = signal(1);
  protected readonly resultPageSize = signal(6);
  protected readonly resultTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.displayedDetections().length / this.resultPageSize())),
  );
  protected readonly resultPageButtons = computed(() =>
    this.compactPages(this.resultPage(), this.resultTotalPages()),
  );
  protected readonly pagedDisplayedDetections = computed(() => {
    const page = Math.min(this.resultPage(), this.resultTotalPages());
    const start = (page - 1) * this.resultPageSize();
    return this.displayedDetections().slice(start, start + this.resultPageSize());
  });
  protected readonly resultStartIndex = computed(() => {
    const total = this.displayedDetections().length;
    if (!total) return 0;
    return (Math.min(this.resultPage(), this.resultTotalPages()) - 1) * this.resultPageSize() + 1;
  });
  protected readonly resultEndIndex = computed(() =>
    Math.min(
      this.displayedDetections().length,
      Math.min(this.resultPage(), this.resultTotalPages()) * this.resultPageSize(),
    ),
  );

  protected readonly approvedDetectionCount = computed(
    () => this.detections().filter((item) => ['Approved', 'Accepted'].includes(item.status)).length,
  );
  protected readonly rejectedDetectionCount = computed(
    () => this.detections().filter((item) => item.status === 'Rejected').length,
  );
  protected readonly pendingDetectionCount = computed(
    () => this.detections().length - this.approvedDetectionCount() - this.rejectedDetectionCount(),
  );

  protected readonly videoDetections = computed(() => {
    return this.detections().filter((item) => this.isVideoDetection(item));
  });

  protected readonly selectedDetection = signal<MissionDetectionView | null>(null);
  protected readonly reviewBusy = signal(false);
  protected readonly reviewNotes = signal('');
  protected readonly resultMessage = signal('');
  protected readonly detailPanelWidth = signal(400);
  private readonly missionMapEffect = effect(() => {
    const mission = this.mission();
    const tab = this.activeTab();
    if (!mission || tab !== 'overview') return;
    setTimeout(() => this.renderMissionMap(), 0);
  });

  // Video Inspection Playback State
  protected readonly videoCurrentTime = signal<number>(0);
  protected readonly videoDuration = signal<number>(60);
  protected readonly hoveredMarker = signal<MissionTimelineMarker | null>(null);

  // Video Timeline Markers
  protected readonly videoTimelineMarkers = computed<readonly MissionTimelineMarker[]>(() => {
    const dur = this.videoDuration() || 60;
    return this.videoDetections()
      .filter((d) => d.timestampSeconds !== null && d.timestampSeconds <= dur)
      .map((d) => {
        const ts = d.timestampSeconds!;
        const pct = Math.min(100, Math.max(0, (ts / dur) * 100));
        return {
          id: `marker-${d.id}`,
          detectionId: d.id,
          timestampSeconds: ts,
          timestampLabel: d.timestampLabel,
          percent: pct,
          title: d.title,
          confidence: d.confidence,
          isEmergency: d.isEmergency,
        };
      });
  });

  /** Cột điện của nhiệm vụ kèm số khuyết tật đã duyệt. */
  protected readonly missionTowers = computed<readonly MissionTowerItem[]>(() => {
    const approved = this.detections().filter((d) => d.status === 'Approved' || d.status === 'Accepted');
    return (this.mission()?.targets ?? []).map((t, idx) => ({
      towerId: t.towerId,
      towerCode: t.towerCode || t.towerId,
      sequence: t.sequence ?? idx + 1,
      inspectionStatus: t.inspectionStatus,
      latitude: t.latitude,
      longitude: t.longitude,
      defectCount: approved.filter((d) => d.towerId === t.towerId).length,
    }));
  });
  protected readonly towersWithDefectsCount = computed(() => this.missionTowers().filter((t) => t.defectCount > 0).length);

  // Emergency Siren and Banner Alert
  protected readonly activeEmergency = signal<{ title: string; message: string; timestamp: string } | null>(null);
  private audioCtx: AudioContext | null = null;
  private sirenInterval: any = null;

  // Mission Maintenance Recommendations (Derived from Approved Detections or Mission Maintenance API)
  protected readonly maintenanceTasks = signal<readonly MissionMaintenanceTask[]>([]);

  private resizeStartX = 0;
  private resizeStartWidth = 400;
  private readonly handleResultDetailResizeMove = (event: PointerEvent): void => {
    const maxWidth = Math.min(800, Math.max(320, window.innerWidth - 420));
    const nextWidth = this.resizeStartWidth + this.resizeStartX - event.clientX;
    this.detailPanelWidth.set(Math.min(maxWidth, Math.max(300, Math.round(nextWidth))));
  };
  private readonly stopResultDetailResize = (): void => {
    window.removeEventListener('pointermove', this.handleResultDetailResizeMove);
    window.removeEventListener('pointerup', this.stopResultDetailResize);
  };

  constructor() {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (this.isTab(tab)) this.activeTab.set(tab);

    this.usersApi
      .getAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (users) => this.availableUsers.set(users),
        error: () => {},
      });

    this.realtime.status$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((status) => this.aiRealtimeStatus.set(status));
    this.realtime.aiAnalysisStatus$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => this.handleAiAnalysisStatus(event));
    this.realtime.missionEvents$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => this.handleMissionRealtimeEvent(event));
    this.realtime.notifications$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((notif) => {
        if (
          notif.type === 'EmergencyAlert' ||
          notif.type === 'CriticalAlert' ||
          notif.title?.toLowerCase().includes('khẩn cấp') ||
          notif.body?.toLowerCase().includes('khẩn cấp')
        ) {
          this.triggerEmergencySiren(notif.title, notif.body);
        }
      });

    const timer = setInterval(() => this.currentTime.set(Date.now()), 30000);
    const pollTimer = setInterval(() => {
      const m = this.mission();
      if (m && !m.allConfirmed && m.status === 'PendingAcceptance') {
        this.loadAssignmentsOverview(m.id);
      }
    }, 5000);

    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      clearInterval(pollTimer);
      if (this.sirenInterval) {
        clearInterval(this.sirenInterval);
        this.sirenInterval = null;
      }
      if (this.audioCtx) {
        this.audioCtx.close().catch(() => {});
      }
      this.realtime.leaveMission(id);
      this.stopResultDetailResize();
      this.cleanupMap();
    });
    this.realtime.connect();
    this.realtime.joinMission(id);

    this.api
      .get(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (mission) => {
          this.mission.set(mission);
          this.selectedTargetId.set(mission.targets[0]?.towerId ?? '');
          this.loadAssignmentsOverview(mission.id);
          this.loadDetections(mission.id);
          this.loadMaintenanceTasks(mission.id);
          this.loadActivities(mission.id);
        },
        error: (error: unknown) => this.error.set(this.errorMessage(error)),
      });
  }

  protected setTab(tab: MissionDetailTab): void {
    if (!this.isInspector() && (tab === 'upload' || tab === 'processing')) {
      this.activeTab.set('overview');
      return;
    }
    this.activeTab.set(tab);
    const missionId = this.mission()?.id;
    if (!missionId) return;

    if (tab === 'results' || tab === 'processing') {
      this.loadDetections(missionId);
    } else if (tab === 'maintenance') {
      this.loadMaintenanceTasks(missionId);
    } else if (tab === 'activity') {
      this.loadActivities(missionId);
    } else if (tab === 'overview') {
      this.loadAssignmentsOverview(missionId);
    }
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

  protected selectTarget(towerId: string): void {
    this.selectedTargetId.set(towerId);
    const target = this.mission()?.targets.find((item) => item.towerId === towerId);
    if (!target || !target.latitude || !target.longitude || !this.map) return;
    this.map.panTo([target.latitude, target.longitude], { animate: true, duration: 0.5 });
  }

  private renderMissionMap(): void {
    const container = this.missionMapContainer()?.nativeElement;
    if (!container) return;

    if (this.map && this.map.getContainer() !== container) {
      this.cleanupMap();
    }

    if (!this.map) {
      (container as unknown as { _leaflet_id: number | null })._leaflet_id = null;
      this.map = L.map(container, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
      });

      L.control.zoom({ position: 'topright' }).addTo(this.map);
      this.setMapType(this.mapType());

      this.mapResizeObserver = new ResizeObserver(() => {
        this.map?.invalidateSize();
      });
      this.mapResizeObserver.observe(container);
    }

    this.renderTargetsOnMap();
  }

  private renderTargetsOnMap(): void {
    if (!this.map) return;

    this.targetMarkers.forEach((m) => m.remove());
    this.targetMarkers = [];
    if (this.routePolyline) {
      this.routePolyline.remove();
      this.routePolyline = null;
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
      this.targetMarkers.push(marker);
    });

    if (latLngs.length > 1) {
      this.routePolyline = L.polyline(latLngs, {
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
    this.mapResizeObserver?.disconnect();
    this.mapResizeObserver = null;
    this.targetMarkers.forEach((m) => m.remove());
    this.targetMarkers = [];
    if (this.routePolyline) {
      this.routePolyline.remove();
      this.routePolyline = null;
    }
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  protected chooseMedia(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.setMediaFiles(files);
    input.value = '';
  }

  protected onMediaDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(true);
  }

  protected onMediaDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
  }

  protected onMediaDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
    this.setMediaFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  private setMediaFiles(files: readonly File[]): void {
    if (!files.length) return;

    const startIndex = this.mediaQueue().length;
    const previews = files.map((file, index) => {
      const kind: MediaKind = file.type.startsWith('video/') ? 'video' : 'image';
      const url = URL.createObjectURL(file);
      return {
        id: `${Date.now()}-${startIndex + index}-${file.name}`,
        file,
        url,
        thumbnailUrl: kind === 'image' ? url : '',
        kind,
        name: file.name,
        size: this.formatBytes(file.size),
        resolution: 'Đang đọc...',
        fps: kind === 'video' ? '30 FPS' : '-',
        duration: kind === 'video' ? 'Đang đọc...' : '-',
        durationSeconds: 0,
        status: 'Sẵn sàng gửi AI',
        progress: 0,
      } satisfies MissionMediaPreview;
    });

    this.mediaQueue.update((items) => [...items, ...previews]);
    this.activeMediaId.set(previews[0]?.id ?? this.activeMediaId());
    this.uploadProgress.set(0);
    this.uploadMessage.set('');
    this.selectedDetection.set(null);

    previews.forEach((media) => {
      if (media.kind === 'image') {
        this.readImageMetadata(media.id, media.url);
      } else {
        this.extractVideoThumbnail(media.id, media.url);
      }
    });
  }

  protected selectMedia(id: string): void {
    this.activeMediaId.set(id);
  }

  protected openMediaPreview(media: MissionMediaPreview, event?: Event): void {
    event?.stopPropagation();
    this.lightboxMedia.set(media);
  }

  protected closeMediaPreview(): void {
    this.lightboxMedia.set(null);
  }

  protected removeMedia(id: string, event?: Event): void {
    event?.stopPropagation();
    const removed = this.mediaQueue().find((media) => media.id === id);
    if (removed) URL.revokeObjectURL(removed.url);
    const nextQueue = this.mediaQueue().filter((media) => media.id !== id);
    this.mediaQueue.set(nextQueue);
    if (this.activeMediaId() === id) this.activeMediaId.set(nextQueue[0]?.id ?? '');
    if (this.lightboxMedia()?.id === id) this.lightboxMedia.set(null);
    if (!nextQueue.length) {
      this.uploadProgress.set(0);
      this.uploadMessage.set('');
    }
  }

  protected onVideoMetadata(event: Event, id?: string): void {
    const video = event.target as HTMLVideoElement;
    const media = id ? this.mediaQueue().find((item) => item.id === id) : this.selectedMedia();
    if (!media || media.kind !== 'video') return;

    const durSec = Math.round(video.duration || 60);
    this.videoDuration.set(durSec);
    this.updateMedia(media.id, {
      resolution: video.videoWidth && video.videoHeight ? `${video.videoWidth} x ${video.videoHeight}` : '1920 x 1080',
      duration: Number.isFinite(video.duration) ? this.formatTime(video.duration) : '01:00',
      durationSeconds: durSec,
      fps: '30 FPS',
    });
  }

  private extractVideoThumbnail(id: string, url: string): void {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.src = url;

    video.onloadedmetadata = () => {
      const dur = Math.round(video.duration || 60);
      const res = video.videoWidth && video.videoHeight ? `${video.videoWidth} x ${video.videoHeight}` : '1920 x 1080';
      this.updateMedia(id, {
        resolution: res,
        duration: this.formatTime(dur),
        durationSeconds: dur,
        fps: '30 FPS',
      });
      video.currentTime = Math.min(1.0, dur / 4);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(480, video.videoWidth || 480);
        canvas.height = Math.min(270, video.videoHeight || 270);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumb = canvas.toDataURL('image/jpeg', 0.85);
          this.updateMedia(id, { thumbnailUrl: thumb });
        }
      } catch {
        this.updateMedia(id, { thumbnailUrl: '/images/defect-preview-frame.png' });
      }
    };
  }

  protected uploadSelectedMedia(): void {
    if (this.isLinearUploadBlocked()) {
      this.uploadMessage.set(
        '⛔ VÒNG ĐỜI TUYẾN TÍNH: Nhiệm vụ đang ở trạng thái dự thảo hoặc chờ các vai trò xác nhận tiếp nhận. Không thể nạp ảnh/video khi chưa bay.',
      );
      return;
    }
    const media = this.mediaQueue();
    const missionId = this.mission()?.id;
    if (!media.length || !missionId) return;

    this.uploadBusy.set(true);
    this.uploadProgress.set(0);
    this.uploadMessage.set('Đang tải tệp lên máy chủ AI Inspection...');
    this.setQueueProgress('Đang tải lên', 0);

    const towerId = this.uploadTowerId() || null;
    const totalBytes = media.reduce((sum, item) => sum + item.file.size, 0) || 1;
    let uploadedBytes = 0;
    let duplicates = 0;

    from(media)
      .pipe(
        concatMap((item) =>
          this.api.uploadMedia(missionId, item.file, { towerId }).pipe(
            tap((event) => {
              if (event.type === HttpEventType.UploadProgress) {
                const itemTotal = event.total || item.file.size || 1;
                this.uploadProgress.set(Math.min(100, Math.round(((uploadedBytes + event.loaded) / totalBytes) * 100)));
                this.updateMedia(item.id, { status: 'Đang tải lên', progress: Math.round((event.loaded / itemTotal) * 100) });
              } else if (event.type === HttpEventType.Response) {
                uploadedBytes += item.file.size;
                const body = event.body && typeof event.body === 'object' ? (event.body as Record<string, unknown>) : {};
                const data = body['data'] && typeof body['data'] === 'object' ? (body['data'] as Record<string, unknown>) : {};
                const isDuplicate = data['isDuplicate'] === true;
                if (isDuplicate) duplicates++;
                this.updateMedia(item.id, {
                  status: isDuplicate ? 'Tệp đã có trong nhiệm vụ (bỏ qua)' : 'Đã tải lên, chờ phân tích',
                  progress: 100,
                  accepted: true,
                });
              }
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.uploadBusy.set(false)),
      )
      .subscribe({
        complete: () => {
          this.uploadProgress.set(100);
          this.uploadMessage.set(
            duplicates
              ? `Đã tải lên ${media.length - duplicates}/${media.length} tệp, ${duplicates} tệp trùng đã bỏ qua.`
              : `Đã tải lên ${media.length} tệp. Hệ thống đang phân tích.`,
          );
          this.setTab('processing');
        },
        error: (error: unknown) => {
          this.setQueueProgress('Tải lên lỗi', this.uploadProgress());
          this.uploadMessage.set(this.errorMessage(error));
        },
      });
  }

  // JUMP TO DETECTION & VIDEO SEEK
  protected jumpToDetection(detection: MissionDetectionView): void {
    if (this.selectedDetection()?.id === detection.id) {
      this.closeDetectionDetail();
      return;
    }
    this.selectedDetection.set(detection);
    this.reviewNotes.set(detection.notes);
    this.resultMessage.set('');

    if (detection.timestampSeconds !== null) {
      queueMicrotask(() => this.seekVideoDetection(detection));
    }
  }

  protected seekVideoDetection(detection: MissionDetectionView, event?: Event): void {
    event?.stopPropagation();
    if (this.selectedDetection()?.id !== detection.id) {
      this.selectedDetection.set(detection);
      this.reviewNotes.set(detection.notes);
      this.resultMessage.set('');
    }
    if (detection.timestampSeconds === null) return;
    const video = this.resultVideo?.nativeElement;
    if (!video) return;
    video.currentTime = detection.timestampSeconds;
    this.videoCurrentTime.set(detection.timestampSeconds);
    void video.play().catch(() => undefined);
  }

  protected onResultVideoTimeUpdate(): void {
    const video = this.resultVideo?.nativeElement;
    if (!video) return;
    this.videoCurrentTime.set(video.currentTime);
    if (!this.videoDuration() && Number.isFinite(video.duration)) {
      this.videoDuration.set(video.duration);
    }
  }

  protected onTimelineTrackScrub(event: MouseEvent | Event): void {
    if (!(event instanceof MouseEvent)) return;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const duration = this.videoDuration() || 60;
    const targetSeconds = percent * duration;

    const video = this.resultVideo?.nativeElement;
    if (video) {
      video.currentTime = targetSeconds;
      this.videoCurrentTime.set(targetSeconds);
      void video.play().catch(() => undefined);
    }
  }

  protected setHoveredMarker(marker: MissionTimelineMarker | null): void {
    this.hoveredMarker.set(marker);
  }

  protected closeDetectionDetail(): void {
    this.selectedDetection.set(null);
    this.reviewNotes.set('');
    this.resultMessage.set('');
  }

  protected reviewDetection(decision: DetectionReviewDecision): void {
    const selected = this.selectedDetection();
    const missionId = this.mission()?.id;
    if (!selected || !missionId) return;

    this.reviewBusy.set(true);
    this.resultMessage.set('');
    const backendStatus: 'Approved' | 'Rejected' = decision === 'Approved' ? 'Approved' : 'Rejected';

    this.api
      .reviewDetection(missionId, selected.id, {
        status: backendStatus,
        reviewNotes: this.reviewNotes(),
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.reviewBusy.set(false)),
      )
      .subscribe({
        next: () => {
          const updated: MissionDetectionView = {
            ...selected,
            status: backendStatus,
            notes: this.reviewNotes(),
            validatedAt: new Date().toISOString(),
          };
          this.selectedDetection.set(updated);
          this.detections.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
          this.resultMessage.set(
            decision === 'Approved'
              ? 'Đã duyệt khuyết tật. Hệ thống lập khuyến nghị bảo trì từ khuyết tật này.'
              : 'Đã từ chối phát hiện AI (nhận diện sai).',
          );
          // Auto reload maintenance tasks generated by backend
          this.loadMaintenanceTasks(missionId);

          this.realtime.broadcastMissionEvent({
            missionId,
            type: 'DETECTION_REVIEWED',
            status: backendStatus,
            actorRole: 'ANALYST',
            actorName: this.auth.user()?.fullName || 'Chuyên viên phân tích',
            detectionId: selected.id,
            reason: this.reviewNotes() || (backendStatus === 'Approved' ? 'Xác nhận khuyết tật' : 'Bác bỏ khuyết tật'),
            timestamp: new Date().toISOString(),
          });
        },
        error: (error: unknown) => this.resultMessage.set(this.errorMessage(error)),
      });
  }

  protected setReviewNotes(value: string): void {
    this.reviewNotes.set(value);
  }

  protected refreshDetections(): void {
    const missionId = this.mission()?.id;
    if (missionId) this.loadDetections(missionId);
  }

  protected goToResultPage(page: number): void {
    const nextPage = this.clampPage(page, this.resultTotalPages(), this.resultPage());
    if (nextPage === this.resultPage()) return;
    this.resultPage.set(nextPage);
    this.selectedDetection.set(null);
  }

  protected startResultDetailResize(event: PointerEvent): void {
    event.preventDefault();
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.detailPanelWidth();
    window.addEventListener('pointermove', this.handleResultDetailResizeMove);
    window.addEventListener('pointerup', this.stopResultDetailResize);
  }

  protected switchRole(role: 'MANAGER' | 'INSPECTOR'): void {
    this.activeRole.set(role);
  }

  protected confirmMission(): void {
    const currentMission = this.mission();
    if (!currentMission) return;
    this.actionBusy.set(true);
    this.actionMessage.set('');

    this.api
      .confirmMission(currentMission.id, 'Inspector xác nhận sẵn sàng tiếp nhận nhiệm vụ.')
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.actionBusy.set(false)),
      )
      .subscribe({
        next: (updated) => {
          this.mission.set(updated);
          this.actionMessage.set('Đã xác nhận nhiệm vụ bay thành công!');
          this.notificationsStore.upsert({
            id: `notif-${Date.now()}`,
            userId: updated.managerId,
            title: `[MF02] Inspector đã xác nhận nhiệm vụ ${updated.missionCode}`,
            body: `Phi công ${updated.assignedToUsername || 'Inspector'} đã xác nhận tiếp nhận nhiệm vụ. Sẵn sàng cất cánh theo lịch.`,
            type: 'MISSION_CONFIRMED',
            referenceType: 'MISSION',
            referenceId: updated.id,
            createdAt: new Date().toISOString(),
            isRead: false,
          });
          this.realtime.broadcastMissionEvent({
            missionId: updated.id,
            type: 'CONFIRMED',
            status: 'Assigned',
            actorRole: 'INSPECTOR',
            actorName: updated.assignedToUsername || 'Inspector',
            reason: 'Inspector xác nhận tiếp nhận nhiệm vụ.',
            timestamp: new Date().toISOString(),
          });
        },
        error: (err: unknown) => this.actionMessage.set(this.errorMessage(err)),
      });
  }

  protected acceptMemberAssignment(assignment: MissionAssignment): void {
    if (!this.canAcceptMemberAssignment(assignment)) {
      this.actionMessage.set('Vai trò Quản lý (Manager) không thể nhận việc thay cho vai trò được phân công.');
      return;
    }

    const currentMission = this.mission();
    if (!currentMission) return;
    this.actionBusy.set(true);
    this.actionMessage.set('');

    const userName = this.getMemberDisplayName(assignment);
    this.api
      .acceptAssignment(currentMission.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.actionBusy.set(false)),
      )
      .subscribe({
        next: (updated) => {
          this.mission.set(updated);
          this.actionMessage.set(`[${assignment.assignmentRole}] ${userName} đã xác nhận tiếp nhận thành công!`);
          this.realtime.broadcastMissionEvent({
            missionId: updated.id,
            type: 'CONFIRMED',
            status: updated.status,
            assignmentId: assignment.id,
            actorRole: assignment.assignmentRole,
            actorName: userName,
            allConfirmed: updated.allConfirmed,
            confirmedCount: updated.confirmedCount,
            totalRequiredCount: updated.totalRequiredCount,
            reason: `${assignment.assignmentRole} xác nhận tiếp nhận nhiệm vụ.`,
            timestamp: new Date().toISOString(),
          });
        },
        error: (err: unknown) => this.actionMessage.set(this.errorMessage(err)),
      });
  }

  protected openPostponeModal(assignment?: MissionAssignment): void {
    if (assignment && !this.canPostponeMemberAssignment(assignment)) {
      this.actionMessage.set('Vai trò Quản lý (Manager) không thể báo hoãn thay cho vai trò được phân công.');
      return;
    }
    this.selectedAssignmentToPostpone.set(assignment ?? null);
    this.postponeReason.set('');
    this.showPostponeModal.set(true);
  }

  protected closePostponeModal(): void {
    this.showPostponeModal.set(false);
    this.selectedAssignmentToPostpone.set(null);
  }

  protected submitPostpone(): void {
    const currentMission = this.mission();
    const reason = this.postponeReason().trim();
    if (!currentMission || !reason) return;
    this.actionBusy.set(true);

    const assignment = this.selectedAssignmentToPostpone();
    const role = assignment?.assignmentRole || 'INSPECTOR';
    const userName = assignment ? this.getMemberDisplayName(assignment) : 'Thành viên đội ngũ';

    this.api
      .postponeAssignment(currentMission.id, reason)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.actionBusy.set(false)),
      )
      .subscribe({
        next: (updated) => {
          this.mission.set(updated);
          this.showPostponeModal.set(false);
          this.actionMessage.set(`Đã gửi yêu cầu hoãn nhiệm vụ cho vai trò [${role}] tới Quản lý.`);
          this.notificationsStore.upsert({
            id: `notif-${Date.now()}`,
            userId: updated.managerId,
            title: `[MF02 CẢNH BÁO] Yêu cầu hoãn nhiệm vụ ${updated.missionCode}`,
            body: `[${role}] ${userName} đề xuất hoãn nhiệm vụ. Lý do: ${reason}`,
            type: 'MISSION_POSTPONED',
            referenceType: 'MISSION',
            referenceId: updated.id,
            createdAt: new Date().toISOString(),
            isRead: false,
          });
          this.realtime.broadcastMissionEvent({
            missionId: updated.id,
            type: 'POSTPONED',
            status: 'Postponed',
            assignmentId: assignment?.id,
            reason,
            actorRole: role,
            actorName: userName,
            timestamp: new Date().toISOString(),
          });
        },
        error: (err: unknown) => this.actionMessage.set(this.errorMessage(err)),
      });
  }

  protected startFlight(): void {
    const currentMission = this.mission();
    if (!currentMission) return;
    this.actionBusy.set(true);
    this.actionMessage.set('');

    this.api
      .start(currentMission.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.actionBusy.set(false)),
      )
      .subscribe({
        next: () => {
          const now = new Date().toISOString();
          const newLog: MissionCommunicationLog = {
            id: `log-${Date.now()}`,
            senderId: this.auth.user()?.id || 'usr-pilot',
            senderName: currentMission.assignedToUsername || 'Phi công phụ trách',
            senderRole: 'INSPECTOR',
            type: 'START',
            content: 'UAV đã cất cánh. Bắt đầu hành trình bay khảo sát và quét LiDAR/Camera hành lang lưới điện.',
            timestamp: now,
          };
          this.mission.update((curr) =>
            curr
              ? {
                  ...curr,
                  status: 'InProgress',
                  actualStart: now,
                  communicationLogs: [newLog, ...(curr.communicationLogs || [])],
                }
              : null,
          );
          this.actionMessage.set('Đã khởi động chuyến bay khảo sát! Trạng thái: Đang bay.');
          this.realtime.broadcastMissionEvent({
            missionId: currentMission.id,
            type: 'STARTED',
            status: 'InProgress',
            actorRole: 'INSPECTOR',
            actorName: currentMission.assignedToUsername || 'Phi công phụ trách',
            reason: 'Bắt đầu hành trình bay khảo sát hiện trường.',
            timestamp: now,
          });
        },
        error: (err: unknown) => this.actionMessage.set(this.errorMessage(err)),
      });
  }

  protected completeFlight(): void {
    const currentMission = this.mission();
    if (!currentMission) return;
    this.actionBusy.set(true);
    this.actionMessage.set('');

    this.api
      .complete(currentMission.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.actionBusy.set(false)),
      )
      .subscribe({
        next: () => {
          const now = new Date().toISOString();
          const newLog: MissionCommunicationLog = {
            id: `log-${Date.now()}`,
            senderId: this.auth.user()?.id || 'usr-pilot',
            senderName: currentMission.assignedToUsername || 'Phi công phụ trách',
            senderRole: 'INSPECTOR',
            type: 'COMPLETE',
            content:
              'UAV đã hạ cánh an toàn. Chuyến bay khảo sát hoàn tất. Sẵn sàng trích xuất thẻ nhớ SD/dữ liệu để nạp AI.',
            timestamp: now,
          };
          this.mission.update((curr) =>
            curr
              ? {
                  ...curr,
                  status: 'Completed',
                  actualCompleted: now,
                  communicationLogs: [newLog, ...(curr.communicationLogs || [])],
                }
              : null,
          );
          this.actionMessage.set('Chuyến bay khảo sát đã HOÀN TẤT! Cổng nạp dữ liệu ảnh/video UAV đã được mở khóa.');
          this.realtime.broadcastMissionEvent({
            missionId: currentMission.id,
            type: 'COMPLETED',
            status: 'Completed',
            actorRole: 'INSPECTOR',
            actorName: currentMission.assignedToUsername || 'Phi công phụ trách',
            reason: 'Hoàn tất bay khảo sát hiện trường.',
            timestamp: now,
          });
        },
        error: (err: unknown) => this.actionMessage.set(this.errorMessage(err)),
      });
  }

  protected openReassignModal(assignment: MissionAssignment): void {
    this.selectedAssignmentToReassign.set(assignment);
    this.reassignReason.set('');
    const pool = this.reassignCandidatePool();
    const candidate = pool.find((u) => u.id !== assignment.userId) || pool[0];
    this.reassignNewUserId.set(candidate?.id || '');
    this.showReassignModal.set(true);
  }

  protected closeReassignModal(): void {
    this.showReassignModal.set(false);
    this.selectedAssignmentToReassign.set(null);
  }

  protected submitReassign(): void {
    const currentMission = this.mission();
    const assignment = this.selectedAssignmentToReassign();
    const newUserId = this.reassignNewUserId();
    const reason = this.reassignReason().trim();
    if (!currentMission || !assignment || !newUserId || this.actionBusy()) return;

    this.actionBusy.set(true);
    this.api
      .reassignAssignment(currentMission.id, assignment.id, newUserId, reason)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.actionBusy.set(false)),
      )
      .subscribe({
        next: (updated) => {
          this.mission.set(updated);
          this.showReassignModal.set(false);
          const newUser = this.availableUsers().find((u) => u.id === newUserId);
          const newName = newUser?.fullName || newUser?.email || 'Thành viên mới';
          this.actionMessage.set(`Đã tái phân công vai trò ${assignment.assignmentRole} cho ${newName}.`);

          this.notificationsStore.upsert({
            id: `notif-${Date.now()}`,
            userId: newUserId,
            title: `[MF02 TÁI PHÂN CÔNG] Bạn được chỉ định vai trò ${assignment.assignmentRole}`,
            body: `Quản lý đã tái phân công bạn cho nhiệm vụ ${currentMission.missionCode}. Vui lòng kiểm tra và xác nhận.`,
            type: 'MISSION_DISPATCH',
            referenceType: 'MISSION',
            referenceId: currentMission.id,
            createdAt: new Date().toISOString(),
            isRead: false,
          });

          this.realtime.broadcastMissionEvent({
            missionId: currentMission.id,
            type: 'REASSIGNED',
            status: updated.status,
            actorRole: 'MANAGER',
            actorName: this.auth.user()?.fullName || 'Quản lý vận hành',
            assignmentId: assignment.id,
            reason: reason || 'Thay thế nhân sự xin hoãn',
            allConfirmed: updated.allConfirmed,
            confirmedCount: updated.confirmedCount,
            totalRequiredCount: updated.totalRequiredCount,
            pendingRoles: updated.pendingRoles,
            timestamp: new Date().toISOString(),
          });
        },
        error: (err: unknown) => this.actionMessage.set(this.errorMessage(err)),
      });
  }

  protected openSuspendModal(): void {
    this.suspendReason.set('');
    this.showSuspendModal.set(true);
  }

  protected closeSuspendModal(): void {
    this.showSuspendModal.set(false);
  }

  protected submitSuspend(): void {
    const currentMission = this.mission();
    const reason = this.suspendReason().trim();
    if (!currentMission || !reason) return;
    this.actionBusy.set(true);

    this.api
      .suspendMission(currentMission.id, reason)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.actionBusy.set(false)),
      )
      .subscribe({
        next: (updated) => {
          this.mission.set(updated);
          this.showSuspendModal.set(false);
          this.actionMessage.set('Đã ra lệnh tạm đình chỉ nhiệm vụ bay.');
          this.notificationsStore.upsert({
            id: `notif-${Date.now()}`,
            userId: updated.assignedToUserId,
            title: `[MF02 LỆNH ĐÌNH CHỈ] Nhiệm vụ ${updated.missionCode} bị tạm dừng`,
            body: `Quản lý đã tạm đình chỉ nhiệm vụ bay. Lý do: ${reason}`,
            type: 'MISSION_SUSPENDED',
            referenceType: 'MISSION',
            referenceId: updated.id,
            createdAt: new Date().toISOString(),
            isRead: false,
          });
          this.realtime.broadcastMissionEvent({
            missionId: updated.id,
            type: 'SUSPENDED',
            status: 'Suspended',
            reason,
            actorRole: 'MANAGER',
            actorName: updated.managerUsername || 'Quản lý vận hành',
            timestamp: new Date().toISOString(),
          });
        },
        error: (err: unknown) => this.actionMessage.set(this.errorMessage(err)),
      });
  }

  protected resumeMission(): void {
    const currentMission = this.mission();
    if (!currentMission) return;
    this.actionBusy.set(true);

    this.api
      .resumeMission(currentMission.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.actionBusy.set(false)),
      )
      .subscribe({
        next: (updated) => {
          this.mission.set(updated);
          this.actionMessage.set('Đã khôi phục nhiệm vụ bay.');
          this.notificationsStore.upsert({
            id: `notif-${Date.now()}`,
            userId: updated.assignedToUserId,
            title: `[MF02 KHÔI PHỤC] Nhiệm vụ ${updated.missionCode} được phép tiếp tục`,
            body: `Quản lý đã dỡ bỏ lệnh tạm đình chỉ. Hãy chuẩn bị cất cánh an toàn.`,
            type: 'MISSION_RESUMED',
            referenceType: 'MISSION',
            referenceId: updated.id,
            createdAt: new Date().toISOString(),
            isRead: false,
          });
          this.realtime.broadcastMissionEvent({
            missionId: updated.id,
            type: 'RESUMED',
            status: 'Assigned',
            actorRole: 'MANAGER',
            actorName: updated.managerUsername || 'Quản lý vận hành',
            timestamp: new Date().toISOString(),
          });
        },
        error: (err: unknown) => this.actionMessage.set(this.errorMessage(err)),
      });
  }

  protected openCancelModal(): void {
    this.cancelReason.set('');
    this.showCancelModal.set(true);
  }

  protected closeCancelModal(): void {
    this.showCancelModal.set(false);
  }

  protected submitCancel(): void {
    const currentMission = this.mission();
    const reason = this.cancelReason().trim();
    if (!currentMission || !reason) return;
    this.actionBusy.set(true);

    this.api
      .cancelMissionWithReason(currentMission.id, reason)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.actionBusy.set(false)),
      )
      .subscribe({
        next: (updated) => {
          this.mission.set(updated);
          this.showCancelModal.set(false);
          this.actionMessage.set('Đã hủy bỏ nhiệm vụ bay.');
          this.notificationsStore.upsert({
            id: `notif-${Date.now()}`,
            userId: updated.assignedToUserId,
            title: `[MF02 HỦY BỎ] Nhiệm vụ ${updated.missionCode} đã bị hủy`,
            body: `Quản lý đã hủy bỏ nhiệm vụ. Lý do: ${reason}`,
            type: 'MISSION_CANCELLED',
            referenceType: 'MISSION',
            referenceId: updated.id,
            createdAt: new Date().toISOString(),
            isRead: false,
          });
          this.realtime.broadcastMissionEvent({
            missionId: updated.id,
            type: 'CANCELLED',
            status: 'Cancelled',
            reason,
            actorRole: 'MANAGER',
            actorName: updated.managerUsername || 'Quản lý vận hành',
            timestamp: new Date().toISOString(),
          });
        },
        error: (err: unknown) => this.actionMessage.set(this.errorMessage(err)),
      });
  }

  protected sendReminder(): void {
    const currentMission = this.mission();
    if (!currentMission) return;
    this.actionBusy.set(true);

    this.api
      .sendReminder(currentMission.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.actionBusy.set(false)),
      )
      .subscribe({
        next: (updated) => {
          this.mission.set(updated);
          this.actionMessage.set('Đã gửi thông báo nhắc nhở tới Inspector!');
          this.notificationsStore.upsert({
            id: `notif-${Date.now()}`,
            userId: updated.assignedToUserId,
            title: `[MF02 KHẨN] Nhắc nhở xác nhận nhiệm vụ ${updated.missionCode}`,
            body: `Quản lý yêu cầu xác nhận nhiệm vụ ngay. Hạn chót: ${this.deadlineTimeRemaining() ?? 'Sắp hết hạn'}`,
            type: 'MISSION_REMINDER',
            referenceType: 'MISSION',
            referenceId: updated.id,
            createdAt: new Date().toISOString(),
            isRead: false,
          });
          this.realtime.broadcastMissionEvent({
            missionId: updated.id,
            type: 'REMINDER',
            reason: 'Yêu cầu tiếp nhận nhiệm vụ khẩn cấp',
            actorRole: 'MANAGER',
            actorName: updated.managerUsername || 'Quản lý vận hành',
            timestamp: new Date().toISOString(),
          });
        },
        error: (err: unknown) => this.actionMessage.set(this.errorMessage(err)),
      });
  }

  protected sendChatMessage(): void {
    const currentMission = this.mission();
    const content = this.chatMessage().trim();
    if (!currentMission || !content) return;

    const role = this.activeRole();
    const senderName =
      role === 'MANAGER'
        ? currentMission.managerUsername || 'Quản lý vận hành'
        : currentMission.assignedToUsername || 'Phi công phụ trách';

    this.actionBusy.set(true);
    this.api
      .addMissionActivity(currentMission.id, content, role)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => this.api.sendCommunication(currentMission.id, content)),
        finalize(() => this.actionBusy.set(false)),
      )
      .subscribe({
        next: (res) => {
          if (res && typeof res === 'object' && 'id' in res && 'targets' in res) {
            this.mission.set(res as Mission);
          } else {
            const newLog: MissionCommunicationLog = {
              id: `log-${Date.now()}`,
              senderId: this.auth.user()?.id || 'usr-me',
              senderName,
              senderRole: role,
              type: 'MESSAGE',
              content,
              timestamp: new Date().toISOString(),
            };
            this.mission.update((curr) =>
              curr
                ? {
                    ...curr,
                    communicationLogs: [newLog, ...(curr.communicationLogs ?? [])],
                  }
                : null,
            );
          }
          this.chatMessage.set('');
          this.notificationsStore.upsert({
            id: `notif-${Date.now()}`,
            title: `[MF02 Tin nhắn] ${senderName} (${role === 'MANAGER' ? 'Quản lý' : 'Inspector'})`,
            body: content,
            type: 'MISSION_COMMUNICATION',
            referenceType: 'MISSION',
            referenceId: currentMission.id,
            createdAt: new Date().toISOString(),
            isRead: false,
          });
          this.realtime.broadcastMissionEvent({
            missionId: currentMission.id,
            type: 'COMMUNICATION',
            actorRole: role,
            actorName: senderName,
            message: content,
            timestamp: new Date().toISOString(),
          });
        },
        error: (err: unknown) => this.actionMessage.set(this.errorMessage(err)),
      });
  }

  protected priorityLabel(priority?: MissionPriority): string {
    switch ((priority || '').toUpperCase()) {
      case 'EMERGENCY':
        return 'Khẩn cấp (EMERGENCY)';
      case 'HIGH':
        return 'Ưu tiên cao (HIGH)';
      default:
        return 'Bình thường (NORMAL)';
    }
  }

  protected priorityClass(priority?: MissionPriority): string {
    switch ((priority || '').toUpperCase()) {
      case 'EMERGENCY':
        return 'priority-emergency';
      case 'HIGH':
        return 'priority-high';
      default:
        return 'priority-normal';
    }
  }

  protected objectiveLabel(obj?: string): string {
    switch (obj) {
      case 'PERIODIC_INSPECTION':
        return 'Kiểm tra định kỳ (PERIODIC_INSPECTION)';
      case 'TARGETED_REINSPECTION':
        return 'Kiểm tra lại mục tiêu (TARGETED_REINSPECTION)';
      case 'INCIDENT_FOLLOW_UP':
        return 'Theo dõi xử lý sự cố (INCIDENT_FOLLOW_UP)';
      case 'EMERGENCY_INSPECTION':
        return 'Khảo sát khẩn cấp (EMERGENCY_INSPECTION)';
      default:
        return obj || 'Kiểm tra định kỳ';
    }
  }

  protected defectLabel(key: string): string {
    const found = PRIORITY_DEFECT_CATEGORIES.find((c) => c.key === key);
    return found ? found.label : key;
  }

  protected openPriorityModal(): void {
    const m = this.mission();
    if (!m) return;
    this.editPriority.set(m.priority || 'NORMAL');
    this.editObjective.set(m.objective || 'PERIODIC_INSPECTION');
    this.editEmergencyReason.set(m.emergencyReason || '');
    this.editPriorityDefects.set([...(m.priorityDefects || [])]);
    this.showPriorityModal.set(true);
  }

  protected closePriorityModal(): void {
    this.showPriorityModal.set(false);
  }

  protected toggleEditDefect(categoryKey: string): void {
    const current = this.editPriorityDefects();
    if (current.includes(categoryKey)) {
      this.editPriorityDefects.set(current.filter((k) => k !== categoryKey));
    } else {
      this.editPriorityDefects.set([...current, categoryKey]);
    }
  }

  protected submitPriorityUpdate(): void {
    const currentMission = this.mission();
    if (!currentMission) return;
    const p = this.editPriority();
    const reason = this.editEmergencyReason().trim();

    if (p === 'EMERGENCY' && reason.length < 10) {
      this.actionMessage.set('Theo quy định an toàn BR-06, nhiệm vụ Khẩn cấp yêu cầu nhập lý do khẩn cấp tối thiểu 10 ký tự.');
      return;
    }

    this.actionBusy.set(true);
    const payload: UpdateMissionPriorityRequest = {
      priority: p,
      objective: this.editObjective(),
      emergencyReason: p === 'EMERGENCY' ? reason : undefined,
      priorityDefects: this.editPriorityDefects(),
    };

    this.api
      .updatePriority(currentMission.id, payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.actionBusy.set(false)),
      )
      .subscribe({
        next: (updatedMission) => {
          const merged: Mission = {
            ...currentMission,
            ...updatedMission,
            team: updatedMission.team && updatedMission.team.length ? updatedMission.team : currentMission.team,
            targets: updatedMission.targets && updatedMission.targets.length ? updatedMission.targets : currentMission.targets,
            status: updatedMission.status && updatedMission.status !== 'Draft' ? updatedMission.status : currentMission.status,
            priority: p,
            objective: payload.objective ?? currentMission.objective,
            emergencyReason: payload.emergencyReason ?? currentMission.emergencyReason,
            priorityDefects: payload.priorityDefects ?? currentMission.priorityDefects,
          };
          this.mission.set(merged);
          this.closePriorityModal();
          this.actionMessage.set(`Đã cập nhật mức độ ưu tiên nhiệm vụ thành: ${this.priorityLabel(p)}.`);
          this.notificationsStore.upsert({
            id: `notif-prio-${Date.now()}`,
            userId: this.auth.user()?.id,
            title: `[MF02] Cập nhật mức độ ưu tiên: ${currentMission.missionCode}`,
            body: `Nhiệm vụ ${currentMission.missionCode} đã được điều chỉnh mức độ ưu tiên sang [${this.priorityLabel(p)}]`,
            type: 'MISSION_DISPATCH',
            referenceType: 'MISSION',
            referenceId: currentMission.id,
            createdAt: new Date().toISOString(),
            isRead: false,
          });
          this.realtime.broadcastMissionEvent({
            missionId: updatedMission.id,
            type: 'PRIORITY_UPDATED',
            status: updatedMission.status,
            priority: p,
            actorRole: 'MANAGER',
            actorName: this.auth.user()?.fullName || 'Quản lý vận hành',
            timestamp: new Date().toISOString(),
          });
        },
        error: (err: unknown) => this.actionMessage.set(this.errorMessage(err)),
      });
  }

  protected statusLabel(status: string): string {
    return missionStatusLabel(status);
  }

  protected statusClass(status: string): string {
    const normalized = normalizeMissionStatus(status);
    if (['Cancelled', 'Suspended', 'Rejected', 'Failed'].includes(normalized)) return 'danger';
    if (['Completed', 'Approved', 'Accepted', 'Assigned', 'Ready'].includes(normalized)) return 'success';
    if (['InProgress', 'Preparing', 'PendingAcceptance', 'Postponed'].includes(normalized)) return 'warning';
    return 'neutral';
  }

  protected detectionStatusLabel(status: string): string {
    return (
      ({
        Approved: 'Đã duyệt',
        Accepted: 'Đã duyệt',
        Rejected: 'Từ chối',
        Pending: 'Chờ duyệt',
        Unreviewed: 'Chờ duyệt',
      } as Record<string, string>)[status] ?? status
    );
  }

  protected displayValue(value: string): string {
    return value?.trim() || 'N/A';
  }

  protected middleEllipsis(value: string, max = 32): string {
    const text = value?.trim() ?? '';
    if (text.length <= max) return text;
    const edge = Math.max(6, Math.floor((max - 3) / 2));
    return `${text.slice(0, edge)}...${text.slice(-edge)}`;
  }

  protected isVideoDetection(detection: MissionDetectionView): boolean {
    return (
      detection.mediaType.toLowerCase().includes('video') ||
      /\.(mp4|mov|avi|webm)(\?|$)/i.test(detection.sourceUrl ?? '') ||
      detection.timestampSeconds !== null
    );
  }

  protected cardTimestampLabel(detection: MissionDetectionView): string {
    return this.isVideoDetection(detection) ? detection.videoDurationLabel : detection.timestampLabel;
  }

  private loadAssignmentsOverview(missionId: string): void {
    this.api
      .getAssignmentsOverview(missionId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => of(null)),
      )
      .subscribe((overview) => {
        if (!overview) return;
        this.mission.update((curr) =>
          curr
            ? {
                ...curr,
                team: overview.assignments.length ? overview.assignments : curr.team,
                totalRequiredCount: overview.totalRequiredCount,
                confirmedCount: overview.confirmedCount,
                allConfirmed: overview.allConfirmed,
                confirmationProgress: `${overview.confirmedCount}/${overview.totalRequiredCount}`,
                confirmationDeadline: overview.confirmationDeadline || curr.confirmationDeadline,
              }
            : null,
        );
      });
  }

  private loadDetections(missionId: string): void {
    this.detectionsLoading.set(true);
    this.api
      .getMissionDetections(missionId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.detectionsLoading.set(false)),
      )
      .subscribe({
        next: (detections) => {
          const mapped = detections.map((item) => this.mapDetection(item));
          this.resultPage.set(1);
          this.detections.set(mapped);
          this.selectedDetection.set(mapped[0] ?? null);
        },
        error: () => {
          this.resultPage.set(1);
          this.detections.set([]);
          this.selectedDetection.set(null);
        },
      });
  }

  private loadMaintenanceTasks(missionId: string): void {
    this.api
      .getMissionMaintenanceTasks(missionId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => of([])),
      )
      .subscribe({
        next: (tasks) => {
          const mapped: MissionMaintenanceTask[] = tasks.map((t) => ({
            id: t.id,
            title: t.title,
            priority: (t.priority === 'Urgent' || t.priority === 'High' || t.priority === 'Medium' || t.priority === 'Scheduled'
              ? t.priority
              : t.priority === 'Low'
              ? 'Scheduled'
              : 'Medium') as MissionMaintenanceTask['priority'],
            towerCode: t.towerCode || '—',
            defectDescription: t.defectDescription || '—',
            suggestedAction: t.suggestedAction || '—',
            status: (t.status === 'Approved' || t.status === 'InProgress' || t.status === 'Completed'
              ? t.status
              : 'Pending') as MissionMaintenanceTask['status'],
            assignedTeam: t.assignedTeam || '—',
          }));
          this.maintenanceTasks.set(mapped);
        },
        error: () => this.maintenanceTasks.set([]),
      });
  }

  private loadActivities(missionId: string): void {
    this.api
      .getMissionActivities(missionId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => of([])),
      )
      .subscribe({
        next: (activities) => {
          if (!activities || !activities.length) return;
          const logs: MissionCommunicationLog[] = activities.map((a) => ({
            id: a.id,
            senderId: a.senderUserId || 'user',
            senderName: a.senderName,
            senderRole: (a.senderRole?.toUpperCase() === 'MANAGER'
              ? 'MANAGER'
              : a.senderRole?.toUpperCase() === 'INSPECTOR'
              ? 'INSPECTOR'
              : 'SYSTEM') as 'MANAGER' | 'INSPECTOR' | 'SYSTEM',
            type: 'MESSAGE',
            content: a.content,
            timestamp: a.timestamp,
          }));
          this.mission.update((curr) => {
            if (!curr) return null;
            const existing = curr.communicationLogs ?? [];
            const merged = [...logs];
            for (const l of existing) {
              if (
                !merged.some(
                  (m) =>
                    m.id === l.id ||
                    (m.content === l.content &&
                      Math.abs(new Date(m.timestamp).getTime() - new Date(l.timestamp).getTime()) < 3000),
                )
              ) {
                merged.push(l);
              }
            }
            merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            return { ...curr, communicationLogs: merged };
          });
        },
      });
  }

  private mapDetection(item: MissionBackendDetection): MissionDetectionView {
    const tsSec = item.timestampSeconds ?? null;
    const tsLabel =
      item.timestampLabel ||
      (tsSec !== null ? this.formatTime(tsSec) : item.frameIndex != null ? `Frame ${item.frameIndex}` : 'N/A');
    const isVideo = tsSec !== null || /\.(mp4|mov|avi|webm)(\?|$)/i.test(item.sourceUrl ?? '');

    return {
      id: item.id,
      mediaId: item.mediaId || '',
      title: item.title,
      confidence: Math.round(item.confidence <= 1 && item.confidence > 0 ? item.confidence * 100 : item.confidence),
      timestampLabel: tsLabel,
      timestampSeconds: tsSec,
      frameIndex: item.frameIndex ?? null,
      videoDurationLabel: tsLabel,
      status: item.status,
      mediaStatus: 'Analyzed',
      categoryCode: item.categoryCode || '—',
      severityWeight: item.severityWeight ?? 1,
      isEmergency: item.isEmergency ?? false,
      aiSource: 'SERVER',
      mediaType: isVideo ? 'video' : 'image',
      sourceUrl: item.sourceUrl,
      imageUrl: item.imageUrl || item.sourceUrl,
      cropImageUrl: item.imageUrl || item.sourceUrl,
      boundingBox: item.boundingBox,
      missionId: item.missionId,
      towerId: item.towerId || '',
      tower: item.tower || 'Chưa gắn cột',
      gps: item.gps || '—',
      description: item.description || 'Không có mô tả.',
      notes: item.reviewNotes || '',
      detectedAt: item.detectedAt || '',
      validatedAt: item.reviewedAt || '',
    };
  }

  private updateMedia(id: string, patch: Partial<MissionMediaPreview>): void {
    this.mediaQueue.update((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  private setQueueProgress(status: string, progress: number): void {
    this.mediaQueue.update((items) => items.map((item) => ({ ...item, status, progress })));
  }

  private handleAiAnalysisStatus(event: AiAnalysisStatusChangedEvent): void {
    const missionId = this.mission()?.id;
    if (!missionId || (event.missionId && event.missionId !== missionId)) return;
    if (event.requestId) this.aiStatusEvents.set(event.requestId, event);

    const matchesCurrentUpload =
      this.mediaQueue().some((item) => item.requestId === event.requestId) ||
      Boolean(event.batchId && event.batchId === this.lastUploadBatchId());

    const normalizedStatus = event.status.trim().toLowerCase();
    const nextStatus = this.aiStatusLabel(event);

    if (matchesCurrentUpload) {
      this.mediaQueue.update((items) =>
        items.map((item) => {
          if (!event.requestId || item.requestId !== event.requestId) return item;
          return this.applyAiStatusToMedia(item, event, nextStatus);
        }),
      );
    }

    if (normalizedStatus === 'completed') {
      this.uploadMessage.set(`AI hoàn tất. Lưu ${event.savedDetections} detection, tạo ${event.createdAlerts} cảnh báo.`);
      this.loadDetections(missionId);
      return;
    }

    if (normalizedStatus === 'failed') {
      this.uploadMessage.set(event.errorMessage || 'AI xử lý thất bại.');
      return;
    }

    this.uploadMessage.set('AI đang xử lý media đã upload.');
  }

  private handleMissionRealtimeEvent(event: MissionLifecycleRealtimeEvent): void {
    const currentMission = this.mission();
    if (!currentMission || (event.missionId !== currentMission.id && event.missionId !== currentMission.missionCode)) {
      return;
    }

    if (event.type === 'CONFIRMED') {
      this.mission.update((curr) => {
        if (!curr) return null;
        const isMatch = (a: MissionAssignment) =>
          (event.assignmentId && a.id === event.assignmentId) ||
          (event.actorRole && a.assignmentRole?.toUpperCase() === event.actorRole.toUpperCase()) ||
          (event.actorId && a.userId === event.actorId);

        let updatedTeam = curr.team
          ? curr.team.map((a) =>
              isMatch(a)
                ? {
                    ...a,
                    responseStatus: 'ACCEPTED' as const,
                    respondedAt: event.timestamp || new Date().toISOString(),
                    responseReason: event.reason || a.responseReason,
                  }
                : a
            )
          : [];

        const totalReq = event.totalRequiredCount ?? curr.totalRequiredCount ?? (updatedTeam ? updatedTeam.length : 3);
        const confCount = event.confirmedCount ?? (updatedTeam ? updatedTeam.filter((a) => a.responseStatus === 'ACCEPTED').length : 1);
        const isAllConfirmed = event.allConfirmed ?? (confCount >= totalReq);

        return {
          ...curr,
          status: isAllConfirmed ? 'Assigned' : 'PendingAcceptance',
          confirmedAt: isAllConfirmed ? (event.timestamp || new Date().toISOString()) : (curr.confirmedAt ?? null),
          allConfirmed: isAllConfirmed,
          confirmedCount: confCount,
          totalRequiredCount: totalReq,
          confirmationProgress: totalReq > 0 ? `${confCount}/${totalReq}` : `${confCount}/3`,
          team: updatedTeam,
        };
      });

      this.loadAssignmentsOverview(currentMission.id);

      if (event.allConfirmed) {
        this.actionMessage.set(`[THỰC THỜI] 100% các vai trò (Inspector, Analyst, Technician) đã chấp thuận! Nhiệm vụ ${event.missionId} chính thức SẴN SÀNG BAY.`);
      } else {
        this.actionMessage.set(`[THỰC THỜI] ${event.actorName || 'Thành viên'} (${event.actorRole || 'Thành viên'}) đã xác nhận tiếp nhận. (${event.confirmedCount ?? 1}/${event.totalRequiredCount ?? 3} đã xác nhận).`);
      }
    } else if (event.type === 'POSTPONED') {
      this.mission.update((curr) => {
        if (!curr) return null;
        const isMatch = (a: MissionAssignment) =>
          (event.assignmentId && a.id === event.assignmentId) ||
          (event.actorRole && a.assignmentRole?.toUpperCase() === event.actorRole.toUpperCase()) ||
          (event.actorId && a.userId === event.actorId);

        let updatedTeam = curr.team
          ? curr.team.map((a) =>
              isMatch(a)
                ? {
                    ...a,
                    responseStatus: 'POSTPONED' as const,
                    responseReason: event.reason || 'Bận việc đột xuất',
                  }
                : a
            )
          : [];

        return {
          ...curr,
          status: 'Postponed',
          postponeReason: event.reason || curr.postponeReason,
          team: updatedTeam,
          requiresReassignment: true,
        };
      });

      this.loadAssignmentsOverview(currentMission.id);
      this.actionMessage.set(`[CẢNH BÁO THỰC THỜI] Thành viên ${event.actorName || 'Đội bay'} (${event.actorRole || ''}) yêu cầu hoãn: "${event.reason || ''}". Quản lý có thể tái phân công ngay vai trò này.`);
    } else if (event.type === 'REASSIGNED') {
      this.actionMessage.set(`[THỰC THỜI] Quản lý đã tái phân công nhân sự mới cho vai trò ${event.actorRole || 'Đội bay'}.`);
      this.api.get(currentMission.id).subscribe({
        next: (fresh) => this.mission.set(fresh),
      });
    } else if (event.type === 'SUSPENDED') {
      this.mission.update((curr) => curr ? {
        ...curr,
        status: 'Suspended',
        suspendedReason: event.reason || curr.suspendedReason,
      } : null);
      this.actionMessage.set(`[LỆNH ĐÌNH CHỈ] Nhiệm vụ tạm đình chỉ: ${event.reason || ''}`);
    } else if (event.type === 'RESUMED') {
      this.mission.update((curr) => curr ? { ...curr, status: 'Assigned' } : null);
      this.actionMessage.set('[THÔNG BÁO] Nhiệm vụ đã được khôi phục, sẵn sàng bay.');
    } else if (event.type === 'CANCELLED') {
      this.mission.update((curr) => curr ? { ...curr, status: 'Cancelled' } : null);
      this.actionMessage.set(`[HỦY BỎ] Nhiệm vụ đã bị hủy: ${event.reason || ''}`);
    } else if (event.type === 'COMMUNICATION') {
      if (event.message) {
        const newLog: MissionCommunicationLog = {
          id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          senderId: event.actorId || 'user',
          senderRole: (event.actorRole as 'MANAGER' | 'INSPECTOR') || 'INSPECTOR',
          senderName: event.actorName || 'Phi công',
          type: 'MESSAGE',
          content: event.message,
          timestamp: event.timestamp || new Date().toISOString(),
        };
        this.mission.update((curr) => {
          if (!curr) return null;
          const existing = curr.communicationLogs ?? [];
          if (existing.some((l) => l.content === newLog.content && Math.abs(new Date(l.timestamp).getTime() - new Date(newLog.timestamp).getTime()) < 3000)) {
            return curr;
          }
          return {
            ...curr,
            communicationLogs: [...existing, newLog],
          };
        });
      }
    } else if (event.type === 'DETECTION_REVIEWED') {
      this.actionMessage.set(
        `[GIÁM ĐỊNH AI] ${event.actorName || 'Chuyên viên'} đã ${event.status === 'Approved' ? 'xác nhận' : 'từ chối'} khuyết tật.`
      );
      this.loadDetections(currentMission.id);
      this.loadMaintenanceTasks(currentMission.id);
    } else if (event.type === 'MEDIA_UPLOADED') {
      this.actionMessage.set(`[HIỆN TRƯỜNG] Tệp bay mới đã được Inspector tải lên thành công.`);
      this.loadDetections(currentMission.id);
    } else if (event.type === 'MAINTENANCE_TASK_CREATED' || event.type === 'MAINTENANCE_TASK_STATUS_CHANGED') {
      this.actionMessage.set(`[BẢO TRÌ] Phiếu bảo dưỡng được cập nhật (${event.status || 'Mới'}).`);
      this.loadMaintenanceTasks(currentMission.id);
    } else if (event.type === 'EMERGENCY_ALERT') {
      this.triggerEmergencySiren(event.reason || event.message || 'Phát hiện sự cố khẩn cấp trên tuyến bay!');
    }
  }

  // --- AUDIO SYNTHESIS ALERT BEEP ---
  protected playWarningBeep(): void {
    try {
      const ctx = this.audioCtx || new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      this.audioCtx = ctx;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch (e) {
      console.warn('Audio alert not supported or user has not interacted yet', e);
    }
  }

  protected triggerEmergencySiren(title: string, message?: string): void {
    this.activeEmergency.set({
      title,
      message: message || 'Phát hiện sự cố nghiêm trọng (cháy rừng, đổ cột, đứt dây) trên tuyến bay.',
      timestamp: new Date().toISOString(),
    });
    this.playWarningBeep();
    if (this.sirenInterval) clearInterval(this.sirenInterval);
    let count = 0;
    this.sirenInterval = setInterval(() => {
      count++;
      if (count >= 3) {
        clearInterval(this.sirenInterval);
        this.sirenInterval = null;
      } else {
        this.playWarningBeep();
      }
    }, 1000);
  }

  protected dismissEmergency(): void {
    if (this.sirenInterval) {
      clearInterval(this.sirenInterval);
      this.sirenInterval = null;
    }
    this.activeEmergency.set(null);
  }

  private applyAiStatusToMedia(
    item: MissionMediaPreview,
    event: AiAnalysisStatusChangedEvent,
    status: string,
  ): MissionMediaPreview {
    return {
      ...item,
      status,
      progress: 100,
      savedDetections: event.savedDetections,
      createdAlerts: event.createdAlerts,
      completedAt: event.completedAt,
      errorMessage: event.errorMessage,
    };
  }

  private readImageMetadata(id: string, url: string): void {
    const image = new Image();
    image.onload = () => this.updateMedia(id, { resolution: `${image.naturalWidth} x ${image.naturalHeight}` });
    image.onerror = () => this.updateMedia(id, { resolution: 'N/A' });
    image.src = url;
  }

  private isTab(value: string | null): value is MissionDetailTab {
    return (
      value === 'overview' ||
      value === 'upload' ||
      value === 'processing' ||
      value === 'results' ||
      value === 'towers' ||
      value === 'maintenance' ||
      value === 'activity'
    );
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }

  protected formatTime(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(total / 60);
    const remaining = total % 60;
    return `${minutes.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
  }

  private compactPages(current: number, total: number): readonly number[] {
    if (total <= 0) return [1];
    if (total <= 2) return Array.from({ length: total }, (_, index) => index + 1);
    const start = Math.min(Math.max(1, current - 1), total - 2);
    return [start, start + 1, start + 2];
  }

  private clampPage(page: number, total: number, fallback: number): number {
    if (!Number.isFinite(page)) return fallback;
    return Math.min(Math.max(1, Math.trunc(page)), Math.max(1, total));
  }

  private aiStatusLabel(event: AiAnalysisStatusChangedEvent): string {
    const status = event.status.trim().toLowerCase();
    if (status === 'completed') return `AI hoàn tất - ${event.savedDetections} detection`;
    if (status === 'failed') return event.errorMessage ? `AI lỗi - ${event.errorMessage}` : 'AI lỗi';
    if (status === 'pending') return 'Đang chờ AI xử lý';
    return event.status || 'Đang xử lý AI';
  }

  private errorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return 'Không thể tải chi tiết nhiệm vụ.';
    const body = error.error && typeof error.error === 'object' ? (error.error as Record<string, unknown>) : {};
    return String(body['message'] ?? error.message ?? 'Không thể tải chi tiết nhiệm vụ.');
  }
}
