import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';

export type AnomalyValidationStatus = 'Pending' | 'Confirmed' | 'Rejected' | 'Approved' | 'Dismissed';

export interface AnomalyBoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly isNormalized?: boolean; // true if 0..1 or 0..100%
}

export interface AnomalyItem {
  readonly id: string;
  readonly mediaUrl: string;
  readonly assetCode: string;
  readonly towerCode?: string;
  readonly missionCode?: string;
  readonly missionName?: string;
  readonly categoryName: string;
  readonly categoryCode?: string;
  readonly boundingBox?: AnomalyBoundingBox;
  readonly confidenceScore: number; // 0..1 or 0..100
  readonly validationStatus: AnomalyValidationStatus;
  readonly analystNotes?: string;
  readonly aiModelName?: string;
  readonly createdAt: string;
  readonly severity?: number;
  readonly isEmergency?: boolean;
}

export interface AnomalyPage {
  readonly items: readonly AnomalyItem[];
  readonly totalCount: number;
  readonly pageIndex: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

export interface AnomalyValidateRequest {
  readonly status: 'Confirmed' | 'Rejected' | 'Approved';
  readonly analystNotes?: string;
}

export interface AnomalyListParams {
  readonly pageIndex?: number;
  readonly pageSize?: number;
  readonly search?: string;
  readonly status?: string;
}

export const REJECT_REASONS = [
  { value: 'False Positive', label: 'Dương tính giả (False Positive) - Không có sự cố' },
  { value: 'Wrong Class', label: 'Sai phân loại (Wrong Class) - AI nhận diện nhầm loại lỗi' },
  { value: 'Poor Image Quality', label: 'Chất lượng ảnh kém (Poor Quality) - Mờ/Nhiễu/Thiếu sáng' },
  { value: 'Duplicate', label: 'Trùng lặp (Duplicate) - Đã được ghi nhận ở góc chụp khác' },
  { value: 'Insufficient Evidence', label: 'Chưa đủ chứng cứ (Insufficient Evidence)' },
  { value: 'Other', label: 'Lý do khác (Other)' },
] as const;

// In-memory / local storage mock store when backend 404
const MOCK_STORAGE_KEY = 'uavpms.mock.anomalies';

@Injectable({
  providedIn: 'root',
})
export class AnomalyApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  listPending(params?: AnomalyListParams): Observable<AnomalyPage> {
    const pageIndex = params?.pageIndex ?? 1;
    const pageSize = params?.pageSize ?? 12;

    const queryParams: Record<string, string | number> = {
      pageIndex,
      pageSize,
    };

    return this.http
      .get<unknown>(`${this.baseUrl}/anomalies/pending`, { params: queryParams })
      .pipe(
        map((response) => {
          const raw = unwrapApiData<Record<string, unknown>>(response);
          return normalizeAnomalyPage(raw, pageIndex, pageSize);
        }),
        catchError((error: HttpErrorResponse) => {
          // If backend endpoint is not implemented or returns 404, fallback to simulated detections
          if (error.status === 404 || error.status === 0 || error.status === 502) {
            return of(this.getFallbackAnomalyPage(pageIndex, pageSize));
          }
          throw error;
        }),
      );
  }

  validate(id: string, request: AnomalyValidateRequest): Observable<void> {
    return this.http
      .put<void>(`${this.baseUrl}/anomalies/${encodeURIComponent(id)}/validate`, request)
      .pipe(
        catchError((error: HttpErrorResponse) => {
          if (error.status === 404 || error.status === 0) {
            // Update local mock store on 404 fallback
            this.updateLocalMockStatus(id, request.status, request.analystNotes);
            return of(undefined as unknown as void);
          }
          throw error;
        }),
      );
  }

  private getFallbackAnomalyPage(pageIndex: number, pageSize: number): AnomalyPage {
    const allItems = this.getOrInitMockDetections();
    const pendingItems = allItems.filter((it) => it.validationStatus === 'Pending');

    const startIndex = (pageIndex - 1) * pageSize;
    const items = pendingItems.slice(startIndex, startIndex + pageSize);
    const totalCount = pendingItems.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    return {
      items,
      totalCount,
      pageIndex,
      pageSize,
      totalPages,
    };
  }

  private getOrInitMockDetections(): AnomalyItem[] {
    try {
      const saved = localStorage.getItem(MOCK_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved) as AnomalyItem[];
      }
    } catch {
      // ignore
    }

    const defaultMocks = createInitialMockAnomalies();
    try {
      localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(defaultMocks));
    } catch {
      // ignore
    }
    return defaultMocks;
  }

  private updateLocalMockStatus(id: string, status: AnomalyValidationStatus, notes?: string): void {
    try {
      const items = this.getOrInitMockDetections();
      const next = items.map((it) =>
        it.id === id
          ? {
              ...it,
              validationStatus: status,
              analystNotes: notes || it.analystNotes,
            }
          : it,
      );
      localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }
}

