import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { forkJoin, map, Observable, of, switchMap, tap, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { CreateMissionFromAssessmentRequest, CreatedMission } from '../../../models/missions.models';
import {
  AssessmentCreateRequest,
  AssessmentFilterOptions,
  AssessmentPage,
  AssessmentTower,
  AssessmentTowerOption,
  DroneTechnicalInspectionResult,
  PersonnelCandidate,
  PreMissionAssessment,
  ReadinessCheck,
  RegionOption,
  ResourceReadiness,
  SiteCheckItem,
  SubsystemHealth,
  TechnicalMetric,
  UavCandidate,
  UavTechnicalEligibility,
} from '../../../models/pre-mission.models';

export interface RealtimeWeatherSnapshot {
  temperature: number;
  humidity: number;
  windSpeed: number;
  windGust: number;
  windDirection: number;
  weatherCode: number;
  weatherDescription: string;
  isSafeToFly: boolean;
  warningLevel: 'low' | 'medium' | 'high';
  time: string;
}

/** Một chỉ số trong biên bản kiểm định (`DroneInspectionMetricRequest`). */
export interface TechnicalInspectionMetricInput {
  readonly metricCode: string;
  readonly subsystem: string;
  readonly numericValue?: number | null;
  readonly boolValue?: boolean | null;
  readonly valueText?: string | null;
  readonly unit?: string | null;
  readonly passed?: boolean | null;
  readonly isRequired?: boolean;
  readonly critical?: boolean;
  readonly severity?: string;
}

/** Nội dung biên bản kiểm định gửi lên backend; `metrics` bắt buộc và không được rỗng. */
export interface TechnicalInspectionSubmission {
  readonly metrics: readonly TechnicalInspectionMetricInput[];
  readonly flightControllerUid?: string | null;
  readonly preMissionAssessmentId?: string | null;
  readonly notes?: string;
  readonly policyVersion?: string;
}

export function isValidGuid(val?: string | null): boolean {
  if (!val) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

export function generateGuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function getWeatherDescription(code: number): string {
  if (code === 0) return 'Trời quang đãng, nắng tốt';
  if (code === 1 || code === 2) return 'Ít mây, tầm nhìn thoáng';
  if (code === 3) return 'Nhiều mây, mây phân tán';
  if (code === 45 || code === 48) return 'Có sương mù nhẹ';
  if (code >= 51 && code <= 55) return 'Mưa phùn nhẹ rải rác';
  if (code >= 61 && code <= 65) return 'Mưa rào';
  if (code >= 80 && code <= 82) return 'Mưa rào diện rộng';
  if (code >= 95) return 'Dông sét nguy hiểm';
  return 'Thời tiết ổn định';
}

/** Số trang tối đa khi tải toàn bộ cột của một khu vực (100 cột/trang theo giới hạn backend). */
const MAX_TOWER_PAGES = 20;
const TOWER_PAGE_SIZE = 100;

/**
 * API đánh giá tiền khả thi (MF01). Endpoint `pre-mission-assessments` trả DTO trực tiếp (không bọc `ApiResponse`).
 */
@Injectable({ providedIn: 'root' })
export class PreMissionApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;
  private readonly url = `${environment.apiBaseUrl}/pre-mission-assessments`;

  list(filters: AssessmentFilterOptions = {}): Observable<AssessmentPage> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (filters.status) params = params.set('status', filters.status);
    if (filters.search?.trim()) params = params.set('search', filters.search.trim());

    return this.http
      .get<unknown>(this.url, { params })
      .pipe(map((response) => normalizePage(unwrapApiData(response), page, pageSize)));
  }

  get(id: string): Observable<PreMissionAssessment> {
    return this.http.get<unknown>(`${this.url}/${id}`).pipe(map((response) => normalizeAssessment(unwrapApiData(response))));
  }

  create(request: AssessmentCreateRequest): Observable<PreMissionAssessment> {
    const payload = {
      regionId: request.regionId,
      plannedStart: toIsoString(request.plannedStart),
      plannedEnd: toIsoString(request.plannedEnd),
      towerIds: request.towerIds,
      boundaryWkt: request.boundaryWkt || null,
      idempotencyKey: request.idempotencyKey || null,
      requiredInspectors: request.requiredInspectors ?? 1,
      requiredAnalysts: request.requiredAnalysts ?? 1,
      requiredTechnicians: request.requiredTechnicians ?? 1,
      maxDronesLimit: request.maxDronesLimit ?? 1,
    };
    return this.http.post<unknown>(this.url, payload).pipe(map((response) => normalizeAssessment(unwrapApiData(response))));
  }

  evaluate(id: string): Observable<PreMissionAssessment> {
    return this.http
      .post<unknown>(`${this.url}/${id}/evaluate`, {})
      .pipe(map((response) => normalizeAssessment(unwrapApiData(response))));
  }

  /**
   * Chạy lại đánh giá (`POST /{id}/re-evaluate`) và trả về hồ sơ đầy đủ sau khi đánh giá (cùng DTO với `GET /{id}`).
   * Đây là cách duy nhất để làm mới ứng viên: `GET /{id}/resource-readiness` chỉ đọc kết quả lần đánh giá gần nhất.
   * Cần quyền quản lý vùng của hồ sơ (`403 REGION_MANAGEMENT_SCOPE_REQUIRED`).
   */
  reEvaluate(id: string): Observable<PreMissionAssessment> {
    return this.http
      .post<unknown>(`${this.url}/${id}/re-evaluate`, {})
      .pipe(map((response) => normalizeAssessment(unwrapApiData(response))));
  }

  /** Quản lý xác nhận hồ sơ đạt (`POST /{id}/confirm`), sau đó tải lại hồ sơ. */
  confirm(id: string): Observable<PreMissionAssessment> {
    return this.http.post<unknown>(`${this.url}/${id}/confirm`, {}).pipe(switchMap(() => this.get(id)));
  }

  cancel(id: string, reason = ''): Observable<PreMissionAssessment> {
    return this.http
      .post<unknown>(`${this.url}/${id}/cancel`, { reason: reason || null })
      .pipe(map((response) => normalizeAssessment(unwrapApiData(response))));
  }

  markCompleted(id: string, missionId?: string): Observable<PreMissionAssessment> {
    return this.http
      .post<unknown>(`${this.url}/${id}/mark-completed`, { missionId: missionId || null })
      .pipe(map((response) => normalizeAssessment(unwrapApiData(response))));
  }

  /**
   * Kết quả nhân sự/drone của lần đánh giá gần nhất. CHỈ ĐỌC: không đánh giá lại, không gia hạn `validUntil`.
   * Muốn làm mới, dùng `reEvaluate()`.
   */
  getResourceReadiness(id: string): Observable<ResourceReadiness> {
    return this.http
      .get<unknown>(`${this.url}/${id}/resource-readiness`)
      .pipe(map((response) => normalizeResourceReadiness(unwrapApiData(response), id)));
  }

  /**
   * Tạo nhiệm vụ chính thức từ hồ sơ `READY` (`POST /pre-mission-assessments/{id}/create-mission`).
   * Backend tự đánh dấu hồ sơ `COMPLETED` và giữ chỗ nhân sự, drone.
   * Quy tắc: đúng 1 `droneIds`, không trùng `userId`, ít nhất 1 người `isRequired: true`;
   * `confirmationDeadline` gửi dạng ISO UTC (`Z`), `managerInstructions` tối đa 2.000 ký tự.
   */
  createMission(request: CreateMissionFromAssessmentRequest): Observable<CreatedMission> {
    const payload = {
      ...request,
      confirmationDeadline: request.confirmationDeadline ? toIsoString(request.confirmationDeadline) : null,
      managerInstructions: request.managerInstructions?.trim() || null,
    };
    return this.http
      .post<unknown>(`${this.url}/${request.assessmentId}/create-mission`, payload)
      .pipe(
        map((response) => {
          const x = objectOf(unwrapApiData(response));
          return {
            id: stringOf(x['id']),
            missionCode: stringOf(x['missionCode']),
            title: stringOf(x['title']),
            status: stringOf(x['status']),
          };
        }),
      );
  }

  // --- Danh mục phục vụ lập hồ sơ ---

  getRegions(): Observable<readonly RegionOption[]> {
    const params = new HttpParams().set('page', 1).set('pageSize', 100);
    return this.http.get<unknown>(`${this.baseUrl}/regions`, { params }).pipe(
      map((response) =>
        itemsOf(unwrapApiData(response)).map((item) => {
          const r = objectOf(item);
          return { id: stringOf(r['id']), name: stringOf(r['regionName'] ?? r['name']) };
        }),
      ),
    );
  }

  /** Tải toàn bộ cột của một khu vực (`GET /towers?regionId=`), gộp các trang. */
  getRegionTowers(regionId: string): Observable<readonly AssessmentTowerOption[]> {
    return this.fetchTowerPage(regionId, 1).pipe(
      switchMap((first) => {
        const totalPages = Math.min(first.totalPages, MAX_TOWER_PAGES);
        if (totalPages <= 1) return of(first.items);
        const rest = Array.from({ length: totalPages - 1 }, (_, index) => this.fetchTowerPage(regionId, index + 2));
        return forkJoin(rest).pipe(map((pages) => [...first.items, ...pages.flatMap((p) => p.items)]));
      }),
    );
  }

  private fetchTowerPage(
    regionId: string,
    page: number,
  ): Observable<{ items: readonly AssessmentTowerOption[]; totalPages: number }> {
    const params = new HttpParams().set('page', page).set('pageSize', TOWER_PAGE_SIZE).set('regionId', regionId);
    return this.http.get<unknown>(`${this.baseUrl}/towers`, { params }).pipe(
      map((response) => {
        const data = unwrapApiData(response);
        const pagination = objectOf(objectOf(data)['pagination']);
        return {
          items: itemsOf(data).map(normalizeTowerOption),
          totalPages: Number(pagination['totalPages'] ?? 1),
        };
      }),
    );
  }

  // --- Kiểm định kỹ thuật drone ---

  /**
   * Nộp biên bản kiểm định (`POST /drone-technical-inspections`). Backend bắt buộc `metrics` có ít nhất 1 chỉ số
   * (`400 METRICS_REQUIRED`) và tính mục critical thiếu số đo là KHÔNG ĐẠT, nên client phải gửi checklist thật.
   * `droneId` trong body luôn là drone được kiểm định (`DRONE_ID_MISMATCH` nếu lệch).
   */
  runTechnicalInspection(droneId: string, options: TechnicalInspectionSubmission): Observable<DroneTechnicalInspectionResult> {
    if (!options.metrics.length) {
      return throwError(() => new Error('METRICS_REQUIRED: Biên bản kiểm định cần ít nhất một chỉ số đo kiểm.'));
    }
    const payload = {
      droneId,
      flightControllerUid: options.flightControllerUid || null,
      preMissionAssessmentId: options.preMissionAssessmentId || null,
      notes: options.notes || 'Kiểm định kỹ thuật trước nhiệm vụ',
      policyVersion: options.policyVersion || 'v2.0',
      metrics: options.metrics.map((m) => ({ ...m })),
    };
    return this.http
      .post<unknown>(`${this.baseUrl}/drone-technical-inspections`, payload)
      .pipe(
        map((response) => normalizeInspectionResult(unwrapApiData(response), droneId)),
        tap((res) => {
          if (typeof localStorage !== 'undefined' && res?.droneId) {
            try {
              localStorage.setItem(
                `${INSPECTION_STORAGE_PREFIX}${res.droneId.toLowerCase()}`,
                JSON.stringify({
                  status: res.status,
                  overallHealth: res.overallHealth,
                  eligibility: res.eligibility,
                  inspectionId: res.id,
                  timestamp: Date.now(),
                }),
              );
            } catch {}
          }
        }),
      );
  }

  getLatestTechnicalInspection(droneId: string): Observable<DroneTechnicalInspectionResult> {
    return this.http
      .get<unknown>(`${this.baseUrl}/drone-technical-inspections/drone/${droneId}/latest`)
      .pipe(map((response) => normalizeInspectionResult(unwrapApiData(response), droneId)));
  }

  /** Khí tượng thời gian thực (Open-Meteo) tại tọa độ cột đầu tiên của hồ sơ. Chỉ mang tính tham khảo. */
  getRealtimeWeather(lat: number, lng: number): Observable<RealtimeWeatherSnapshot> {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m&wind_speed_unit=ms&timezone=Asia%2FBangkok`;
    return this.http.get<unknown>(url).pipe(
      map((res) => {
        const current = objectOf(objectOf(res)['current']);
        const windSpeed = Number(current['wind_speed_10m'] ?? 0);
        const windGust = Number(current['wind_gusts_10m'] ?? 0);
        const weatherCode = Number(current['weather_code'] ?? 0);
        const isSafeToFly = windSpeed <= 10.0 && weatherCode < 80;
        const warningLevel: 'low' | 'medium' | 'high' =
          windSpeed > 12 || weatherCode >= 80 ? 'high' : windSpeed > 8 || weatherCode >= 51 ? 'medium' : 'low';

        return {
          temperature: Number(current['temperature_2m'] ?? 0),
          humidity: Number(current['relative_humidity_2m'] ?? 0),
          windSpeed,
          windGust,
          windDirection: Number(current['wind_direction_10m'] ?? 0),
          weatherCode,
          weatherDescription: getWeatherDescription(weatherCode),
          isSafeToFly,
          warningLevel,
          time: stringOf(current['time']),
        };
      }),
    );
  }
}

const objectOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const arrayOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

const itemsOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : arrayOf(objectOf(value)['items']));

const stringOf = (value: unknown, fallback = '') => (value == null ? fallback : String(value));

const optionalStringOf = (value: unknown): string | null => (value == null || value === '' ? null : String(value));

const optionalNumberOf = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function toIsoString(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

/** Thông tin khí tượng (tham khảo) hiển thị ở tab Mặt bằng. Không thay thế kết quả đánh giá của backend. */
export const weatherSiteChecks = (weather: RealtimeWeatherSnapshot): readonly SiteCheckItem[] => [
  {
    code: 'METEO_WIND',
    name: 'Điều kiện khí tượng & sức gió bề mặt (thời gian thực)',
    status: weather.isSafeToFly ? 'PASS' : weather.warningLevel === 'high' ? 'FAIL' : 'WARNING',
    details: `Sức gió ${weather.windSpeed.toFixed(1)} m/s (gió giật ${weather.windGust.toFixed(1)} m/s), nhiệt độ ${weather.temperature.toFixed(1)}°C, độ ẩm ${weather.humidity}%, ${weather.weatherDescription}. Ngưỡng an toàn bay: gió bề mặt <= 10 m/s, không mưa dông.`,
    severity: weather.warningLevel,
  },
];

/** Chuẩn hóa vai trò ứng viên từ backend (`Inspector`, `Analyst`, `Technician`, `MaintenanceTechnician`...). */
export function normalizeOperationalRole(role: string): string {
  const r = role.toUpperCase();
  if (r.includes('INSPECT') || r.includes('PILOT')) return 'INSPECTOR';
  if (r.includes('ANALYST')) return 'ANALYST';
  if (r.includes('TECH') || r.includes('MAINTENANCE')) return 'TECHNICIAN';
  return r;
}

const normalizePersonnel = (value: unknown): PersonnelCandidate => {
  const c = objectOf(value);
  const rawRole = stringOf(c['role']);
  return {
    id: stringOf(c['userId']),
    candidateId: stringOf(c['id']),
    name: stringOf(c['fullName']) || stringOf(c['userId']),
    role: normalizeOperationalRole(rawRole),
    rawRole,
    isEligible: c['isEligible'] === true,
    eligibilityStatus: stringOf(c['eligibilityStatus'], 'Unknown'),
    availabilityStatus: stringOf(c['availabilityStatus'], 'Unknown'),
    reasonCode: optionalStringOf(c['reasonCode']),
    findings: stringOf(c['findings']),
  };
};

const normalizeSuitability = (value: unknown): string | null => {
  const s = stringOf(value).replace(/[\s_-]/g, '').toUpperCase();
  if (!s) return null;
  if (s === 'SUITABLEWITHSPLIT') return 'SUITABLE_WITH_SPLIT';
  return s;
};

const TECHNICAL_REASON: Readonly<Record<string, UavTechnicalEligibility>> = {
  NO_VALID_TECHNICAL_INSPECTION: 'REQUIRES_INSPECTION',
  TECHNICAL_HEALTH_CRITICAL: 'CRITICAL',
  TECHNICAL_HEALTH_DEGRADED: 'DEGRADED',
};

/**
 * Kết quả kỹ thuật của một ứng viên UAV. Backend lưu `TechnicalEligibilityStatus` nhưng DTO chỉ trả `reasonCode`
 * (lý do đầu tiên theo thứ tự ưu tiên), nên khi UAV không khả dụng hoặc trùng lịch thì kết quả kỹ thuật bị che.
 */
function technicalEligibilityOf(d: Record<string, unknown>, reasonCode: string | null, available: boolean): UavTechnicalEligibility {
  const explicit = stringOf(d['technicalEligibilityStatus']).replace(/[\s_-]/g, '').toUpperCase();
  if (explicit === 'ELIGIBLE') return 'ELIGIBLE';
  if (explicit === 'REQUIRESINSPECTION') return 'REQUIRES_INSPECTION';
  if (typeof d['isTechnicallyReady'] === 'boolean' && d['isTechnicallyReady']) return 'ELIGIBLE';

  const code = (reasonCode ?? '').toUpperCase();
  if (TECHNICAL_REASON[code]) return TECHNICAL_REASON[code];
  if (explicit === 'INELIGIBLE') return 'CRITICAL';
  // Lý do đầu tiên là phạm vi bay (hoặc không có lý do) nghĩa là đã qua bước kiểm tra kỹ thuật.
  if (available && (!code || code === 'SCOPE_EXCEEDS_CAPABILITY')) return 'ELIGIBLE';
  if (stringOf(d['technicalHealth']).toUpperCase() === 'CRITICAL') return 'CRITICAL';
  if (!d['technicalInspectionId']) return 'REQUIRES_INSPECTION';
  return 'UNKNOWN';
}

const INSPECTION_STORAGE_PREFIX = 'uavpms_inspection_';

export function getLocalDroneInspectionOverride(droneId: string): {
  status: string;
  overallHealth: string;
  eligibility: string;
  inspectionId: string;
} | null {
  if (typeof localStorage === 'undefined' || !droneId) return null;
  try {
    const raw = localStorage.getItem(`${INSPECTION_STORAGE_PREFIX}${droneId.toLowerCase()}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Date.now() - Number(parsed['timestamp'] || 0) < 7 * 86400 * 1000) {
      return {
        status: String(parsed['status'] || ''),
        overallHealth: String(parsed['overallHealth'] || ''),
        eligibility: String(parsed['eligibility'] || ''),
        inspectionId: String(parsed['inspectionId'] || ''),
      };
    }
  } catch {}
  return null;
}

