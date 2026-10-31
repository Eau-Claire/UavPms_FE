import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Auth } from '../../../../core/auth/auth';
import { AnomalyApi, normalizeAnomalyItem } from '../../../analyst-review/data-access/anomaly-api';
import { EmergencyAlertsApi } from '../../../emergency-alerts/data-access/emergency-alerts-api';
import { ActiveEmergencyAlert } from '../../../emergency-alerts/models/emergency-alert.models';
import { MonitorApi } from '../../data-access/monitor-api';
import { AnalystHome } from './analyst-home';

const anomalies = Array.from({ length: 5 }, (_, i) =>
  normalizeAnomalyItem({ id: `an-${i}`, categoryName: `Ăn mòn ${i}`, towerCode: `T-0${i}`, confidenceScore: 0.9, validationStatus: 'Pending', createdAt: '2026-10-31T01:00:00Z' }, i),
);

const emergency = (id: string, priority: ActiveEmergencyAlert['priority'], triggeredAt: string): ActiveEmergencyAlert => ({
  id,
  anomalyId: `an-${id}`,
  towerId: null,
  towerCode: `T-${id}`,
  alertType: 'Fire',
  categoryName: 'Cháy cách điện',
  priority,
  status: 'Active',
  deliveryLatencySeconds: 2,
  triggeredAt,
  location: { latitude: null, longitude: null, towerCode: `T-${id}` },
  evidence: { mediaUrl: null, boundingBox: null, confidenceScore: 95 },
});

async function setup() {
  const anomalyApi = { listPending: vi.fn().mockReturnValue(of({ items: anomalies, totalCount: 17, pageIndex: 1, pageSize: 5, totalPages: 4 })) };
  const emergencyApi = {
    fetchActiveAlerts: vi.fn().mockReturnValue(of([emergency('e1', 'High', '2026-10-31T01:00:00Z'), emergency('e2', 'Critical', '2026-10-31T02:00:00Z')])),
  };
  const monitorApi = {
    getAlerts: vi.fn().mockReturnValue(of([])),
    getRecentDefects: vi.fn().mockReturnValue(
      of({ items: [{ id: 'd1', missionId: 'm1', missionName: 'Tuyến 110kV A', defectType: 'Ăn mòn', detectedAt: '2026-10-30T00:00:00Z' }], page: 1, pageSize: 5, totalCount: 1, totalPages: 1 }),
    ),
  };
  await TestBed.configureTestingModule({
    imports: [AnalystHome],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AnomalyApi, useValue: anomalyApi },
      { provide: EmergencyAlertsApi, useValue: emergencyApi },
      { provide: MonitorApi, useValue: monitorApi },
      { provide: Auth, useValue: { user: signal({ id: 'u-analyst', email: 'analyst@evn.vn', fullName: 'Trần Thị Phân Tích', role: 'Analyst', mustChangePassword: false }) } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AnalystHome);
  fixture.detectChanges();
  await fixture.whenStable();
  return { el: fixture.nativeElement as HTMLElement, anomalyApi, monitorApi };
}

describe('AnalystHome', () => {
  it('shows the pending AI detections count and the top 5 with review links', async () => {
    const { el, anomalyApi } = await setup();
    expect(anomalyApi.listPending).toHaveBeenCalledWith({ pageIndex: 1, pageSize: 5 });
    expect(el.textContent).toContain('Chuyên viên phân tích');

    const pending = el.querySelector('[aria-labelledby="analyst-pending-title"]') as HTMLElement;
    expect(pending.querySelector('.group-count')?.textContent?.trim()).toBe('17');
    const links = Array.from(pending.querySelectorAll('a.action-link')).map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/ai-review/an-0', '/ai-review/an-1', '/ai-review/an-2', '/ai-review/an-3', '/ai-review/an-4']);
    expect(pending.querySelector('header a')?.getAttribute('href')).toBe('/ai-review');
    expect(pending.textContent).toContain('Còn 12 phát hiện khác');
  });

  it('lists active emergency alerts, newest first, linking to the alerts page', async () => {
    const { el } = await setup();
    const section = el.querySelector('[aria-labelledby="analyst-emergency-title"]') as HTMLElement;
    expect(section.querySelector('.group-count')?.textContent?.trim()).toBe('2');
    const items = Array.from(section.querySelectorAll('li.item'));
    expect(items[0].textContent).toContain('Nghiêm trọng');
    expect(items[0].textContent).toContain('T-e2');
    expect(items[0].querySelector('a')?.getAttribute('href')).toBe('/emergency-alerts');
  });

  it('keeps the system recent-defects table', async () => {
    const { el, monitorApi } = await setup();
    expect(monitorApi.getRecentDefects).toHaveBeenCalledWith(1, 5);
    expect(el.querySelector('app-recent-defects-table')?.textContent).toContain('Tuyến 110kV A');
  });
});
