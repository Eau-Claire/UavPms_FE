import { Injectable, NgZone, inject } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { Auth } from '../../../core/auth/auth';
import { BackendFallbackService } from '../../../core/http/backend-fallback.service';
import { Mission, MissionCommunicationLog } from '../../../models/missions.models';
import { AppNotification } from '../../../models/notification.models';
import { asRecord, readArray, readFirstNumber, readFirstString, readOptionalNumber, readString } from '../../../shared/utils';
import { normalizeNotification } from './notifications-api';

export type AiAnalysisRealtimeStatus = 'Pending' | 'Evaluating' | 'Completed' | 'Failed' | string;

export interface AiAnalysisStatusChangedEvent {
  readonly requestId: string;
  readonly batchId: string;
  readonly missionId: string;
  readonly mediaId: string;
  readonly mediaType: string;
  readonly status: AiAnalysisRealtimeStatus;
  readonly savedDetections: number;
  readonly createdAlerts: number;
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly createdAt: string;
  readonly completedAt: string;
}

export type MissionLifecycleEventType =
  | 'CONFIRMED'
  | 'DISPATCHED'
  | 'ASSIGNED'
  | 'CREATED'
  | 'SUSPENDED'
  | 'POSTPONED'
  | 'REASSIGNED'
  | 'RESUMED'
  | 'CANCELLED'
  | 'REMINDER'
  | 'COMMUNICATION'
  | 'CHECKED_IN'
  | 'STARTED'
  | 'COMPLETED'
  | 'OVERDUE'
  | 'DETECTION_REVIEWED'
  | 'MEDIA_UPLOADED'
  | 'MAINTENANCE_TASK_CREATED'
  | 'MAINTENANCE_TASK_STATUS_CHANGED'
  | 'EMERGENCY_ALERT'
  | 'PRIORITY_UPDATED';

export interface MissionLifecycleRealtimeEvent {
  readonly missionId: string;
  readonly type: MissionLifecycleEventType;
  readonly status?: string;
  readonly assignmentId?: string;
  readonly confirmationDeadline?: string;
  readonly priority?: string;
  readonly managerInstructions?: string;
  readonly mission?: Partial<Mission>;
  readonly actorId?: string;
  readonly actorName?: string;
  readonly actorRole?: 'MANAGER' | 'INSPECTOR' | 'ANALYST' | 'TECHNICIAN' | 'SYSTEM' | string;
  readonly allConfirmed?: boolean;
  readonly confirmedCount?: number;
  readonly totalRequiredCount?: number;
  readonly pendingRoles?: readonly string[];
  readonly reason?: string;
  readonly message?: string;
  readonly log?: MissionCommunicationLog;
  readonly detectionId?: string;
  readonly taskId?: string;
  readonly timestamp: string;
}


export type AssessmentRealtimeEventType =
  | 'AssessmentStatusChanged'
  | 'DroneInspectionCompleted'
  | 'AssessmentCompleted'
  | 'MeteoAlertTriggered'
  | string;

export interface AssessmentRealtimeEvent {
  readonly assessmentId: string;
  readonly type: AssessmentRealtimeEventType;
  readonly status?: string;
  readonly droneId?: string;
  readonly droneCode?: string;
  readonly technicalHealth?: string;
  readonly technicalStatus?: string;
  readonly consumedMissionId?: string;
  readonly consumedMissionCode?: string;
  readonly completedMissionId?: string;
  readonly completedMissionCode?: string;
  readonly windSpeed?: number;
  readonly windGust?: number;
  readonly isMeteoSafe?: boolean;
  readonly message?: string;
  readonly actorId?: string;
  readonly actorName?: string;
  readonly actorRole?: string;
  readonly timestamp: string;
}

const MF01_ASSESSMENT_CHANNEL = 'uavpms_mf01_assessment_bus';
const MF02_BROADCAST_CHANNEL = 'uavpms_mf02_realtime_bus';