const createInitialMockAnomalies = (): AnomalyItem[] => [
  {
    id: 'ano-001',
    mediaUrl: '/images/defect-insulator-crack.png',
    assetCode: 'INS-TOW05-01',
    towerCode: 'Cột 042 (TOW-220KV-042)',
    missionCode: 'MIS-20260617-01',
    missionName: 'Bay kiểm tra định kỳ tuyến Hòa Bình - Hà Đông',
    categoryName: 'Bát cách điện nứt vỡ (Insulator Damage)',
    categoryCode: 'DEF-INS-CRACK',
    boundingBox: { x: 32, y: 22, width: 34, height: 38, isNormalized: true },
    confidenceScore: 94,
    validationStatus: 'Pending',
    aiModelName: 'YOLOv8-PowerGrid-v2.4',
    createdAt: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
    severity: 5,
    isEmergency: true,
  },
  {
    id: 'ano-002',
    mediaUrl: '/images/defect-insulator-flashover.png',
    assetCode: 'INS-TOW05-02',
    towerCode: 'Cột 042 (TOW-220KV-042)',
    missionCode: 'MIS-20260617-01',
    missionName: 'Bay kiểm tra định kỳ tuyến Hòa Bình - Hà Đông',
    categoryName: 'Vết phóng điện bề mặt (Flashover Trace)',
    categoryCode: 'DEF-INS-FLASHOVER',
    boundingBox: { x: 42, y: 35, width: 28, height: 32, isNormalized: true },
    confidenceScore: 89,
    validationStatus: 'Pending',
    aiModelName: 'YOLOv8-PowerGrid-v2.4',
    createdAt: new Date(Date.now() - 3600 * 1000 * 4).toISOString(),
    severity: 4,
    isEmergency: false,
  },
  {
    id: 'ano-003',
    mediaUrl: '/images/defect-insulator-dirty.png',
    assetCode: 'INS-TOW06-01',
    towerCode: 'Cột 043 (TOW-220KV-043)',
    missionCode: 'MIS-20260617-01',
    missionName: 'Bay kiểm tra định kỳ tuyến Hòa Bình - Hà Đông',
    categoryName: 'Bám bẩn bề mặt cách điện (Dirty Insulator)',
    categoryCode: 'DEF-INS-DIRT',
    boundingBox: { x: 26, y: 28, width: 32, height: 36, isNormalized: true },
    confidenceScore: 91,
    validationStatus: 'Pending',
    aiModelName: 'YOLOv8-PowerGrid-v2.4',
    createdAt: new Date(Date.now() - 3600 * 1000 * 6).toISOString(),
    severity: 3,
    isEmergency: false,
  },
  {
    id: 'ano-004',
    mediaUrl: '/images/defect-conductor-damage.png',
    assetCode: 'COND-TOW06-03',
    towerCode: 'Cột 043 (TOW-220KV-043)',
    missionCode: 'MIS-20260617-01',
    missionName: 'Bay kiểm tra định kỳ tuyến Hòa Bình - Hà Đông',
    categoryName: 'Xơ tước dây dẫn (Conductor Strand Damage)',
    categoryCode: 'DEF-COND-STRAND',
    boundingBox: { x: 48, y: 52, width: 36, height: 24, isNormalized: true },
    confidenceScore: 87,
    validationStatus: 'Pending',
    aiModelName: 'YOLOv8-PowerGrid-v2.4',
    createdAt: new Date(Date.now() - 3600 * 1000 * 8).toISOString(),
    severity: 5,
    isEmergency: true,
  },
  {
    id: 'ano-005',
    mediaUrl: '/images/defect-bolt-loose.png',
    assetCode: 'TWR-TOW07-X1',
    towerCode: 'Cột 044 (TOW-220KV-044)',
    missionCode: 'MIS-20260618-02',
    missionName: 'Khảo sát đột xuất sau giông lốc',
    categoryName: 'Bung lỏng bu lông thanh giằng (Missing Bolt)',
    categoryCode: 'DEF-BOLT-LOOSE',
    boundingBox: { x: 55, y: 44, width: 22, height: 26, isNormalized: true },
    confidenceScore: 88,
    validationStatus: 'Pending',
    aiModelName: 'YOLOv8-PowerGrid-v2.4',
    createdAt: new Date(Date.now() - 3600 * 1000 * 12).toISOString(),
    severity: 3,
    isEmergency: false,
  },
  {
    id: 'ano-006',
    mediaUrl: '/images/defect-preview-frame.png',
    assetCode: 'VEG-CORR-01',
    towerCode: 'Khoảng cột 044 - 045',
    missionCode: 'MIS-20260618-02',
    missionName: 'Khảo sát đột xuất sau giông lốc',
    categoryName: 'Cây vi phạm hành lang an toàn (Corridor Tree)',
    categoryCode: 'DEF-VEG-CLEARANCE',
    boundingBox: { x: 58, y: 48, width: 30, height: 35, isNormalized: true },
    confidenceScore: 93,
    validationStatus: 'Pending',
    aiModelName: 'YOLOv8-PowerGrid-v2.4',
    createdAt: new Date(Date.now() - 3600 * 1000 * 16).toISOString(),
    severity: 4,
    isEmergency: true,
  },
];

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const pick = (source: Record<string, unknown>, ...keys: string[]) =>
  keys.map((key) => source[key]).find((value) => value !== undefined && value !== null);

