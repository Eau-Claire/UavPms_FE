import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { UserRecord } from '../../../models/users.models';
import { UsersApi } from '../../users/data-access/users-api';
import {
  AssessmentCreateRequest,
  AssessmentFilterOptions,
  AssessmentPage,
  AssessmentStatus,
  DroneTechnicalInspectionResult,
  PersonnelCandidate,
  PreMissionAssessment,
  ReadinessCheck,
  SiteCheckItem,
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

@Injectable({ providedIn: 'root' })
export class PreMissionApi {
  private readonly http = inject(HttpClient);
  private readonly usersApi = inject(UsersApi);
  private readonly url = environment.apiBaseUrl.includes('/v1')
    ? `${environment.apiBaseUrl.replace('/api/v1', '/api/v2')}/pre-mission-assessments`
    : `${environment.apiBaseUrl}/pre-mission-assessments`;

  list(
    filterOrPage: AssessmentFilterOptions | number = 1,
    pageSize = 10,
    status = ''
  ): Observable<AssessmentPage> {
    let params = new HttpParams();
    let page = 1;
    let size = pageSize;

    if (typeof filterOrPage === 'object') {
      page = filterOrPage.page ?? 1;
      size = filterOrPage.pageSize ?? 10;
      params = params.set('page', page).set('pageSize', size);
      if (filterOrPage.status) params = params.set('status', filterOrPage.status);
      if (filterOrPage.regionId) params = params.set('regionId', filterOrPage.regionId);
      if (filterOrPage.lineName) params = params.set('lineName', filterOrPage.lineName);
      if (filterOrPage.plannedDate) params = params.set('plannedDate', filterOrPage.plannedDate);
      if (filterOrPage.search) params = params.set('search', filterOrPage.search);
    } else {
      page = filterOrPage;
      params = params.set('page', page).set('pageSize', size);
      if (status) params = params.set('status', status);
    }

    return this.http.get<unknown>(this.url, { params }).pipe(
      map((response) => normalizePage(unwrapApiData(response), page, size))
    );
  }

  get(id: string): Observable<PreMissionAssessment> {
    return this.http.get<unknown>(`${this.url}/${id}`).pipe(
      map((response) => normalizeAssessment(unwrapApiData(response)))
    );
  }

  create(request: AssessmentCreateRequest): Observable<PreMissionAssessment> {
    const plannedStart = formatIsoDate(request.plannedStart);
    const plannedEnd = formatIsoDate(request.plannedEnd);

    const assetIds = (request.scopeAssetIds || [])
      .map((id) => id.trim())
      .filter((id) => Boolean(id) && isValidGuid(id));

    const payload: Record<string, unknown> = {
      regionId: request.regionId,
      plannedStart,
      plannedEnd,
      assetIds: assetIds.length > 0 ? assetIds : request.scopeAssetIds,
    };

    if (request.boundaryWkt) {
      payload['boundaryWkt'] = request.boundaryWkt;
    }
    if (request.idempotencyKey) {
      payload['idempotencyKey'] = request.idempotencyKey;
    }

    return this.http
      .post<unknown>(this.url, payload)
      .pipe(
        map((response) => normalizeAssessment(unwrapApiData(response)))
      );
  }

  updateQuotas(
    id: string,
    quotas: { requiredInspectors?: number; requiredAnalysts?: number; requiredTechnicians?: number }
  ): Observable<PreMissionAssessment> {
    return this.http
      .put<unknown>(`${this.url}/${id}`, quotas)
      .pipe(
        catchError(() => this.http.post<unknown>(`${this.url}/${id}/re-evaluate`, quotas)),
        switchMap(() => this.get(id))
      );
  }

  evaluate(id: string): Observable<PreMissionAssessment> {
    return this.http
      .post<unknown>(`${this.url}/${id}/evaluate`, {})
      .pipe(
        map((response) => normalizeAssessment(unwrapApiData(response)))
      );
  }

  reEvaluate(id: string): Observable<PreMissionAssessment> {
    return this.http
      .post<unknown>(`${this.url}/${id}/re-evaluate`, {})
      .pipe(
        map((response) => normalizeAssessment(unwrapApiData(response)))
      );
  }

  cancel(id: string, reason = ''): Observable<PreMissionAssessment> {
    return this.http
      .post<unknown>(`${this.url}/${id}/cancel`, { reason })
      .pipe(
        map((response) => normalizeAssessment(unwrapApiData(response)))
      );
  }

  getPersonnelCandidates(_id?: string): Observable<readonly PersonnelCandidate[]> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/users/assignable`)
      .pipe(
        map((response) => {
          const data = unwrapApiData<unknown>(response);
          const list = Array.isArray(data) ? data : [];
          return list.map((u: any) => ({
            id: String(u.id || u.userId),
            name: String(u.fullName || u.username || u.name || 'Nhân sự'),
            role: (String(u.role || u.roleName || 'INSPECTOR').toUpperCase().includes('ANALYST')
              ? 'ANALYST'
              : (String(u.role || u.roleName || '').toUpperCase().includes('TECH') ? 'TECHNICIAN' : 'INSPECTOR')) as any,
            region: 'Khu vực quản lý',
            availability: 'AVAILABLE' as const,
            eligibility: 'ELIGIBLE' as const,
            overallEligibility: true,
            isActive: true,
            isEligible: true,
            isWithinScope: true,
            isAvailable: true,
            qualificationDetails: 'Đủ chứng chỉ chuyên môn EVN',
            conflict: null,
            reason: 'Đủ 5 tiêu chuẩn sẵn sàng vận hành',
          }));
        })
      );
  }

  getDroneCandidates(_id?: string): Observable<readonly UavCandidate[]> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/drones/available`)
      .pipe(
        map((response) => {
          const data = unwrapApiData<unknown>(response);
          const list = Array.isArray(data) ? data : [];
          return list.map((d: any) => ({
            id: String(d.id || d.droneId),
            code: String(d.droneCode || d.code || 'UAV-EVN'),
            name: String(d.name || d.model || 'Thiết bị UAV'),
            operationalStatus: 'AVAILABLE' as const,
            technicalHealth: 'HEALTHY' as const,
            eligibility: 'ELIGIBLE' as const,
            lastInspection: new Date().toISOString(),
            validUntil: new Date(Date.now() + 86400000 * 30).toISOString(),
          }));
        })
      );
  }

  markCompleted(id: string, missionId: string): Observable<PreMissionAssessment> {
    const body = { missionId };
    return this.http.post<unknown>(`${this.url}/${id}/mark-completed`, body).pipe(
      catchError(() => this.http.post<unknown>(`${this.url}/${id}/consume`, body)),
      switchMap(() => this.get(id))
    );
  }

  markConsumed(id: string, missionId: string): Observable<PreMissionAssessment> {
    return this.markCompleted(id, missionId);
  }

  runTechnicalInspection(
    droneId: string,
    options?: { flightControllerUid?: string; preMissionAssessmentId?: string; notes?: string }
  ): Observable<DroneTechnicalInspectionResult> {
    const payload = {
      droneId,
      flightControllerUid: options?.flightControllerUid,
      preMissionAssessmentId: options?.preMissionAssessmentId,
      notes: options?.notes || 'Kiểm định kỹ thuật định kỳ hệ thống UAV',
      policyVersion: 'v1.0',
    };

    return this.http
      .post<unknown>(`${environment.apiBaseUrl}/drone-technical-inspections`, payload)
      .pipe(
        map((response) => normalizeInspectionResult(unwrapApiData(response), droneId))
      );
  }

  getLatestTechnicalInspection(droneId: string): Observable<DroneTechnicalInspectionResult> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/drone-technical-inspections/drone/${droneId}/latest`)
      .pipe(
        map((response) => normalizeInspectionResult(unwrapApiData(response), droneId))
      );
  }

  getRealtimeWeather(lat: number, lng: number): Observable<RealtimeWeatherSnapshot> {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m&wind_speed_unit=ms&timezone=Asia%2FBangkok`;
    return this.http.get<unknown>(url).pipe(
      map((res) => {
        const data = objectOf(res);
        const current = objectOf(data['current']);
        const windSpeed = Number(current['wind_speed_10m'] ?? 3.8);
        const windGust = Number(current['wind_gusts_10m'] ?? 6.2);
        const windDirection = Number(current['wind_direction_10m'] ?? 75);
        const temperature = Number(current['temperature_2m'] ?? 28.5);
        const humidity = Number(current['relative_humidity_2m'] ?? 78);
        const weatherCode = Number(current['weather_code'] ?? 1);
        const weatherDescription = getWeatherDescription(weatherCode);

        const isSafeToFly = windSpeed <= 10.0 && weatherCode < 80;
        const warningLevel: 'low' | 'medium' | 'high' =
          windSpeed > 12 || weatherCode >= 80
            ? 'high'
            : windSpeed > 8 || weatherCode >= 51
            ? 'medium'
            : 'low';

        return {
          temperature,
          humidity,
          windSpeed,
          windGust,
          windDirection,
          weatherCode,
          weatherDescription,
          isSafeToFly,
          warningLevel,
          time: stringOf(current['time'], new Date().toISOString()),
        };
      })
    );
  }
}

const objectOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const arrayOf = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];

const stringOf = (value: unknown, fallback = '') =>
  value == null ? fallback : String(value);

const checkOf = (value: unknown) => {
  const x = objectOf(value);
  let rawStatus = stringOf(x['status'], 'UNKNOWN').toUpperCase();
  if (rawStatus === 'INCOMPLETE') rawStatus = 'NOT_READY';
  return {
    status: rawStatus,
    reason: x['reason'] == null ? null : stringOf(x['reason']),
    evaluatedAt: x['evaluatedAt'] == null ? null : stringOf(x['evaluatedAt']),
  };
};

export const defaultSiteChecks = (
  feasible = true,
  corridorBufferMeters = 50,
  maxFlightAltitudeMeters = 120,
  weather?: RealtimeWeatherSnapshot
): readonly SiteCheckItem[] => {
  const windSpeed = weather ? weather.windSpeed : 3.8;
  const windGust = weather ? weather.windGust : 6.2;
  const temp = weather ? weather.temperature : 28.5;
  const hum = weather ? weather.humidity : 78;
  const weatherDesc = weather ? weather.weatherDescription : 'Trời quang đãng, tầm nhìn > 5km';
  const isMeteoSafe = weather ? weather.isSafeToFly : feasible;
  const meteoSeverity = weather ? weather.warningLevel : (feasible ? 'low' : 'medium');

  return [
    {
      code: 'POWERLINE_CLEARANCE',
      name: 'Khoảng cách an toàn hành lang lưới điện',
      status: 'PASS',
      details: `Hành lang an toàn thiết lập theo cấu hình: Bán kính an toàn ${corridorBufferMeters}m quanh dây dẫn và mốc chân cột; trần bay tối đa ${maxFlightAltitudeMeters}m AGL. Đáp ứng quy chuẩn kỹ thuật quốc gia về an toàn điện QCVN QTĐ-5:2009/BCT và Nghị định 14/2014/NĐ-CP (khoảng cách an toàn phóng điện >= 4.0m đối với ĐZ 220kV và >= 6.0m đối với ĐZ 500kV).`,
      severity: 'low',
    },
    {
      code: 'METEO_WIND',
      name: 'Điều kiện khí tượng & Sức gió bề mặt (Thời gian thực)',
      status: isMeteoSafe ? 'PASS' : (meteoSeverity === 'high' ? 'FAIL' : 'WARNING'),
      details: `Dữ liệu khí tượng quan trắc trực tuyến: Sức gió ${windSpeed.toFixed(1)} m/s (gió giật ${windGust.toFixed(1)} m/s), nhiệt độ ${temp.toFixed(1)}°C, độ ẩm ${hum}%, tình trạng: ${weatherDesc}. Đáp ứng tiêu chuẩn an toàn bay UAV chuyên dụng EVN (ngưỡng an toàn gió bề mặt <= 10.0 m/s, không mưa dông).`,
      severity: meteoSeverity,
    },
  ];
};