const normalizeDrone = (value: unknown): UavCandidate => {
  const d = objectOf(value);
  const droneId = stringOf(d['droneId']);
  const override = getLocalDroneInspectionOverride(droneId);

  let rawHealth = stringOf(d['technicalHealth'], 'Unknown');
  let rawInspectionId = optionalStringOf(d['technicalInspectionId']);
  let rawReasonCode = optionalStringOf(d['reasonCode']);
  let rawEligible = d['isEligible'] === true;

  if (override) {
    rawHealth = override.overallHealth;
    if (override.inspectionId) rawInspectionId = override.inspectionId;
    const isOverrideCritical =
      override.overallHealth?.toUpperCase() === 'CRITICAL' ||
      override.status?.toLowerCase() === 'failed' ||
      override.eligibility !== 'ELIGIBLE';
    if (isOverrideCritical) {
      rawReasonCode = 'TECHNICAL_HEALTH_CRITICAL';
      rawEligible = false;
    } else if (override.eligibility === 'ELIGIBLE' && override.status?.toLowerCase() === 'passed') {
      if (rawReasonCode === 'TECHNICAL_HEALTH_CRITICAL' || rawReasonCode === 'NO_VALID_TECHNICAL_INSPECTION') {
        rawReasonCode = null;
      }
      rawEligible = true;
    }
  }

  const operationalStatus = stringOf(d['operationalStatus'], 'Unknown');
  const code = (rawReasonCode ?? '').toUpperCase();
  const isAvailable =
    typeof d['isAvailable'] === 'boolean'
      ? d['isAvailable']
      : operationalStatus.toUpperCase() === 'AVAILABLE' && code !== 'DRONE_NOT_AVAILABLE' && code !== 'SCHEDULE_CONFLICT';
  const techElig = technicalEligibilityOf(
    { ...d, technicalHealth: rawHealth, technicalEligibilityStatus: override ? override.eligibility : d['technicalEligibilityStatus'] },
    rawReasonCode,
    isAvailable,
  );
  const isCritical = rawHealth.toUpperCase() === 'CRITICAL' || techElig === 'CRITICAL' || code === 'TECHNICAL_HEALTH_CRITICAL';
  const isEligible = rawEligible && !isCritical && isAvailable && techElig === 'ELIGIBLE';

  return {
    isAvailable,
    technicalEligibility: isCritical ? 'CRITICAL' : techElig,
    id: droneId,
    candidateId: stringOf(d['id']),
    code: stringOf(d['uavCode']),
    model: stringOf(d['model']),
    isEligible,
    operationalStatus,
    technicalHealth: rawHealth,
    technicalInspectionId: rawInspectionId,
    reasonCode: isCritical && !rawReasonCode ? 'TECHNICAL_HEALTH_CRITICAL' : rawReasonCode,
    batteryLevel: Number(d['batteryLevel'] ?? 0),
    suitability: normalizeSuitability(d['suitability']),
    estimatedFlightsNeeded: optionalNumberOf(d['estimatedFlightsNeeded']),
    coverageDistanceKm: optionalNumberOf(d['coverageDistanceKm']),
    suitabilityReason: optionalStringOf(d['suitabilityReason']),
  };
};

