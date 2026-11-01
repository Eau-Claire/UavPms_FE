import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../../../core/auth/auth';
import { BetaflightSerialService } from '../../../../core/services/betaflight-serial.service';
import { PreMissionAssessment, UavCandidate } from '../../../../models/pre-mission.models';
import { NotificationsRealtime } from '../../../notifications/data-access/notifications-realtime';
import { FlightControllerApi } from '../../data-access/flight-controller-api';
import { PreMissionApi } from '../../data-access/pre-mission-api';
import { AssessmentWorkspace } from './assessment-workspace';

const ID = '11111111-1111-4111-8111-111111111111';

const drone = (overrides: Partial<UavCandidate> = {}): UavCandidate => ({
  id: 'd1',
  candidateId: 'c1',
  code: 'UAV-01',
  model: 'M300',
  isEligible: false,
  operationalStatus: 'Available',
  technicalHealth: 'Unknown',
  batteryLevel: 90,
  reasonCode: 'NO_VALID_TECHNICAL_INSPECTION',
  isAvailable: true,
  technicalEligibility: 'REQUIRES_INSPECTION',
  ...overrides,
});

const assessment = (): PreMissionAssessment => ({
  id: ID,
  assessmentCode: 'PMA-1',
  managerId: 'm1',
  regionId: '',
  regionName: 'Hải Phòng',
  plannedStart: '2099-01-01T01:00:00Z',
  plannedEnd: '2099-01-01T05:00:00Z',
  status: 'NOT_READY',
  overallTechnicalHealth: 'Unknown',
  siteFeasibilityStatus: 'Passed',
  validUntil: '2099-01-01T00:00:00Z',
  version: 1,
  findings: '',
  completedMissionId: null,
  towers: [],
  personnelCandidates: [],
  uavCandidates: [drone(), drone({ id: 'd2', code: 'UAV-02', isEligible: true, reasonCode: null, technicalEligibility: 'ELIGIBLE' })],
  site: { status: 'PASS' },
  personnel: { status: 'PASS' },
  uav: { status: 'FAIL' },
  technical: { status: 'FAIL' },
  createdAt: '2026-10-01T00:00:00Z',
});