@Injectable({
  providedIn: 'root',
})
export class NotificationsRealtime {
  private readonly auth = inject(Auth);
  private readonly backendFallback = inject(BackendFallbackService);
  private readonly zone = inject(NgZone);
  private readonly notificationSubject = new Subject<AppNotification>();
  private readonly aiAnalysisStatusSubject = new Subject<AiAnalysisStatusChangedEvent>();
  private readonly missionEventsSubject = new Subject<MissionLifecycleRealtimeEvent>();
  private readonly assessmentEventsSubject = new Subject<AssessmentRealtimeEvent>();
  private readonly statusSubject = new Subject<'connected' | 'disconnected' | 'reconnecting'>();

  private connection: HubConnection | null = null;
  private starting: Promise<void> | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private assessmentBroadcastChannel: BroadcastChannel | null = null;
  private readonly activeMissionGroups = new Set<string>();
  private readonly activeAssessmentGroups = new Set<string>();
  private isInAssessmentsListGroup = false;

  readonly notifications$ = this.notificationSubject.asObservable();
  readonly aiAnalysisStatus$ = this.aiAnalysisStatusSubject.asObservable();
  readonly missionEvents$ = this.missionEventsSubject.asObservable();
  readonly assessmentEvents$ = this.assessmentEventsSubject.asObservable();
  readonly status$ = this.statusSubject.asObservable();

  constructor() {
    this.initBroadcastChannel();
  }

  private initBroadcastChannel(): void {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    try {
      this.broadcastChannel = new BroadcastChannel(MF02_BROADCAST_CHANNEL);
      this.broadcastChannel.onmessage = (event: MessageEvent<MissionLifecycleRealtimeEvent>) => {
        if (event.data && event.data.missionId && event.data.type) {
          this.zone.run(() => this.missionEventsSubject.next(event.data));
        }
      };
    } catch {
      // Ignore broadcast channel init failure
    }

    try {
      this.assessmentBroadcastChannel = new BroadcastChannel(MF01_ASSESSMENT_CHANNEL);
      this.assessmentBroadcastChannel.onmessage = (event: MessageEvent<AssessmentRealtimeEvent>) => {
        if (event.data && event.data.type) {
          this.zone.run(() => this.assessmentEventsSubject.next(event.data));
        }
      };
    } catch {
      // Ignore broadcast channel init failure
    }
  }

  joinMission(missionId: string): void {
    if (!missionId) return;
    this.activeMissionGroups.add(missionId);
    if (this.connection && this.connection.state === HubConnectionState.Connected) {
      this.connection.invoke('JoinMissionGroup', missionId).catch(() => undefined);
      this.connection.invoke('JoinMission', missionId).catch(() => undefined);
      this.connection.invoke('JoinGroup', `mission_${missionId}`).catch(() => undefined);
      this.connection.invoke('JoinGroup', missionId).catch(() => undefined);
    }
  }

  leaveMission(missionId: string): void {
    if (!missionId) return;
    this.activeMissionGroups.delete(missionId);
    if (this.connection && this.connection.state === HubConnectionState.Connected) {
      this.connection.invoke('LeaveMissionGroup', missionId).catch(() => undefined);
      this.connection.invoke('LeaveMission', missionId).catch(() => undefined);
      this.connection.invoke('LeaveGroup', `mission_${missionId}`).catch(() => undefined);
      this.connection.invoke('LeaveGroup', missionId).catch(() => undefined);
    }
  }


  joinAssessment(assessmentId: string): void {
    if (!assessmentId) return;
    this.activeAssessmentGroups.add(assessmentId);
    if (this.connection && this.connection.state === HubConnectionState.Connected) {
      this.connection.invoke('JoinAssessmentGroup', assessmentId).catch(() => undefined);
      this.connection.invoke('JoinGroup', 'assessment_' + assessmentId).catch(() => undefined);
    }
  }

  leaveAssessment(assessmentId: string): void {
    if (!assessmentId) return;
    this.activeAssessmentGroups.delete(assessmentId);
    if (this.connection && this.connection.state === HubConnectionState.Connected) {
      this.connection.invoke('LeaveAssessmentGroup', assessmentId).catch(() => undefined);
      this.connection.invoke('LeaveGroup', 'assessment_' + assessmentId).catch(() => undefined);
    }
  }

