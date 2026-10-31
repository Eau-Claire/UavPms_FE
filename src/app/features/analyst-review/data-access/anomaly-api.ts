import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { TowerSummary } from '../../../models/assets.models';

export type AnomalyValidationStatus = 'Pending' | 'Confirmed' | 'Rejected' | 'Resolved';

/** Where the AI run that produced the anomaly executed (ERD v2.2 `ai_analysis_runs.execution_location`). */
export type AnomalyExecutionLocation = 'Edge' | 'Cloud' | 'Manual';

export interface AnomalyBoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly isNormalized?: boolean; // true if 0..1 or 0..100%
}

/** One item of `GET /anomalies/pending` (AIInspectionService, api_spec 7.5). */
export interface AnomalyItem {
  readonly id: string;
  readonly mediaUrl: string;
  readonly towerId: string | null;
  readonly towerCode: string | null;
  /** `missionCode` from the backend: currently the mission GUID of the media, or empty. */
  readonly missionCode: string | null;
  readonly missionName: string | null;
  readonly categoryName: string;
  readonly categoryCode: string | null;
  readonly boundingBox?: AnomalyBoundingBox;
  readonly confidenceScore: number; // 0..100
  readonly validationStatus: AnomalyValidationStatus;
  readonly analystNotes: string;
  /** Derived source: model name of the run, its execution location, or "Manual". */
  readonly aiSource: string;
  readonly analysisRunId: string | null;
  /** Known only when the backend exposes it (directly, via `aiSource` or via `GET /ai-analysis/{runId}`). */
  readonly executionLocation: AnomalyExecutionLocation | null;
  /** Set on an edge result that a cloud result replaced; points to the replacement. */
  readonly supersededById: string | null;
  readonly createdAt: string;
  readonly severity: number | null;
  readonly isEmergency: boolean;
}