describe('AssessmentWorkspace technical inspection', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let role: string;

  const create = () => {
    api = {
      get: vi.fn(() => of(assessment())),
      getRegionTowers: vi.fn(() => of([])),
      getLatestTechnicalInspection: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))),
      runTechnicalInspection: vi.fn(() =>
        of({ id: 'i1', droneId: 'd1', status: 'Passed', overallHealth: 'HEALTHY', eligibility: 'ELIGIBLE', inspectedAt: '', subsystems: [], metrics: [] }),
      ),
      reEvaluate: vi.fn(() => of(assessment())),
      cancel: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [AssessmentWorkspace],
      providers: [
        provideRouter([]),
        { provide: PreMissionApi, useValue: api },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: ID }), queryParamMap: convertToParamMap({}) } } },
        { provide: Auth, useValue: { user: signal({ id: 'u1', email: 'a@b.c', fullName: 'A', role, mustChangePassword: false }) } },
        {
          provide: NotificationsRealtime,
          useValue: {
            assessmentEvents$: new Subject(),
            joinAssessment: vi.fn(),
            leaveAssessment: vi.fn(),
            broadcastAssessmentEvent: vi.fn(),
          },
        },
        {
          provide: BetaflightSerialService,
          useValue: {
            activeMetadata: signal(null),
            connectionState: signal('disconnected'),
            isSimulated: signal(false),
            errorMessage: signal(null),
            disconnect: vi.fn(() => Promise.resolve()),
          },
        },
        { provide: FlightControllerApi, useValue: {} },
      ],
    });
    TestBed.overrideComponent(AssessmentWorkspace, { set: { template: '' } });
    const fixture = TestBed.createComponent(AssessmentWorkspace);
    return fixture.componentInstance as unknown as Record<string, (...args: unknown[]) => unknown>;
  };

  beforeEach(() => {
    role = 'Technician';
  });

  it('opens the checklist instead of sending an inspection without metrics', () => {
    const c = create();
    c['runInspectionNow']();
    expect(api['runTechnicalInspection']).not.toHaveBeenCalled();
    expect((c['showMockModal'] as unknown as () => boolean)()).toBe(true);
    expect((c['checklistManual'] as unknown as () => boolean)()).toBe(true);
  });

  it('submits a checklist with readings for every critical item and the inspected droneId', () => {
    const c = create();
    c['runInspectionNow']();
    c['submitMockBistTelemetry']();

    expect(api['runTechnicalInspection']).toHaveBeenCalledTimes(1);
    const [droneId, body] = api['runTechnicalInspection'].mock.calls[0] as [string, { metrics: { metricCode: string; numericValue?: number | null; boolValue?: boolean | null }[]; preMissionAssessmentId: string }];
    expect(droneId).toBe('d1');
    expect(body.preMissionAssessmentId).toBe(ID);
    const codes = body.metrics.map((m) => m.metricCode);
    for (const code of ['FRAME_BODY', 'PROP_INTEGRITY', 'MOTORS', 'BATTERY_HEALTH', 'GPS_FIX', 'FLIGHT_CONTROLLER', 'RF_LINK_TELEMETRY']) {
      expect(codes).toContain(code);
    }
    expect(body.metrics.every((m) => m.numericValue != null || m.boolValue != null)).toBe(true);
  });

  it('does not re-evaluate as a technician (needs manager scope); a manager re-evaluates', () => {
    const tech = create();
    tech['submitMockBistTelemetry']('healthy');
    expect(api['reEvaluate']).not.toHaveBeenCalled();
    expect((tech['actionMessage'] as unknown as () => string)()).toContain('Quản lý cần bấm');

    TestBed.resetTestingModule();
    role = 'Manager';
    const manager = create();
    manager['submitMockBistTelemetry']('healthy');
    expect(api['reEvaluate']).toHaveBeenCalledWith(ID);
  });

  it('counts the UAVs a technician must inspect and labels the reason in Vietnamese', () => {
    const c = create();
    expect((c['uavNeedingInspectionCount'] as unknown as () => number)()).toBe(1);
    expect(c['uavReason']('NO_VALID_TECHNICAL_INSPECTION')).toContain('kiểm định');
  });

  it('shows the Vietnamese message for METRICS_REQUIRED and assessment errors', () => {
    const c = create();
    api['runTechnicalInspection'].mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { message: 'ASSESSMENT_CANCELLED: Bản đánh giá đã bị hủy.', errorCode: 'ASSESSMENT_CANCELLED' },
          }),
      ),
    );
    c['submitMockBistTelemetry']('healthy');
    expect((c['error'] as unknown as () => string)()).toContain('đã bị hủy');
    expect((c['error'] as unknown as () => string)()).not.toContain('ASSESSMENT_CANCELLED');
  });

  it('updates drone candidate eligibility and eligible count in real time on mock inspection', () => {
    const c = create();
    expect((c['eligibleUavCount'] as unknown as () => number)()).toBe(1);

    // Mock healthy inspection for d1
    api['runTechnicalInspection'].mockReturnValue(
      of({ id: 'i1', droneId: 'd1', status: 'Passed', overallHealth: 'HEALTHY', eligibility: 'ELIGIBLE', inspectedAt: '', subsystems: [], metrics: [] })
    );
    c['submitMockBistTelemetry']('healthy');
    expect((c['eligibleUavCount'] as unknown as () => number)()).toBe(2);
    const d1 = (c['item'] as unknown as () => PreMissionAssessment)().uavCandidates.find((d) => d.id === 'd1');
    expect(d1?.isEligible).toBe(true);
    expect(d1?.technicalHealth).toBe('HEALTHY');

    // Mock critical inspection for d1
    api['runTechnicalInspection'].mockReturnValue(
      of({ id: 'i2', droneId: 'd1', status: 'Failed', overallHealth: 'CRITICAL', eligibility: 'NOT_ELIGIBLE', inspectedAt: '', subsystems: [], metrics: [] })
    );
    c['submitMockBistTelemetry']('critical');
    expect((c['eligibleUavCount'] as unknown as () => number)()).toBe(1);
    const d1After = (c['item'] as unknown as () => PreMissionAssessment)().uavCandidates.find((d) => d.id === 'd1');
    expect(d1After?.isEligible).toBe(false);
    expect(d1After?.technicalHealth).toBe('CRITICAL');
    expect(d1After?.reasonCode).toBe('TECHNICAL_HEALTH_CRITICAL');
  });
});