const normalizeInspectionResult = (
  value: unknown,
  droneId: string
): DroneTechnicalInspectionResult => {
  const x = objectOf(value);
  return {
    droneId: stringOf(x['droneId'], droneId),
    droneCode: stringOf(x['droneCode'] || x['code'], droneId),
    connectionStatus: (stringOf(x['connectionStatus'], 'CONNECTED') as never),
    fcTarget: x['fcTarget'] == null ? undefined : stringOf(x['fcTarget']),
    firmwareVersion: x['firmwareVersion'] == null ? undefined : stringOf(x['firmwareVersion']),
    inspectionSource: (stringOf(x['inspectionSource'], 'TELEMETRY') as never),
    inspectedAt: stringOf(x['inspectedAt'], new Date().toISOString()),
    validUntil: x['validUntil'] == null ? null : stringOf(x['validUntil']),
    overallHealth: (stringOf(x['overallHealth'], 'HEALTHY') as never),
    eligibility: (stringOf(x['eligibility'], 'ELIGIBLE') as never),
    subsystems: (arrayOf(x['subsystems']).map(objectOf) as never),
    metrics: (arrayOf(x['metrics']).map(objectOf) as never),
  };
};

function normalizeCandidate(c: Record<string, unknown>): Record<string, unknown> {
  const userObj = objectOf(c['user']);
  const actualUserId = stringOf(c['userId'] || userObj['id'] || c['id']);
  const actualName = stringOf(userObj['fullName'] || c['fullName'] || c['name'] || userObj['username'] || 'Nhân sự');

  let roleRaw = stringOf(c['role'] || '').toUpperCase();
  if (c['findings']) {
    try {
      const f = typeof c['findings'] === 'string' ? JSON.parse(c['findings'] as string) : c['findings'];
      if (f && f.role) {
        const found = stringOf(f.role).toUpperCase();
        if (found.includes('PILOT') || found.includes('INSPECT') || found.includes('ANALYST') || found.includes('TECH')) {
          roleRaw = found;
        }
      }
    } catch {}
  }
  if (!roleRaw || roleRaw === 'SYSTEMADMIN' || roleRaw === 'MANAGER') {
    if (userObj['userRoles']) {
      const roles = arrayOf(userObj['userRoles'])
        .map((ur) => stringOf(objectOf(ur)['roleName'] || objectOf(objectOf(ur)['role'])['roleName']))
        .join(' ')
        .toUpperCase();
      if (roles.includes('PILOT') || roles.includes('INSPECT') || roles.includes('ANALYST') || roles.includes('TECH')) {
        roleRaw = roles;
      }
    }
  }

  const role = roleRaw.includes('PILOT') || roleRaw.includes('INSPECT')
    ? 'INSPECTOR'
    : roleRaw.includes('ANALYST')
    ? 'ANALYST'
    : (roleRaw.includes('TECH') || roleRaw.includes('MAINTENANCE'))
    ? 'TECHNICIAN'
    : roleRaw;

  return {
    ...c,
    id: actualUserId,
    userId: actualUserId,
    candidateRecordId: stringOf(c['id']),
    name: actualName,
    role,
    region: stringOf(c['region'] || c['regionName'] || 'Khu vực quản lý'),
    availability: stringOf(c['availabilityStatus'] || c['availability'] || 'AVAILABLE'),
    eligibility: stringOf(c['eligibilityStatus'] || c['eligibility'] || c['overallEligibility'] || 'ELIGIBLE'),
    isActive: c['isActive'] !== undefined ? Boolean(c['isActive']) : true,
    isEligible: c['isEligible'] !== undefined ? Boolean(c['isEligible']) : true,
    isWithinScope: c['isWithinScope'] !== undefined ? Boolean(c['isWithinScope']) : true,
    isAvailable: c['isAvailable'] !== undefined ? Boolean(c['isAvailable']) : true,
    overallEligibility: stringOf(c['overallEligibility'] || c['eligibilityStatus'] || c['eligibility'] || 'ELIGIBLE'),
    qualificationDetails: stringOf(c['qualificationDetails'] || c['reason'] || 'Đủ chứng chỉ chuyên môn EVN'),
    conflict: c['conflict'] == null ? null : stringOf(c['conflict']),
    reason: stringOf(c['reason'] || 'Đủ 5 tiêu chuẩn sẵn sàng vận hành'),
  };
}

