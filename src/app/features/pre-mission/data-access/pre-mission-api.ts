import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { forkJoin, map, Observable, of, switchMap } from 'rxjs';
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
    };
    return this.http.post<unknown>(this.url, payload).pipe(map((response) => normalizeAssessment(unwrapApiData(response))));
  }

  evaluate(id: string): Observable<PreMissionAssessment> {
    return this.http
      .post<unknown>(`${this.url}/${id}/evaluate`, {})
      .pipe(map((response) => normalizeAssessment(unwrapApiData(response))));
  }

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

  getResourceReadiness(id: string): Observable<ResourceReadiness> {
    return this.http
      .get<unknown>(`${this.url}/${id}/resource-readiness`)
      .pipe(map((response) => normalizeResourceReadiness(unwrapApiData(response), id)));
  }

  /**
   * Tạo nhiệm vụ chính thức từ hồ sơ `READY` (`POST /pre-mission-assessments/{id}/create-mission`).
   * Backend tự đánh dấu hồ sơ `COMPLETED` và giữ chỗ nhân sự, drone.
   */
  createMission(request: CreateMissionFromAssessmentRequest): Observable<CreatedMission> {
    return this.http
      .post<unknown>(`${this.url}/${request.assessmentId}/create-mission`, request)
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

  runTechnicalInspection(
    droneId: string,
    options?: {
      flightControllerUid?: string;
      preMissionAssessmentId?: string;
      notes?: string;
      policyVersion?: string;
      metrics?: readonly {
        metricCode: string;
        subsystem: string;
        numericValue?: number | null;
        boolValue?: boolean | null;
        valueText?: string | null;
        unit?: string | null;
        passed?: boolean | null;
        isRequired?: boolean;
        critical?: boolean;
        severity?: string;
      }[];
    },
  ): Observable<DroneTechnicalInspectionResult> {
    const payload = {
      droneId,
      flightControllerUid: options?.flightControllerUid || null,
      preMissionAssessmentId: options?.preMissionAssessmentId || null,
      notes: options?.notes || 'Kiểm định kỹ thuật trước nhiệm vụ',
      policyVersion: options?.policyVersion || 'v2.0',
      metrics: options?.metrics ?? null,
    };
    return this.http
      .post<unknown>(`${this.baseUrl}/drone-technical-inspections`, payload)
      .pipe(map((response) => normalizeInspectionResult(unwrapApiData(response), droneId)));
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

const normalizeDrone = (value: unknown): UavCandidate => {
  const d = objectOf(value);
  return {
    id: stringOf(d['droneId']),
    candidateId: stringOf(d['id']),
    code: stringOf(d['uavCode']),
    model: stringOf(d['model']),
    isEligible: d['isEligible'] === true,
    operationalStatus: stringOf(d['operationalStatus'], 'Unknown'),
    technicalHealth: stringOf(d['technicalHealth'], 'Unknown'),
    technicalInspectionId: optionalStringOf(d['technicalInspectionId']),
    reasonCode: optionalStringOf(d['reasonCode']),
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
  return {
    id: stringOf(x['id']),
    assessmentCode: stringOf(x['assessmentCode']),
    managerId: stringOf(x['managerId']),
    regionId: stringOf(x['regionId']),
    regionName: stringOf(x['regionName']),
    plannedStart: stringOf(x['plannedStart']),
    plannedEnd: stringOf(x['plannedEnd']),
    status: normalizeAssessmentStatus(x['status']),
    overallTechnicalHealth: stringOf(x['overallTechnicalHealth'], 'Unknown'),
    siteFeasibilityStatus: stringOf(x['siteFeasibilityStatus'], 'Pending'),
    validUntil: optionalStringOf(x['validUntil']),
    version: Number(x['version'] ?? 0),
    findings: stringOf(x['findings']),
    evaluationPolicyVersion: optionalStringOf(x['evaluationPolicyVersion']),
    completedMissionId: optionalStringOf(x['completedMissionId'] ?? x['consumedByMissionId']),
    towers: arrayOf(x['towers']).map(normalizeTower).sort((a, b) => a.sequence - b.sequence),
    personnelCandidates: arrayOf(x['personnelCandidates']).map(normalizePersonnel),
    uavCandidates: drones.map(normalizeDrone),
    site: checkOf(x['site']),
    personnel: checkOf(x['personnel']),
    uav: checkOf(x['uav']),
    technical: checkOf(x['technical']),
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
    return {
      subsystem: stringOf(m['subsystem']),
      metric: stringOf(m['metricCode']),
      value: typeof raw === 'number' ? raw : stringOf(raw, '-'),
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
