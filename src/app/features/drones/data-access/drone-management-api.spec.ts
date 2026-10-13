import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { DroneManagementApi } from './drone-management-api';

describe('DroneManagementApi', () => {
  let service: DroneManagementApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        DroneManagementApi,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(DroneManagementApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should fetch drones list', () => {
    const mockDrones = [
      { id: 'd-1', uavCode: 'UAV-001', name: 'Surveyor 1', operationalStatus: 'AVAILABLE', technicalHealth: 'HEALTHY' },
    ];

    service.getDrones().subscribe((drones) => {
      expect(drones.length).toBe(1);
      expect(drones[0].uavCode).toBe('UAV-001');
    });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/drones`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: mockDrones });
  });

  it('should post basic technical check', () => {
    const checkPayload = {
      frameBodyPassed: true,
      propellersPassed: true,
      motorsPassed: true,
      cameraPayloadPassed: true,
      batteryPassed: true,
      batteryPercent: 95,
      batteryVoltage: 24.8,
      gpsPassed: true,
      gpsSatelliteCount: 18,
      communicationPassed: true,
      flightControllerPassed: true,
      flightControllerUid: 'BF-F405-A1B2C3D4',
    };

    service.submitBasicTechnicalCheck('d-1', checkPayload).subscribe((res) => {
      expect(res.status).toBe('Passed');
      expect(res.health).toBe('Healthy');
    });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/drones/d-1/basic-technical-check`);
    expect(req.request.method).toBe('POST');
    req.flush({ success: true, data: { status: 'Passed', health: 'Healthy' } });
  });

  it('should request GIS scope drone estimation', () => {
    const reqData = {
      corridorLengthKm: 5.0,
      assetCount: 10,
    };

    service.estimateGisScope(reqData).subscribe((res) => {
      expect(res.corridorLengthKm).toBe(5.0);
      expect(res.drones.length).toBe(1);
      expect(res.drones[0].suitability).toBe('SUITABLE');
    });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/drones/estimate-gis-scope`);
    expect(req.request.method).toBe('POST');
    req.flush({
      success: true,
      data: {
        corridorLengthKm: 5.0,
        assetCount: 10,
        totalEstimatedMissionMinutes: 28,
        recommendedMinEnduranceMinutes: 35,
        drones: [
          {
            droneId: 'd-1',
            droneCode: 'UAV-001',
            droneName: 'Surveyor 1',
            flightEnduranceMinutes: 45,
            operationalRangeKm: 20,
            operationalStatus: 'AVAILABLE',
            technicalHealth: 'HEALTHY',
            suitability: 'SUITABLE',
            estimatedFlightsNeeded: 1,
            maxCorridorPerFlightKm: 21.6,
            recommendation: 'Đạt điều kiện bay trọn vẹn',
          },
        ],
      },
    });
  });
});
