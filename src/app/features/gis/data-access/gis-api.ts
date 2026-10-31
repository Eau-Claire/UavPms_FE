import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, timeout } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { RegionLookup, SelectableAsset, SpatialTowerQueryRequest } from '../../../models/assets.models';
import { RegionsApi } from '../../towers/data-access/regions-api';

/** Tower marker from GET /gis/infrastructure (GisTowerDto). */
export interface GisTower {
  readonly id: string;
  readonly towerCode: string;
  readonly regionId: string;
  readonly poleType?: string;
  readonly address?: string;
  readonly latitude: number;
  readonly longitude: number;
}

/** Open anomaly from GET /gis/infrastructure (GisAnomalyDto). */
export interface GisAnomalyFeature {
  readonly id: string;
  readonly anomalyId: string;
  readonly towerId?: string;
  readonly towerCode: string;
  readonly category: string;
  readonly severity: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly status: string;
  readonly confidenceScore: number;
  readonly imageUrl?: string;
  readonly detectedAt?: string;
}

/** Active alert from GET /gis/infrastructure (GisAlertDto). */
export interface GisAlert {
  readonly id: string;
  readonly anomalyId?: string;
  readonly towerId?: string;
  readonly towerCode?: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly status: string;
  readonly priority: string;
  readonly title: string;
  readonly triggeredAt: string;
}

export interface GisDataSnapshot {
  readonly towers: readonly GisTower[];
  readonly anomalies: readonly GisAnomalyFeature[];
  readonly alerts: readonly GisAlert[];
}

export interface GisInfrastructureFilters {
  /** Region id; the backend narrows to that region (always within the caller's geographic scope). */
  readonly administrativeAreaId?: string;
}

@Injectable({
  providedIn: 'root',
})
export class GisApi {
  private readonly http = inject(HttpClient);
  private readonly regionsApi = inject(RegionsApi);
  private readonly baseUrl = environment.apiBaseUrl;

  /** All regions (GET /regions, every page). */
  getRegions(): Observable<readonly RegionLookup[]> {
    return this.regionsApi.getAll();
  }

  /** GET /gis/infrastructure: towers, open anomalies and active alerts. */
  getAllGisData(filters: GisInfrastructureFilters = {}): Observable<GisDataSnapshot> {
    const params: Record<string, string> = {};
    if (filters.administrativeAreaId) params['administrativeAreaId'] = filters.administrativeAreaId;
    return this.http.get<unknown>(`${this.baseUrl}/gis/infrastructure`, { params }).pipe(
      timeout(15000),
      map((response) => {
        const data = record(unwrapApiData<unknown>(response));
        if (!Array.isArray(data['towers'])) throw new Error('Invalid GIS infrastructure response');
        return {
          towers: data['towers'].map(normalizeGisTower).filter((tower) => tower.id && validCoordinates(tower.latitude, tower.longitude)),
          anomalies: arrayOf(data['anomalies']).map(normalizeGisAnomaly).filter((item) => item.id && validCoordinates(item.latitude, item.longitude)),
          alerts: arrayOf(data['alerts']).map(normalizeGisAlert).filter((item) => item.id && validCoordinates(item.latitude, item.longitude)),
        };
      }),
    );
  }

  /** POST /towers/spatial-query: towers inside a GeoJSON polygon (closed [lng, lat] ring). */
  spatialQuery(request: SpatialTowerQueryRequest): Observable<readonly SelectableAsset[]> {
    return this.http.post<unknown>(`${this.baseUrl}/towers/spatial-query`, request).pipe(
      map((response) => {
        const data = unwrapApiData<unknown>(response);
        const items = Array.isArray(data) ? data : arrayOf(record(data)['towers']);
        return items.map(normalizeSpatialTower).filter((tower) => tower.towerId);
      }),
    );
  }
}

export function isPointInPolygon(
  point: { lat: number; lng: number },
  polygonCoords: readonly (readonly [number, number])[],
): boolean {
  const x = point.lng;
  const y = point.lat;
  let inside = false;
  for (let i = 0, j = polygonCoords.length - 1; i < polygonCoords.length; j = i++) {
    const xi = polygonCoords[i][0];
    const yi = polygonCoords[i][1];
    const xj = polygonCoords[j][0];
    const yj = polygonCoords[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const arrayOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

const stringValue = (value: unknown, fallback = '') =>
  value === undefined || value === null ? fallback : String(value);

const optionalString = (value: unknown): string | undefined => stringValue(value) || undefined;

const numberValue = (value: unknown, fallback = 0): number => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** TowerDto/GisTowerDto report 0,0 when a tower has no geometry; such points are not drawable. */
const validCoordinates = (latitude: number, longitude: number): boolean =>
  Number.isFinite(latitude) && Number.isFinite(longitude)
  && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
  && !(latitude === 0 && longitude === 0);

const normalizeGisTower = (item: unknown): GisTower => {
  const source = record(item);
  return {
    id: stringValue(source['id']),
    towerCode: stringValue(source['code'] ?? source['towerCode']),
    regionId: stringValue(source['regionId']),
    poleType: optionalString(source['poleType']),
    address: optionalString(source['address']),
    latitude: numberValue(source['latitude'], Number.NaN),
    longitude: numberValue(source['longitude'], Number.NaN),
  };
};

const normalizeGisAnomaly = (item: unknown): GisAnomalyFeature => {
  const source = record(item);
  const anomalyId = stringValue(source['anomalyId'] ?? source['id']);
  return {
    id: stringValue(source['id'] ?? anomalyId),
    anomalyId,
    towerId: optionalString(source['towerId']),
    towerCode: stringValue(source['towerCode']),
    category: stringValue(source['category']),
    severity: numberValue(source['severity']),
    latitude: numberValue(source['latitude'], Number.NaN),
    longitude: numberValue(source['longitude'], Number.NaN),
    status: stringValue(source['status']),
    confidenceScore: numberValue(source['confidenceScore']),
    imageUrl: optionalString(source['imageUrl']),
    detectedAt: optionalString(source['detectedAt']),
  };
};

const normalizeGisAlert = (item: unknown): GisAlert => {
  const source = record(item);
  return {
    id: stringValue(source['id']),
    anomalyId: optionalString(source['anomalyId']),
    towerId: optionalString(source['towerId']),
    towerCode: optionalString(source['towerCode']),
    latitude: numberValue(source['latitude'], Number.NaN),
    longitude: numberValue(source['longitude'], Number.NaN),
    status: stringValue(source['status']),
    priority: stringValue(source['priority']),
    title: stringValue(source['title']),
    triggeredAt: stringValue(source['triggeredAt']),
  };
};

/** SpatialTowerDto { towerId, towerCode, regionId, latitude, longitude } → mission target candidate. */
const normalizeSpatialTower = (item: unknown): SelectableAsset => {
  const source = record(item);
  const code = stringValue(source['towerCode'] ?? source['code']);
  return {
    towerId: stringValue(source['towerId'] ?? source['id']),
    code,
    name: code,
    latitude: numberValue(source['latitude']),
    longitude: numberValue(source['longitude']),
  };
};