export interface AnomalyPage {
  readonly items: readonly AnomalyItem[];
  readonly totalCount: number;
  readonly pageIndex: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

export interface AnomalyValidateRequest {
  readonly status: 'Confirmed' | 'Rejected';
  readonly analystNotes?: string;
}

export interface AnomalyListParams {
  readonly pageIndex?: number;
  readonly pageSize?: number;
  readonly search?: string;
}

/** Tower as returned by `GET /towers`. */
export type TowerLookupItem = TowerSummary;

export interface TowerSuggestion {
  readonly towerId: string;
  readonly towerCode: string;
  readonly regionId: string;
  readonly address: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly distanceMeters: number;
  readonly isCurrent: boolean;
}

/** `GET /anomalies/{id}/tower-suggestions` (api_spec 7.10). */
export interface TowerSuggestions {
  readonly anomalyId: string;
  readonly currentTowerId: string | null;
  /** "Anomaly" (anomaly GPS) or "Media" (capture location of its media). */
  readonly source: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusMeters: number;
  readonly towers: readonly TowerSuggestion[];
}

/** `PUT /anomalies/{id}/tower` response (api_spec 7.9). */
export interface AnomalyTowerAssignment {
  readonly anomalyId: string;
  readonly towerId: string;
  readonly towerCode: string;
  readonly validationStatus: string;
}

/** `GET /ai-analysis/{id}` (api_spec 7.1), only the fields the review page uses. */
export interface AnalysisRunInfo {
  readonly id: string;
  readonly executionLocation: AnomalyExecutionLocation | null;
  readonly modelName: string;
  readonly modelVersion: string;
  readonly status: string;
}

export const REJECT_REASONS = [
  { value: 'False Positive', label: 'Dương tính giả (False Positive) - Không có sự cố' },
  { value: 'Wrong Class', label: 'Sai phân loại (Wrong Class) - AI nhận diện nhầm loại lỗi' },
  { value: 'Poor Image Quality', label: 'Chất lượng ảnh kém (Poor Quality) - Mờ/Nhiễu/Thiếu sáng' },
  { value: 'Duplicate', label: 'Trùng lặp (Duplicate) - Đã được ghi nhận ở góc chụp khác' },
  { value: 'Insufficient Evidence', label: 'Chưa đủ chứng cứ (Insufficient Evidence)' },
  { value: 'Other', label: 'Lý do khác (Other)' },
] as const;

export const EXECUTION_LOCATION_LABELS: Record<AnomalyExecutionLocation, string> = {
  Edge: 'Edge (trên UAV)',
  Cloud: 'Cloud (máy chủ)',
  Manual: 'Tạo thủ công',
};

/** Vietnamese messages for the business error codes of the anomaly endpoints. */
const ANOMALY_ERROR_MESSAGES: Record<string, string> = {
  TOWER_REQUIRED: 'Bất thường chưa được gắn cột điện. Vui lòng gán cột điện trước khi xác nhận.',
  INVALID_TOWER: 'Mã cột điện không hợp lệ.',
  ANOMALY_SUPERSEDED: 'Kết quả Edge này đã được kết quả Cloud thay thế. Hãy thao tác trên kết quả thay thế.',
  ANOMALY_RESOLVED: 'Bất thường đã được xử lý xong, không thể đổi cột điện.',
  LOCATION_UNKNOWN: 'Bất thường và ảnh gốc đều không có tọa độ GPS. Vui lòng tìm và chọn cột điện thủ công.',
  NOT_FOUND: 'Không tìm thấy bất thường hoặc cột điện.',
};

export const apiErrorCode = (error: unknown): string | null => {
  if (!(error instanceof HttpErrorResponse)) return null;
  const body = error.error;
  if (!body || typeof body !== 'object') return null;
  const code = (body as Record<string, unknown>)['errorCode'];
  return typeof code === 'string' && code ? code : null;
};

export const anomalyErrorMessage = (error: unknown, fallback = 'Đã xảy ra lỗi khi xử lý yêu cầu.'): string => {
  if (!(error instanceof HttpErrorResponse)) return fallback;
  const code = apiErrorCode(error);
  if (code && ANOMALY_ERROR_MESSAGES[code]) return ANOMALY_ERROR_MESSAGES[code];
  if (error.status === 0) return 'Không thể kết nối đến máy chủ.';
  if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  if (error.status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  if (error.status === 404) return ANOMALY_ERROR_MESSAGES['NOT_FOUND'];
  const body = error.error as Record<string, unknown> | null;
  const message = body && typeof body === 'object' ? body['message'] : null;
  return typeof message === 'string' && message ? message : fallback;
};

@Injectable({
  providedIn: 'root',
})
export class AnomalyApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  listPending(params?: AnomalyListParams): Observable<AnomalyPage> {
    const pageIndex = params?.pageIndex ?? 1;
    const pageSize = params?.pageSize ?? 12;

    const queryParams: Record<string, string | number> = { pageIndex, pageSize };
    const search = params?.search?.trim();
    if (search) queryParams['search'] = search;

    return this.http
      .get<unknown>(`${this.baseUrl}/anomalies/pending`, { params: queryParams })
      .pipe(map((response) => normalizeAnomalyPage(unwrapApiData(response), pageIndex, pageSize)));
  }

  validate(id: string, request: AnomalyValidateRequest): Observable<void> {
    return this.http
      .put<unknown>(`${this.baseUrl}/anomalies/${encodeURIComponent(id)}/validate`, request)
      .pipe(map(() => undefined));
  }

  assignTower(id: string, towerId: string): Observable<AnomalyTowerAssignment> {
    return this.http
      .put<unknown>(`${this.baseUrl}/anomalies/${encodeURIComponent(id)}/tower`, { towerId })
      .pipe(map((response) => normalizeTowerAssignment(unwrapApiData(response), id, towerId)));
  }

  getTowerSuggestions(id: string, radiusMeters = 300, limit = 5): Observable<TowerSuggestions> {
    return this.http
      .get<unknown>(`${this.baseUrl}/anomalies/${encodeURIComponent(id)}/tower-suggestions`, {
        params: { radiusMeters, limit },
      })
      .pipe(map((response) => normalizeTowerSuggestions(unwrapApiData(response), id)));
  }

  /** Manual tower lookup (`GET /towers?search=`), used when no GPS suggestion fits. */
  searchTowers(search: string, pageSize = 10): Observable<readonly TowerLookupItem[]> {
    const params: Record<string, string | number> = { page: 1, pageSize };
    if (search.trim()) params['search'] = search.trim();
    return this.http
      .get<unknown>(`${this.baseUrl}/towers`, { params })
      .pipe(map((response) => itemsOf(unwrapApiData(response)).map(normalizeTower)));
  }

  /** Reads the AI run behind an anomaly to show where it executed. Resolves to null when unavailable. */
  getAnalysisRun(runId: string): Observable<AnalysisRunInfo | null> {
    return this.http.get<unknown>(`${this.baseUrl}/ai-analysis/${encodeURIComponent(runId)}`).pipe(
      map((response) => normalizeAnalysisRun(unwrapApiData(response))),
      catchError(() => of(null)),
    );
  }
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const pick = (source: Record<string, unknown>, ...keys: string[]) =>
  keys.map((key) => source[key]).find((value) => value !== undefined && value !== null);

const stringValue = (value: unknown, fallback = '') =>
  value === undefined || value === null ? fallback : String(value);

const optionalString = (value: unknown): string | null => {
  const text = stringValue(value).trim();
  return text ? text : null;
};

const numberValue = (value: unknown) => Number(value ?? 0) || 0;

const itemsOf = (value: unknown): readonly unknown[] => {
  if (Array.isArray(value)) return value;
  const items = record(value)['items'];
  return Array.isArray(items) ? items : [];
};

export const toExecutionLocation = (value: unknown): AnomalyExecutionLocation | null => {
  const text = stringValue(value).trim().toLowerCase();
  if (text === 'edge') return 'Edge';
  if (text === 'cloud') return 'Cloud';
  if (text === 'manual') return 'Manual';
  return null;
};

export const parseBoundingBox = (value: unknown): AnomalyBoundingBox | undefined => {
  if (!value) return undefined;

  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  if (Array.isArray(parsed) && parsed.length >= 4) {
    const [x, y, w, h] = parsed.map(numberValue);
    const isNorm = x <= 1 && y <= 1 && w <= 1 && h <= 1;
    return {
      x: isNorm ? x * 100 : x,
      y: isNorm ? y * 100 : y,
      width: isNorm ? w * 100 : w,
      height: isNorm ? h * 100 : h,
      isNormalized: isNorm,
    };
  }

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const x = numberValue(obj['x'] ?? obj['left'] ?? obj['xMin'] ?? obj['xmin']);
    const y = numberValue(obj['y'] ?? obj['top'] ?? obj['yMin'] ?? obj['ymin']);
    const w = numberValue(obj['w'] ?? obj['width'] ?? (numberValue(obj['xMax'] ?? obj['xmax']) - x));
    const h = numberValue(obj['h'] ?? obj['height'] ?? (numberValue(obj['yMax'] ?? obj['ymax']) - y));
    const isNorm = x <= 1 && y <= 1 && w <= 1 && h <= 1 && (x > 0 || y > 0 || w > 0);
    return {
      x: isNorm ? x * 100 : x,
      y: isNorm ? y * 100 : y,
      width: isNorm ? w * 100 : w,
      height: isNorm ? h * 100 : h,
      isNormalized: isNorm,
    };
  }

  return undefined;
};

const toValidationStatus = (value: unknown): AnomalyValidationStatus => {
  const status = stringValue(value, 'Pending').toLowerCase();
  if (status === 'confirmed' || status === 'approved') return 'Confirmed';
  if (status === 'rejected' || status === 'dismissed') return 'Rejected';
  if (status === 'resolved') return 'Resolved';
  return 'Pending';
};

export const normalizeAnomalyItem = (item: unknown, index = 0): AnomalyItem => {
  const source = record(item);
  const rawConfidence = numberValue(pick(source, 'confidenceScore', 'confidence'));
  const confidenceScore = rawConfidence > 1 ? Math.round(rawConfidence) : Math.round(rawConfidence * 100);

  const rawUrl = stringValue(pick(source, 'mediaUrl', 'imageUrl', 'fileUrl'));
  const mediaUrl = !rawUrl || /^(https?:|blob:|data:|\/)/.test(rawUrl) ? rawUrl : `/${rawUrl}`;

  const aiSource = stringValue(pick(source, 'aiSource', 'aiModelName'));
  const analysisRunId = optionalString(source['analysisRunId']);
  const towerId = optionalString(source['towerId']);
  // The backend falls back to the tower GUID when the code is unknown; do not show a GUID as a code.
  const rawTowerCode = optionalString(source['towerCode']);
  const towerCode = rawTowerCode && rawTowerCode !== towerId ? rawTowerCode : null;
  const severity = Number(pick(source, 'severity', 'severityWeight'));

  return {
    id: stringValue(pick(source, 'id', 'anomalyId'), `anomaly-${index + 1}`),
    mediaUrl,
    towerId,
    towerCode,
    missionCode: optionalString(source['missionCode']),
    missionName: optionalString(source['missionName']),
    categoryName: stringValue(pick(source, 'categoryName', 'title'), 'Chưa phân loại'),
    categoryCode: optionalString(source['categoryCode']),
    boundingBox: parseBoundingBox(pick(source, 'boundingBox', 'rawBoundingBox')),
    confidenceScore,
    validationStatus: toValidationStatus(source['validationStatus']),
    analystNotes: stringValue(source['analystNotes']),
    aiSource,
    analysisRunId,
    executionLocation:
      toExecutionLocation(source['executionLocation']) ??
      (analysisRunId ? toExecutionLocation(aiSource) : 'Manual'),
    supersededById: optionalString(source['supersededById']),
    createdAt: stringValue(source['createdAt']),
    severity: Number.isFinite(severity) && severity > 0 ? severity : null,
    isEmergency: Boolean(pick(source, 'isEmergency', 'isEmergencyClass')),
  };
};

const normalizeAnomalyPage = (value: unknown, pageIndex: number, pageSize: number): AnomalyPage => {
  const raw = record(value);
  const items = itemsOf(value).map((item, idx) => normalizeAnomalyItem(item, idx));
  const totalCount = numberValue(raw['totalCount']) || items.length;
  const totalPages = numberValue(raw['totalPages']) || Math.ceil(totalCount / pageSize);

  return {
    items,
    totalCount,
    pageIndex: numberValue(raw['pageIndex']) || pageIndex,
    pageSize: numberValue(raw['pageSize']) || pageSize,
    totalPages: Math.max(1, totalPages),
  };
};

const normalizeTower = (value: unknown): TowerLookupItem => {
  const source = record(value);
  return {
    id: stringValue(source['id']),
    regionId: stringValue(source['regionId']),
    regionName: optionalString(source['regionName']) ?? undefined,
    towerCode: stringValue(source['towerCode']),
    poleType: optionalString(source['poleType']) ?? undefined,
    address: optionalString(source['address']) ?? undefined,
    latitude: numberValue(source['latitude']),
    longitude: numberValue(source['longitude']),
  };
};

const normalizeTowerSuggestions = (value: unknown, anomalyId: string): TowerSuggestions => {
  const source = record(value);
  const towers = Array.isArray(source['towers']) ? (source['towers'] as unknown[]) : [];
  return {
    anomalyId: stringValue(source['anomalyId'], anomalyId),
    currentTowerId: optionalString(source['currentTowerId']),
    source: stringValue(source['source']),
    latitude: numberValue(source['latitude']),
    longitude: numberValue(source['longitude']),
    radiusMeters: numberValue(source['radiusMeters']),
    towers: towers.map((tower) => {
      const t = record(tower);
      return {
        towerId: stringValue(t['towerId']),
        towerCode: stringValue(t['towerCode']),
        regionId: stringValue(t['regionId']),
        address: optionalString(t['address']),
        latitude: numberValue(t['latitude']),
        longitude: numberValue(t['longitude']),
        distanceMeters: numberValue(t['distanceMeters']),
        isCurrent: Boolean(t['isCurrent']),
      };
    }),
  };
};

const normalizeTowerAssignment = (value: unknown, anomalyId: string, towerId: string): AnomalyTowerAssignment => {
  const source = record(value);
  return {
    anomalyId: stringValue(source['anomalyId'], anomalyId),
    towerId: stringValue(source['towerId'], towerId),
    towerCode: stringValue(source['towerCode']),
    validationStatus: stringValue(source['validationStatus'], 'Pending'),
  };
};

const normalizeAnalysisRun = (value: unknown): AnalysisRunInfo | null => {
  const source = record(value);
  const id = optionalString(source['id']);
  if (!id) return null;
  return {
    id,
    executionLocation: toExecutionLocation(source['executionLocation']),
    modelName: stringValue(source['modelName']),
    modelVersion: stringValue(source['modelVersion']),
    status: stringValue(source['status']),
  };
};

/** The anomalies to show, with superseded edge results grouped under their cloud replacement. */
export interface SupersededGrouping {
  readonly visible: readonly AnomalyItem[];
  readonly supersededByReplacement: ReadonlyMap<string, readonly AnomalyItem[]>;
  readonly hiddenCount: number;
}

export const groupSuperseded = (items: readonly AnomalyItem[]): SupersededGrouping => {
  const visible: AnomalyItem[] = [];
  const grouped = new Map<string, AnomalyItem[]>();
  for (const item of items) {
    if (!item.supersededById) {
      visible.push(item);
      continue;
    }
    grouped.set(item.supersededById, [...(grouped.get(item.supersededById) ?? []), item]);
  }
  return { visible, supersededByReplacement: grouped, hiddenCount: items.length - visible.length };
};
