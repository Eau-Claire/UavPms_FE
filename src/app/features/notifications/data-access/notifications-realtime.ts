import { Injectable, NgZone, inject } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Auth } from '../../../core/auth/auth';
import { AppNotification } from '../../../models/notification.models';
import { normalizeNotification } from './notifications-api';

export type AiAnalysisRealtimeStatus = 'Pending' | 'Completed' | 'Failed' | string;

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

@Injectable({
  providedIn: 'root',
})
export class NotificationsRealtime {
  private readonly auth = inject(Auth);
  private readonly zone = inject(NgZone);
  private readonly notificationSubject = new Subject<AppNotification>();
  private readonly aiAnalysisStatusSubject = new Subject<AiAnalysisStatusChangedEvent>();
  private readonly statusSubject = new Subject<'connected' | 'disconnected' | 'reconnecting'>();
  private connection: HubConnection | null = null;
  private starting: Promise<void> | null = null;

  readonly notifications$ = this.notificationSubject.asObservable();
  readonly aiAnalysisStatus$ = this.aiAnalysisStatusSubject.asObservable();
  readonly status$ = this.statusSubject.asObservable();

  connect(): void {
    if (this.connection?.state === HubConnectionState.Connected || this.starting) return;
    this.connection = this.buildConnection();
    this.registerHandlers(this.connection);
    this.starting = this.connection
      .start()
      .then(() => this.zone.run(() => this.statusSubject.next('connected')))
      .catch(() => this.zone.run(() => this.statusSubject.next('disconnected')))
      .finally(() => {
        this.starting = null;
      });
  }

  disconnect(): void {
    const connection = this.connection;
    this.connection = null;
    this.starting = null;
    void connection?.stop();
  }

  private buildConnection(): HubConnection {
    return new HubConnectionBuilder()
      .withUrl(environment.notificationsHubUrl, {
        accessTokenFactory: () => this.auth.session()?.tokens.accessToken ?? '',
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();
  }

  private registerHandlers(connection: HubConnection): void {
    const receive = (payload: unknown) => this.zone.run(() => this.notificationSubject.next(normalizeNotification(payload)));
    connection.on('ReceiveNotification', receive);
    connection.on('NotificationReceived', receive);
    connection.on('NewNotification', receive);
    connection.on('notification', receive);
    connection.on('AiAnalysisStatusChanged', (payload: unknown) => {
      this.zone.run(() => this.aiAnalysisStatusSubject.next(normalizeAiAnalysisStatus(payload)));
    });
    connection.onreconnecting(() => this.zone.run(() => this.statusSubject.next('reconnecting')));
    connection.onreconnected(() => this.zone.run(() => this.statusSubject.next('connected')));
    connection.onclose(() => this.zone.run(() => this.statusSubject.next('disconnected')));
  }
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? value as Record<string, unknown> : {};

const pick = (source: Record<string, unknown>, ...keys: string[]) =>
  keys.map((key) => source[key]).find((value) => value !== undefined && value !== null);

const stringValue = (value: unknown) => value === undefined || value === null ? '' : String(value);

const numberValue = (value: unknown) => Number(value ?? 0) || 0;

const normalizeAiAnalysisStatus = (payload: unknown): AiAnalysisStatusChangedEvent => {
  const source = record(payload);
  return {
    requestId: stringValue(pick(source, 'requestId', 'RequestId')),
    batchId: stringValue(pick(source, 'batchId', 'BatchId')),
    missionId: stringValue(pick(source, 'missionId', 'MissionId')),
    mediaId: stringValue(pick(source, 'mediaId', 'MediaId')),
    mediaType: stringValue(pick(source, 'mediaType', 'MediaType')),
    status: stringValue(pick(source, 'status', 'Status')),
    savedDetections: numberValue(pick(source, 'savedDetections', 'SavedDetections')),
    createdAlerts: numberValue(pick(source, 'createdAlerts', 'CreatedAlerts')),
    errorCode: stringValue(pick(source, 'errorCode', 'ErrorCode')),
    errorMessage: stringValue(pick(source, 'errorMessage', 'ErrorMessage')),
    createdAt: stringValue(pick(source, 'createdAt', 'CreatedAt')),
    completedAt: stringValue(pick(source, 'completedAt', 'CompletedAt')),
  };
};