  joinAssessmentsList(): void {
    this.isInAssessmentsListGroup = true;
    if (this.connection && this.connection.state === HubConnectionState.Connected) {
      this.connection.invoke('JoinAssessmentsListGroup').catch(() => undefined);
      this.connection.invoke('JoinGroup', 'assessments').catch(() => undefined);
    }
  }

  leaveAssessmentsList(): void {
    this.isInAssessmentsListGroup = false;
    if (this.connection && this.connection.state === HubConnectionState.Connected) {
      this.connection.invoke('LeaveAssessmentsListGroup').catch(() => undefined);
      this.connection.invoke('LeaveGroup', 'assessments').catch(() => undefined);
    }
  }

  broadcastAssessmentEvent(event: AssessmentRealtimeEvent): void {
    // 1. Emit locally on current tab
    this.zone.run(() => this.assessmentEventsSubject.next(event));

    // 2. Broadcast cross-tab (instant sync)
    try {
      this.assessmentBroadcastChannel?.postMessage(event);
    } catch {
      // Ignore postMessage failure
    }

    // 3. Emit via SignalR Hub WebSocket
    if (this.connection && this.connection.state === HubConnectionState.Connected) {
      this.connection.send('SendAssessmentEvent', event).catch(() => undefined);
      this.connection.send('BroadcastAssessmentEvent', event).catch(() => undefined);
    }
  }

    broadcastMissionEvent(event: MissionLifecycleRealtimeEvent): void {
    // 1. Emit locally on current tab
    this.zone.run(() => this.missionEventsSubject.next(event));

    // 2. Broadcast across other tabs on same device (instant sync)
    try {
      this.broadcastChannel?.postMessage(event);
    } catch {
      // Ignore postMessage failure
    }

    // 3. Emit via SignalR Hub WebSocket to server and other network clients
    if (this.connection && this.connection.state === HubConnectionState.Connected) {
      this.connection.send('SendMissionEvent', event).catch(() => undefined);
      this.connection.send('BroadcastMissionLifecycle', event).catch(() => undefined);
      this.connection.send('BroadcastEvent', event).catch(() => undefined);
    }
  }

  connect(): void {
    if (this.connection?.state === HubConnectionState.Connected || this.starting) return;
    const initialHubUrl = this.backendFallback.getActiveHubUrl();
    this.connection = this.buildConnection(initialHubUrl);
    this.registerHandlers(this.connection);
    this.starting = this.connection
      .start()
      .then(() => {
        this.onHubConnected();
      })
      .catch(() => {
        if (!this.backendFallback.isUsingFallback() && this.backendFallback.fallbackHubUrl !== initialHubUrl) {
          this.backendFallback.activateFallback();
          const fallbackConn = this.buildConnection(this.backendFallback.fallbackHubUrl);
          this.connection = fallbackConn;
          this.registerHandlers(fallbackConn);
          return fallbackConn
            .start()
            .then(() => this.onHubConnected())
            .catch(() => this.zone.run(() => this.statusSubject.next('disconnected')));
        }
        this.zone.run(() => this.statusSubject.next('disconnected'));
        return;
      })
      .finally(() => {
        this.starting = null;
      });
  }

  private onHubConnected(): void {
    this.zone.run(() => {
      this.statusSubject.next('connected');
      for (const mId of this.activeMissionGroups) {
        this.joinMission(mId);
      }
      for (const aId of this.activeAssessmentGroups) {
        this.joinAssessment(aId);
      }
      if (this.isInAssessmentsListGroup) {
        this.joinAssessmentsList();
      }
    });
  }

  disconnect(): void {
    const connection = this.connection;
    this.connection = null;
    this.starting = null;
    void connection?.stop();
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
    if (this.assessmentBroadcastChannel) {
      this.assessmentBroadcastChannel.close();
      this.assessmentBroadcastChannel = null;
    }
  }

  private buildConnection(hubUrl: string = this.backendFallback.getActiveHubUrl()): HubConnection {
    return new HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: () => this.auth.session()?.tokens.accessToken ?? '',
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();
  }