const normalizeTower = (value: unknown): AssessmentTower => {
  const t = objectOf(value);
  return {
    id: stringOf(t['id']),
    towerId: stringOf(t['towerId']),
    sequence: Number(t['sequence'] ?? 0),
    towerCode: optionalStringOf(t['towerCode']),
    poleType: optionalStringOf(t['poleType']),
  };
};

const normalizeTowerOption = (value: unknown): AssessmentTowerOption => {
  const t = objectOf(value);
  return {
    id: stringOf(t['id']),
    regionId: stringOf(t['regionId']),
    regionName: optionalStringOf(t['regionName']),
    towerCode: stringOf(t['towerCode']),
    poleType: optionalStringOf(t['poleType']),
    address: optionalStringOf(t['address']),
    latitude: Number(t['latitude'] ?? 0),
    longitude: Number(t['longitude'] ?? 0),
  };
};

const checkOf = (value: unknown): ReadinessCheck => {
  const x = objectOf(value);
  return {
    status: stringOf(x['status'], 'FAIL').toUpperCase(),
    reason: optionalStringOf(x['reason']),
    evaluatedAt: optionalStringOf(x['evaluatedAt']),
  };
};

/** Chuẩn hóa trạng thái hồ sơ; chấp nhận cả giá trị cũ `CONSUMED`, `INCOMPLETE`. */
export function normalizeAssessmentStatus(value: unknown): string {
  const s = stringOf(value).replace(/[\s-]/g, '_').toUpperCase();
  if (s === 'CONSUMED') return 'COMPLETED';
  if (s === 'INCOMPLETE' || s === 'NOTREADY') return 'NOT_READY';
  return s;
}

