import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
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
        map((response) => {
          const raw = unwrapApiData<readonly unknown[]>(response);
          return Array.isArray(raw) ? raw.map(normalizeGisTower) : [];
        }),
        catchError((err: HttpErrorResponse) => {
          if (err.status === 404 || err.status === 0 || err.status === 502) {
            return of(MOCK_GIS_TOWERS);
          }
          throw err;
        }),
      );
  }

  getAnomaliesGeoJson(): Observable<readonly GisAnomalyFeature[]> {
    return this.http.get<unknown>(`${this.baseUrl}/anomalies/geojson`).pipe(
      map((response) => {
        const raw = unwrapApiData<Record<string, unknown>>(response);
        return normalizeGeoJsonAnomalies(raw);
      }),
      catchError((err: HttpErrorResponse) => {
        if (err.status === 404 || err.status === 0 || err.status === 502) {
          return of(MOCK_GIS_ANOMALIES);
        }
        throw err;
      }),
    );
  }

  getActiveAlerts(): Observable<readonly GisAlert[]> {
    return this.http.get<unknown>(`${this.baseUrl}/alerts/active`).pipe(
      map((response) => {
        const raw = unwrapApiData<readonly unknown[]>(response);
        return Array.isArray(raw) ? raw.map(normalizeGisAlert) : [];
      }),
      catchError((err: HttpErrorResponse) => {
        if (err.status === 404 || err.status === 0 || err.status === 502) {
          return of(MOCK_GIS_ALERTS);
        }
        throw err;
      }),
    );
  }

  getAllGisData(): Observable<GisDataSnapshot> {
    return of({
      towers: MOCK_GIS_TOWERS,
      lines: MOCK_TRANSMISSION_LINES,
      anomalies: MOCK_GIS_ANOMALIES,
      alerts: MOCK_GIS_ALERTS,
    });
  }

  spatialQuery(request: SpatialAssetQueryRequest): Observable<readonly SelectableAsset[]> {
    return this.http.post<unknown>(`${this.baseUrl}/assets/spatial-query`, request).pipe(
      map((response) => {
        const data = unwrapApiData<unknown>(response);
        const items = Array.isArray(data) ? data : itemsFromRecord(data);
        return items.map(normalizeSelectableAsset);
      }),
      catchError((err: HttpErrorResponse) => {
        if (err.status === 404 || err.status === 0 || err.status === 500 || err.status === 502) {
          const ring = request.geometry.coordinates[0] || [];
          const matchedTowers = MOCK_GIS_TOWERS.filter((t) =>
            isPointInPolygon({ lat: t.latitude, lng: t.longitude }, ring),
          );
          const selectable: SelectableAsset[] = matchedTowers.map((t) => ({
            assetId: t.id,
            code: t.towerCode,
            name: t.towerCode,
            latitude: t.latitude,
            longitude: t.longitude,
            status: 'Operational',
          }));
          return of(selectable);
        }
        throw err;
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
    id: stringValue(pick(s, 'id', 'towerId'), 'tow-unknown'),
    lineAssetId: stringValue(pick(s, 'lineAssetId', 'lineId')),
    towerCode: stringValue(pick(s, 'towerCode', 'code', 'name'), 'TOW-220KV-001'),
    latitude: numberValue(pick(s, 'latitude', 'lat')) || 20.95,
    longitude: numberValue(pick(s, 'longitude', 'lng', 'lon')) || 105.75,
    transmissionLineName: stringValue(pick(s, 'transmissionLineName', 'lineName'), 'Đường dây 220kV Hòa Bình - Hà Đông'),
    voltageLevel: stringValue(pick(s, 'voltageLevel', 'voltage'), '220kV'),
    towerType: stringValue(pick(s, 'towerType', 'type'), 'Cột đỡ néo'),
    healthScore: numberValue(pick(s, 'healthScore', 'currentHealthScore')) || 85,
    riskLevel: stringValue(pick(s, 'riskLevel', 'risk'), 'Thấp'),
    assetsCount: numberValue(pick(s, 'assetsCount', 'assetTotal')) || 4,
    activeAnomaliesCount: numberValue(pick(s, 'activeAnomaliesCount', 'defectCount')) || 0,
  };
};

const normalizeGeoJsonAnomalies = (raw: Record<string, unknown>): readonly GisAnomalyFeature[] => {
  const features = (raw['features'] ?? raw['items'] ?? raw) as readonly unknown[];
  if (!Array.isArray(features)) return MOCK_GIS_ANOMALIES;

  return features.map((f, idx) => {
    const feat = record(f);
    const geom = record(feat['geometry']);
    const coords = (geom['coordinates'] as readonly number[]) || [105.7942, 21.0084];
    const props = record(feat['properties'] ?? feat);

    return {
      id: stringValue(pick(props, 'anomalyId', 'id'), `ano-${idx + 1}`),
      anomalyId: stringValue(pick(props, 'anomalyId', 'id'), `ano-${idx + 1}`),
      assetCode: stringValue(pick(props, 'assetCode', 'code'), 'INS-TOW05-01'),
      category: stringValue(pick(props, 'category', 'categoryName', 'defectType'), 'Insulator Damage'),
      severity: numberValue(pick(props, 'severity', 'severityWeight')) || 4,
      towerCode: stringValue(pick(props, 'towerCode', 'tower'), 'TOW-N1-05'),
      longitude: coords[0] || 105.7942,
      latitude: coords[1] || 21.0084,
      status: (stringValue(pick(props, 'status', 'validationStatus'), 'Confirmed')) as 'Pending' | 'Confirmed' | 'Resolved' | 'Rejected',
      confidenceScore: numberValue(pick(props, 'confidenceScore', 'confidence')) || 92,
      imageUrl: stringValue(pick(props, 'imageUrl', 'mediaUrl'), '/images/defect-insulator-crack.png'),
      detectedAt: stringValue(pick(props, 'detectedAt', 'createdAt'), new Date().toISOString()),
    };
  });
};

const normalizeGisAlert = (item: unknown): GisAlert => {
  const s = record(item);
  return {
    id: stringValue(pick(s, 'id', 'alertId'), 'alert-01'),
    anomalyId: stringValue(pick(s, 'anomalyId', 'defectId')),
    assetCode: stringValue(pick(s, 'assetCode', 'asset'), 'INS-TOW05-01'),
    towerCode: stringValue(pick(s, 'towerCode', 'tower'), 'TOW-N1-05'),
    latitude: numberValue(pick(s, 'latitude', 'lat')) || 21.0084,
    longitude: numberValue(pick(s, 'longitude', 'lng')) || 105.7942,
    status: (stringValue(pick(s, 'status'), 'Active')) as 'Active' | 'Resolved' | 'Dismissed',
    priority: (stringValue(pick(s, 'priority', 'level'), 'Critical')) as 'Critical' | 'High' | 'Medium',
    title: stringValue(pick(s, 'title', 'headline'), 'Sự cố quá nhiệt / Phóng điện khẩn cấp'),
    message: stringValue(pick(s, 'message', 'description'), 'Phát hiện điểm phát nhiệt vượt ngưỡng 80°C tại chuỗi sứ đỡ pha B.'),
    triggeredAt: stringValue(pick(s, 'triggeredAt', 'timestamp', 'createdAt'), new Date().toISOString()),
  };
};

export const MOCK_GIS_TOWERS: readonly GisTower[] = [
  {
    id: 'tow-041',
    lineAssetId: 'line-hb-hd',
    towerCode: 'Cột 041 (TOW-220KV-041)',
    latitude: 20.9985,
    longitude: 105.7725,
    transmissionLineName: 'Đường dây 220kV Hòa Bình - Hà Đông',
    voltageLevel: '220kV',
    towerType: 'Cột néo góc',
    healthScore: 92,
    riskLevel: 'Rất thấp',
    assetsCount: 6,
    activeAnomaliesCount: 0,
  },
  {
    id: 'tow-042',
    lineAssetId: 'line-hb-hd',
    towerCode: 'Cột 042 (TOW-220KV-042)',
    latitude: 21.0084,
    longitude: 105.7942,
    transmissionLineName: 'Đường dây 220kV Hòa Bình - Hà Đông',
    voltageLevel: '220kV',
    towerType: 'Cột đỡ trung gian',
    healthScore: 68,
    riskLevel: 'Cao',
    assetsCount: 4,
    activeAnomaliesCount: 2,
  },
  {
    id: 'tow-043',
    lineAssetId: 'line-hb-hd',
    towerCode: 'Cột 043 (TOW-220KV-043)',
    latitude: 21.0195,
    longitude: 105.8155,
    transmissionLineName: 'Đường dây 220kV Hòa Bình - Hà Đông',
    voltageLevel: '220kV',
    towerType: 'Cột đỡ chuỗi kép',
    healthScore: 74,
    riskLevel: 'Trung bình',
    assetsCount: 4,
    activeAnomaliesCount: 1,
  },
  {
    id: 'tow-044',
    lineAssetId: 'line-hb-hd',
    towerCode: 'Cột 044 (TOW-220KV-044)',
    latitude: 21.0310,
    longitude: 105.8360,
    transmissionLineName: 'Đường dây 220kV Hòa Bình - Hà Đông',
    voltageLevel: '220kV',
    towerType: 'Cột vượt sông/vùng đồi',
    healthScore: 81,
    riskLevel: 'Thấp',
    assetsCount: 5,
    activeAnomaliesCount: 1,
  },
  {
    id: 'tow-045',
    lineAssetId: 'line-hb-hd',
    towerCode: 'Cột 045 (TOW-220KV-045)',
    latitude: 21.0425,
    longitude: 105.8580,
    transmissionLineName: 'Đường dây 220kV Hòa Bình - Hà Đông',
    voltageLevel: '220kV',
    towerType: 'Cột néo hãm',
    healthScore: 95,
    riskLevel: 'Rất thấp',
    assetsCount: 6,
    activeAnomaliesCount: 0,
  },
  {
    id: 'tow-051',
    lineAssetId: 'line-nq-tt',
    towerCode: 'Cột 102 (TOW-500KV-102)',
    latitude: 20.9750,
    longitude: 105.7890,
    transmissionLineName: 'Đường dây 500kV Nho Quan - Thường Tín',
    voltageLevel: '500kV',
    towerType: 'Cột đỡ thân lớn 500kV',
    healthScore: 88,
    riskLevel: 'Thấp',
    assetsCount: 8,
    activeAnomaliesCount: 0,
  },
  {
    id: 'tow-052',
    lineAssetId: 'line-nq-tt',
    towerCode: 'Cột 103 (TOW-500KV-103)',
    latitude: 20.9880,
    longitude: 105.8220,
    transmissionLineName: 'Đường dây 500kV Nho Quan - Thường Tín',
    voltageLevel: '500kV',
    towerType: 'Cột néo chịu lực',
    healthScore: 59,
    riskLevel: 'Khẩn cấp',
    assetsCount: 8,
    activeAnomaliesCount: 2,
  },
];

export const MOCK_TRANSMISSION_LINES: readonly GisTransmissionLine[] = [
  {
    id: 'line-hb-hd',
    lineCode: 'LINE-220KV-HB-HD',
    lineName: 'Đường dây 220kV Hòa Bình - Hà Đông',
    voltage: '220kV',
    coordinates: [
      [20.9985, 105.7725],
      [21.0084, 105.7942],
      [21.0195, 105.8155],
      [21.0310, 105.8360],
      [21.0425, 105.8580],
    ],
  },
  {
    id: 'line-nq-tt',
    lineCode: 'LINE-500KV-NQ-TT',
    lineName: 'Đường dây 500kV Nho Quan - Thường Tín',
    voltage: '500kV',
    coordinates: [
      [20.9750, 105.7890],
      [20.9880, 105.8220],
      [21.0195, 105.8155],
    ],
  },
];

export const MOCK_GIS_ANOMALIES: readonly GisAnomalyFeature[] = [
  {
    id: 'ano-gis-01',
    anomalyId: 'ano-001',
    assetCode: 'INS-TOW05-01',
    category: 'Bát cách điện nứt vỡ (Insulator Damage)',
    severity: 5,
    towerCode: 'Cột 042 (TOW-220KV-042)',
    latitude: 21.0084,
    longitude: 105.7942,
    status: 'Confirmed',
    confidenceScore: 94,
    imageUrl: '/images/defect-insulator-crack.png',
    detectedAt: '2026-06-17T14:30:00Z',
  },
  {
    id: 'ano-gis-02',
    anomalyId: 'ano-002',
    assetCode: 'INS-TOW05-02',
    category: 'Vết phóng điện bề mặt (Flashover Trace)',
    severity: 4,
    towerCode: 'Cột 042 (TOW-220KV-042)',
    latitude: 21.0089,
    longitude: 105.7947,
    status: 'Pending',
    confidenceScore: 89,
    imageUrl: '/images/defect-insulator-flashover.png',
    detectedAt: '2026-06-17T16:00:00Z',
  },
  {
    id: 'ano-gis-03',
    anomalyId: 'ano-003',
    assetCode: 'INS-TOW06-01',
    category: 'Bám bẩn bề mặt cách điện (Dirty Insulator)',
    severity: 3,
    towerCode: 'Cột 043 (TOW-220KV-043)',
    latitude: 21.0195,
    longitude: 105.8155,
    status: 'Pending',
    confidenceScore: 91,
    imageUrl: '/images/defect-insulator-dirty.png',
    detectedAt: '2026-06-18T08:15:00Z',
  },
  {
    id: 'ano-gis-04',
    anomalyId: 'ano-004',
    assetCode: 'COND-TOW06-03',
    category: 'Xơ tước dây dẫn (Conductor Strand Damage)',
    severity: 5,
    towerCode: 'Cột 044 (TOW-220KV-044)',
    latitude: 21.0310,
    longitude: 105.8360,
    status: 'Confirmed',
    confidenceScore: 87,
    imageUrl: '/images/defect-conductor-damage.png',
    detectedAt: '2026-06-18T10:30:00Z',
  },
  {
    id: 'ano-gis-05',
    anomalyId: 'ano-005',
    assetCode: 'TWR-TOW07-X1',
    category: 'Cháy lan hành lang an toàn (Corridor Fire Hazard)',
    severity: 5,
    towerCode: 'Cột 103 (TOW-500KV-103)',
    latitude: 20.9880,
    longitude: 105.8220,
    status: 'Confirmed',
    confidenceScore: 96,
    imageUrl: '/images/defect-preview-frame.png',
    detectedAt: '2026-06-18T11:00:00Z',
  },
];

export const MOCK_GIS_ALERTS: readonly GisAlert[] = [
  {
    id: 'alert-01',
    anomalyId: 'ano-gis-05',
    assetCode: 'TWR-TOW07-X1',
    towerCode: 'Cột 103 (TOW-500KV-103)',
    latitude: 20.9880,
    longitude: 105.8220,
    status: 'Active',
    priority: 'Critical',
    title: 'Cảnh báo khẩn cấp: Nguy cơ cháy rừng sát cột 500kV',
    message: 'Nhiệt độ môi trường tăng cao đột ngột kết hợp khói phát hiện từ UAV camera nhiệt.',
    triggeredAt: '2026-06-18T11:15:00Z',
  },
  {
    id: 'alert-02',
    anomalyId: 'ano-gis-01',
    assetCode: 'INS-TOW05-01',
    towerCode: 'Cột 042 (TOW-220KV-042)',
    latitude: 21.0084,
    longitude: 105.7942,
    status: 'Active',
    priority: 'High',
    title: 'Cảnh báo sự cố: Nứt vỡ chuỗi cách điện néo',
    message: 'Nguy cơ phóng điện cao trong điều kiện trời mưa ẩm.',
    triggeredAt: '2026-06-17T15:00:00Z',
  },
];
