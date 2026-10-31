import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import {
  ArrowLeftOutline,
  LoadingOutline,
  SendOutline,
  SyncOutline,
  UnorderedListOutline,
} from '@ant-design/icons-angular/icons';
import { PreMissionAssessment } from '../../../../models/pre-mission.models';
import { PreMissionApi } from '../../../pre-mission/data-access/pre-mission-api';
import { MissionCreate } from './mission-create';

const ASSESSMENT_ID = '11111111-1111-4111-8111-111111111111';

const readyAssessment = (overrides: Partial<PreMissionAssessment> = {}): PreMissionAssessment => ({
  id: ASSESSMENT_ID,
  assessmentCode: 'PMA-11111111',
  managerId: 'm1',
  regionId: 'r1',
  regionName: 'Hải Phòng',
  plannedStart: '2099-01-01T01:00:00Z',
  plannedEnd: '2099-01-01T05:00:00Z',
  status: 'READY',
  overallTechnicalHealth: 'Healthy',
  siteFeasibilityStatus: 'Passed',
  validUntil: '2099-01-01T00:00:00Z',
  version: 1,
  findings: '',
  completedMissionId: null,
  towers: [{ id: 't-row', towerId: 't1', sequence: 1, towerCode: 'HP-001' }],
  personnelCandidates: [
    { id: 'u-insp', candidateId: 'c1', name: 'Inspector A', role: 'INSPECTOR', rawRole: 'Inspector', isEligible: true, eligibilityStatus: 'Eligible', availabilityStatus: 'Available', findings: '' },
    { id: 'u-ana', candidateId: 'c2', name: 'Analyst B', role: 'ANALYST', rawRole: 'Analyst', isEligible: true, eligibilityStatus: 'Eligible', availabilityStatus: 'Available', findings: '' },
    { id: 'u-bad', candidateId: 'c3', name: 'Busy C', role: 'TECHNICIAN', rawRole: 'Technician', isEligible: false, eligibilityStatus: 'Eligible', availabilityStatus: 'Conflict', findings: '' },
  ],
  uavCandidates: [
    { id: 'd1', candidateId: 'dc1', code: 'UAV-01', model: 'M300', isEligible: true, operationalStatus: 'Available', technicalHealth: 'Healthy', batteryLevel: 100 },
  ],
  site: { status: 'PASS' },
  personnel: { status: 'PASS' },
  uav: { status: 'PASS' },
  technical: { status: 'PASS' },
  createdAt: '2026-10-01T00:00:00Z',
  ...overrides,
});

describe('MissionCreate', () => {
  let fixture: ComponentFixture<MissionCreate>;
  let component: MissionCreate;
  let createMission: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;
  let assessment: PreMissionAssessment;

  const setup = (queryAssessmentId: string | null) => {
    createMission = vi.fn().mockReturnValue(of({ id: 'mission-1', missionCode: 'MS-1', title: 'x', status: 'PendingAcceptance' }));
    TestBed.configureTestingModule({
      imports: [MissionCreate],
      providers: [
        {
          provide: PreMissionApi,
          useValue: {
            get: vi.fn(() => of(assessment)),
            list: vi.fn(() => of({ items: [assessment], page: 1, pageSize: 100, totalCount: 1, totalPages: 1 })),
            getResourceReadiness: vi.fn(),
            createMission,
          },
        },
        provideNzIcons([ArrowLeftOutline, UnorderedListOutline, SyncOutline, SendOutline, LoadingOutline]),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryAssessmentId ? { assessmentId: queryAssessmentId } : {}) } },
        },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(MissionCreate);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  beforeEach(() => {
    assessment = readyAssessment();
  });

  it('loads the assessment from the query string and preselects eligible candidates only', () => {
    setup(ASSESSMENT_ID);
    expect(component['assessment']()?.id).toBe(ASSESSMENT_ID);
    expect(component['selectedPersonnelIds']()).toEqual(['u-insp', 'u-ana']);
    expect(component['selectedDroneIds']()).toEqual(['d1']);
    expect(component['eligiblePersonnel']().map((p) => p.id)).not.toContain('u-bad');
  });

  it('blocks submission when no assessment is selected', () => {
    setup(null);
    component['submit']();
    expect(createMission).not.toHaveBeenCalled();
    expect(component['error']()).toContain('READY');
  });

  it('blocks submission when the assessment is not READY', () => {
    assessment = readyAssessment({ status: 'NOT_READY' });
    setup(ASSESSMENT_ID);
    component['form'].patchValue({ title: 'Kiểm tra tuyến A' });
    component['submit']();
    expect(createMission).not.toHaveBeenCalled();
  });

  it('requires an inspector among the selected personnel', () => {
    setup(ASSESSMENT_ID);
    component['form'].patchValue({ title: 'Kiểm tra tuyến A' });
    component['togglePersonnel']('u-insp');
    component['submit']();
    expect(createMission).not.toHaveBeenCalled();
    expect(component['error']()).toContain('Inspector');
  });

  it('requires an emergency reason for EMERGENCY priority', () => {
    setup(ASSESSMENT_ID);
    component['form'].patchValue({ title: 'Kiểm tra khẩn', priority: 'EMERGENCY', emergencyReason: 'ngắn' });
    component['submit']();
    expect(createMission).not.toHaveBeenCalled();
    expect(component['error']()).toContain('Lý do khẩn cấp');
  });

  it('creates the mission through the assessment create-mission endpoint and navigates to it', () => {
    setup(ASSESSMENT_ID);
    component['form'].patchValue({
      title: 'Kiểm tra sự cố tuyến A',
      priority: 'EMERGENCY',
      objective: 'INCIDENT_FOLLOW_UP',
      emergencyReason: 'Phóng điện tại cột HP-001 do trung tâm điều độ báo.',
    });
    component['toggleDefect']('Insulator');
    component['submit']();

    expect(createMission).toHaveBeenCalledTimes(1);
    const req = createMission.mock.calls[0][0];
    expect(req.assessmentId).toBe(ASSESSMENT_ID);
    expect(req.personnel).toEqual([
      { userId: 'u-insp', role: 'INSPECTOR', isRequired: true },
      { userId: 'u-ana', role: 'ANALYST', isRequired: true },
    ]);
    expect(req.droneIds).toEqual(['d1']);
    expect(req.priority).toBe('EMERGENCY');
    expect(req.objective).toBe('INCIDENT_FOLLOW_UP');
    expect(req.priorityDefects).toEqual(['Insulator']);
    expect(req.idempotencyKey).toBeTruthy();
    expect(navigate).toHaveBeenCalledWith(['/missions', 'mission-1'], { queryParams: { created: 'true' } });
  });

  it('shows backend errors', () => {
    setup(ASSESSMENT_ID);
    createMission.mockReturnValue(
      throwError(() => new HttpErrorResponse({ error: { message: 'RESOURCE_BOOKING_CONFLICT' }, status: 400 })),
    );
    component['form'].patchValue({ title: 'Kiểm tra tuyến A' });
    component['submit']();
    expect(component['error']()).toContain('RESOURCE_BOOKING_CONFLICT');
  });
});