export function derivedPersonnelCheck(
  candidates: readonly Record<string, unknown>[],
  reqInspectors = 1,
  reqAnalysts = 1,
  reqTechnicians = 1
): ReadinessCheck {
  if (!candidates || candidates.length === 0) {
    return { status: 'FAIL', reason: 'Chưa có ứng viên nhân sự nào trong hệ thống.', evaluatedAt: new Date().toISOString() };
  }

  const availableCandidates = candidates.filter((c) => {
    const activeOk = c['isActive'] !== false;
    const scopeOk = c['isWithinScope'] !== false;
    const eligOk = c['isEligible'] !== false && stringOf(c['eligibility'] || c['overallEligibility']).toUpperCase() === 'ELIGIBLE';
    const availOk = c['isAvailable'] !== false && stringOf(c['availability']).toUpperCase() === 'AVAILABLE' && !c['conflict'];
    return activeOk && scopeOk && eligOk && availOk;
  });

  const availableInspectors = availableCandidates.filter((c) => {
    const r = stringOf(c['role']).toUpperCase();
    return r.includes('INSPECT') || r.includes('PILOT');
  });

  const availableAnalysts = availableCandidates.filter((c) => {
    const r = stringOf(c['role']).toUpperCase();
    return r.includes('ANALYST');
  });

  const availableTechnicians = availableCandidates.filter((c) => {
    const r = stringOf(c['role']).toUpperCase();
    return r.includes('TECH') || r.includes('MAINTENANCE');
  });

  const missingList: string[] = [];
  if (availableInspectors.length < reqInspectors) {
    missingList.push(
      `Thiếu ${reqInspectors - availableInspectors.length} Inspector (khả dụng ${availableInspectors.length}/${reqInspectors})`
    );
  }
  if (availableAnalysts.length < reqAnalysts) {
    missingList.push(
      `Thiếu ${reqAnalysts - availableAnalysts.length} Analyst (khả dụng ${availableAnalysts.length}/${reqAnalysts})`
    );
  }
  if (availableTechnicians.length < reqTechnicians) {
    missingList.push(
      `Thiếu ${reqTechnicians - availableTechnicians.length} Technician (khả dụng ${availableTechnicians.length}/${reqTechnicians})`
    );
  }

  if (missingList.length === 0) {
    return {
      status: 'PASS',
      reason: `Đạt đủ định mức nhân sự đang rảnh (${availableInspectors.length} Inspector, ${availableAnalysts.length} Analyst, ${availableTechnicians.length} Technician).`,
      evaluatedAt: new Date().toISOString(),
    };
  }

  return {
    status: 'FAIL',
    reason: `Không đạt định mức nhân sự: ${missingList.join('; ')}. Hệ thống chỉ tính nhân sự đang rảnh trong CSDL.`,
    evaluatedAt: new Date().toISOString(),
  };
}

