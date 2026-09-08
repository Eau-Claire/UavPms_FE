import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { EMPTY, expand, map, Observable, reduce, timeout } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { SelectableAsset, SpatialAssetQueryRequest } from '../../../models/assets.models';

export interface BoundingBoxQuery {
  readonly minLat: number;
  readonly minLng: number;
  readonly maxLat: number;
  readonly maxLng: number;
}

export interface GisTower {
  readonly id: string;
  readonly lineAssetId?: string;
  readonly towerCode: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly transmissionLineName?: string;
  readonly voltageLevel?: string; // 110kV, 220kV, 500kV
  readonly towerType?: string; // Tension, Suspension, Terminal
  readonly healthScore?: number;
  readonly riskLevel?: string;
  readonly status?: string;
  readonly assetsCount?: number;
  readonly activeAnomaliesCount?: number;
}

export interface GisTransmissionLine {
  readonly id: string;
  readonly lineCode: string;
  readonly lineName: string;
  readonly voltage: string;
  readonly coordinates: readonly [number, number][]; // [lat, lng][]
}

export interface GisAnomalyFeature {
  readonly id: string;
  readonly anomalyId: string;
  readonly assetCode: string;
  readonly category: string;
  readonly severity: number; // 1..5
  readonly towerCode: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly status: 'Pending' | 'Confirmed' | 'Resolved' | 'Rejected';
  readonly confidenceScore?: number;
  readonly imageUrl?: string;
  readonly detectedAt?: string;
}

export interface GisAlert {
  readonly id: string;
  readonly anomalyId?: string;
  readonly assetCode: string;
  readonly towerCode?: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly status: 'Active' | 'Resolved' | 'Dismissed';
  readonly priority: 'Critical' | 'High' | 'Medium';
  readonly title: string;
  readonly message?: string;
  readonly triggeredAt: string;
}

export interface GisDataSnapshot {
  readonly towers: readonly GisTower[];
  readonly lines: readonly GisTransmissionLine[];
  readonly anomalies: readonly GisAnomalyFeature[];
  readonly alerts: readonly GisAlert[];
}