export const normalizeAssessment = (value: unknown): PreMissionAssessment => {
  const x = objectOf(value);
  const drones = arrayOf(x['droneCandidates']).length ? arrayOf(x['droneCandidates']) : arrayOf(x['uavCandidates']);
  const uavCandidates = drones.map(normalizeDrone);
  const eligibleDrones = uavCandidates.filter((d) => d.isEligible);
  let uavCheck = checkOf(x['uav']);
  let techCheck = checkOf(x['technical']);
  let status = normalizeAssessmentStatus(x['status']);

  if (uavCandidates.length > 0 && eligibleDrones.length === 0) {
    uavCheck = {
      status: 'FAIL',
      reason: 'Chưa có UAV nào đạt hạn kiểm định hoặc khả dụng trong khung giờ này.',
      evaluatedAt: uavCheck.evaluatedAt,
    };
    techCheck = {
      status: 'FAIL',
      reason: 'Không có thiết bị bay đạt yêu cầu kỹ thuật và an toàn bay.',
      evaluatedAt: techCheck.evaluatedAt,
    };
    if (status === 'READY') {
      status = 'NOT_READY';
    }
  }

  let overallTech = stringOf(x['overallTechnicalHealth'], 'Unknown');
  if (eligibleDrones.length > 0) {
    const healths = eligibleDrones.map((d) => (d.technicalHealth || '').toUpperCase());
    if (healths.includes('HEALTHY')) overallTech = 'Healthy';
    else if (healths.includes('WARNING')) overallTech = 'Warning';
  } else if (uavCandidates.some((d) => (d.technicalHealth || '').toUpperCase() === 'CRITICAL')) {
    overallTech = 'Critical';
  }

  return {
    id: stringOf(x['id']),
    assessmentCode: stringOf(x['assessmentCode']),
    managerId: stringOf(x['managerId']),
    regionId: stringOf(x['regionId']),
    regionName: stringOf(x['regionName']),
    plannedStart: stringOf(x['plannedStart']),
    plannedEnd: stringOf(x['plannedEnd']),
    status,
    overallTechnicalHealth: overallTech,
    siteFeasibilityStatus: stringOf(x['siteFeasibilityStatus'], 'Pending'),
    validUntil: optionalStringOf(x['validUntil']),
    version: Number(x['version'] ?? 0),
    findings: stringOf(x['findings']),
    evaluationPolicyVersion: optionalStringOf(x['evaluationPolicyVersion']),
    completedMissionId: optionalStringOf(x['completedMissionId'] ?? x['consumedByMissionId']),
    towers: arrayOf(x['towers']).map(normalizeTower).sort((a, b) => a.sequence - b.sequence),
    personnelCandidates: arrayOf(x['personnelCandidates']).map(normalizePersonnel),
    uavCandidates,
    site: checkOf(x['site']),
    personnel: checkOf(x['personnel']),
    uav: uavCheck,
    technical: techCheck,
    createdAt: stringOf(x['createdAt']),
    updatedAt: optionalStringOf(x['updatedAt']),
  };
};

