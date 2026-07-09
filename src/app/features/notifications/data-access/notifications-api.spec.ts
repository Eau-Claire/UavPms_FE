import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { NotificationsApi } from './notifications-api';

describe('NotificationsApi', () => {
  let api: NotificationsApi;
  let http: HttpTestingController;
  const baseUrl = `${environment.apiBaseUrl}/notifications`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(NotificationsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads notification history with userId filter', () => {
    let result: unknown;
    api.getHistory('user-1').subscribe((value) => result = value);

    const request = http.expectOne((item) => item.url === `${baseUrl}/history`);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('userId')).toBe('user-1');
    request.flush({ data: [{ id: 'n1', title: 'Mission updated', body: 'Review flight plan', type: 'Mission', isRead: false, createdAt: '2026-06-26T01:00:00Z' }] });

    expect(result).toEqual([{ id: 'n1', title: 'Mission updated', body: 'Review flight plan', type: 'Mission', isRead: false, createdAt: '2026-06-26T01:00:00Z', userId: undefined, referenceType: undefined, referenceId: undefined }]);
  });

  it('loads notification history without userId filter', () => {
    let result: unknown;
    api.getHistory().subscribe((value) => result = value);

    const request = http.expectOne(`${baseUrl}/history`);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.has('userId')).toBe(false);
    request.flush({ data: [] });

    expect(result).toEqual([]);
  });

  it('normalizes raw array history responses', () => {
    let result: unknown;
    api.getHistory().subscribe((value) => result = value);

    const request = http.expectOne(`${baseUrl}/history`);
    request.flush([{ id: 'n1', title: 'Raw item', body: 'Body', createdAt: '2026-06-26T01:00:00Z' }]);

    expect(result).toEqual([expect.objectContaining({ id: 'n1', title: 'Raw item', body: 'Body' })]);
  });

  it.each(['items', 'results', 'records', 'notifications', 'data'])('normalizes history responses from %s collection key', (key) => {
    let result: unknown;
    api.getHistory().subscribe((value) => result = value);

    const request = http.expectOne(`${baseUrl}/history`);
    request.flush({ data: { [key]: [{ id: key, title: key, body: 'Body' }] } });

    expect(result).toEqual([expect.objectContaining({ id: key, title: key, body: 'Body' })]);
  });

  it('normalizes alternate notification field names', () => {
    let result: unknown;
    api.getHistory().subscribe((value) => result = value);

    const request = http.expectOne(`${baseUrl}/history`);
    request.flush({
      data: [{
        notificationId: 'n-alt',
        recipientId: 'user-2',
        notificationType: 'Mention',
        entityType: 'Ticket',
        entityId: 'TC-42',
        subject: 'Alternate title',
        message: 'Alternate body',
        timestamp: '2026-06-26T03:00:00Z',
        seen: true,
      }],
    });

    expect(result).toEqual([{
      id: 'n-alt',
      userId: 'user-2',
      type: 'Mention',
      referenceType: 'Ticket',
      referenceId: 'TC-42',
      title: 'Alternate title',
      body: 'Alternate body',
      createdAt: '2026-06-26T03:00:00Z',
      isRead: true,
    }]);
  });

  it.each([
    ['createdTime', '2026-06-26T04:00:00Z'],
    ['createdDate', '2026-06-26T05:00:00Z'],
    ['sentAt', '2026-06-26T06:00:00Z'],
  ])('normalizes %s as createdAt', (field, value) => {
    let result: unknown;
    api.getHistory().subscribe((next) => result = next);

    const request = http.expectOne(`${baseUrl}/history`);
    request.flush({ data: [{ id: field, title: field, [field]: value }] });

    expect(result).toEqual([expect.objectContaining({ id: field, createdAt: value })]);
  });

  it.each([
    ['isRead true boolean', { isRead: true }],
    ['read true string', { read: 'true' }],
    ['seen numeric one', { seen: 1 }],
    ['readAt present', { readAt: '2026-06-26T02:00:00Z' }],
    ['readTime present', { readTime: '2026-06-26T02:00:00Z' }],
  ])('normalizes read state from %s', (_label, patch) => {
    let result: unknown;
    api.getHistory().subscribe((value) => result = value);

    const request = http.expectOne(`${baseUrl}/history`);
    request.flush({ data: [{ id: 'n-read', title: 'Read', ...patch }] });

    expect(result).toEqual([expect.objectContaining({ id: 'n-read', isRead: true })]);
  });

  it('defaults missing optional and content fields', () => {
    let result: unknown;
    api.getHistory().subscribe((value) => result = value);

    const request = http.expectOne(`${baseUrl}/history`);
    request.flush({ data: [{}] });

    expect(result).toEqual([{
      id: '',
      userId: undefined,
      type: undefined,
      referenceType: undefined,
      referenceId: undefined,
      title: 'Notification',
      body: '',
      createdAt: new Date(0).toISOString(),
      isRead: false,
    }]);
  });

  it('returns empty history for non-array wrapper values', () => {
    let result: unknown;
    api.getHistory().subscribe((value) => result = value);

    const request = http.expectOne(`${baseUrl}/history`);
    request.flush({ data: { items: null } });

    expect(result).toEqual([]);
  });

  it('loads notification detail', () => {
    let result: unknown;
    api.getById('n1').subscribe((value) => result = value);

    const request = http.expectOne(`${baseUrl}/n1`);
    expect(request.request.method).toBe('GET');
    request.flush({ data: { id: 'n1', subject: 'Alert', message: 'Line fault', readAt: '2026-06-26T02:00:00Z' } });

    expect(result).toEqual(expect.objectContaining({ id: 'n1', title: 'Alert', body: 'Line fault', isRead: true }));
  });

  it('loads notification detail from non-enveloped response', () => {
    let result: unknown;
    api.getById('n1').subscribe((value) => result = value);

    const request = http.expectOne(`${baseUrl}/n1`);
    request.flush({ id: 'n1', title: 'Direct detail', content: 'Direct body', read: false });

    expect(result).toEqual(expect.objectContaining({ id: 'n1', title: 'Direct detail', body: 'Direct body', isRead: false }));
  });

  it('marks notification as read', () => {
    let result: unknown;
    api.markRead('n1').subscribe((value) => result = value);

    const request = http.expectOne(`${baseUrl}/n1/read`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toBeNull();
    request.flush({ data: { id: 'n1', title: 'Read', isRead: true } });

    expect(result).toEqual(expect.objectContaining({ id: 'n1', title: 'Read', isRead: true }));
  });

  it('uses fallback id for sparse mark-read responses', () => {
    let result: unknown;
    api.markRead('n1').subscribe((value) => result = value);

    const request = http.expectOne(`${baseUrl}/n1/read`);
    request.flush({ data: { isRead: true } });

    expect(result).toEqual(expect.objectContaining({ id: 'n1', isRead: true }));
  });

  it('deletes notification', () => {
    api.delete('n1').subscribe();

    const request = http.expectOne(`${baseUrl}/n1`);
    expect(request.request.method).toBe('DELETE');
    request.flush({ success: true });
  });
});