  private registerHandlers(connection: HubConnection): void {
    const recentNotifs = new Map<string, number>();
    const receive = (payload: unknown) => {
      const normalized = normalizeNotification(payload);
      const now = Date.now();
      const key = normalized.id || `${normalized.title}|${normalized.body}`;
      const lastSeen = recentNotifs.get(key);
      if (lastSeen && now - lastSeen < 5000) return;
      recentNotifs.set(key, now);
      if (recentNotifs.size > 50) {
        for (const [k, ts] of recentNotifs) {
          if (now - ts > 10000) recentNotifs.delete(k);
        }
      }
      this.zone.run(() => this.notificationSubject.next(normalized));
    };
    connection.on('ReceiveNotification', receive);
    connection.on('NotificationReceived', receive);
    connection.on('NewNotification', receive);
    connection.on('notification', receive);

    // AI Status handler
    connection.on('AiAnalysisStatusChanged', (payload: unknown) => {
      this.zone.run(() => this.aiAnalysisStatusSubject.next(normalizeAiAnalysisStatus(payload)));
    });

    // MF02 Lifecycle & Dispatch Real-time handlers
    const emitLifecycle = (type: MissionLifecycleEventType, payload: unknown) => {
      const parsed = normalizeMissionLifecycleEvent(type, payload);
      this.zone.run(() => this.missionEventsSubject.next(parsed));
    };

    connection.on('MissionLifecycleEvent', (payload: unknown) => {
      const data = asRecord(payload);
      const type = (readString(data, 'type').toUpperCase() as MissionLifecycleEventType) || 'CONFIRMED';
      emitLifecycle(type, payload);
    });

    connection.on('ReceiveMissionLifecycleEvent', (payload: unknown) => {
      const data = asRecord(payload);
      const type = (readString(data, 'type').toUpperCase() as MissionLifecycleEventType) || 'CONFIRMED';
      emitLifecycle(type, payload);
    });

    connection.on('ReceiveMissionLifecycle', (payload: unknown) => {
      const data = asRecord(payload);
      const type = (readString(data, 'type').toUpperCase() as MissionLifecycleEventType) || 'CONFIRMED';
      emitLifecycle(type, payload);
    });

    connection.on('MissionLifecycleChanged', (payload: unknown) => {
      const data = asRecord(payload);
      const type = (readString(data, 'type').toUpperCase() as MissionLifecycleEventType) || 'CONFIRMED';
      emitLifecycle(type, payload);
    });

    connection.on('ReceiveMissionEvent', (payload: unknown) => {
      const data = asRecord(payload);
      const type = (readString(data, 'type').toUpperCase() as MissionLifecycleEventType) || 'CONFIRMED';
      emitLifecycle(type, payload);
    });

    connection.on('MissionConfirmed', (payload: unknown) => emitLifecycle('CONFIRMED', payload));
    connection.on('ReceiveMissionConfirmed', (payload: unknown) => emitLifecycle('CONFIRMED', payload));
    connection.on('MissionAccepted', (payload: unknown) => emitLifecycle('CONFIRMED', payload));
    connection.on('AssignmentAccepted', (payload: unknown) => emitLifecycle('CONFIRMED', payload));
    connection.on('ReceiveAssignmentAccepted', (payload: unknown) => emitLifecycle('CONFIRMED', payload));
    connection.on('MissionDispatched', (payload: unknown) => emitLifecycle('DISPATCHED', payload));
    connection.on('MissionAssigned', (payload: unknown) => emitLifecycle('DISPATCHED', payload));
    connection.on('MissionCreated', (payload: unknown) => emitLifecycle('DISPATCHED', payload));
    connection.on('ReceiveMissionAssigned', (payload: unknown) => emitLifecycle('DISPATCHED', payload));
    connection.on('ReceiveMissionCreated', (payload: unknown) => emitLifecycle('DISPATCHED', payload));
    connection.on('AssignmentCreated', (payload: unknown) => emitLifecycle('DISPATCHED', payload));
    connection.on('MissionSuspended', (payload: unknown) => emitLifecycle('SUSPENDED', payload));
    connection.on('MissionPostponed', (payload: unknown) => emitLifecycle('POSTPONED', payload));
    connection.on('ReceiveMissionPostponed', (payload: unknown) => emitLifecycle('POSTPONED', payload));
    connection.on('AssignmentPostponed', (payload: unknown) => emitLifecycle('POSTPONED', payload));
    connection.on('ReceiveAssignmentPostponed', (payload: unknown) => emitLifecycle('POSTPONED', payload));
    connection.on('MissionResumed', (payload: unknown) => emitLifecycle('RESUMED', payload));
    connection.on('MissionCancelled', (payload: unknown) => emitLifecycle('CANCELLED', payload));
    connection.on('MissionCommunicationReceived', (payload: unknown) => emitLifecycle('COMMUNICATION', payload));
    connection.on('MissionReminderSent', (payload: unknown) => emitLifecycle('REMINDER', payload));
    connection.on('MissionConfirmationOverdue', (payload: unknown) => emitLifecycle('OVERDUE', payload));
    connection.on('MissionUpdated', (payload: unknown) => emitLifecycle('CONFIRMED', payload));
    connection.on('ReceiveMissionUpdated', (payload: unknown) => emitLifecycle('CONFIRMED', payload));
    connection.on('DetectionReviewed', (payload: unknown) => emitLifecycle('DETECTION_REVIEWED', payload));
    connection.on('MissionMediaUploaded', (payload: unknown) => emitLifecycle('MEDIA_UPLOADED', payload));
    connection.on('MaintenanceTaskCreated', (payload: unknown) => emitLifecycle('MAINTENANCE_TASK_CREATED', payload));
    connection.on('MaintenanceTaskStatusChanged', (payload: unknown) => emitLifecycle('MAINTENANCE_TASK_STATUS_CHANGED', payload));
    connection.on('EmergencyAlert', (payload: unknown) => emitLifecycle('EMERGENCY_ALERT', payload));
    connection.on('EmergencyAlertTriggered', (payload: unknown) => emitLifecycle('EMERGENCY_ALERT', payload));

    // MF01 Pre-Mission Assessment Real-time handlers
    const emitAssessment = (defaultType: AssessmentRealtimeEventType, payload: unknown) => {
      const parsed = normalizeAssessmentRealtimeEvent(defaultType, payload);
      this.zone.run(() => this.assessmentEventsSubject.next(parsed));
    };

    connection.on('AssessmentRealtimeEvent', (payload: unknown) => {
      const data = asRecord(payload);
      const type = readFirstString(data, ['type', 'Type'], 'AssessmentStatusChanged');
      emitAssessment(type, payload);
    });
    connection.on('AssessmentStatusChanged', (payload: unknown) => emitAssessment('AssessmentStatusChanged', payload));
    connection.on('DroneInspectionCompleted', (payload: unknown) => emitAssessment('DroneInspectionCompleted', payload));
    connection.on('AssessmentCompleted', (payload: unknown) => emitAssessment('AssessmentCompleted', payload));
    connection.on('MeteoAlertTriggered', (payload: unknown) => emitAssessment('MeteoAlertTriggered', payload));

    connection.onreconnecting(() => this.zone.run(() => this.statusSubject.next('reconnecting')));
    connection.onreconnected(() => {
      this.zone.run(() => {
        this.statusSubject.next('connected');
        for (const mId of this.activeMissionGroups) {
          this.joinMission(mId);
        }
      });
    });
    connection.onclose(() => this.zone.run(() => this.statusSubject.next('disconnected')));
  }
}

