import '@angular/compiler';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { alertErrorMessage, EmergencyAlertsApi, parseAlertBoundingBox } from './emergency-alerts-api';

describe('EmergencyAlertsApi', () => {
  let api: EmergencyAlertsApi;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/alerts`;

  const activeAlert = {
    id: 'a1',
    anomalyId: 'an1',
    towerId: 't1',
    towerCode: 'NPC_HP_01_001',
    alertType: 'Vỡ bát sứ',
    categoryName: 'Vỡ bát sứ cách điện',
    priority: 'Critical',
    status: 'Active',
    deliveryLatencySeconds: 3,
    triggeredAt: '2026-10-30T08:00:00Z',
    location: { latitude: 20.86, longitude: 106.68, towerCode: 'NPC_HP_01_001' },
    evidence: { mediaUrl: 'https://cdn/img.jpg', boundingBox: '{"x":0.4,"y":0.5,"width":0.1,"height":0.2}', confidenceScore: 0.94 },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(EmergencyAlertsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the raw active alert array and updates the shared count', () => {
    api.fetchActiveAlerts().subscribe();
    http.expectOne(`${base}/active`).flush([activeAlert]);

    const [alert] = api.activeAlerts();
    expect(api.activeCount()).toBe(1);
    expect(alert.towerCode).toBe('NPC_HP_01_001');
    expect(alert.evidence.confidenceScore).toBe(94);
    expect(alert.evidence.boundingBox).toEqual({ x: 40, y: 50, width: 10, height: 20, isNormalized: true });
    expect(alert.location.latitude).toBe(20.86);
  });

  it('propagates errors instead of falling back to local data', () => {
    let error: unknown;
    api.fetchActiveAlerts().subscribe({ error: (err) => (error = err) });
    http.expectOne(`${base}/active`).flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect(api.activeAlerts()).toEqual([]);
  });

  it('reads the raw paged history with status filter', () => {
    let total = 0;
    api.fetchAlertHistory({ status: 'Escalated', page: 2, pageSize: 5 }).subscribe((page) => (total = page.totalCount));
    const req = http.expectOne((r) => r.url === base);
    expect(req.request.params.get('status')).toBe('Escalated');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('5');
    req.flush({ totalCount: 7, page: 2, pageSize: 5, items: [{ id: 'h1', towerCode: 'T1', alertType: 'x', priority: 'High', status: 'Escalated', triggeredAt: '2026-10-30T08:00:00Z', resolvedAt: null, reviewedBy: 'Analyst A', notes: 'n' }] });
    expect(total).toBe(7);
  });

  it('removes a reviewed alert from the active list (204 response)', () => {
    api.fetchActiveAlerts().subscribe();
    http.expectOne(`${base}/active`).flush([activeAlert]);

    api.reviewAlert('a1', { status: 'Dismissed', notes: 'false positive' }).subscribe();
    const req = http.expectOne(`${base}/a1/review`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ status: 'Dismissed', notes: 'false positive' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(api.activeCount()).toBe(0);
  });

  it('returns the raw escalation (201)', () => {
    let name = '';
    api.escalateAlert('a1', { escalatedToUserId: 'u2', reason: 'urgent reason' }).subscribe((e) => (name = e.escalatedToName));
    http.expectOne(`${base}/a1/escalate`).flush(
      { id: 'e1', escalatedBy: 'u1', escalatedByName: 'A', escalatedTo: 'u2', escalatedToName: 'Manager B', reason: 'urgent reason', escalatedAt: '2026-10-30T09:00:00Z' },
      { status: 201, statusText: 'Created' },
    );
    expect(name).toBe('Manager B');
  });

  it('maps backend error codes to Vietnamese messages', () => {
    const conflict = new HttpErrorResponse({ status: 409, error: { success: false, errorCode: 'ALERT_ALREADY_ACTIVE' } });
    const self = new HttpErrorResponse({ status: 400, error: { success: false, errorCode: 'INVALID_ESCALATION_TARGET' } });
    expect(alertErrorMessage(conflict, 'x')).toContain('đã có một cảnh báo');
    expect(alertErrorMessage(self, 'x')).toContain('chính bạn');
  });

  it('keeps pixel bounding boxes as pixels', () => {
    expect(parseAlertBoundingBox('[120, 80, 40, 30]')).toEqual({ x: 120, y: 80, width: 40, height: 30, isNormalized: false });
    expect(parseAlertBoundingBox('not json')).toBeNull();
  });
});
