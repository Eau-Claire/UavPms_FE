import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { DroneManagement } from './drone-management';
import { DroneManagementApi } from '../../data-access/drone-management-api';
import { UavRecord } from '../../../../models/drone-management.models';

describe('DroneManagement Component', () => {
  let component: DroneManagement;
  let fixture: ComponentFixture<DroneManagement>;
  let apiMock: any;

  const mockDrones: UavRecord[] = [
    {
      id: 'd-001',
      code: 'UAV-001',
      name: 'Surveyor Hexa',
      model: 'M350 RTK',
      category: 'Hexacopter',
      serialNumber: 'SN-001',
      assignedRegionId: 'reg-cpc',
      assignedRegionName: 'EVN CPC',
      operationalStatus: 'Available',
      technicalHealth: 'Healthy',
      flightEnduranceMinutes: 45,
      operationalRangeKm: 20,
      cameraPayloadInfo: 'Zenmuse H20T',
      batteryLevel: 98,
      activeFlightController: {
        id: 'fc-1',
        droneId: 'd-001',
        flightControllerUid: 'BF-F405-A1B2C3D4',
        boardIdentifier: 'SPEEDYBEEF405V3',
        firmwareName: 'Betaflight',
        firmwareVersion: '4.5.1',
        pairedAt: new Date().toISOString(),
        isActive: true,
      },
      createdAt: new Date().toISOString(),
    },
    {
      id: 'd-002',
      code: 'UAV-002',
      name: 'Line Inspector',
      model: 'M300 RTK',
      category: 'Quadcopter',
      serialNumber: 'SN-002',
      operationalStatus: 'Maintenance',
      technicalHealth: 'Critical',
      flightEnduranceMinutes: 30,
      operationalRangeKm: 12,
      cameraPayloadInfo: 'H20 Optical',
      batteryLevel: 25,
      createdAt: new Date().toISOString(),
    },
  ];

  beforeEach(async () => {
    apiMock = {
      getDrones: vi.fn().mockReturnValue(of(mockDrones)),
      createDrone: vi.fn().mockReturnValue(of(mockDrones[0])),
      updateDrone: vi.fn().mockReturnValue(of(mockDrones[0])),
      deleteDrone: vi.fn().mockReturnValue(of(undefined)),
      submitBasicTechnicalCheck: vi.fn().mockReturnValue(of({ status: 'Passed', health: 'Healthy' })),
      estimateGisScope: vi.fn().mockReturnValue(of({
        corridorLengthKm: 5,
        assetCount: 10,
        estimatedMissionDurationMinutes: 28,
        averageSpeedKmh: 36,
        reserveBatteryPercent: 20,
        inspectionMinutesPerAsset: 3,
        drones: [],
      })),
    };

    await TestBed.configureTestingModule({
      imports: [DroneManagement],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DroneManagementApi, useValue: apiMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DroneManagement);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load drones list', () => {
    expect(component).toBeTruthy();
    expect(apiMock.getDrones).toHaveBeenCalled();
    expect((component as any).drones().length).toBe(2);
  });

  it('should compute KPI statistics properly', () => {
    const stats = (component as any).stats();
    expect(stats.total).toBe(2);
    expect(stats.available).toBe(1);
    expect(stats.maintenance).toBe(1);
    expect(stats.healthy).toBe(1);
    expect(stats.critical).toBe(1);
  });

  it('should filter drones by search keyword', () => {
    (component as any).search.set('UAV-001');
    expect((component as any).filteredDrones().length).toBe(1);
    expect((component as any).filteredDrones()[0].code).toBe('UAV-001');
  });

  it('should filter drones by operational status', () => {
    (component as any).statusFilter.set('Maintenance');
    expect((component as any).filteredDrones().length).toBe(1);
    expect((component as any).filteredDrones()[0].code).toBe('UAV-002');
  });

  it('should filter drones by technical health', () => {
    (component as any).healthFilter.set('Critical');
    expect((component as any).filteredDrones().length).toBe(1);
    expect((component as any).filteredDrones()[0].technicalHealth).toBe('Critical');
  });
});