@Injectable({
  providedIn: 'root',
})
export class GisApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  getTowersInBBox(bbox: BoundingBoxQuery): Observable<readonly GisTower[]> {
    return this.http
      .get<unknown>(`${this.baseUrl}/towers/in-bbox`, {
        params: {
          minLat: bbox.minLat,
          minLng: bbox.minLng,
          maxLat: bbox.maxLat,
          maxLng: bbox.maxLng,
        },
      })
      .pipe(
        timeout(3500),
        map((response) => {
          const raw = unwrapApiData<readonly unknown[]>(response);
          return Array.isArray(raw) ? raw.map(normalizeGisTower) : [];
        }),
      );
  }

  getAnomaliesGeoJson(): Observable<readonly GisAnomalyFeature[]> {
    return this.http.get<unknown>(`${this.baseUrl}/anomalies/geojson`).pipe(
      timeout(3500),
      map((response) => {
        const raw = unwrapApiData<Record<string, unknown>>(response);
        return normalizeGeoJsonAnomalies(raw);
      }),
    );
  }

  getActiveAlerts(): Observable<readonly GisAlert[]> {
    return this.http.get<unknown>(`${this.baseUrl}/alerts/active`).pipe(
      timeout(3500),
      map((response) => {
        const raw = unwrapApiData<readonly unknown[]>(response);
        return Array.isArray(raw) ? raw.map(normalizeGisAlert) : [];
      }),
    );
  }

  getInstantBaselineData(): GisDataSnapshot {
    return { towers: [], lines: [], anomalies: [], alerts: [] };
  }

  getRegions(): Observable<readonly { id: string; name: string }[]> {
    const page = (number: number) => this.http.get<unknown>(`${this.baseUrl}/regions`, { params: { page: number, pageSize: 100 } }).pipe(map((response) => {
      const data = record(unwrapApiData(response));
      const pagination = record(data['pagination']);
      return { page: number, totalPages: Number(pagination['totalPages'] ?? 1),
        items: itemsFromRecord(data).map((item) => { const region = record(item); return { id: stringValue(region['id']), name: stringValue(region['regionName'] ?? region['name']) }; }) };
    }));
    return page(1).pipe(expand((result) => result.page < result.totalPages ? page(result.page + 1) : EMPTY),
      reduce((all, result) => [...all, ...result.items], [] as { id: string; name: string }[]));
  }

  getAllGisData(filters: { administrativeAreaId?: string; powerLineId?: string } = {}): Observable<GisDataSnapshot> {
    return this.http.get<unknown>(`${this.baseUrl}/gis/infrastructure`, { params: { ...filters } }).pipe(
      timeout(15000),
      map((response) => {
        const data = record(unwrapApiData<unknown>(response));
        if (!Array.isArray(data['assets']) || !Array.isArray(data['powerLines'])) {
          throw new Error('Invalid GIS infrastructure response');
        }
        const lines = data['powerLines'].map((item): GisTransmissionLine => {
          const line = record(item);
          const wkt = stringValue(line['geometry']);
          const match = /^LINESTRING\s*\(([^()]+)\)$/i.exec(wkt);
          const coordinates: [number, number][] = match ? match[1].split(',').map((point) => {
            const [longitude, latitude] = point.trim().split(/\s+/).map(Number);
            return [latitude, longitude];
          }) : [];
          return { id: stringValue(line['id']), lineCode: stringValue(line['code']), lineName: stringValue(line['name']), voltage: stringValue(line['voltageLevel']), coordinates };
        });
        const towers = data['assets'].map((item): GisTower => {
          const asset = record(item);
          if (asset['latitude'] == null || asset['longitude'] == null) throw new Error('Missing GIS coordinates');
          const line = lines.find((line) => line.id === asset['powerLineId']);
          return { id: stringValue(asset['id']), towerCode: stringValue(asset['code']), lineAssetId: stringValue(asset['powerLineId']), latitude: Number(asset['latitude']), longitude: Number(asset['longitude']), towerType: stringValue(asset['assetType']), status: stringValue(asset['status']), transmissionLineName: line?.lineName, voltageLevel: line?.voltage };
        });
        if (towers.some((tower) => !tower.id || !Number.isFinite(tower.latitude) || !Number.isFinite(tower.longitude))) throw new Error('Invalid GIS asset coordinates');
        const anomalies = Array.isArray(data['anomalies']) ? normalizeGeoJsonAnomalies({ items: data['anomalies'] }) : [];
        const alerts = Array.isArray(data['alerts']) ? data['alerts'].map(normalizeGisAlert) : [];
        if ([...anomalies, ...alerts].some((item) => !item.id || !Number.isFinite(item.latitude) || !Number.isFinite(item.longitude))) throw new Error('Invalid GIS event coordinates');
        return { towers, lines, anomalies, alerts };
      }),
    );
  }

  spatialQuery(request: SpatialAssetQueryRequest): Observable<readonly SelectableAsset[]> {
    return this.http.post<unknown>(`${this.baseUrl}/assets/spatial-query`, request).pipe(
      map((response) => {
        const data = unwrapApiData<unknown>(response);
        const items = Array.isArray(data) ? data : itemsFromRecord(data);
        return items.map(normalizeSelectableAsset);
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

const stringValue = (value: unknown, fallback = '') =>
  value === undefined || value === null ? fallback : String(value);

const numberValue = (value: unknown) => Number(value ?? 0) || 0;

const pick = (source: Record<string, unknown>, ...keys: string[]) =>
  keys.map((key) => source[key]).find((value) => value !== undefined && value !== null);

const itemsFromRecord = (value: unknown): readonly unknown[] => {
  const source = record(value);
  const items = pick(source, 'items', 'assets', 'results', 'records');
  return Array.isArray(items) ? items : [];
};
const normalizeSelectableAsset = (item: unknown): SelectableAsset => {
  const source = record(item);
  return {
    assetId: stringValue(pick(source, 'assetId', 'id')),
    code: stringValue(pick(source, 'code', 'assetCode')),
    name: stringValue(pick(source, 'name', 'assetName', 'towerCode')),
    latitude: numberValue(pick(source, 'latitude', 'lat')),
    longitude: numberValue(pick(source, 'longitude', 'lng', 'lon')),
    status: stringValue(pick(source, 'status'), 'Operational'),
  };
};

const normalizeGisTower = (item: unknown): GisTower => {
  const s = record(item);
  return {
    id: stringValue(pick(s, 'id', 'towerId')),
    lineAssetId: stringValue(pick(s, 'lineAssetId', 'lineId')),
    towerCode: stringValue(pick(s, 'towerCode', 'code', 'name')),
    latitude: numberValue(pick(s, 'latitude', 'lat')),
    longitude: numberValue(pick(s, 'longitude', 'lng', 'lon')),
    transmissionLineName: stringValue(pick(s, 'transmissionLineName', 'lineName')),
    voltageLevel: stringValue(pick(s, 'voltageLevel', 'voltage')),
    towerType: stringValue(pick(s, 'towerType', 'type')),
    healthScore: numberValue(pick(s, 'healthScore', 'currentHealthScore')),
    riskLevel: stringValue(pick(s, 'riskLevel', 'risk')),
    assetsCount: numberValue(pick(s, 'assetsCount', 'assetTotal')),
    activeAnomaliesCount: numberValue(pick(s, 'activeAnomaliesCount', 'defectCount')) || 0,
  };
};

const normalizeGeoJsonAnomalies = (raw: Record<string, unknown>): readonly GisAnomalyFeature[] => {
  const features = (raw['features'] ?? raw['items'] ?? raw) as readonly unknown[];
  if (!Array.isArray(features)) throw new Error('Invalid anomaly response');

  return features.map((f) => {
    const feat = record(f);
    const geom = record(feat['geometry']);
    const coords = (geom['coordinates'] as readonly number[]) || [NaN, NaN];
    const props = record(feat['properties'] ?? feat);

    return {
      id: stringValue(pick(props, 'anomalyId', 'id')),
      anomalyId: stringValue(pick(props, 'anomalyId', 'id')),
      assetCode: stringValue(pick(props, 'assetCode', 'code')),
      category: stringValue(pick(props, 'category', 'categoryName', 'defectType')),
      severity: numberValue(pick(props, 'severity', 'severityWeight')),
      towerCode: stringValue(pick(props, 'towerCode', 'tower')),
      longitude: Number(props['longitude'] ?? coords[0]),
      latitude: Number(props['latitude'] ?? coords[1]),
      status: (stringValue(pick(props, 'status', 'validationStatus'))) as 'Pending' | 'Confirmed' | 'Resolved' | 'Rejected',
      confidenceScore: numberValue(pick(props, 'confidenceScore', 'confidence')),
      imageUrl: stringValue(pick(props, 'imageUrl', 'mediaUrl')),
      detectedAt: stringValue(pick(props, 'detectedAt', 'createdAt')),
    };
  });
};

const normalizeGisAlert = (item: unknown): GisAlert => {
  const s = record(item);
  return {
    id: stringValue(pick(s, 'id', 'alertId')),
    anomalyId: stringValue(pick(s, 'anomalyId', 'defectId')),
    assetCode: stringValue(pick(s, 'assetCode', 'asset')),
    towerCode: stringValue(pick(s, 'towerCode', 'tower')),
    latitude: numberValue(pick(s, 'latitude', 'lat')),
    longitude: numberValue(pick(s, 'longitude', 'lng')),
    status: (stringValue(pick(s, 'status'))) as 'Active' | 'Resolved' | 'Dismissed',
    priority: (stringValue(pick(s, 'priority', 'level'))) as 'Critical' | 'High' | 'Medium',
    title: stringValue(pick(s, 'title', 'headline')),
    message: stringValue(pick(s, 'message', 'description')),
    triggeredAt: stringValue(pick(s, 'triggeredAt', 'timestamp', 'createdAt')),
  };
};