const optionalFirstString = (source: Record<string, unknown> | null, keys: readonly string[]): string | undefined =>
  readFirstString(source, keys) || undefined;

const optionalFirstNumber = (source: Record<string, unknown> | null, keys: readonly string[]): number | undefined => {
  for (const key of keys) {
    const val = readOptionalNumber(source, key);
    if (val !== null) return val;
  }
  return undefined;
};

const normalizeAiAnalysisStatus = (payload: unknown): AiAnalysisStatusChangedEvent => {
  const source = asRecord(payload);
  return {
    requestId: readFirstString(source, ['requestId', 'RequestId']),
    batchId: readFirstString(source, ['batchId', 'BatchId']),
    missionId: readFirstString(source, ['missionId', 'MissionId']),
    mediaId: readFirstString(source, ['mediaId', 'MediaId']),
    mediaType: readFirstString(source, ['mediaType', 'MediaType']),
    status: readFirstString(source, ['status', 'Status']),
    savedDetections: readFirstNumber(source, ['savedDetections', 'SavedDetections']),
    createdAlerts: readFirstNumber(source, ['createdAlerts', 'CreatedAlerts']),
    errorCode: readFirstString(source, ['errorCode', 'ErrorCode']),
    errorMessage: readFirstString(source, ['errorMessage', 'ErrorMessage']),
    createdAt: readFirstString(source, ['createdAt', 'CreatedAt']),
    completedAt: readFirstString(source, ['completedAt', 'CompletedAt']),
  };
};