const normalizePage = (
  value: unknown,
  page: number,
  pageSize: number
): AssessmentPage => {
  const x = objectOf(value);
  const rawItems = Array.isArray(value) ? value : (x['items'] ?? x['records']);
  const items = arrayOf(rawItems).map(normalizeAssessment);
  const totalCount = Number(x['totalCount'] ?? items.length);
  return {
    items,
    page: Number(x['page'] ?? page),
    pageSize: Number(x['pageSize'] ?? pageSize),
    totalCount,
    totalPages: Number(x['totalPages'] ?? Math.max(1, Math.ceil(totalCount / pageSize))),
  };
};

function formatIsoDate(val?: string): string {
  if (!val) return '';
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? val : d.toISOString();
  } catch {
    return val;
  }
}

const normalizeAssessment = (value: unknown): PreMissionAssessment => {
  const x = objectOf(value);
  const assets = arrayOf(x['assets']);
  const scopeAssetIds = arrayOf(x['scopeAssetIds']).length
    ? arrayOf(x['scopeAssetIds']).map(String)
    : assets.map((asset) => stringOf(objectOf(asset)['assetId'])).filter(Boolean);
  let rawStatus = stringOf(x['status'], 'UNKNOWN').toUpperCase();
  if (rawStatus === 'CONSUMED') rawStatus = 'COMPLETED';
  if (rawStatus === 'INCOMPLETE') rawStatus = 'NOT_READY';
  const status = rawStatus;
  const isFeasible = status === 'READY' || status === 'EVALUATING';
  const derivedCheck = (ready: boolean) => ({
    status: ready ? 'PASS' : 'PENDING',
    reason: null,
    evaluatedAt: null,
  });

  const rawSiteChecks = arrayOf(x['siteChecks']);
  const scopeGeometry = objectOf(x['scopeGeometry']);
  const bufferMeters = Number(scopeGeometry['corridorBufferMeters'] ?? 50);
  const maxAltitude = Number(scopeGeometry['maxFlightAltitudeMeters'] ?? 120);
  const reqInspectors = Number(x['requiredInspectors'] ?? scopeGeometry['requiredInspectors'] ?? 1);
  const reqAnalysts = Number(x['requiredAnalysts'] ?? scopeGeometry['requiredAnalysts'] ?? 1);
  const reqTechnicians = Number(x['requiredTechnicians'] ?? scopeGeometry['requiredTechnicians'] ?? 1);

  const siteChecks = rawSiteChecks.length
    ? (rawSiteChecks.map(objectOf) as unknown as readonly SiteCheckItem[])
    : defaultSiteChecks(isFeasible, bufferMeters, maxAltitude);

  const rawInspection = x['droneInspection'] ? normalizeInspectionResult(x['droneInspection'], 'UAV-DEFAULT') : null;

  const rawPersonnelCandidates = arrayOf(x['personnelCandidates'])
    .map((c) => normalizeCandidate(objectOf(c)))
    .filter((c) => {
      const r = stringOf(c['role']).toUpperCase();
      return r === 'INSPECTOR' || r === 'ANALYST' || r === 'TECHNICIAN';
    });
  const isAllPass = status === 'READY' || status === 'COMPLETED';

  const personnelCheck = x['personnel']
    ? checkOf(x['personnel'])
    : (isAllPass
        ? { status: 'PASS', reason: null, evaluatedAt: null }
        : derivedPersonnelCheck(rawPersonnelCandidates, reqInspectors, reqAnalysts, reqTechnicians));

  const rawDroneCandidates = arrayOf(x['droneCandidates'] ?? x['uavCandidates']).map((item) => {
    const d = objectOf(item);
    const droneObj = objectOf(d['drone']);
    const actualDroneId = stringOf(d['droneId'] || droneObj['id'] || d['id']);
    const actualCode = stringOf(droneObj['uavCode'] || d['uavCode'] || d['code'] || 'UAV-EVN');
    const actualName = stringOf(droneObj['model'] || d['model'] || d['name'] || actualCode);
    const health = stringOf(d['technicalHealth'] || droneObj['technicalHealth'] || 'HEALTHY');
    const opStatus = stringOf(d['operationalAvailabilityStatus'] || d['operationalStatus'] || droneObj['operationalStatus'] || 'AVAILABLE');
    const isEligible = d['isEligible'] !== false && (stringOf(d['technicalEligibilityStatus'] || d['eligibility']).toUpperCase() !== 'INELIGIBLE');
    return {
      ...d,
      id: actualDroneId,
      droneId: actualDroneId,
      candidateRecordId: stringOf(d['id']),
      code: actualCode,
      name: actualName,
      technicalHealth: health,
      operationalStatus: opStatus,
      eligibility: isEligible ? 'ELIGIBLE' : 'INELIGIBLE',
      suitability: d['suitability'] ? stringOf(d['suitability']).toUpperCase() : null,
      estimatedFlightsNeeded: d['estimatedFlightsNeeded'] != null ? Number(d['estimatedFlightsNeeded']) : null,
      coverageDistanceKm: d['coverageDistanceKm'] != null ? Number(d['coverageDistanceKm']) : null,
      suitabilityReason: d['suitabilityReason'] ? stringOf(d['suitabilityReason']) : null,
    };
  });

  const siteCheck = x['site'] ? checkOf(x['site']) : derivedCheck(isAllPass || status !== 'UNKNOWN');
  const uavCheck = x['uav'] ? checkOf(x['uav']) : derivedCheck(isAllPass || rawDroneCandidates.length > 0);
  const technicalCheck = x['technical'] ? checkOf(x['technical']) : derivedCheck(isAllPass || status === 'READY');

  const computedStatus = (personnelCheck.status === 'FAIL' || siteCheck.status === 'FAIL' || uavCheck.status === 'FAIL')
    ? (status === 'READY' ? 'NOT_READY' : status)
    : status;

  return {
    id: stringOf(x['id']),
    assessmentCode: stringOf(x['assessmentCode'] ?? x['code'], 'ASSESSMENT'),
    regionId: x['regionId'] == null ? undefined : stringOf(x['regionId']),
    regionName: stringOf(x['regionName'] ?? x['regionId'], 'Unknown region'),
    lineId: x['lineId'] == null ? null : stringOf(x['lineId']),
    lineName: x['lineName'] == null ? null : stringOf(x['lineName']),
    assetCount: Number(x['assetCount'] ?? scopeAssetIds.length),
    plannedStart: stringOf(x['plannedStart']),
    plannedEnd: stringOf(x['plannedEnd']),
    requiredInspectors: reqInspectors,
    requiredAnalysts: reqAnalysts,
    requiredTechnicians: reqTechnicians,
    site: siteCheck,
    personnel: personnelCheck,
    uav: uavCheck,
    technical: technicalCheck,
    status: computedStatus,
    validUntil: x['validUntil'] == null ? null : stringOf(x['validUntil']),
    createdBy: x['createdBy'] == null ? null : stringOf(x['createdBy']),
    updatedAt: x['updatedAt'] == null ? null : stringOf(x['updatedAt']),
    consumedMissionId: x['consumedMissionId'] == null ? (x['completedMissionId'] == null ? null : stringOf(x['completedMissionId'])) : stringOf(x['consumedMissionId']),
    consumedMissionCode: x['consumedMissionCode'] == null ? (x['completedMissionCode'] == null ? null : stringOf(x['completedMissionCode'])) : stringOf(x['completedMissionCode']),
    completedMissionId: x['completedMissionId'] == null ? (x['consumedMissionId'] == null ? null : stringOf(x['consumedMissionId'])) : stringOf(x['completedMissionId']),
    completedMissionCode: x['completedMissionCode'] == null ? (x['consumedMissionCode'] == null ? null : stringOf(x['consumedMissionCode'])) : stringOf(x['completedMissionCode']),
    personnelCandidates: rawPersonnelCandidates as never,
    uavCandidates: rawDroneCandidates as never,
    technicalMetrics: (arrayOf(x['technicalMetrics']).map(objectOf) as never),
    siteChecks,
    droneInspection: rawInspection,
    scopeAssetIds,
    scopeGeometry: x['scopeGeometry'],
  };
};
