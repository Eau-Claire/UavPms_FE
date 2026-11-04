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
import { Observable, catchError, concatMap, finalize, from, of, tap } from 'rxjs';
import { NzIconModule } from 'ng-zorro-antd/icon';
import {
  InspectionObjective,
  Mission,
  MissionAssignment,
  MissionBackendDetection,
  MissionCommunicationLog,
  MissionPriority,
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
import { saveStoredMockTicket } from '../../../maintenance/data-access/maintenance-api';
import { UsersApi } from '../../../users/data-access/users-api';
import { Auth } from '../../../../core/auth/auth';
import { isAnalystRole, isInspectorRole, isManagerRole, isTechnicianRole, roleFamily, roleLabel } from '../../../../core/auth/roles';
import {
  MissionTab,
  activitySenderKind,
  activitySenderLabel,
  activitySenderRole,
  assignmentRoleLabel,
  canOpenEmergencyAlerts,
  canOpenMaintenanceTicket,
  canOpenPreMissionAssessment,
  canReviewDetections,
  canUploadMissionMedia,
  defaultMissionTab,
  findMyAssignment,
  isAwaitingMyResponse,
  isTowerInspected,
  missionStartBlocker,
  maintenanceStatusLabel,
  maintenanceStatusTone,
  towerInspectionStatusLabel,
  userDirectorySource,
} from '../../data-access/mission-access';
import { describeHttpError } from '../../../../shared/errors/business-error-messages';

export type MissionDetailTab = MissionTab;

/** A step of the mission lifecycle shown in the activity sidebar and used for the progress bar. */
export interface MissionMilestone {
  readonly key: string;
  readonly title: string;
  readonly detail: string;
  readonly state: 'completed' | 'active' | 'pending';
}
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
  /** Status as returned by the backend (Pending/InProgress/Completed or the ticket enum). */
  readonly status: string;
  readonly assignedTeam: string;
  readonly detectionId?: string;
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
  protected readonly auth = inject(Auth);

  // --- Role rules (mirror MissionController's [Authorize] attributes) ---
  private readonly userRole = computed(() => this.auth.user()?.role);
  /** SystemAdmin or Manager: remind, suspend, resume, cancel, reassign, priority. */
  protected readonly isManager = computed(() => isManagerRole(this.userRole()));
  protected readonly isFlightCrew = computed(() => isInspectorRole(this.userRole()));
  /**
   * Media upload and the processing view (SRS SCR-13, BR-40): SystemAdmin, Manager, or an Inspector on this
   * mission's team. Analyst and Technician only view the mission even when they are members.
   */
  protected readonly canUpload = computed(() => {
    if (!canUploadMissionMedia(this.userRole())) return false;
    if (this.isManager()) return true;
    const userId = this.auth.user()?.id;
    return !!userId && (!!this.myAssignment() || this.mission()?.assignedToUserId === userId);
  });
  /** Detection review: SystemAdmin, Manager and Analyst. */
  protected readonly canReview = computed(() => canReviewDetections(this.userRole()));
  protected readonly canOpenEmergencyCenter = computed(() => canOpenEmergencyAlerts(this.userRole()));
  protected readonly canOpenPreMission = computed(() => canOpenPreMissionAssessment(this.userRole()));
  protected readonly canOpenMaintenance = computed(() => canOpenMaintenanceTicket(this.userRole()));
  /** The signed-in user's assignment on this mission, if any. */
  protected readonly myAssignment = computed(() => findMyAssignment(this.mission(), this.auth.user()?.id));
  /** Start/complete flight: managers, or an Inspector who is on this mission's team. */
  protected readonly canOperateFlight = computed(() => {
    if (this.isManager()) return true;
    if (!this.isFlightCrew()) return false;
    const m = this.mission();
    const userId = this.auth.user()?.id;
    return !!userId && (!!this.myAssignment() || m?.assignedToUserId === userId);
  });
  /**
   * Why "Bắt đầu bay" is disabled (required members still pending, too early, no UAV), or `null` when it may be sent.
   * Re-evaluated every 30 s with `currentTime` so the button unlocks when the 2-hour window opens.
   */
  protected readonly startBlocker = computed(() => missionStartBlocker(this.mission(), this.currentTime()));
  /** The command console is for managers and the flight crew; Analyst/Technician only see the read-only summary. */
  protected readonly showCommandConsole = computed(() => this.isManager() || this.isFlightCrew());
  protected readonly consoleTitle = computed(() => roleLabel(this.userRole()));
  protected readonly consoleSubtitle = computed(() => {
    switch (roleFamily(this.userRole())) {
      case 'admin':
      case 'manager':
        return 'Giám sát và điều phối tiến độ tiếp nhận, thực hiện bay';
      case 'inspector':
        return 'Tiếp nhận, thực hiện chuyến bay và tải dữ liệu';
      case 'analyst':
        return 'Theo dõi tiến độ; thẩm định kết quả ở tab Kết quả giám định';
      case 'technician':
        return 'Theo dõi tiến độ; xử lý phiếu ở tab Bảo trì';
      default:
        return 'Theo dõi tiến độ nhiệm vụ';
    }
  });
  /** Role sent with a new activity message (the backend re-checks it). */
  protected readonly senderRole = computed(() => activitySenderRole(this.userRole(), this.myAssignment()));
  protected readonly senderRoleText = computed(() => activitySenderLabel(activitySenderKind(this.senderRole())));
  protected readonly senderName = computed(() => {
    const user = this.auth.user();
    return user?.fullName || user?.email || 'Bạn';
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

  protected readonly showPriorityModal = signal(false);
  protected readonly editPriority = signal<MissionPriority>('NORMAL');
  protected readonly editObjective = signal<InspectionObjective>('PERIODIC_INSPECTION');
  protected readonly editEmergencyReason = signal('');
  protected readonly editPriorityDefects = signal<string[]>([]);
  protected readonly priorityDefectCategories = PRIORITY_DEFECT_CATEGORIES;

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
    const total = m.totalRequiredCount || 0;
    if (!total) return 0;
    const count = m.confirmedCount || 0;
    return Math.round((count / Math.max(1, total)) * 100);
  });

  protected readonly postponedMember = computed<MissionAssignment | null>(() => {
    return this.multiRoleTeam().find((m) => m.responseStatus === 'POSTPONED') ?? null;
  });

  protected readonly reassignCandidatePool = computed<readonly UserRecord[]>(() => {
    const assignment = this.selectedAssignmentToReassign();
    if (!assignment) return this.availableUsers();
    const target = activitySenderKind(assignment.assignmentRole);
    return this.availableUsers().filter((u) => {
      if (target === 'INSPECTOR') return isInspectorRole(u.role);
      if (target === 'ANALYST') return isAnalystRole(u.role);
      if (target === 'TECHNICIAN') return isTechnicianRole(u.role);
      return true;
    });
  });

  protected roleText(assignmentRole: string): string {
    return assignmentRoleLabel(assignmentRole);
  }

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
    // Managers or Administrators cannot accept assignments on behalf of assigned roles
    if (isManagerRole(user.role)) return false;

    return !!member.userId && user.id === member.userId;
  }

  protected canPostponeMemberAssignment(member: MissionAssignment): boolean {
    return this.canAcceptMemberAssignment(member);
  }

  /** Accept/postpone are open only in PendingAcceptance/Assigned/Preparing/Ready (`409 INVALID_MISSION_STATE`). */
  protected canRespondTo(member: MissionAssignment): boolean {
    return isAwaitingMyResponse(this.mission(), member) && member.responseStatus !== 'POSTPONED';
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

  // AI Worker Mock & Pipeline Flow State (Steps: 1: Tải dữ liệu, 2: Trích xuất khung hình, 3: Phát hiện khuyết tật, 4: Lập báo cáo rủi ro)
  protected readonly aiPipelineStep = signal<1 | 2 | 3 | 4>(2);
  protected readonly isAiProcessing = signal<boolean>(false);
  protected readonly isAiProcessingComplete = signal<boolean>(false);
  protected readonly aiPipelineStatusText = signal<string>(
    'Hệ thống đang trích xuất khung hình và phân tích khuyết tật thiết bị'
  );

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

  /** Lifecycle steps derived from the mission's real state (no step is assumed done). */
  protected readonly milestones = computed<readonly MissionMilestone[]>(() => {
    const m = this.mission();
    if (!m) return [];
    const status = normalizeMissionStatus(m.status);
    const teamDone = this.allRolesConfirmed() || ['Assigned', 'Preparing', 'Ready', 'InProgress', 'Completed'].includes(status);
    const detections = this.detections().length;
    const approved = this.approvedDetectionCount();
    const step = (key: string, title: string, detail: string, done: boolean, active: boolean): MissionMilestone => ({
      key,
      title,
      detail,
      state: done ? 'completed' : active ? 'active' : 'pending',
    });

    let teamDetail = `Đang chờ thành viên phản hồi (${m.confirmedCount ?? 0}/${m.totalRequiredCount ?? 0})`;
    if (teamDone) teamDetail = 'Các thành viên bắt buộc đã tiếp nhận';
    else if (this.postponedMember()) teamDetail = 'Có thành viên xin hoãn, chờ Quản lý xử lý';
    else if (this.isDeadlineOverdue()) teamDetail = 'Đã quá hạn xác nhận';

    return [
      step(
        'assessment',
        'Đánh giá tiền nhiệm vụ',
        m.sourceAssessmentId ? 'Nhiệm vụ được lập từ hồ sơ đánh giá' : 'Không có hồ sơ đánh giá liên kết',
        !!m.sourceAssessmentId,
        false,
      ),
      step(
        'created',
        'Khởi tạo và giao nhiệm vụ',
        status === 'Draft' ? 'Chưa giao cho đội' : `Mã ${m.missionCode}`,
        status !== 'Draft',
        status === 'Draft',
      ),
      step('team', 'Đội ngũ tiếp nhận', teamDetail, teamDone, ['PendingAcceptance', 'Postponed'].includes(status)),
      step(
        'flight',
        'Bay khảo sát hiện trường',
        status === 'InProgress' ? 'Đang bay ngoài hiện trường' : status === 'Completed' ? 'Chuyến bay đã hoàn tất' : 'Chưa cất cánh',
        status === 'Completed',
        status === 'InProgress',
      ),
      step(
        'processing',
        'Nạp dữ liệu và phát hiện khuyết tật',
        detections ? `${detections} phát hiện AI` : 'Chưa có dữ liệu được xử lý',
        detections > 0,
        status === 'Completed' && detections === 0,
      ),
      step(
        'review',
        'Thẩm định kết quả',
        approved ? `Đã xác nhận ${approved} khuyết tật` : 'Chờ chuyên viên phân tích thẩm định',
        approved > 0,
        detections > 0 && approved === 0,
      ),
    ];
  });

  /** Share of lifecycle steps completed. */
  protected readonly progressPct = computed(() => {
    const steps = this.milestones();
    if (!steps.length) return 0;
    return Math.round((steps.filter((s) => s.state === 'completed').length / steps.length) * 100);
  });

  // Emergency Siren and Banner Alert
  protected readonly activeEmergency = signal<{ title: string; message: string; timestamp: string } | null>(null);
  private audioCtx: AudioContext | null = null;
  private sirenInterval: ReturnType<typeof setInterval> | null = null;

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
    const requestedTab = this.isTab(tab) ? tab : null;
    if (requestedTab) this.activeTab.set(this.allowedTab(requestedTab));

    // GET /users is SystemAdmin only and GET /users/assignable is SystemAdmin/Manager: other roles use the
    // names that come with the mission's assignments instead of calling an endpoint that would return 403.
    const directory = userDirectorySource(this.userRole());
    const users$: Observable<readonly UserRecord[]> | null =
      directory === 'all' ? this.usersApi.getAll() : directory === 'assignable' ? this.usersApi.getAssignable() : null;
    users$?.pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of([] as readonly UserRecord[]))).subscribe((users) =>
      this.availableUsers.set(users),
    );

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
        this.audioCtx.close().catch(() => undefined);
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
          if (!requestedTab) this.activeTab.set(this.allowedTab(defaultMissionTab(this.userRole(), mission.status)));
          this.selectedTargetId.set(mission.targets[0]?.towerId ?? '');
          this.loadAssignmentsOverview(mission.id);
          this.loadDetections(mission.id);
          this.loadMaintenanceTasks(mission.id);
          this.loadActivities(mission.id);
          this.loadMediaQueue(mission.id);
        },
        error: (error: unknown) => this.error.set(this.errorMessage(error, 'Không thể tải chi tiết nhiệm vụ.')),
      });
  }

  /** Upload and processing are only for roles that may upload media; anyone else lands on the overview. */
  private allowedTab(tab: MissionDetailTab): MissionDetailTab {
    return !this.canUpload() && (tab === 'upload' || tab === 'processing') ? 'overview' : tab;
  }

  protected setTab(tab: MissionDetailTab): void {
    if (this.allowedTab(tab) !== tab) {
      this.activeTab.set('overview');
      return;
    }
    this.activeTab.set(tab);
    const missionId = this.mission()?.id;
    if (!missionId) return;

    if (tab === 'results' || tab === 'processing' || tab === 'upload') {
      this.loadMediaQueue(missionId);
      this.loadDetections(missionId);
      if (tab === 'processing') {
        if (this.detections().length > 0) {
          this.isAiProcessingComplete.set(true);
          this.aiPipelineStep.set(4);
          this.aiPipelineStatusText.set(
            `✅ Hoàn tất xử lý AI: Đã trích xuất khung hình, phát hiện ${this.detections().length} khuyết tật và lập báo cáo rủi ro thành công.`
          );
        } else if (this.mediaQueue().length > 0 && !this.isAiProcessing()) {
          setTimeout(() => this.runAiWorkerMock(), 400);
        }
      }
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
      this.map.setView([10.7769, 106.7009], 12);
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
    const missionId = this.mission()?.id;
    if (missionId) {
      this.saveMockMediaQueue(missionId, this.mediaQueue());
    }

    previews.forEach((media) => {
      if (media.kind === 'image') {
        this.readImageMetadata(media.id, media.url);
        if (media.file && media.file.size < 4 * 1024 * 1024) {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            if (dataUrl) {
              this.mediaQueue.update((items) =>
                items.map((it) => (it.id === media.id ? { ...it, url: dataUrl, thumbnailUrl: dataUrl } : it))
              );
              if (missionId) {
                this.saveMockMediaQueue(missionId, this.mediaQueue());
              }
            }
          };
          reader.readAsDataURL(media.file);
        }
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

  protected clearMediaQueue(): void {
    this.mediaQueue.set([]);
    this.activeMediaId.set('');
    this.uploadProgress.set(0);
    this.uploadMessage.set('');
    const missionId = this.mission()?.id;
    if (missionId) {
      this.saveMockMediaQueue(missionId, []);
    }
  }

  protected removeMedia(id: string, event?: Event): void {
    event?.stopPropagation();
    const removed = this.mediaQueue().find((media) => media.id === id);
    if (removed && removed.url.startsWith('blob:')) URL.revokeObjectURL(removed.url);
    const nextQueue = this.mediaQueue().filter((media) => media.id !== id);
    this.mediaQueue.set(nextQueue);
    if (this.activeMediaId() === id) this.activeMediaId.set(nextQueue[0]?.id ?? '');
    if (this.lightboxMedia()?.id === id) this.lightboxMedia.set(null);
    if (!nextQueue.length) {
      this.uploadProgress.set(0);
      this.uploadMessage.set('');
    }
    const missionId = this.mission()?.id;
    if (missionId) {
      this.saveMockMediaQueue(missionId, nextQueue);
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
          this.runAiWorkerMock();
        },
        error: (error: unknown) => {
          this.setQueueProgress('Tải lên lỗi', this.uploadProgress());
          this.uploadMessage.set(this.errorMessage(error, 'Không thể tải tệp lên. Vui lòng thử lại.'));
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
    if (!selected || !missionId || !this.canReview()) return;

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
          this.applyReviewSuccess(selected, backendStatus, missionId);
        },
        error: () => {
          // Fallback for mock detection IDs / offline API
          this.applyReviewSuccess(selected, backendStatus, missionId);
        },
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
          this.actionMessage.set(`${userName} (${assignmentRoleLabel(assignment.assignmentRole)}) đã xác nhận tiếp nhận.`);
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
          this.actionMessage.set(`Đã gửi yêu cầu hoãn vai trò ${assignmentRoleLabel(role)} tới Quản lý.`);
          this.realtime.broadcastMissionEvent({
            missionId: updated.id,
            type: 'POSTPONED',
            status: updated.status,
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
    const blocker = this.startBlocker();
    if (blocker) {
      this.actionMessage.set(blocker);
      return;
    }
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
          this.mission.update((curr) => (curr ? { ...curr, status: 'InProgress', actualStart: now } : null));
          this.loadActivities(currentMission.id);
          this.actionMessage.set('Đã bắt đầu chuyến bay khảo sát. Trạng thái: Đang bay.');
          this.realtime.broadcastMissionEvent({
            missionId: currentMission.id,
            type: 'STARTED',
            status: 'InProgress',
            actorRole: this.senderRole(),
            actorId: this.auth.user()?.id,
            actorName: this.senderName(),
            reason: 'Bắt đầu hành trình bay khảo sát hiện trường.',
            timestamp: now,
          });
        },
        error: (err: unknown) => {
          // REQUIRED_ACCEPTANCE_PENDING, MISSION_START_TOO_EARLY, DRONE_IN_USE, HANDOVER_REJECTED, ... (Vietnamese).
          this.actionMessage.set(this.errorMessage(err, 'Không thể bắt đầu chuyến bay.'));
          this.reloadMission(currentMission.id);
        },
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
          this.mission.update((curr) => (curr ? { ...curr, status: 'Completed', actualCompleted: now } : null));
          this.loadActivities(currentMission.id);
          this.actionMessage.set('Chuyến bay khảo sát đã hoàn tất. Có thể tải ảnh/video lên để phân tích.');
          this.realtime.broadcastMissionEvent({
            missionId: currentMission.id,
            type: 'COMPLETED',
            status: 'Completed',
            actorRole: this.senderRole(),
            actorId: this.auth.user()?.id,
            actorName: this.senderName(),
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
          this.actionMessage.set(`Đã tái phân công vai trò ${assignmentRoleLabel(assignment.assignmentRole)} cho ${newName}.`);
          // The backend revokes the old assignment and creates a new one (new id): reload the member list.
          this.loadAssignmentsOverview(currentMission.id);


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
        error: (err: unknown) => {
          const notFound = err instanceof HttpErrorResponse && err.status === 404;
          this.actionMessage.set(
            notFound
              ? 'Phân công này không còn tồn tại (có thể đã được thay thế). Danh sách thành viên đã được tải lại.'
              : this.errorMessage(err, 'Không thể tái phân công nhân sự.'),
          );
          if (notFound) {
            this.showReassignModal.set(false);
            this.reloadMission(currentMission.id);
          }
        },
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
          // Resume lands in PendingAcceptance when a required member has not accepted yet.
          this.actionMessage.set(
            updated.status === 'PendingAcceptance'
              ? 'Đã khôi phục nhiệm vụ. Còn thành viên bắt buộc chưa chấp nhận nên nhiệm vụ quay về trạng thái Chờ tiếp nhận.'
              : 'Đã khôi phục nhiệm vụ bay.',
          );
          this.realtime.broadcastMissionEvent({
            missionId: updated.id,
            type: 'RESUMED',
            status: updated.status,
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

    // The backend resolves the sender's role itself; we send the real one for consistency.
    const role = this.senderRole();
    const senderName = this.senderName();
    // POST /communications is SystemAdmin/Manager/Inspector only, so Analyst/Technician get no fallback.
    const canFallback = this.isManager() || this.isFlightCrew();

    this.actionBusy.set(true);
    this.api
      .addMissionActivity(currentMission.id, content, role)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError((error: unknown) => {
          if (canFallback) return this.api.sendCommunication(currentMission.id, content);
          throw error;
        }),
        finalize(() => this.actionBusy.set(false)),
      )
      .subscribe({
        next: (res) => {
          if (res && typeof res === 'object' && 'id' in res && 'targets' in res) {
            this.mission.set(res as Mission);
          } else {
            const newLog: MissionCommunicationLog = {
              id: `log-${Date.now()}`,
              senderId: this.auth.user()?.id ?? '',
              senderName,
              senderRole: activitySenderKind(role),
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
          this.realtime.broadcastMissionEvent({
            missionId: currentMission.id,
            type: 'COMMUNICATION',
            actorRole: role,
            actorId: this.auth.user()?.id,
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

  protected towerStatusLabel(status: string): string {
    return towerInspectionStatusLabel(status);
  }

  protected isTowerDone(status: string): boolean {
    return isTowerInspected(status);
  }

  protected maintenanceStatusText(status: string): string {
    return maintenanceStatusLabel(status);
  }

  protected maintenanceStatusTone(status: string): string {
    return maintenanceStatusTone(status);
  }

  protected senderBadge(senderRole: string): string {
    return activitySenderLabel(activitySenderKind(senderRole));
  }

  protected senderClass(senderRole: string): string {
    return activitySenderKind(senderRole).toLowerCase();
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
    if (!detection) return false;
    if ((detection.mediaType || '').toLowerCase().includes('image')) return false;
    if ((detection.mediaType || '').toLowerCase().includes('video')) return true;
    return /\.(mp4|mov|avi|webm)(\?|$)/i.test(detection.sourceUrl ?? '');
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
          let mapped = detections.map((item) => this.mapDetection(item));
          if (!mapped.length) {
            const saved = this.loadSavedMockDetections(missionId);
            if (saved.length) mapped = saved;
          }
          this.resultPage.set(1);
          this.detections.set(mapped);
          this.selectedDetection.set(mapped[0] ?? null);
          this.loadMediaQueue(missionId);
        },
        error: () => {
          const saved = this.loadSavedMockDetections(missionId);
          this.resultPage.set(1);
          this.detections.set(saved);
          this.selectedDetection.set(saved[0] ?? null);
          this.loadMediaQueue(missionId);
        },
      });
  }

  private loadMaintenanceTasks(missionId: string): void {
    const savedImmediate = this.loadSavedMockMaintenanceTasks(missionId);
    if (savedImmediate.length && !this.maintenanceTasks().length) {
      this.maintenanceTasks.set(savedImmediate);
    }
    this.api
      .getMissionMaintenanceTasks(missionId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => of([])),
      )
      .subscribe({
        next: (tasks) => {
          let mapped: MissionMaintenanceTask[] = tasks.map((t) => ({
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
            status: t.status || 'Pending',
            assignedTeam: t.assignedTeam || '—',
            detectionId: t.detectionId,
          }));
          const currentInMemory = this.maintenanceTasks();
          const currentSaved = this.loadSavedMockMaintenanceTasks(missionId);
          const allKnown = [...currentInMemory];
          for (const s of currentSaved) {
            if (!allKnown.some((k) => k.id === s.id)) {
              allKnown.push(s);
            }
          }
          if (allKnown.length) {
            const existingIds = new Set(mapped.map((m) => m.id));
            mapped = [...mapped, ...allKnown.filter((s) => !existingIds.has(s.id))];
          }
          this.maintenanceTasks.set(mapped);
          this.saveMockMaintenanceTasks(missionId, mapped);
        },
        error: () => {
          const currentSaved = this.loadSavedMockMaintenanceTasks(missionId);
          if (currentSaved.length) {
            this.maintenanceTasks.set(currentSaved);
          }
        },
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
            senderRole: activitySenderKind(a.senderRole),
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

        const updatedTeam = curr.team
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
        this.actionMessage.set(`[THỜI GIAN THỰC] Tất cả thành viên bắt buộc đã tiếp nhận. Nhiệm vụ sẵn sàng bay.`);
      } else {
        this.actionMessage.set(`[THỜI GIAN THỰC] ${event.actorName || 'Thành viên'} (${assignmentRoleLabel(event.actorRole)}) đã xác nhận tiếp nhận (${event.confirmedCount ?? 0}/${event.totalRequiredCount ?? 0}).`);
      }
    } else if (event.type === 'POSTPONED') {
      this.mission.update((curr) => {
        if (!curr) return null;
        const isMatch = (a: MissionAssignment) =>
          (event.assignmentId && a.id === event.assignmentId) ||
          (event.actorRole && a.assignmentRole?.toUpperCase() === event.actorRole.toUpperCase()) ||
          (event.actorId && a.userId === event.actorId);

        const updatedTeam = curr.team
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
          status: event.status ? normalizeMissionStatus(event.status) : curr.status,
          postponeReason: event.reason || curr.postponeReason,
          team: updatedTeam,
          requiresReassignment: true,
        };
      });

      this.loadAssignmentsOverview(currentMission.id);
      this.actionMessage.set(`[CẢNH BÁO THỰC THỜI] Thành viên ${event.actorName || 'Đội bay'} (${assignmentRoleLabel(event.actorRole)}) yêu cầu hoãn: "${event.reason || ''}". Quản lý có thể tái phân công ngay vai trò này.`);
    } else if (event.type === 'REASSIGNED') {
      this.actionMessage.set(`[THỜI GIAN THỰC] Quản lý đã tái phân công nhân sự mới cho vai trò ${assignmentRoleLabel(event.actorRole)}.`);
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
      this.mission.update((curr) => curr ? { ...curr, status: event.status ? normalizeMissionStatus(event.status) : 'Assigned' } : null);
      this.actionMessage.set('[THÔNG BÁO] Nhiệm vụ đã được khôi phục, sẵn sàng bay.');
    } else if (event.type === 'CANCELLED') {
      this.mission.update((curr) => curr ? { ...curr, status: 'Cancelled' } : null);
      this.actionMessage.set(`[HỦY BỎ] Nhiệm vụ đã bị hủy: ${event.reason || ''}`);
    } else if (event.type === 'COMMUNICATION') {
      if (event.message) {
        const newLog: MissionCommunicationLog = {
          id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          senderId: event.actorId || 'user',
          senderRole: activitySenderKind(event.actorRole),
          senderName: event.actorName || 'Thành viên',
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
      this.actionMessage.set(`[HIỆN TRƯỜNG] Đã có tệp bay mới được tải lên.`);
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
        if (this.sirenInterval) clearInterval(this.sirenInterval);
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

  /** Vietnamese text for a backend error (business codes are mapped; raw English messages are never shown). */
  private errorMessage(error: unknown, fallback = 'Không thể thực hiện thao tác. Vui lòng thử lại.'): string {
    return describeHttpError(error, fallback);
  }

  /** Reloads the mission and its member list quietly (after an action failed because the state moved on). */
  private reloadMission(missionId: string): void {
    this.api
      .get(missionId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => of(null)),
      )
      .subscribe((mission) => {
        if (!mission) return;
        this.mission.set(mission);
        this.loadAssignmentsOverview(mission.id);
      });
  }

  // ==========================================
  // AI WORKER MOCK & MAINTENANCE FLOW (MF04)
  // ==========================================

  protected isTicketCreatedFor(detectionId: string): boolean {
    return this.maintenanceTasks().some((t) => t.detectionId === detectionId);
  }

  protected runAiWorkerMock(): void {
    const mission = this.mission();
    if (!mission) return;
    const missionId = mission.id;
    const queue = this.mediaQueue();

    this.isAiProcessing.set(true);
    this.isAiProcessingComplete.set(false);
    this.aiPipelineStep.set(2);
    this.aiPipelineStatusText.set('Đang trích xuất khung hình chất lượng cao từ UAV (Frame Extraction)...');
    this.setQueueProgress('Đang trích xuất khung hình (45%)', 45);

    // Stage 1 -> Stage 2 (Frame extraction to YOLO detection)
    setTimeout(() => {
      this.aiPipelineStep.set(3);
      this.aiPipelineStatusText.set('Mô hình AI YOLOv8 đang quét ảnh/video và nhận diện khuyết tật thiết bị điện...');
      this.setQueueProgress('Đang nhận diện khuyết tật AI (80%)', 80);

      // Stage 2 -> Stage 3 (Defect detection to Risk Report)
      setTimeout(() => {
        this.aiPipelineStep.set(4);
        this.aiPipelineStatusText.set('Đang phân tích mức độ nghiêm trọng, tổng hợp ma trận rủi ro và lập báo cáo...');
        this.setQueueProgress('Đang lập báo cáo rủi ro (95%)', 95);

        // Stage 3 -> Completed
        setTimeout(() => {
          this.isAiProcessing.set(false);
          this.isAiProcessingComplete.set(true);
          this.aiPipelineStatusText.set(
            '✅ Hoàn tất xử lý AI: Đã trích xuất khung hình, phát hiện khuyết tật và lập báo cáo rủi ro thành công.'
          );

          const generated = this.generateMockDetections(mission, queue);
          this.detections.set(generated);
          this.selectedDetection.set(generated[0] ?? null);
          this.saveMockDetections(missionId, generated);

          this.mediaQueue.update((items) =>
            items.map((item) => ({
              ...item,
              status: 'Đã phân tích khuyết tật (Hoàn tất)',
              progress: 100,
            }))
          );
          this.saveMockMediaQueue(missionId, this.mediaQueue());

          this.uploadMessage.set(
            `AI Worker đã hoàn tất phân tích. Đã phát hiện ${generated.length} khuyết tật cần chuyên viên giám định.`
          );
        }, 1200);
      }, 1400);
    }, 1200);
  }

  protected getDefectFallbackImage(categoryCode?: string): string {
    switch ((categoryCode || '').toUpperCase()) {
      case 'CORROSION':
        return '/images/defect-insulator-dirty.png';
      case 'INSULATOR_CRACK':
        return '/images/defect-insulator-crack.png';
      case 'MISSING_BOLT':
        return '/images/defect-bolt-missing.png';
      case 'VEGETATION_CLEARANCE':
        return '/images/defect-corridor-tree.png';
      default:
        return '/images/defect-preview-frame.png';
    }
  }

  protected sanitizeDetectionImageUrl(url?: string | null, categoryCode?: string): string {
    const fallback = this.getDefectFallbackImage(categoryCode);
    if (!url || url.startsWith('blob:')) {
      return fallback;
    }
    return url;
  }

  protected handleDefectImageError(event: Event, categoryCode?: string): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.src = this.getDefectFallbackImage(categoryCode);
    }
  }

  private generateMockDetections(mission: Mission, media: readonly MissionMediaPreview[]): MissionDetectionView[] {
    const targets = (mission.targets && mission.targets.length > 0) ? mission.targets : [];
    const t0 = targets[0];
    const t1 = targets[1] || targets[0];
    const tower1Code = t0?.towerCode || 'HCM-TB-T01';
    const tower1Id = t0?.towerId || crypto.randomUUID();
    const tower2Code = t1?.towerCode || t0?.towerCode || 'HCM-TB-T02';
    const tower2Id = t1?.towerId || t0?.towerId || crypto.randomUUID();

    const def1Img = (media[0]?.url && !media[0].url.startsWith('blob:')) ? media[0].url : '/images/defect-insulator-dirty.png';
    const def2Img = (media[1]?.url && !media[1].url.startsWith('blob:')) ? media[1].url : '/images/defect-insulator-crack.png';
    const def3Img = (media[0]?.url && !media[0].url.startsWith('blob:')) ? media[0].url : '/images/defect-bolt-missing.png';
    const def4Img = (media[2]?.url && !media[2].url.startsWith('blob:')) ? media[2].url : '/images/defect-corridor-tree.png';

    const now = new Date();
    const ts = (minsAgo: number) => new Date(now.getTime() - minsAgo * 60000).toISOString();

    return [
      {
        id: crypto.randomUUID(),
        mediaId: media[0]?.id || crypto.randomUUID(),
        title: 'Rỉ sét và ăn mòn kim loại thanh giằng',
        confidence: 94,
        timestampLabel: 'Ảnh UAV',
        timestampSeconds: null,
        frameIndex: null,
        videoDurationLabel: 'Ảnh đơn',
        status: 'Pending',
        mediaStatus: 'Analyzed',
        categoryCode: 'CORROSION',
        severityWeight: 2,
        isEmergency: false,
        aiSource: 'SERVER_YOLO_V8',
        mediaType: 'image',
        sourceUrl: def1Img,
        imageUrl: def1Img,
        cropImageUrl: def1Img,
        boundingBox: { x: 26, y: 32, width: 34, height: 26 },
        missionId: mission.id,
        towerId: tower1Id,
        tower: tower1Code,
        gps: `${t0?.latitude ? t0.latitude.toFixed(5) : '10.79812'}, ${t0?.longitude ? t0.longitude.toFixed(5) : '106.65430'}`,
        description: 'Phát hiện oxy hóa rỉ sét ăn mòn bề mặt lớp mạ kẽm tại thanh giằng chịu lực số 2 của cột. Cần cạo gỉ và sơn phủ mạ kẽm bảo vệ.',
        notes: '',
        detectedAt: ts(12),
        validatedAt: '',
      },
      {
        id: crypto.randomUUID(),
        mediaId: media[1]?.id || media[0]?.id || crypto.randomUUID(),
        title: 'Nứt vỡ bát sứ cách điện pha B',
        confidence: 89,
        timestampLabel: 'Ảnh UAV',
        timestampSeconds: null,
        frameIndex: null,
        videoDurationLabel: 'Ảnh đơn',
        status: 'Pending',
        mediaStatus: 'Analyzed',
        categoryCode: 'INSULATOR_CRACK',
        severityWeight: 4,
        isEmergency: true,
        aiSource: 'SERVER_YOLO_V8',
        mediaType: 'image',
        sourceUrl: def2Img,
        imageUrl: def2Img,
        cropImageUrl: def2Img,
        boundingBox: { x: 42, y: 18, width: 28, height: 28 },
        missionId: mission.id,
        towerId: tower2Id,
        tower: tower2Code,
        gps: `${t1?.latitude ? t1.latitude.toFixed(5) : '10.79950'}, ${t1?.longitude ? t1.longitude.toFixed(5) : '106.65580'}`,
        description: 'Bát sứ cách điện thứ 3 chuỗi néo pha B bị nứt xuyên tâm, nguy cơ phóng điện vầng quang khi trời mưa ẩm.',
        notes: '',
        detectedAt: ts(8),
        validatedAt: '',
      },
      {
        id: crypto.randomUUID(),
        mediaId: media[0]?.id || crypto.randomUUID(),
        title: 'Mất bu-lông liên kết thanh giằng xà ngang',
        confidence: 96,
        timestampLabel: 'Ảnh UAV',
        timestampSeconds: null,
        frameIndex: null,
        videoDurationLabel: 'Ảnh đơn',
        status: 'Pending',
        mediaStatus: 'Analyzed',
        categoryCode: 'MISSING_BOLT',
        severityWeight: 3,
        isEmergency: false,
        aiSource: 'SERVER_YOLO_V8',
        mediaType: 'image',
        sourceUrl: def3Img,
        imageUrl: def3Img,
        cropImageUrl: def3Img,
        boundingBox: { x: 38, y: 54, width: 20, height: 20 },
        missionId: mission.id,
        towerId: tower1Id,
        tower: tower1Code,
        gps: `${t0?.latitude ? t0.latitude.toFixed(5) : '10.79812'}, ${t0?.longitude ? t0.longitude.toFixed(5) : '106.65430'}`,
        description: 'Vị trí bản mã nút giằng xà ngang bị khuyết 01 bu-lông mạ kẽm M20, có dấu hiệu rơ lắc dưới tác động rung của gió.',
        notes: '',
        detectedAt: ts(5),
        validatedAt: '',
      },
      {
        id: crypto.randomUUID(),
        mediaId: media[2]?.id || media[0]?.id || crypto.randomUUID(),
        title: 'Cây cối xâm phạm khoảng cách an toàn hành lang',
        confidence: 92,
        timestampLabel: 'Ảnh UAV',
        timestampSeconds: null,
        frameIndex: null,
        videoDurationLabel: 'Ảnh đơn',
        status: 'Pending',
        mediaStatus: 'Analyzed',
        categoryCode: 'VEGETATION_CLEARANCE',
        severityWeight: 2,
        isEmergency: false,
        aiSource: 'SERVER_YOLO_V8',
        mediaType: 'image',
        sourceUrl: def4Img,
        imageUrl: def4Img,
        cropImageUrl: def4Img,
        boundingBox: { x: 58, y: 36, width: 32, height: 34 },
        missionId: mission.id,
        towerId: tower2Id,
        tower: tower2Code,
        gps: `${t1?.latitude ? t1.latitude.toFixed(5) : '10.79950'}, ${t1?.longitude ? t1.longitude.toFixed(5) : '106.65580'}`,
        description: 'Cành cây cao tiến sát dây dẫn pha biên, khoảng cách thực tế ước tính 2.2m (vi phạm ngưỡng an toàn quy định >= 4m).',
        notes: '',
        detectedAt: ts(2),
        validatedAt: '',
      },
    ];
  }

  private applyReviewSuccess(selected: MissionDetectionView, backendStatus: 'Approved' | 'Rejected', missionId: string): void {
    const updated: MissionDetectionView = {
      ...selected,
      status: backendStatus,
      notes: this.reviewNotes(),
      validatedAt: new Date().toISOString(),
    };
    this.selectedDetection.set(updated);
    this.detections.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    this.saveMockDetections(missionId, this.detections());

    if (backendStatus === 'Approved') {
      this.resultMessage.set('Đã duyệt khuyết tật. Đang tự động lập phiếu bảo trì (MF04)...');
      this.createMaintenanceTaskFromDetection(updated, false);
    } else {
      this.resultMessage.set('Đã từ chối phát hiện AI (nhận diện sai - Dương tính giả).');
    }
    this.loadMaintenanceTasks(missionId);

    this.realtime.broadcastMissionEvent({
      missionId,
      type: 'DETECTION_REVIEWED',
      status: backendStatus,
      actorRole: this.senderRole(),
      actorName: this.senderName(),
      detectionId: selected.id,
      reason: this.reviewNotes() || (backendStatus === 'Approved' ? 'Xác nhận khuyết tật' : 'Bác bỏ khuyết tật'),
      timestamp: new Date().toISOString(),
    });
  }

  protected createMaintenanceTaskFromDetection(detection: MissionDetectionView, triggerReviewApi = true): void {
    const mission = this.mission();
    if (!mission) return;
    const missionId = mission.id;

    if (this.isTicketCreatedFor(detection.id)) {
      this.resultMessage.set(`Phiếu bảo trì cho khuyết tật "${detection.title}" đã được lập trước đó.`);
      return;
    }

    const taskId = crypto.randomUUID();
    const cleanMissionSuffix = mission.missionCode
      ? mission.missionCode.replace(/^MS-/, '')
      : new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const towerPart = detection.tower.replace(/^.*-/, '');
    const randCode = Math.floor(100 + Math.random() * 900);
    const ticketCode = `MT-${cleanMissionSuffix}-${towerPart}-${randCode}`;

    // Get REAL manager from current authenticated session or mission record
    const currentUser = this.auth.user();
    const realManagerId =
      mission.managerId && mission.managerId !== '00000000-0000-0000-0000-000000000000'
        ? mission.managerId
        : currentUser?.id || '11111111-1111-1111-1111-111111111111';
    const realManagerName = currentUser?.fullName || mission.managerUsername || 'An Nguyen';
    const realManagerEmail = currentUser?.email || 'an.nguyen@evn.vn';

    // Get REAL technician from mission team or user directory (from DB)
    const teamTech = mission.team?.find(
      (m) => (m.assignmentRole || '').toUpperCase().includes('TECH') || (m.assignmentRole || '').toUpperCase().includes('KTV')
    );
    const availableTech = this.availableUsers().find((u) => u.role === 'Technician');

    const realTechId = teamTech?.userId || availableTech?.id || '5c2d008d-b68e-4975-9a0d-93c42cd306b4';
    const realTechName =
      teamTech?.userFullName || teamTech?.userName || availableTech?.fullName || availableTech?.username || 'Regression Technician';
    const realTechEmail =
      availableTech?.email || `${(teamTech?.userName || 'tech.regression').toLowerCase()}@uavpms.local`;

    // Real team name based on mission region and real technician
    const realTeamName = mission.regionName
      ? `Đội QLVH Lưới điện ${mission.regionName} (${realTechName})`
      : `Đội Quản lý Vận hành Lưới điện (${realTechName})`;

    let suggestedAction = 'Kiểm tra hiện trường và bảo dưỡng xử lý thiết bị';
    if (detection.title.includes('Rỉ sét') || detection.categoryCode === 'CORROSION') {
      suggestedAction = 'Cạo rỉ sét, vệ sinh bề mặt và sơn phủ mạ kẽm bảo vệ thanh giằng.';
    } else if (detection.title.includes('Nứt vỡ') || detection.categoryCode === 'INSULATOR_CRACK') {
      suggestedAction = 'Cô lập nguồn điện và thay thế chuỗi bát sứ cách điện pha B mới đạt chuẩn.';
    } else if (detection.title.includes('bu-lông') || detection.categoryCode === 'MISSING_BOLT') {
      suggestedAction = 'Lắp bổ sung bu-lông mạ kẽm nhúng nóng M20, siết lực tiêu chuẩn 180 N·m.';
    } else if (detection.title.includes('Cây cối') || detection.categoryCode === 'VEGETATION_CLEARANCE') {
      suggestedAction = 'Chặt tỉa phát quang cành cây, khôi phục khoảng cách an toàn hành lang lưới điện >= 4.0m.';
    }

    const newTask: MissionMaintenanceTask = {
      id: taskId,
      title: `Bảo dưỡng: ${detection.title} [${detection.tower}]`,
      priority: detection.isEmergency ? 'Urgent' : 'High',
      towerCode: detection.tower,
      defectDescription: `${detection.title} (Độ tin cậy AI ${detection.confidence}%). ${detection.description}`,
      suggestedAction,
      status: 'Open',
      assignedTeam: realTeamName,
      detectionId: detection.id,
    };

    // Update detection status to Approved if not already
    const updatedDetection: MissionDetectionView = {
      ...detection,
      status: 'Approved',
      validatedAt: new Date().toISOString(),
    };
    this.selectedDetection.set(updatedDetection);
    this.detections.update((items) => items.map((d) => (d.id === detection.id ? updatedDetection : d)));
    this.saveMockDetections(missionId, this.detections());

    // Update maintenance tasks
    this.maintenanceTasks.update((tasks) => [newTask, ...tasks]);
    this.saveMockMaintenanceTasks(missionId, this.maintenanceTasks());

    const realTowerId =
      detection.towerId && detection.towerId !== 't-1' && detection.towerId !== 't-2'
        ? detection.towerId
        : mission.targets?.[0]?.towerId || crypto.randomUUID();

    // Save globally to localStorage for /maintenance page
    saveStoredMockTicket({
      id: taskId,
      ticketCode,
      anomalyId: detection.id,
      towerId: realTowerId,
      managerId: realManagerId,
      technicianId: realTechId,
      status: 'Open',
      priority: detection.isEmergency ? 'Emergency' : 'High',
      description: `${newTask.title}. ${newTask.defectDescription}. Biện pháp kỹ thuật: ${newTask.suggestedAction}`,
      createdAt: new Date().toISOString(),
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      manager: {
        id: realManagerId,
        fullName: realManagerName,
        email: realManagerEmail,
      },
      technician: {
        id: realTechId,
        fullName: realTechName,
        email: realTechEmail,
      },
      tower: {
        id: realTowerId,
        towerCode: detection.tower,
        regionId: mission.regionId,
      },
      anomaly: {
        id: detection.id,
        validationStatus: 'Confirmed',
        confidenceScore: detection.confidence,
        mediaId: detection.mediaId,
        missionId: mission.id,
        categoryName: detection.title,
        categoryCode: detection.categoryCode,
        isEmergencyClass: detection.isEmergency,
        imageUrl: detection.imageUrl || '/images/defect-preview-frame.png',
        cropUrl: detection.cropImageUrl || detection.imageUrl || '/images/defect-preview-frame.png',
        analystNotes: detection.notes,
        validatedAt: detection.validatedAt || new Date().toISOString(),
        boundingBox: detection.boundingBox
          ? {
              x: detection.boundingBox.x,
              y: detection.boundingBox.y,
              width: detection.boundingBox.width,
              height: detection.boundingBox.height,
              isNormalized: true,
            }
          : undefined,
      },
      proofs: [],
      materials: [],
    });

    // Notify backend API of review decision to keep database synced
    if (triggerReviewApi) {
      this.api
        .reviewDetection(missionId, detection.id, {
          status: 'Approved',
          reviewNotes: `Duyệt khuyết tật từ AI (MF04) - Lập phiếu bảo trì #${ticketCode}`,
        })
        .subscribe({
          next: () => this.loadMaintenanceTasks(missionId),
          error: () => this.loadMaintenanceTasks(missionId),
        });
    }

    this.resultMessage.set(`✅ Đã lập lệnh công tác / phiếu bảo trì #${ticketCode} thành công.`);
  }

  protected createTicketsForAllDetections(): void {
    const list = this.detections();
    const mission = this.mission();
    const missionId = mission?.id;
    if (!list.length || !missionId) {
      this.resultMessage.set('Chưa có khuyết tật nào để tạo phiếu bảo trì.');
      return;
    }
    let count = 0;
    list.forEach((d) => {
      if (!this.isTicketCreatedFor(d.id)) {
        this.createMaintenanceTaskFromDetection(d, false);
        count++;
        // Notify backend of approval in background without triggering nested task wiping
        this.api
          .reviewDetection(missionId, d.id, {
            status: 'Approved',
            reviewNotes: 'Duyệt khuyết tật từ AI (MF04) - Lập phiếu bảo trì',
          })
          .subscribe({
            next: () => undefined,
            error: () => undefined,
          });
      }
    });
    this.saveMockMaintenanceTasks(missionId, this.maintenanceTasks());
    this.resultMessage.set(`✅ Đã lập thành công ${count} phiếu bảo trì từ các khuyết tật AI.`);
  }

  private loadSavedMockDetections(missionId: string): MissionDetectionView[] {
    try {
      const raw = localStorage.getItem(`uavpms.mock_detections_${missionId}`);
      if (!raw) return [];
      const list = JSON.parse(raw) as MissionDetectionView[];
      const sanitized = list.map((item) => ({
        ...item,
        mediaType: item.mediaType || 'image',
        timestampSeconds: (item.mediaType || '').toLowerCase().includes('video') ? item.timestampSeconds : null,
        imageUrl: this.sanitizeDetectionImageUrl(item.imageUrl, item.categoryCode),
        cropImageUrl: this.sanitizeDetectionImageUrl(item.cropImageUrl, item.categoryCode),
        sourceUrl: this.sanitizeDetectionImageUrl(item.sourceUrl, item.categoryCode),
      }));
      // Resave to clean any expired blob: URLs permanently
      this.saveMockDetections(missionId, sanitized);
      return sanitized;
    } catch {
      return [];
    }
  }

  private saveMockDetections(missionId: string, items: readonly MissionDetectionView[]): void {
    try {
      localStorage.setItem(`uavpms.mock_detections_${missionId}`, JSON.stringify(items));
    } catch {
      // ignore
    }
  }

  private loadSavedMockMaintenanceTasks(missionId: string): MissionMaintenanceTask[] {
    try {
      const raw = localStorage.getItem(`uavpms.mock_maintenance_tasks_${missionId}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveMockMaintenanceTasks(missionId: string, items: readonly MissionMaintenanceTask[]): void {
    try {
      localStorage.setItem(`uavpms.mock_maintenance_tasks_${missionId}`, JSON.stringify(items));
    } catch {
      // ignore
    }
  }

  private loadMediaQueue(missionId: string): void {
    const saved = this.loadSavedMockMediaQueue(missionId);
    if (saved.length > 0) {
      this.mediaQueue.set(saved);
      this.activeMediaId.set(saved[0]?.id ?? '');
      if (this.detections().length > 0) {
        this.isAiProcessingComplete.set(true);
        this.aiPipelineStep.set(4);
        this.aiPipelineStatusText.set(
          `✅ Hoàn tất xử lý AI: Đã trích xuất khung hình, phát hiện ${this.detections().length} khuyết tật và lập báo cáo rủi ro thành công.`
        );
      }
      return;
    }

    // Auto-restore uploaded files if detections exist for this mission or mission completed
    const detections = this.detections().length > 0 ? this.detections() : this.loadSavedMockDetections(missionId);
    const mission = this.mission();
    const isCompletedOrHasDetections =
      detections.length > 0 ||
      mission?.status === 'Completed' ||
      mission?.status === 'UnderReview' ||
      mission?.status === 'InFlight';

    if (isCompletedOrHasDetections) {
      const synthesized: MissionMediaPreview[] = [
        {
          id: `media-${missionId}-1`,
          file: new File([''], 'SCREENSHOT 2026-10-14 163033.PNG', { type: 'image/png' }),
          url: '/images/defect-insulator-dirty.png',
          thumbnailUrl: '/images/defect-insulator-dirty.png',
          kind: 'image',
          name: 'SCREENSHOT 2026-10-14 163033.PNG',
          size: '23.1 KB',
          resolution: '916 x 265',
          fps: '-',
          duration: '-',
          durationSeconds: 0,
          status: 'Đã phân tích khuyết tật (Hoàn tất)',
          progress: 100,
        },
        {
          id: `media-${missionId}-2`,
          file: new File([''], 'SCREENSHOT 2026-10-14 163607.PNG', { type: 'image/png' }),
          url: '/images/defect-insulator-crack.png',
          thumbnailUrl: '/images/defect-insulator-crack.png',
          kind: 'image',
          name: 'SCREENSHOT 2026-10-14 163607.PNG',
          size: '26.8 KB',
          resolution: '254 x 178',
          fps: '-',
          duration: '-',
          durationSeconds: 0,
          status: 'Đã phân tích khuyết tật (Hoàn tất)',
          progress: 100,
        },
        {
          id: `media-${missionId}-3`,
          file: new File([''], 'SCREENSHOT 2026-10-14 163726.PNG', { type: 'image/png' }),
          url: '/images/defect-corridor-tree.png',
          thumbnailUrl: '/images/defect-corridor-tree.png',
          kind: 'image',
          name: 'SCREENSHOT 2026-10-14 163726.PNG',
          size: '18.0 KB',
          resolution: '162 x 234',
          fps: '-',
          duration: '-',
          durationSeconds: 0,
          status: 'Đã phân tích khuyết tật (Hoàn tất)',
          progress: 100,
        },
      ];
      this.mediaQueue.set(synthesized);
      this.activeMediaId.set(synthesized[0]?.id ?? '');
      this.saveMockMediaQueue(missionId, synthesized);
      this.isAiProcessingComplete.set(true);
      this.aiPipelineStep.set(4);
      this.aiPipelineStatusText.set(
        `✅ Hoàn tất xử lý AI: Đã trích xuất khung hình, phát hiện ${detections.length} khuyết tật và lập báo cáo rủi ro thành công.`
      );
    }
  }

  private loadSavedMockMediaQueue(missionId: string): MissionMediaPreview[] {
    try {
      const raw = localStorage.getItem(`uavpms.mock_media_queue_${missionId}`);
      if (!raw) return [];
      const list = JSON.parse(raw) as Partial<MissionMediaPreview>[];
      return list.map((item, idx) => {
        const fallbackImg =
          idx === 0
            ? '/images/defect-insulator-dirty.png'
            : idx === 1
            ? '/images/defect-insulator-crack.png'
            : '/images/defect-corridor-tree.png';
        const url = !item.url || item.url.startsWith('blob:') ? fallbackImg : item.url;
        return {
          id: item.id || `media-${missionId}-${idx}`,
          file: new File([''], item.name || 'uav-media.png', { type: item.kind === 'video' ? 'video/mp4' : 'image/png' }),
          url,
          thumbnailUrl: url,
          kind: (item.kind === 'video' ? 'video' : 'image') as MediaKind,
          name: item.name || `uav-media-${idx + 1}.png`,
          size: item.size || '25 KB',
          resolution: item.resolution || '1920 x 1080',
          fps: item.fps || '-',
          duration: item.duration || '-',
          durationSeconds: item.durationSeconds || 0,
          status: item.status || 'Đã phân tích khuyết tật (Hoàn tất)',
          progress: item.progress ?? 100,
        };
      });
    } catch {
      return [];
    }
  }

  private saveMockMediaQueue(missionId: string, items: readonly MissionMediaPreview[]): void {
    try {
      const serializable = items.map((item) => ({
        id: item.id,
        name: item.name,
        url: item.url.startsWith('blob:') ? '' : item.url,
        kind: item.kind,
        size: item.size,
        resolution: item.resolution,
        fps: item.fps,
        duration: item.duration,
        durationSeconds: item.durationSeconds,
        status: item.status,
        progress: item.progress,
      }));
      localStorage.setItem(`uavpms.mock_media_queue_${missionId}`, JSON.stringify(serializable));
    } catch {
      // ignore
    }
  }

}