function normalizeMissionLifecycleEvent(
  defaultType: MissionLifecycleEventType,
  payload: unknown
): MissionLifecycleRealtimeEvent {
  const raw = asRecord(payload);
  const source = asRecord(raw?.['data']) ?? raw;
  const rawType = readFirstString(source, ['type', 'Type', 'eventType', 'EventType']).toUpperCase();
  let type: MissionLifecycleEventType = defaultType;
  if (rawType === 'ASSIGNED' || rawType === 'CREATED' || rawType === 'DISPATCHED' || rawType === 'MISSIONDISPATCHED' || rawType === 'MISSIONASSIGNED' || rawType === 'MISSIONCREATED') {
    type = 'DISPATCHED';
  } else if (rawType) {
    type = rawType as MissionLifecycleEventType;
  }
  const missionId = readFirstString(source, ['missionId', 'MissionId', 'id', 'Id', 'entityId', 'EntityId']);
  const actorRole = (readFirstString(source, ['actorRole', 'ActorRole', 'senderRole', 'SenderRole']).toUpperCase() as 'MANAGER' | 'INSPECTOR' | 'SYSTEM') || undefined;
  const actorName = optionalFirstString(source, ['actorName', 'ActorName', 'senderName', 'SenderName']);
  const reason = optionalFirstString(source, ['reason', 'Reason']);
  const message = optionalFirstString(source, ['message', 'Message', 'content', 'Content']);
  const timestamp = readFirstString(source, ['timestamp', 'Timestamp'], new Date().toISOString());

  let log: MissionCommunicationLog | undefined = undefined;
  const logRecord = asRecord(source?.['log']);
  if (logRecord) {
    log = {
      id: readString(logRecord, 'id', `log-${Date.now()}`),
      senderId: readString(logRecord, 'senderId', 'user'),
      senderName: readString(logRecord, 'senderName', actorName || 'Hệ thống'),
      senderRole: (readString(logRecord, 'senderRole').toUpperCase() as 'MANAGER' | 'INSPECTOR' | 'SYSTEM') || 'SYSTEM',
      type: (readString(logRecord, 'type').toUpperCase() as MissionCommunicationLog['type']) || 'DISPATCH',
      content: readString(logRecord, 'content', message || ''),
      timestamp: readString(logRecord, 'timestamp', timestamp),
    };
  } else if (message) {
    log = {
      id: `log-${Date.now()}`,
      senderId: readFirstString(source, ['actorId', 'ActorId'], 'user'),
      senderName: actorName || (actorRole === 'MANAGER' ? 'Quản lý vận hành' : 'Thanh tra viên'),
      senderRole: actorRole || 'SYSTEM',
      type: type === 'CONFIRMED' ? 'CONFIRM' : type === 'REMINDER' ? 'REMINDER' : type === 'SUSPENDED' ? 'SUSPEND' : type === 'POSTPONED' ? 'POSTPONE' : 'DISPATCH',
      content: message,
      timestamp,
    };
  }

  const assignmentId = optionalFirstString(source, ['assignmentId', 'AssignmentId']);
  const allConfirmed = source?.['allConfirmed'] !== undefined ? Boolean(source['allConfirmed']) : (source?.['AllConfirmed'] !== undefined ? Boolean(source['AllConfirmed']) : undefined);
  const confirmedCount = optionalFirstNumber(source, ['confirmedCount', 'ConfirmedCount']);
  const totalRequiredCount = optionalFirstNumber(source, ['totalRequiredCount', 'TotalRequiredCount']);
  const rawPending = source?.['pendingRoles'] ?? source?.['PendingRoles'];
  const pendingRoles = Array.isArray(rawPending) ? readArray(rawPending).map(String) : undefined;
  const detectionId = optionalFirstString(source, ['detectionId', 'DetectionId', 'anomalyId', 'AnomalyId']);
  const taskId = optionalFirstString(source, ['taskId', 'TaskId', 'maintenanceTaskId', 'MaintenanceTaskId']);

  return {
    missionId,
    type,
    status: optionalFirstString(source, ['status', 'Status']),
    assignmentId,
    confirmationDeadline: optionalFirstString(source, ['confirmationDeadline', 'ConfirmationDeadline']),
    managerInstructions: optionalFirstString(source, ['managerInstructions', 'ManagerInstructions']),
    actorId: optionalFirstString(source, ['actorId', 'ActorId']),
    actorName,
    actorRole,
    allConfirmed,
    confirmedCount,
    totalRequiredCount,
    pendingRoles,
    reason,
    message,
    log,
    detectionId,
    taskId,
    timestamp,
    mission: asRecord(source?.['mission']) ? (source?.['mission'] as Partial<Mission>) : undefined,
  };
}

