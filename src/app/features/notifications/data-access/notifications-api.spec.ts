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

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(NotificationsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads notification history with userId filter', () => {
    let result: unknown;
    api.getHistory('user-1').subscribe((value) => result = value);

    const request = http.expectOne((item) => item.url === `${environment.apiBaseUrl}/notifications/history`);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('userId')).toBe('user-1');
    request.flush({ data: [{ id: 'n1', title: 'Mission updated', body: 'Review flight plan', type: 'Mission', isRead: false, createdAt: '2026-06-26T01:00:00Z' }] });

    expect(result).toEqual([{ id: 'n1', title: 'Mission updated', body: 'Review flight plan', type: 'Mission', isRead: false, createdAt: '2026-06-26T01:00:00Z', userId: undefined, referenceType: undefined, referenceId: undefined }]);
  });

  it('loads notification detail', () => {
    let result: unknown;
    api.getById('n1').subscribe((value) => result = value);

    const request = http.expectOne(`${environment.apiBaseUrl}/notifications/n1`);
    expect(request.request.method).toBe('GET');
    request.flush({ data: { id: 'n1', subject: 'Alert', message: 'Line fault', readAt: '2026-06-26T02:00:00Z' } });

    expect(result).toEqual(expect.objectContaining({ id: 'n1', title: 'Alert', body: 'Line fault', isRead: true }));
  });

  it('marks notification as read', () => {
    api.markRead('n1').subscribe();

    const request = http.expectOne(`${environment.apiBaseUrl}/notifications/n1/read`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toBeNull();
    request.flush({ data: { id: 'n1', title: 'Read', isRead: true } });
  });

  it('deletes notification', () => {
    api.delete('n1').subscribe();

    const request = http.expectOne(`${environment.apiBaseUrl}/notifications/n1`);
    expect(request.request.method).toBe('DELETE');
    request.flush({ success: true });
  });
});
