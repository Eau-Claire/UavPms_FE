import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { DroneManagement } from './drone-management';
import { DroneManagementApi } from '../../data-access/drone-management-api';
import { UavRecord } from '../../../../models/drone-management.models';
import { Auth } from '../../../../core/auth/auth';

describe('DroneManagement Component', () => {
  let component: DroneManagement;
  let fixture: ComponentFixture<DroneManagement>;
  let apiMock: any;
  const authUser = signal<{ id: string; role: string } | null>({ id: 'u1', role: 'Manager' });

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
      getTechnicalInspections: vi.fn().mockReturnValue(of([{ id: 'i1', status: 'Passed', health: 'Healthy', technicianName: 'KTV A', completedAt: '2026-10-30T08:00:00Z', metricCount: 8 }])),
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
        { provide: Auth, useValue: { user: authUser } },
      ],
    }).compileComponents();

    authUser.set({ id: 'u1', role: 'Manager' });
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

  const buttonTitles = (): string[] =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).map((b) => b.getAttribute('title') ?? b.textContent?.trim() ?? '');

  it('shows add, edit, delete and the GIS estimate to managers', () => {
    const titles = buttonTitles();
    expect(titles).toContain('Xóa UAV');
    expect(titles).toContain('Chỉnh sửa thông số UAV');
    expect(titles).toContain('Ước tính tải Drone theo hành lang GIS');
    expect(titles.some((t) => t.includes('Thêm UAV mới'))).toBe(true);
  });

  it('lets technicians edit and check drones but not delete or plan', () => {
    authUser.set({ id: 'u2', role: 'MaintenanceTechnician' });
    fixture.detectChanges();
    const titles = buttonTitles();
    expect(titles).toContain('Chỉnh sửa thông số UAV');
    expect(titles).toContain('Kiểm định kỹ thuật an toàn (Checklist)');
    expect(titles).not.toContain('Xóa UAV');
    expect(titles).not.toContain('Ước tính tải Drone theo hành lang GIS');
  });

  it('keeps inspectors and analysts read-only', () => {
    for (const role of ['Inspector', 'Analyst']) {
      authUser.set({ id: 'u3', role });
      fixture.detectChanges();
      const titles = buttonTitles();
      expect(titles).not.toContain('Chỉnh sửa thông số UAV');
      expect(titles).not.toContain('Xóa UAV');
      expect(titles.some((t) => t.includes('Thêm UAV mới'))).toBe(false);
      expect(titles).toContain('Lịch sử kiểm định kỹ thuật');
    }
  });

  it('loads the technical inspection history of a drone', () => {
    (component as any).openHistory(mockDrones[0]);
    expect(apiMock.getTechnicalInspections).toHaveBeenCalledWith('d-001', 1, 20);
    expect((component as any).historyItems().length).toBe(1);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('KTV A');
  });

  it('should filter drones by technical health', () => {
    (component as any).healthFilter.set('Critical');
    expect((component as any).filteredDrones().length).toBe(1);
    expect((component as any).filteredDrones()[0].technicalHealth).toBe('Critical');
  });
});
