import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import {
  AssetAnomaly,
  AssetDetail,
  AssetFilters,
  AssetHealthItem,
  AssetPage,
  LineLookup,
  MaintenancePriority,
  RegionLookup,
  RiskLevel,
  TowerLookup,
} from '../../../models/assets.models';
import { MonitorSummary } from '../../../models/monitor.models';

@Injectable({
  providedIn: 'root',
})
export class AssetHealthApi {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = environment.apiBaseUrl;

  getAssets(filters: AssetFilters): Observable<AssetPage> {
    let params = new HttpParams()
      .set('page', filters.page)
      .set('pageSize', filters.pageSize);

    if (filters.towerId) params = params.set('towerId', filters.towerId);
    if (filters.assetType) params = params.set('assetType', filters.assetType);
    if (filters.status) params = params.set('status', filters.status);

    return this.http
      .get<unknown>(`${this.apiBaseUrl}/assets`, { params })
      .pipe(map((response) => normalizeAssetPage(unwrapApiData(response), filters)));
  }

  getAssetDetail(id: string): Observable<AssetDetail> {
    return this.http
      .get<unknown>(`${this.apiBaseUrl}/assets/${id}`)
      .pipe(map((response) => normalizeAssetDetail(unwrapApiData(response), id)));
  }

  getDashboardSummary(): Observable<MonitorSummary> {
    return this.http
      .get<unknown>(`${this.apiBaseUrl}/monitor/summary`)
      .pipe(map((response) => normalizeMonitorSummary(unwrapApiData(response))));
  }

  getTowers(): Observable<readonly TowerLookup[]> {
    return this.http
      .get<unknown>(`${this.apiBaseUrl}/towers`)
      .pipe(map((response) => normalizeTowerList(unwrapApiData(response))));
  }

  getRegions(): Observable<readonly RegionLookup[]> {
    const params = new HttpParams().set('page', 1).set('pageSize', 100);
    return this.http
      .get<unknown>(`${this.apiBaseUrl}/regions`, { params })
      .pipe(map((response) => normalizeRegionList(unwrapApiData(response))));
  }

