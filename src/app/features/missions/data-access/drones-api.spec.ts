import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { DroneDto } from '../../../models/drones.models';
import { DronesApi } from './drones-api';

describe('DronesApi', () => {
  let api: DronesApi;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), DronesApi],
    });
    api = TestBed.inject(DronesApi);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('fetches available drones and normalizes fields', () => {
    const mockResponse = {
      success: true,
      data: [
        {
          id: 'drone-1',
          droneCode: 'UAV-001',
          name: 'Matrice 300 RTK',
          online: true,
          battery: 92.5,
          operationalStatus: 'Idle',
        },
      ],
    };

    let result: readonly DroneDto[] = [];
    api.getAvailableDrones().subscribe((drones) => {
      result = drones;
    });

    const req = httpTesting.expectOne(`${environment.apiBaseUrl}/drones/available`);
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);

    expect(result.length).toBe(1);
    expect(result[0].id).toBe('drone-1');
    expect(result[0].droneCode).toBe('UAV-001');
    expect(result[0].battery).toBe(92.5);
    expect(result[0].operationalStatus).toBe('Idle');
  });

  it('falls back to mock list when available endpoint fails', () => {
    let result: readonly DroneDto[] = [];
    api.getAvailableDrones().subscribe((drones) => {
      result = drones;
    });

    const reqAvailable = httpTesting.expectOne(`${environment.apiBaseUrl}/drones/available`);
    reqAvailable.flush('Not Found', { status: 404, statusText: 'Not Found' });

    const reqAll = httpTesting.expectOne(`${environment.apiBaseUrl}/drones`);
    reqAll.flush('Not Found', { status: 404, statusText: 'Not Found' });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });
});
