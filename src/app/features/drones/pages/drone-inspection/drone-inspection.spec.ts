import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../../../core/auth/auth';
import { BetaflightSerialService } from '../../../../core/services/betaflight-serial.service';
import { UavRecord } from '../../../../models/drone-management.models';
import { FlightControllerApi } from '../../../../core/services/flight-controller-api';
import { PreMissionApi } from '../../../../core/services/pre-mission-api';
import { DroneManagementApi } from '../../../../core/services/drone-management-api';
import { DroneInspection } from './drone-inspection';

const mockDrone = (overrides: Partial<UavRecord> = {}): UavRecord => ({
  id: 'd1',
  code: 'UAV-01',
  name: 'Matrice 300 RTK',
  model: 'M300',
  category: 'Quadcopter',
  serialNumber: 'SN-001',
  operationalStatus: 'Available',
  technicalHealth: 'Healthy',
  flightEnduranceMinutes: 45,
  operationalRangeKm: 15,
  batteryLevel: 95,
  assignedRegionId: null,
  assignedRegionName: 'Hải Phòng',
  lastTechnicalInspection: null,
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('DroneInspection Component', () => {
  let droneApi: Record<string, ReturnType<typeof vi.fn>>;
  let preMissionApi: Record<string, ReturnType<typeof vi.fn>>;
  let fcSerial: Record<string, ReturnType<typeof vi.fn> | unknown>;

  const create = () => {
    droneApi = {
      getDrones: vi.fn(() => of([mockDrone(), mockDrone({ id: 'd2', code: 'UAV-02', technicalHealth: 'Critical' })])),
      getTechnicalInspections: vi.fn(() => of([])),
    };
    preMissionApi = {
      runTechnicalInspection: vi.fn(() =>
        of({
          id: 'insp-1',
          droneId: 'd1',
          status: 'Passed',
          overallHealth: 'HEALTHY',
          eligibility: 'ELIGIBLE',
          inspectedAt: new Date().toISOString(),
          subsystems: [],
          metrics: [],
        })
      ),
    };
    fcSerial = {
      activeMetadata: signal(null),
      connectionState: signal('disconnected'),
      isSimulated: signal(false),
      errorMessage: signal(null),
      disconnect: vi.fn(() => Promise.resolve()),
      connectSimulated: vi.fn(() => Promise.resolve()),
      connectRealSerial: vi.fn(() => Promise.resolve({ uid: 'mock-uid' })),
    };

    TestBed.configureTestingModule({
      imports: [DroneInspection],
      providers: [
        provideRouter([]),
        { provide: DroneManagementApi, useValue: droneApi },
        { provide: PreMissionApi, useValue: preMissionApi },
        { provide: BetaflightSerialService, useValue: fcSerial },
        { provide: FlightControllerApi, useValue: { pairFlightController: vi.fn(() => of({})), resolveDrone: vi.fn(() => of(null)) } },
        { provide: Auth, useValue: { user: signal({ id: 'u1', email: 'tech@uavpms.local', fullName: 'Tech An', role: 'Technician', mustChangePassword: false }) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ droneId: 'd1' }) } } },
      ],
    });
    TestBed.overrideComponent(DroneInspection, { set: { template: '' } });
    const fixture = TestBed.createComponent(DroneInspection);
    fixture.detectChanges();
    return fixture.componentInstance;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads drones and pre-selects drone from query param', () => {
    const comp = create();
    expect(comp['drones']().length).toBe(2);
    expect(comp['selectedDroneId']()).toBe('d1');
    expect(comp['currentDrone']()?.code).toBe('UAV-01');
  });

  it('submits inspection checklist for periodic inspection', () => {
    const comp = create();
    comp['setPurpose']('PERIODIC');
    comp['setPreset']('healthy');
    comp['submitInspection']();

    expect(preMissionApi['runTechnicalInspection']).toHaveBeenCalledTimes(1);
    const [droneId, payload] = preMissionApi['runTechnicalInspection'].mock.calls[0];
    expect(droneId).toBe('d1');
    expect(payload.notes).toContain('[Định kỳ]');
    expect(payload.metrics.length).toBeGreaterThan(0);
    expect(comp['actionMessage']()).toContain('ĐẠT TIÊU CHUẨN AN TOÀN');
  });

  it('switches purpose to POST_FLIGHT and adjusts notes prefix', () => {
    const comp = create();
    comp['setPurpose']('POST_FLIGHT');
    expect(comp['notes']()).toContain('sau chuyến bay');
    comp['submitInspection']();

    const [, payload] = preMissionApi['runTechnicalInspection'].mock.calls[0];
    expect(payload.notes).toContain('[Sau chuyến bay]');
  });
});

