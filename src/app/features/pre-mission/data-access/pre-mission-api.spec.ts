import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { buildInspectionChecklist } from './inspection-checklist';
import { PreMissionApi } from './pre-mission-api';

const ID = '11111111-1111-4111-8111-111111111111';
const URL = `${environment.apiBaseUrl}/pre-mission-assessments`;

const assessmentDto = (droneCandidates: unknown[] = []) => ({
  id: ID,
  assessmentCode: 'PMA-1',
  status: 'Ready',
  plannedStart: '2099-01-01T01:00:00Z',
  plannedEnd: '2099-01-01T05:00:00Z',
  personnelCandidates: [],
  droneCandidates,
});

describe('PreMissionApi', () => {
  let api: PreMissionApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(PreMissionApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('refreshes candidates with POST /re-evaluate (GET /resource-readiness is read-only)', () => {
    let status = '';
    api.reEvaluate(ID).subscribe((a) => (status = a.status));
    const req = http.expectOne(`${URL}/${ID}/re-evaluate`);
    expect(req.request.method).toBe('POST');
    req.flush(assessmentDto());
    expect(status).toBe('READY');
  });

  it('derives availability and technical eligibility of UAV candidates from reasonCode', () => {
    let drones: { id: string; isAvailable?: boolean; technicalEligibility?: string }[] = [];
    api.get(ID).subscribe((a) => (drones = [...a.uavCandidates]));
    http.expectOne(`${URL}/${ID}`).flush(
      assessmentDto([
        { droneId: 'ok', isEligible: true, operationalStatus: 'Available', technicalHealth: 'Healthy', technicalInspectionId: 'i1' },
        { droneId: 'noinsp', operationalStatus: 'Available', technicalHealth: 'Healthy', reasonCode: 'NO_VALID_TECHNICAL_INSPECTION' },
        { droneId: 'busy', operationalStatus: 'Unavailable', technicalHealth: 'Unknown', reasonCode: 'SCHEDULE_CONFLICT' },
        { droneId: 'scope', operationalStatus: 'Available', technicalHealth: 'Healthy', technicalInspectionId: 'i2', reasonCode: 'SCOPE_EXCEEDS_CAPABILITY', suitability: 'UNSUITABLE' },
      ]),
    );
    const byId = Object.fromEntries(drones.map((d) => [d.id, d]));
    expect(byId['ok']).toMatchObject({ isAvailable: true, technicalEligibility: 'ELIGIBLE' });
    expect(byId['noinsp']).toMatchObject({ isAvailable: true, technicalEligibility: 'REQUIRES_INSPECTION' });
    expect(byId['busy']).toMatchObject({ isAvailable: false, technicalEligibility: 'REQUIRES_INSPECTION' });
    expect(byId['scope']).toMatchObject({ isAvailable: true, technicalEligibility: 'ELIGIBLE' });
  });

  it('sends create-mission with one UAV, required flags, an ISO UTC deadline and trimmed instructions', () => {
    api
      .createMission({
        assessmentId: ID,
        title: 'Kiểm tra tuyến A',
        personnel: [{ userId: 'u1', role: 'INSPECTOR', isRequired: true }],
        droneIds: ['d1'],
        priority: 'NORMAL',
        objective: 'PERIODIC_INSPECTION',
        isImmediate: false,
        idempotencyKey: 'k1',
        confirmationDeadline: '2099-01-01T00:30:00+07:00',
        managerInstructions: '  Mang thêm pin  ',
      })
      .subscribe();
    const req = http.expectOne(`${URL}/${ID}/create-mission`);
    expect(req.request.body.droneIds).toEqual(['d1']);
    expect(req.request.body.personnel[0].isRequired).toBe(true);
    expect(req.request.body.confirmationDeadline).toBe('2098-12-31T17:30:00.000Z');
    expect(req.request.body.managerInstructions).toBe('Mang thêm pin');
    req.flush({ id: 'm1', missionCode: 'MS-1', title: 'x', status: 'PendingAcceptance' });
  });

  it('submits a technical inspection with a non-empty checklist and the inspected droneId', () => {
    const metrics = buildInspectionChecklist({ preset: 'healthy', batteryLevel: 90, gpsSatellites: 20, rfLinkQuality: 95 });
    api.runTechnicalInspection('d1', { metrics, preMissionAssessmentId: ID }).subscribe();
    const req = http.expectOne(`${environment.apiBaseUrl}/drone-technical-inspections`);
    expect(req.request.body.droneId).toBe('d1');
    expect(req.request.body.metrics.length).toBeGreaterThan(0);
    req.flush({ id: 'i1', droneId: 'd1', status: 'Passed', health: 'Healthy', metrics: [] });
  });

  it('refuses to send an inspection without metrics (backend METRICS_REQUIRED)', () => {
    let failed = false;
    api.runTechnicalInspection('d1', { metrics: [] }).subscribe({ error: () => (failed = true) });
    http.expectNone(`${environment.apiBaseUrl}/drone-technical-inspections`);
    expect(failed).toBe(true);
  });

  it('sends assessment times as ISO UTC', () => {
    api
      .create({ regionId: 'r1', plannedStart: '2099-01-01T08:00', plannedEnd: '2099-01-01T10:00', towerIds: ['t1'], idempotencyKey: 'k' })
      .subscribe();
    const req = http.expectOne(URL);
    expect(req.request.body.plannedStart).toMatch(/Z$/);
    expect(new Date(req.request.body.plannedStart).getTime()).toBe(new Date('2099-01-01T08:00').getTime());
    req.flush(assessmentDto());
  });
});
