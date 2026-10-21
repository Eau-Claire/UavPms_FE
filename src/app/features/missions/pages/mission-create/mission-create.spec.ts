import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import {
  ArrowLeftOutline,
  BellOutline,
  FundOutline,
  MessageOutline,
  SendOutline,
  SyncOutline,
  TeamOutline,
  ToolOutline,
  UnorderedListOutline,
  UserOutline,
} from '@ant-design/icons-angular/icons';
import { Auth } from '../../../../core/auth/auth';
import { GisApi } from '../../../gis/data-access/gis-api';
import { UsersApi } from '../../../users/data-access/users-api';
import { Mission } from '../../../../models/missions.models';
import { DronesApi } from '../../data-access/drones-api';
import { MissionsApi } from '../../data-access/missions-api';
import { MissionCreate } from './mission-create';

describe('MissionCreate', () => {
  let fixture: ComponentFixture<MissionCreate>;
  let component: MissionCreate;
  let create: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;
  const response = { id: 'm1', targets: [] } as unknown as Mission;

  beforeEach(() => {
    create = vi.fn().mockReturnValue(of(response));
    TestBed.configureTestingModule({
      imports: [MissionCreate],
      providers: [
        { provide: MissionsApi, useValue: { create } },
        { provide: UsersApi, useValue: { getAssignable: () => of([]), getAll: () => of([]) } },
        { provide: DronesApi, useValue: { getAvailableDrones: () => of([]), getAll: () => of([]) } },
        { provide: GisApi, useValue: { getRegions: () => of([{ id: 'r1', name: 'Cà Mau' }]), getAllGisData: () => of({ towers: [], lines: [], anomalies: [], alerts: [] }), spatialQuery: () => of([]) } },
        { provide: Auth, useValue: { user: () => ({ id: 'u1', fullName: 'Manager', email: 'user@test' }) } },
        provideNzIcons([
          ArrowLeftOutline,
          UnorderedListOutline,
          TeamOutline,
          MessageOutline,
          BellOutline,
          SyncOutline,
          UserOutline,
          FundOutline,
          ToolOutline,
          SendOutline,
        ]),
        provideRouter([]),
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(MissionCreate);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('blocks submission when required fields are missing', () => {
    component['form'].patchValue({ name: '', inspectorId: '', droneId: '' });
    component.dispatchMission();
    expect(create).not.toHaveBeenCalled();
    expect(component['error']()).toContain('Vui lòng hoàn thiện các trường bắt buộc');
  });

  it('blocks submission when plannedEnd is before scheduledAt', () => {
    component['form'].patchValue({
      name: 'Mission Test Survey',
      scheduledAt: '2026-09-03T10:00',
      plannedEnd: '2026-09-03T09:00',
      confirmationDeadline: '2026-09-03T08:00',
      inspectorId: 'u1',
      analystId: 'u2',
      technicianId: 'u3',
      droneId: 'd1',
    });
    component.dispatchMission();
    expect(create).not.toHaveBeenCalled();
    expect(component['error']()).toContain('Thời gian kết thúc nhiệm vụ phải sau thời điểm bắt đầu bay');
  });

  it('submits valid dispatch request and follows success navigation', () => {
    vi.useFakeTimers();
    component['form'].patchValue({
      name: 'Mission Test Survey',
      scheduledAt: '2026-09-03T08:00',
      plannedEnd: '2026-09-03T10:00',
      confirmationDeadline: '2026-09-03T06:00',
      inspectorId: 'u1',
      analystId: 'u2',
      technicianId: 'u3',
      droneId: 'd1',
    });
    component.dispatchMission();
    expect(create).toHaveBeenCalledTimes(1);
    const req = create.mock.calls[0][0];
    expect(req.name).toBe('Mission Test Survey');
    expect(req.inspectorId).toBe('u1');
    expect(req.droneId).toBe('d1');
    expect(req.assignments).toHaveLength(3);
    vi.advanceTimersByTime(1000);
    expect(navigate).toHaveBeenCalledWith(['/missions', 'm1'], { queryParams: { created: 'true' } });
    vi.useRealTimers();
  });

  it('displays backend validation errors', () => {
    create.mockReturnValue(throwError(() => new HttpErrorResponse({ error: { message: 'Asset unavailable' }, status: 400 })));
    component['form'].patchValue({
      name: 'Mission Test Survey',
      scheduledAt: '2026-09-03T08:00',
      plannedEnd: '2026-09-03T10:00',
      confirmationDeadline: '2026-09-03T06:00',
      inspectorId: 'u1',
      analystId: 'u2',
      technicianId: 'u3',
      droneId: 'd1',
    });
    component.dispatchMission();
    expect(component['error']()).toContain('Asset unavailable');
  });
  it('blocks submission when priority is EMERGENCY and emergencyReason is missing or too short', () => {
    component['form'].patchValue({
      name: 'Emergency Conductor Check',
      scheduledAt: '2026-09-03T08:00',
      plannedEnd: '2026-09-03T10:00',
      confirmationDeadline: '2026-09-03T06:00',
      inspectorId: 'u1',
      analystId: 'u2',
      technicianId: 'u3',
      droneId: 'd1',
      priority: 'EMERGENCY',
      emergencyReason: 'Short',
    });
    component.dispatchMission();
    expect(create).not.toHaveBeenCalled();
    expect(component['error']()).toContain('Lý do khẩn cấp');
  });

  it('submits priority, objective, defects, and emergencyReason when valid', () => {
    vi.useFakeTimers();
    component['form'].patchValue({
      name: 'Emergency Conductor Check',
      scheduledAt: '2026-09-03T08:00',
      plannedEnd: '2026-09-03T10:00',
      confirmationDeadline: '2026-09-03T06:00',
      inspectorId: 'u1',
      analystId: 'u2',
      technicianId: 'u3',
      droneId: 'd1',
      priority: 'EMERGENCY',
      objective: 'INCIDENT_FOLLOW_UP',
      emergencyReason: 'Flashover reported by control center on line 220kV.',
    });
    component['toggleDefect']('Insulator');
    component['toggleDefect']('Conductor');

    component.dispatchMission();
    expect(create).toHaveBeenCalledTimes(1);
    const req = create.mock.calls[0][0];
    expect(req.priority).toBe('EMERGENCY');
    expect(req.objective).toBe('INCIDENT_FOLLOW_UP');
    expect(req.priorityDefects).toContain('Insulator');
    expect(req.priorityDefects).toContain('Conductor');
    expect(req.emergencyReason).toBe('Flashover reported by control center on line 220kV.');
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
  });
});
