import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { AssetDetail, AssetHealthSummary, AssetPage } from '../../../models/assets.models';
import { AssetHealthApi, calculateMaintenancePriority, calculateRiskLevel } from './asset-health-api';

describe('AssetHealthApi', () => {
  let api: AssetHealthApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(AssetHealthApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('calculates risk levels and maintenance priorities accurately based on score', () => {
    expect(calculateRiskLevel(35)).toBe('Critical Risk');
    expect(calculateRiskLevel(55)).toBe('High Risk');
    expect(calculateRiskLevel(75)).toBe('Medium Risk');
    expect(calculateRiskLevel(90)).toBe('Low Risk');

    expect(calculateMaintenancePriority('Critical Risk')).toBe('Immediate');
    expect(calculateMaintenancePriority('High Risk')).toBe('High');
    expect(calculateMaintenancePriority('Medium Risk')).toBe('Medium');
    expect(calculateMaintenancePriority('Low Risk')).toBe('Routine');
  });

  it('fetches and normalizes paginated asset health items', () => {
    let result: AssetPage | undefined;
    api
      .getAssets({
        page: 1,
        pageSize: 10,
        assetType: 'Insulator',
        status: 'Operational',
      })
      .subscribe((res) => (result = res));

    const req = http.expectOne(
      (request) =>
        request.url === `${environment.apiBaseUrl}/assets` &&
        request.params.get('page') === '1' &&
        request.params.get('pageSize') === '10' &&
        request.params.get('assetType') === 'Insulator' &&
        request.params.get('status') === 'Operational',
    );
    expect(req.request.method).toBe('GET');

    req.flush({
      success: true,
      message: 'Lấy danh sách thiết bị thành công.',
      data: {
        items: [
          {
            id: 'b0f81d8a-6b58-45b7-a3c3-63023e3e2b2a',
            towerId: 'c7a8b9f0-d1e2-3456-789a-bcdef0123456',
            assetType: 'Insulator',
            assetCode: 'INS-TOW05-01',
            status: 'Operational',
            currentHealthScore: 38.5,
            riskLevel: 'Critical Risk',
            lastInspectedAt: '2026-08-25T14:30:00Z',
          },
          {
            id: 'd1a81d8a-7c58-45b7-a3c3-83023e3e2b3c',
            towerId: 'c7a8b9f0-d1e2-3456-789a-bcdef0123456',
            assetType: 'Cable',
            assetCode: 'CBL-TOW05-01',
            status: 'Operational',
            currentHealthScore: 88.0,
            riskLevel: 'Low Risk',
            lastInspectedAt: '2026-08-22T09:15:00Z',
          },
        ],
        pagination: {
          page: 1,
          pageSize: 10,
          totalItems: 48,
          totalPages: 5,
        },
      },
    });

    expect(result).toBeDefined();
    expect(result?.items).toHaveLength(2);
    expect(result?.totalItems).toBe(48);
    expect(result?.totalPages).toBe(5);
    expect(result?.items[0].assetCode).toBe('INS-TOW05-01');
    expect(result?.items[0].currentHealthScore).toBe(38.5);
    expect(result?.items[0].riskLevel).toBe('Critical Risk');
    expect(result?.items[0].maintenancePriority).toBe('Immediate');
    expect(result?.items[1].riskLevel).toBe('Low Risk');
    expect(result?.items[1].maintenancePriority).toBe('Routine');
  });

  it('sends server-side risk and sort filters instead of applying them only to the current page', () => {
    api
      .getAssets({
        page: 1,
        pageSize: 10,
        riskLevel: 'Critical Risk',
        sortBy: 'currentHealthScore',
        sortOrder: 'asc',
      })
      .subscribe();

    const req = http.expectOne(
      (request) =>
        request.url === `${environment.apiBaseUrl}/assets` &&
        request.params.get('riskLevel') === 'Critical Risk' &&
        request.params.get('sortBy') === 'healthScore' &&
        request.params.get('sortOrder') === 'asc',
    );
    req.flush({ data: { items: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 } } });
  });

  it('fetches and normalizes asset detail with active anomalies', () => {
    let detailResult: AssetDetail | undefined;
    const testId = 'b0f81d8a-6b58-45b7-a3c3-63023e3e2b2a';

    api.getAssetDetail(testId).subscribe((res) => (detailResult = res));

    const req = http.expectOne(`${environment.apiBaseUrl}/assets/${testId}`);
    expect(req.request.method).toBe('GET');

    req.flush({
      success: true,
      message: 'Lấy thông tin chi tiết thiết bị thành công.',
      data: {
        id: testId,
        towerId: 'c7a8b9f0-d1e2-3456-789a-bcdef0123456',
        towerCode: 'TOW-N1-05',
        assetType: 'Insulator',
        assetCode: 'INS-TOW05-01',
        status: 'Operational',
        currentHealthScore: 38.5,
        riskLevel: 'Critical Risk',
        lastInspectedAt: '2026-08-25T14:30:00Z',
        activeAnomalies: [
          {
            id: 'f5b81d8a-6e58-41b9-a9c3-7303e3e2a2ba',
            categoryName: 'Insulator Damage',
            confidenceScore: 0.94,
            validationStatus: 'Confirmed',
            createdAt: '2026-08-25T14:35:00Z',
          },
          {
            id: 'a7c81d8a-6e58-41b9-a9c3-7303e3e2a2bb',
            categoryName: 'Corrosion',
            confidenceScore: 0.82,
            validationStatus: 'Pending',
            createdAt: '2026-08-25T14:35:00Z',
          },
        ],
      },
    });

    expect(detailResult).toBeDefined();
    expect(detailResult?.id).toBe(testId);
    expect(detailResult?.towerCode).toBe('TOW-N1-05');
    expect(detailResult?.activeAnomalies).toHaveLength(2);
    expect(detailResult?.activeAnomalies[0].categoryName).toBe('Insulator Damage');
    expect(detailResult?.activeAnomalies[0].confidenceScore).toBe(0.94);
    expect(detailResult?.activeAnomalies[0].validationStatus).toBe('Confirmed');
    expect(detailResult?.activeDefectsCount).toBe(2);
  });

  it('fetches dashboard summary and lookup tables', () => {
    api.getDashboardSummary().subscribe((summary) => {
      expect(summary.totalMissions).toBe(24);
      expect(summary.criticalDefects).toBe(4);
    });
    http
      .expectOne(`${environment.apiBaseUrl}/monitor/summary`)
      .flush({ data: { totalMissions: 24, criticalDefects: 4 } });

    api.getTowers().subscribe((towers) => {
      expect(towers).toHaveLength(1);
      expect(towers[0].code).toBe('TOW-01');
    });
    http
      .expectOne(`${environment.apiBaseUrl}/towers`)
      .flush({ data: [{ id: 'tow-1', code: 'TOW-01' }] });
  });

  it('fetches the overall asset health summary independently of pagination', () => {
    let result: AssetHealthSummary | undefined;
    api.getAssetHealthSummary().subscribe((summary) => (result = summary));

    const req = http.expectOne(`${environment.apiBaseUrl}/assets/health-summary`);
    expect(req.request.method).toBe('GET');
    req.flush({
      data: {
        totalAssets: 51,
        averageHealthScore: 82.4,
        criticalRiskCount: 2,
        highRiskCount: 4,
        mediumRiskCount: 8,
        lowRiskCount: 37,
      },
    });

    expect(result).toEqual({
      totalAssets: 51,
      averageHealthScore: 82.4,
      criticalRiskCount: 2,
      highRiskCount: 4,
      mediumRiskCount: 8,
      lowRiskCount: 37,
    });
  });
});