  getLines(): Observable<readonly LineLookup[]> {
    return this.http
      .get<unknown>(`${this.apiBaseUrl}/lines`)
      .pipe(map((response) => normalizeLineList(unwrapApiData(response))));
  }
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const pick = (source: Record<string, unknown>, ...keys: string[]) =>
  keys.map((key) => source[key]).find((value) => value !== undefined && value !== null);

const stringValue = (value: unknown, fallback = '') =>
  value === undefined || value === null ? fallback : String(value);

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const arrayValue = (value: unknown): readonly unknown[] => {
  if (Array.isArray(value)) return value;
  const source = record(value);
  const list = pick(source, 'items', 'records', 'results', 'data');
  return Array.isArray(list) ? list : [];
};

export const calculateRiskLevel = (healthScore: number): RiskLevel => {
  if (healthScore < 40) return 'Critical Risk';
  if (healthScore < 60) return 'High Risk';
  if (healthScore < 80) return 'Medium Risk';
  return 'Low Risk';
};

export const calculateMaintenancePriority = (riskLevel: RiskLevel): MaintenancePriority => {
  switch (riskLevel) {
    case 'Critical Risk':
      return 'Immediate';
    case 'High Risk':
      return 'High';
    case 'Medium Risk':
      return 'Medium';
    default:
      return 'Routine';
  }
};

const normalizeAssetItem = (value: unknown, index = 0): AssetHealthItem => {
  const source = record(value);
  const healthScore = numberValue(
    pick(source, 'currentHealthScore', 'healthScore', 'score'),
    100,
  );
  const explicitRisk = stringValue(pick(source, 'riskLevel', 'riskCategory', 'condition'));
  const riskLevel: RiskLevel = explicitRisk || calculateRiskLevel(healthScore);
  const priority = (stringValue(pick(source, 'maintenancePriority', 'priority')) ||
    calculateMaintenancePriority(riskLevel)) as MaintenancePriority;

  return {
    id: stringValue(source['id'], `asset-${index}`),
    towerId: stringValue(source['towerId']),
    towerCode: stringValue(pick(source, 'towerCode', 'towerName', 'tower')),
    assetType: stringValue(pick(source, 'assetType', 'type'), 'Insulator'),
    assetCode: stringValue(pick(source, 'assetCode', 'code', 'name'), `AST-${index + 1}`),
    status: stringValue(source['status'], 'Operational'),
    currentHealthScore: Math.round(healthScore * 10) / 10,
    riskLevel,
    lastInspectedAt: stringValue(
      pick(source, 'lastInspectedAt', 'lastInspectionDate', 'inspectedAt', 'updatedAt'),
    ),
    maintenancePriority: priority,
    activeDefectsCount: numberValue(
      pick(source, 'activeDefectsCount', 'anomaliesCount', 'defectCount'),
      0,
    ),
  };
};

const normalizeAnomaly = (value: unknown, index = 0): AssetAnomaly => {
  const source = record(value);
  const confidence = numberValue(pick(source, 'confidenceScore', 'confidence', 'score'), 0);
  return {
    id: stringValue(pick(source, 'id', 'anomalyId'), `anomaly-${index}`),
    categoryName: stringValue(
      pick(source, 'categoryName', 'defectType', 'defectCategory', 'name', 'title'),
      'Lỗi phát hiện',
    ),
    confidenceScore: confidence > 1 ? confidence / 100 : confidence,
    validationStatus: stringValue(
      pick(source, 'validationStatus', 'status', 'reviewStatus'),
      'Confirmed',
    ),
    createdAt: stringValue(
      pick(source, 'createdAt', 'detectedAt', 'timestamp'),
      new Date().toISOString(),
    ),
  };
};

const normalizeAssetDetail = (value: unknown, fallbackId: string): AssetDetail => {
  const base = normalizeAssetItem(value);
  const source = record(value);
  const anomaliesRaw = pick(source, 'activeAnomalies', 'anomalies', 'defects');
  const activeAnomalies = arrayValue(anomaliesRaw).map(normalizeAnomaly);

  return {
    ...base,
    id: base.id || fallbackId,
    towerCode: stringValue(pick(source, 'towerCode', 'towerName'), base.towerCode || 'TOW-N1'),
    activeAnomalies,
    activeDefectsCount: activeAnomalies.length || base.activeDefectsCount || 0,
  };
};

const normalizeAssetPage = (value: unknown, filters: AssetFilters): AssetPage => {
  const source = record(value);
  const items = arrayValue(value).map(normalizeAssetItem);
  const pagination = record(source['pagination']);
  const totalItems =
    numberValue(pick(source, 'totalItems', 'totalCount', 'count')) ||
    numberValue(pagination['totalItems']) ||
    items.length;
  const page =
    numberValue(pick(source, 'page') ?? pagination['page']) || filters.page;
  const pageSize =
    numberValue(pick(source, 'pageSize') ?? pagination['pageSize']) || filters.pageSize;
  const totalPages =
    numberValue(pick(source, 'totalPages') ?? pagination['totalPages']) ||
    Math.max(1, Math.ceil(totalItems / pageSize));

  return {
    items,
    page,
    pageSize,
    totalItems,
    totalPages,
  };
};

const normalizeMonitorSummary = (value: unknown): MonitorSummary => {
  const source = record(value);
  return {
    totalMissions: numberValue(pick(source, 'totalMissions', 'missionTotal')),
    pendingMissions: numberValue(pick(source, 'pendingMissions', 'pending')),
    inProgressMissions: numberValue(pick(source, 'inProgressMissions', 'inProgress')),
    completedMissions: numberValue(pick(source, 'completedMissions', 'completed')),
    totalInspections: numberValue(pick(source, 'totalInspections', 'inspectionTotal')),
    totalDefects: numberValue(pick(source, 'totalDefects', 'defectTotal')),
    criticalDefects: numberValue(pick(source, 'criticalDefects', 'critical')),
  };
};

const normalizeTowerList = (value: unknown): readonly TowerLookup[] =>
  arrayValue(value).map((item, index) => {
    const source = record(item);
    return {
      id: stringValue(source['id'], `tower-${index}`),
      code: stringValue(pick(source, 'towerCode', 'code', 'name'), `TOW-${index + 1}`),
      lineId: stringValue(source['lineId']),
      lineName: stringValue(pick(source, 'lineName', 'lineCode', 'line')),
    };
  });

const normalizeRegionList = (value: unknown): readonly RegionLookup[] =>
  arrayValue(value).map((item, index) => {
    const source = record(item);
    return {
      id: stringValue(source['id'], `region-${index}`),
      code: stringValue(pick(source, 'code', 'regionCode'), `REG-${index + 1}`),
      name: stringValue(pick(source, 'name', 'regionName', 'title'), 'Khu vực'),
    };
  });

const normalizeLineList = (value: unknown): readonly LineLookup[] =>
  arrayValue(value).map((item, index) => {
    const source = record(item);
    return {
      id: stringValue(source['id'], `line-${index}`),
      code: stringValue(pick(source, 'lineCode', 'code'), `LINE-${index + 1}`),
      name: stringValue(pick(source, 'name', 'title'), 'Tuyến đường dây'),
      regionId: stringValue(source['regionId']),
    };
  });