function normalizeAssessmentRealtimeEvent(
  defaultType: AssessmentRealtimeEventType,
  payload: unknown
): AssessmentRealtimeEvent {
  const raw = asRecord(payload);
  const source = asRecord(raw?.['data']) ?? raw;
  const type = readFirstString(source, ['type', 'Type'], defaultType);
  const assessmentId = readFirstString(source, ['assessmentId', 'AssessmentId', 'id', 'Id']);
  return {
    assessmentId,
    type,
    status: optionalFirstString(source, ['status', 'Status']),
    droneId: optionalFirstString(source, ['droneId', 'DroneId']),
    droneCode: optionalFirstString(source, ['droneCode', 'DroneCode']),
    technicalHealth: optionalFirstString(source, ['technicalHealth', 'TechnicalHealth']),
    technicalStatus: optionalFirstString(source, ['technicalStatus', 'TechnicalStatus']),
    consumedMissionId: optionalFirstString(source, ['completedMissionId', 'CompletedMissionId', 'consumedMissionId', 'ConsumedMissionId']),
    consumedMissionCode: optionalFirstString(source, ['completedMissionCode', 'CompletedMissionCode', 'consumedMissionCode', 'ConsumedMissionCode']),
    completedMissionId: optionalFirstString(source, ['completedMissionId', 'CompletedMissionId', 'consumedMissionId', 'ConsumedMissionId']),
    completedMissionCode: optionalFirstString(source, ['completedMissionCode', 'CompletedMissionCode', 'consumedMissionCode', 'ConsumedMissionCode']),
    windSpeed: optionalFirstNumber(source, ['windSpeed', 'WindSpeed']),
    windGust: optionalFirstNumber(source, ['windGust', 'WindGust']),
    isMeteoSafe: source?.['isMeteoSafe'] !== undefined ? Boolean(source['isMeteoSafe']) : (source?.['IsMeteoSafe'] !== undefined ? Boolean(source['IsMeteoSafe']) : undefined),
    message: optionalFirstString(source, ['message', 'Message']),
    actorId: optionalFirstString(source, ['actorId', 'ActorId']),
    actorName: optionalFirstString(source, ['actorName', 'ActorName']),
    actorRole: optionalFirstString(source, ['actorRole', 'ActorRole']),
    timestamp: readFirstString(source, ['timestamp', 'Timestamp'], new Date().toISOString()),
  };
}
