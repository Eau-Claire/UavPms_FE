import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { AppNotification } from '../../../models/notification.models';
import { asRecord, readArray, readFirstString } from '../../../shared/utils';

@Injectable({
  providedIn: 'root',
})
export class NotificationsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/notifications`;

  getHistory(userId?: string) {
    let params = new HttpParams().set('limit', '50');
    if (userId) params = params.set('userId', userId);
    return this.http
      .get<unknown>(`${this.baseUrl}/history`, { params })
      .pipe(
        catchError(() => this.http.get<unknown>(this.baseUrl, { params })),
        map((response) => normalizeArray(unwrapApiData(response)).map((item) => normalizeNotification(item)))
      );
  }

  getById(id: string) {
    return this.http
      .get<unknown>(`${this.baseUrl}/${id}`)
      .pipe(map((response) => normalizeNotification(unwrapApiData(response))));
  }

  markRead(id: string) {
    return this.http
      .put<unknown>(`${this.baseUrl}/${id}/read`, null)
      .pipe(map((response) => normalizeNotification(unwrapApiData(response), id)));
  }

  delete(id: string) {
    return this.http.delete<unknown>(`${this.baseUrl}/${id}`);
  }
}

const pick = (source: Record<string, unknown> | null, ...keys: string[]) =>
  keys.map((key) => source?.[key]).find((value) => value !== undefined && value !== null);

const boolValue = (value: unknown) => value === true || value === 'true' || value === 1;

const normalizeArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  const source = asRecord(value);
  const list = pick(source, 'items', 'results', 'records', 'notifications', 'data', 'Items', 'Results', 'Records', 'Notifications', 'Data');
  return readArray(list);
};

const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

export const normalizeNotification = (value: unknown, fallbackId = ''): AppNotification => {
  const source = asRecord(value);
  const id = readFirstString(source, ['id', 'notificationId', 'Id', 'NotificationId'], fallbackId);
  const createdAt = readFirstString(
    source,
    ['createdAt', 'createdTime', 'createdDate', 'timestamp', 'sentAt', 'CreatedAt', 'Timestamp'],
    new Date(0).toISOString(),
  );
  const readAt = pick(source, 'readAt', 'readTime', 'ReadAt', 'ReadTime');
  const rawRefId = readFirstString(source, ['referenceId', 'entityId', 'ReferenceId', 'EntityId']);
  const referenceId = !rawRefId || rawRefId === EMPTY_GUID ? undefined : rawRefId;
  return {
    id,
    userId: readFirstString(source, ['userId', 'recipientId', 'UserId', 'RecipientId']) || undefined,
    type: readFirstString(source, ['type', 'notificationType', 'Type', 'NotificationType']) || undefined,
    referenceType: readFirstString(source, ['referenceType', 'entityType', 'ReferenceType', 'EntityType']) || undefined,
    referenceId,
    title: readFirstString(source, ['title', 'subject', 'Title', 'Subject'], 'Notification'),
    body: readFirstString(source, ['body', 'message', 'content', 'description', 'Body', 'Message', 'Content', 'Description']),
    createdAt,
    isRead: boolValue(pick(source, 'isRead', 'read', 'seen', 'IsRead', 'Read', 'Seen')) || Boolean(readAt),
  };
};
