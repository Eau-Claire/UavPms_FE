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
      providers: [DroneManagementApi, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DroneManagementApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('fetches the detailed drone list as UavDetailsDto', () => {
    const mockDrones = [
      { id: 'd-1', code: 'UAV-001', name: 'Surveyor 1', operationalStatus: 'Available', technicalHealth: 'Healthy' },
    ];
    let codes: string[] = [];
    service.getDrones({ operationalStatus: 'InUse' }).subscribe((drones) => (codes = drones.map((d) => d.code)));

    const req = httpMock.expectOne((r) => r.url === `${environment.apiBaseUrl}/drones`);
    expect(req.request.params.get('detailed')).toBe('true');
    expect(req.request.params.get('operationalStatus')).toBe('InUse');
    req.flush(mockDrones);
    expect(codes).toEqual(['UAV-001']);
  });

  it('posts the basic technical check with backend field names', () => {
    const checkPayload = {
      frameBodyPassed: true,
      frameBodyNotes: 'OK',
      propellersPassed: true,
      motorsPassed: true,
      cameraPayloadPassed: true,
      batteryPassed: true,
      batteryPercent: 95,
      gpsPassed: true,
      communicationPassed: true,
      communicationSignalInfo: '-55 dBm',
      flightControllerPassed: true,
      flightControllerUid: 'BF-F405-A1B2C3D4',
    };
    let status = '';
    service.submitBasicTechnicalCheck('d-1', checkPayload).subscribe((res) => (status = res.status));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/drones/d-1/basic-technical-check`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.frameBodyNotes).toBe('OK');
    expect(req.request.body.communicationSignalInfo).toBe('-55 dBm');
    req.flush({ id: 'i-1', status: 'Passed', health: 'Healthy', metricCount: 8 });
    expect(status).toBe('Passed');
  });

  it('requests the GIS scope drone estimation', () => {
    let suitability = '';
    service.estimateGisScope({ corridorLengthKm: 5, assetCount: 10 }).subscribe((res) => (suitability = res.drones[0].suitability));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/drones/estimate-gis-scope`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ corridorLengthKm: 5, assetCount: 10 });
    req.flush({
      corridorLengthKm: 5,
      assetCount: 10,
      estimatedMissionDurationMinutes: 38.3,
      averageSpeedKmh: 36,
      reserveBatteryPercent: 20,
      inspectionMinutesPerAsset: 3,
      drones: [
        {
          droneId: 'd-1',
          droneCode: 'UAV-001',
          droneName: 'Surveyor 1',
          model: 'M300',
          category: 'Hexacopter',
          operationalStatus: 'Available',
          technicalHealth: 'Healthy',
          flightEnduranceMinutes: 45,
          operationalRangeKm: 20,
          effectiveFlightMinutes: 36,
          maxCoverageDistanceKm: 21.6,
          estimatedFlightsNeeded: 1,
          estimatedDronesNeeded: 1,
          suitability: 'SUITABLE',
          isAvailable: true,
          isTechnicallyReady: true,
          recommendation: 'Đạt',
        },
      ],
    });
    expect(suitability).toBe('SUITABLE');
  });
});