const normalizeResourceReadiness = (value: unknown, assessmentId: string): ResourceReadiness => {
  const x = objectOf(value);
  return {
    assessmentId: stringOf(x['assessmentId'] ?? x['id'], assessmentId),
    status: normalizeAssessmentStatus(x['status']),
    siteFeasibilityStatus: stringOf(x['siteFeasibilityStatus']),
    overallTechnicalHealth: stringOf(x['overallTechnicalHealth']),
    isReady: x['isReady'] === true || normalizeAssessmentStatus(x['status']) === 'READY',
    personnelCandidates: arrayOf(x['personnelCandidates']).map(normalizePersonnel),
    uavCandidates: arrayOf(x['droneCandidates']).map(normalizeDrone),
    evaluatedAt: stringOf(x['evaluatedAt'] ?? x['updatedAt']),
  };
};

const healthOf = (value: unknown): SubsystemHealth['status'] => {
  const h = stringOf(value).toUpperCase();
  return h === 'HEALTHY' || h === 'WARNING' || h === 'CRITICAL' ? h : 'UNKNOWN';
};

/** Chuẩn hóa `DroneTechnicalInspectionDto` (hoặc `DroneTechnicalInspectionSummaryDto`). */
export const normalizeInspectionResult = (value: unknown, droneId: string): DroneTechnicalInspectionResult => {
  const x = objectOf(value);
  const metrics: TechnicalMetric[] = arrayOf(x['metrics']).map((item) => {
    const m = objectOf(item);
    const raw = m['numericValue'] ?? m['boolValue'] ?? m['valueText'];
    let formattedVal: string | number = '-';
    if (typeof raw === 'number') {
      formattedVal = raw;
    } else if (typeof raw === 'boolean') {
      formattedVal = raw ? 'Đạt chuẩn' : 'Không đạt';
    } else if (raw != null) {
      formattedVal = String(raw);
    }
    return {
      subsystem: stringOf(m['subsystem']),
      metric: stringOf(m['metricCode']),
      value: formattedVal,
      unit: optionalStringOf(m['unit']),
      required: m['isRequired'] === true,
      severity: optionalStringOf(m['severity']),
      passed: typeof m['passed'] === 'boolean' ? m['passed'] : null,
    };
  });

  const subsystemNames = Array.from(new Set(metrics.map((m) => m.subsystem).filter(Boolean)));
  const subsystems: SubsystemHealth[] = subsystemNames.map((name) => {
    const items = metrics.filter((m) => m.subsystem === name);
    const failed = items.filter((m) => m.passed === false);
    const criticalFail = failed.some((m) => (m.severity || '').toUpperCase() === 'CRITICAL');
    const status: SubsystemHealth['status'] = criticalFail ? 'CRITICAL' : failed.length ? 'WARNING' : 'HEALTHY';
    return {
      id: name,
      name,
      status,
      description: failed.length ? `${failed.length}/${items.length} chỉ số không đạt` : `${items.length} chỉ số đạt`,
    };
  });

  const status = stringOf(x['status']);
  return {
    id: stringOf(x['id']),
    droneId: stringOf(x['droneId'], droneId),
    status,
    overallHealth: healthOf(x['health']),
    eligibility: status.toUpperCase() === 'PASSED' ? 'ELIGIBLE' : 'NOT_ELIGIBLE',
    technicianName: optionalStringOf(x['technicianName']),
    policyVersion: optionalStringOf(x['policyVersion']),
    notes: optionalStringOf(x['notes']),
    inspectionSource: optionalStringOf(x['sourceType']),
    sourceVersion: optionalStringOf(x['sourceVersion']),
    inspectedAt: stringOf(x['completedAt'] ?? x['startedAt']),
    validUntil: optionalStringOf(x['validUntil']),
    subsystems,
    metrics,
  };
};

const normalizePage = (value: unknown, page: number, pageSize: number): AssessmentPage => {
  const x = objectOf(value);
  const items = itemsOf(value).map(normalizeAssessment);
  const totalCount = Number(x['totalCount'] ?? items.length);
  return {
    items,
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
};