const stringValue = (value: unknown, fallback = '') =>
  value === undefined || value === null ? fallback : String(value);

const numberValue = (value: unknown) => Number(value ?? 0) || 0;

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

export const normalizeAnomalyItem = (item: unknown, index = 0): AnomalyItem => {
  const source = record(item);
  const rawConfidence = numberValue(pick(source, 'confidenceScore', 'confidence', 'score'));
  const confidenceScore = rawConfidence > 1 ? rawConfidence : rawConfidence > 0 ? Math.round(rawConfidence * 100) : 90;

  const rawStatus = stringValue(pick(source, 'validationStatus', 'status', 'state'), 'Pending');
  const validationStatus: AnomalyValidationStatus =
    rawStatus.toLowerCase() === 'confirmed' || rawStatus.toLowerCase() === 'approved'
      ? 'Confirmed'
      : rawStatus.toLowerCase() === 'rejected' || rawStatus.toLowerCase() === 'dismissed'
      ? 'Rejected'
      : 'Pending';

  const rawUrl = stringValue(pick(source, 'mediaUrl', 'imageUrl', 'fileUrl', 'thumbnailUrl'), '');
  const mediaUrl = rawUrl.startsWith('http') || rawUrl.startsWith('/') || rawUrl.startsWith('blob:')
    ? rawUrl
    : rawUrl ? `/${rawUrl}` : '/images/defect-insulator-crack.png';

  const rawBbox = pick(source, 'boundingBox', 'box', 'rawBoundingBox', 'bbox');

  return {
    id: stringValue(pick(source, 'id', 'anomalyId', 'detectionId'), `anomaly-${index + 1}`),
    mediaUrl,
    assetCode: stringValue(pick(source, 'assetCode', 'assetId', 'deviceCode'), 'INS-TOW05-01'),
    towerCode: stringValue(pick(source, 'towerCode', 'tower', 'poleCode'), 'TOW-220KV-042'),
    missionCode: stringValue(pick(source, 'missionCode', 'mission'), 'MIS-2026-001'),
    missionName: stringValue(pick(source, 'missionName', 'missionTitle'), 'Khảo sát định kỳ tuyến 220kV'),
    categoryName: stringValue(pick(source, 'categoryName', 'defectType', 'category', 'title'), 'Bát cách điện nứt vỡ (Insulator Damage)'),
    categoryCode: stringValue(pick(source, 'categoryCode', 'code'), 'DEF-INS-01'),
    boundingBox: parseBoundingBox(rawBbox),
    confidenceScore,
    validationStatus,
    analystNotes: stringValue(pick(source, 'analystNotes', 'notes', 'comment')),
    aiModelName: stringValue(pick(source, 'aiModelName', 'model', 'modelVersion'), 'YOLOv8-PowerGrid-v2.4'),
    createdAt: stringValue(pick(source, 'createdAt', 'detectedAt', 'timestamp'), new Date().toISOString()),
    severity: numberValue(pick(source, 'severity', 'severityWeight')) || 4,
    isEmergency: Boolean(pick(source, 'isEmergency', 'isCritical')),
  };
};

const normalizeAnomalyPage = (
  raw: Record<string, unknown>,
  pageIndex: number,
  pageSize: number,
): AnomalyPage => {
  const itemsRaw = pick(raw, 'items', 'data', 'anomalies', 'detections');
  const rawList = Array.isArray(itemsRaw) ? itemsRaw : Array.isArray(raw) ? raw : [];
  const items = rawList.map((item, idx) => normalizeAnomalyItem(item, idx));

  const totalCount = numberValue(pick(raw, 'totalCount', 'total', 'count')) || items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    items,
    totalCount,
    pageIndex,
    pageSize,
    totalPages,
  };
};
