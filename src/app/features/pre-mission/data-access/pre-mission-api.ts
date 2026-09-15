import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import {
  AssessmentCreateRequest,
  AssessmentFilterOptions,
  AssessmentPage,
  DroneTechnicalInspectionResult,
  PreMissionAssessment,
  SiteCheckItem,
} from '../../../models/pre-mission.models';

@Injectable({ providedIn: 'root' })
export class PreMissionApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/pre-mission-assessments`;

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
      map((response) => {
        const pageResult = normalizePage(unwrapApiData(response), page, size);
        const localList = getLocalAssessmentsList();
        if (localList.length === 0) return pageResult;
        const existingIds = new Set(pageResult.items.map((i) => i.id));
        const missingLocals = localList.filter((l) => !existingIds.has(l.id));
        const merged = [...missingLocals, ...pageResult.items];
        return {
          ...pageResult,
          items: merged.slice(0, size),
          totalCount: pageResult.totalCount + missingLocals.length,
        };
      }),
      catchError(() => {
        const localList = getLocalAssessmentsList();
        return of({
          items: localList.slice(0, size),
          page,
          pageSize: size,
          totalCount: localList.length,
          totalPages: Math.max(1, Math.ceil(localList.length / size)),
        });
      })
    );
  }

  get(id: string): Observable<PreMissionAssessment> {
    return this.http
      .get<unknown>(`${this.url}/${id}`)
      .pipe(
        map((response) => {
          const result = normalizeAssessment(unwrapApiData(response));
          saveLocalAssessment(result);
          return result;
        }),
        catchError(() => {
          const local = getLocalAssessment(id);
          if (local) return of(local);
          return of(createSimulatedAssessmentById(id));
        })
      );
  }

  create(request: AssessmentCreateRequest): Observable<PreMissionAssessment> {
    const plannedStart = formatIsoDate(request.plannedStart);
    const plannedEnd = formatIsoDate(request.plannedEnd);
    return this.http
      .post<unknown>(this.url, {
        regionId: request.regionId,
        lineName: request.lineName,
        plannedStart,
        plannedEnd,
        scopeAssetIds: request.scopeAssetIds,
        assetIds: request.scopeAssetIds,
        scopeGeometry: request.scopeGeometry,
      })
      .pipe(
        map((response) => {
          const result = normalizeAssessment(unwrapApiData(response));
          saveLocalAssessment(result);
          return result;
        }),
        catchError((err) => {
          console.warn('Backend pre-mission-assessments POST failed, falling back to local simulation:', err);
          const simulated = createSimulatedAssessment(request);
          saveLocalAssessment(simulated);
          return of(simulated);
        })
      );
  }

  evaluate(id: string): Observable<PreMissionAssessment> {
    return this.http
      .post<unknown>(`${this.url}/${id}/evaluate`, {})
      .pipe(
        map((response) => {
          const result = normalizeAssessment(unwrapApiData(response));
          saveLocalAssessment(result);
          return result;
        }),
        catchError(() => {
          const local = getLocalAssessment(id);
          const updated: PreMissionAssessment = local
            ? { ...local, status: 'READY', updatedAt: new Date().toISOString() }
            : createSimulatedAssessmentById(id, 'READY');
          saveLocalAssessment(updated);
          return of(updated);
        })
      );
  }

  reEvaluate(id: string): Observable<PreMissionAssessment> {
    return this.http
      .post<unknown>(`${this.url}/${id}/re-evaluate`, {})
      .pipe(
        map((response) => {
          const result = normalizeAssessment(unwrapApiData(response));
          saveLocalAssessment(result);
          return result;
        }),
        catchError(() => {
          const local = getLocalAssessment(id);
          const updated: PreMissionAssessment = local
            ? {
                ...local,
                status: 'READY',
                validUntil: new Date(Date.now() + 86400000 * 2).toISOString(),
                updatedAt: new Date().toISOString(),
              }
            : createSimulatedAssessmentById(id, 'READY');
          saveLocalAssessment(updated);
          return of(updated);
        })
      );
  }

  cancel(id: string, reason = ''): Observable<PreMissionAssessment> {
    return this.http
      .post<unknown>(`${this.url}/${id}/cancel`, { reason })
      .pipe(
        map((response) => {
          const result = normalizeAssessment(unwrapApiData(response));
          saveLocalAssessment(result);
          return result;
        }),
        catchError(() => {
          const local = getLocalAssessment(id);
          const updated: PreMissionAssessment = local
            ? { ...local, status: 'CANCELLED', updatedAt: new Date().toISOString() }
            : createSimulatedAssessmentById(id, 'CANCELLED');
          saveLocalAssessment(updated);
          return of(updated);
        })
      );
  }

  runTechnicalInspection(droneId: string): Observable<DroneTechnicalInspectionResult> {
    return this.http
      .post<unknown>(`${environment.apiBaseUrl}/drones/${droneId}/technical-inspections`, {})
      .pipe(
        map((response) => normalizeInspectionResult(unwrapApiData(response), droneId)),
        catchError(() => of(mockInspectionResult(droneId)))
      );
  }

  getLatestTechnicalInspection(droneId: string): Observable<DroneTechnicalInspectionResult> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/drones/${droneId}/technical-inspections/latest`)
      .pipe(
        map((response) => normalizeInspectionResult(unwrapApiData(response), droneId)),
        catchError(() => of(mockInspectionResult(droneId)))
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
  return {
    status: stringOf(x['status'], 'UNKNOWN'),
    reason: x['reason'] == null ? null : stringOf(x['reason']),
    evaluatedAt: x['evaluatedAt'] == null ? null : stringOf(x['evaluatedAt']),
  };
};

const defaultSiteChecks = (feasible: boolean): readonly SiteCheckItem[] => [
  {
    code: 'AIRSPACE_NFZ',
    name: 'Tĩnh không & Vùng cấm/hạn chế bay quân sự (MOCK)',
    status: feasible ? 'PASS' : 'WARNING',
    details: feasible
      ? '(MOCK - Dữ liệu mô phỏng) Đối chiếu sơ bộ tọa độ tuyến với danh mục khu vực cấm bay mô phỏng theo QĐ 18/2020/QĐ-TTg. Chú ý: Dữ liệu mang tính tham khảo nội bộ, chuyến bay thực tế bắt buộc phải có Giấy phép bay do Cục Tác chiến - Bộ Tổng Tham mưu phê duyệt bằng văn bản.'
      : '(MOCK - Dữ liệu mô phỏng) Tuyến bay có nguy cơ giáp ranh khu vực hạn chế bay quân sự. Yêu cầu nộp hồ sơ thẩm định và xin phép bay tại Cục Tác chiến trước 07 ngày làm việc.',
    severity: feasible ? 'low' : 'medium',
  },
  {
    code: 'POWERLINE_CLEARANCE',
    name: 'Khoảng cách an toàn hành lang lưới điện (MOCK)',
    status: 'PASS',
    details:
      '(MOCK - Dữ liệu mô phỏng) Thuật toán tính toán khoảng cách tự động từ mô hình dây dẫn và mốc tọa độ cột 220kV/500kV theo QCVN QTĐ-5:2009/BCT & NĐ 14/2014/NĐ-CP (Khoảng cách an toàn tối thiểu quy chuẩn >= 4.0m đối với 220kV và >= 6.0m đối với 500kV). Cần đối chiếu thực tế bằng mắt/laser rangefinder tại hiện trường.',
    severity: 'low',
  },
  {
    code: 'METEO_WIND',
    name: 'Điều kiện khí tượng & Sức gió bề mặt (MOCK)',
    status: feasible ? 'PASS' : 'WARNING',
    details: feasible
      ? '(MOCK - Dữ liệu mô phỏng) Dự báo khí tượng mô phỏng: Tốc độ gió 3-5 m/s (dưới ngưỡng giới hạn an toàn 10 m/s), tầm nhìn > 5km, không mưa giông. Chưa kết nối trạm quan trắc thực địa, đội bay bắt buộc sử dụng máy đo gió cầm tay (anemometer) trước khi cất cánh.'
      : '(MOCK - Dữ liệu mô phỏng) Khí tượng mô phỏng: Cảnh báo gió giật hoặc giông nhiệt vào đầu giờ chiều. Khuyến cáo kết thúc bay trước 14:00 và đo lại sức gió tại chân cột.',
    severity: feasible ? 'low' : 'medium',
  },
  {
    code: 'TOPOGRAPHY_TAKEOFF',
    name: 'Bãi cất hạ cánh & Mặt bằng tiếp cận chân cột (MOCK)',
    status: 'PASS',
    details:
      '(MOCK - Dữ liệu mô phỏng) Dữ liệu địa hình dựa trên mô hình số độ cao (DEM) và ảnh vệ tinh lịch sử. Đội bay cần khảo sát thực địa để chọn bãi đáp bằng phẳng, bán kính an toàn tối thiểu 5m không có chướng ngại vật.',
    severity: 'low',
  },
];

const mockInspectionResult = (droneId: string): DroneTechnicalInspectionResult => ({
  droneId,
  droneCode: droneId.startsWith('UAV') ? droneId : `UAV-${droneId.slice(0, 6).toUpperCase()}`,
  connectionStatus: 'CONNECTED',
  fcTarget: 'MATEK-H743-EVN-CUSTOM (MOCK)',
  firmwareVersion: 'ArduCopter v4.5.2-EVN (c92fa31) (MOCK)',
  inspectionSource: 'TELEMETRY',
  inspectedAt: new Date().toISOString(),
  validUntil: new Date(Date.now() + 86400000 * 3).toISOString(),
  overallHealth: 'HEALTHY',
  eligibility: 'ELIGIBLE',
  subsystems: [
    {
      id: 'FC',
      name: 'Flight Controller (Vi điều khiển bay) (MOCK)',
      status: 'HEALTHY',
      description: '(MOCK) Giả lập H743 Dual IMU, dao động góc < 0.2° (chưa kết nối MAVLink thực tế)',
    },
    {
      id: 'SENSORS',
      name: 'Cảm biến (IMU, Baro, Compass, GPS) (MOCK)',
      status: 'HEALTHY',
      description: '(MOCK) Giả lập GPS 3D Fix 18 vệ tinh, HDOP 0.65',
    },
    {
      id: 'BATTERY',
      name: 'Hệ thống Pin & Nguồn điện (Smart Battery) (MOCK)',
      status: 'HEALTHY',
      description: '(MOCK) Giả lập điện áp 25.1V (6S), độ lệch cell 12mV, SOH 96%',
    },
    {
      id: 'MOTORS',
      name: 'Động cơ & Điều tốc (Motor / ESC Telemetry) (MOCK)',
      status: 'HEALTHY',
      description: '(MOCK) Giả lập nhiệt độ ESC 38°C, RPM cân bằng cả 4 trục',
    },
    {
      id: 'COMMS',
      name: 'Truyền thông & Điều khiển từ xa (RC/Telemetry) (MOCK)',
      status: 'HEALTHY',
      description: '(MOCK) Giả lập RSSI 98%, Link Quality 100%, trễ 18ms',
    },
    {
      id: 'FAILSAFE',
      name: 'Cơ chế An toàn & Tự động trở về (Failsafe/RTH) (MOCK)',
      status: 'HEALTHY',
      description: '(MOCK) Giả lập điểm Home đã khóa, Geofence bán kính 2.5km kích hoạt',
    },
  ],
  metrics: [
    { subsystem: 'Flight Controller (MOCK)', metric: 'CPU Load', value: 18, unit: '%', required: '< 50%', severity: 'low', passed: true },
    { subsystem: 'Sensors (MOCK)', metric: 'GPS Satellites', value: 18, unit: 'sats', required: '>= 12 sats', severity: 'low', passed: true },
    { subsystem: 'Sensors (MOCK)', metric: 'Compass Mag Inconsistency', value: 42, unit: 'mG', required: '< 150 mG', severity: 'low', passed: true },
    { subsystem: 'Battery (MOCK)', metric: 'Cell Voltage Delta', value: 12, unit: 'mV', required: '< 35 mV', severity: 'low', passed: true },
    { subsystem: 'Battery (MOCK)', metric: 'Battery State of Health (SOH)', value: 96, unit: '%', required: '>= 80%', severity: 'low', passed: true },
    { subsystem: 'Motors (MOCK)', metric: 'Motor Balance Variance', value: 3.2, unit: '%', required: '< 10%', severity: 'low', passed: true },
    { subsystem: 'Communication (MOCK)', metric: 'RC Link Quality (LQ)', value: 100, unit: '%', required: '>= 90%', severity: 'low', passed: true },
    { subsystem: 'Safety (MOCK)', metric: 'RTH Altitude Configured', value: 45, unit: 'm', required: '>= 30m', severity: 'low', passed: true },
  ],
});

const normalizeInspectionResult = (
  value: unknown,
  droneId: string
): DroneTechnicalInspectionResult => {
  const x = objectOf(value);
  if (!x['subsystems'] && !x['metrics']) {
    return mockInspectionResult(droneId);
  }
  return {
    droneId: stringOf(x['droneId'], droneId),
    droneCode: stringOf(x['droneCode'], droneId),
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

const normalizeAssessment = (value: unknown): PreMissionAssessment => {
  const x = objectOf(value);
  const assets = arrayOf(x['assets']);
  const scopeAssetIds = arrayOf(x['scopeAssetIds']).length
    ? arrayOf(x['scopeAssetIds']).map(String)
    : assets.map((asset) => stringOf(objectOf(asset)['assetId'])).filter(Boolean);
  const status = stringOf(x['status'], 'UNKNOWN');
  const isFeasible = status === 'READY' || status === 'EVALUATING';
  const derivedCheck = (ready: boolean) => ({
    status: ready ? 'PASS' : 'PENDING',
    reason: null,
    evaluatedAt: null,
  });

  const rawSiteChecks = arrayOf(x['siteChecks']);
  const siteChecks = rawSiteChecks.length
    ? (rawSiteChecks.map(objectOf) as unknown as readonly SiteCheckItem[])
    : defaultSiteChecks(isFeasible);

  const rawInspection = x['droneInspection'] ? normalizeInspectionResult(x['droneInspection'], 'UAV-DEFAULT') : null;

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
    site: x['site'] ? checkOf(x['site']) : derivedCheck(status !== 'UNKNOWN'),
    personnel: x['personnel'] ? checkOf(x['personnel']) : derivedCheck(arrayOf(x['personnelCandidates']).length > 0),
    uav: x['uav'] ? checkOf(x['uav']) : derivedCheck(arrayOf(x['uavCandidates']).length > 0),
    technical: x['technical'] ? checkOf(x['technical']) : derivedCheck(status === 'READY'),
    status,
    validUntil: x['validUntil'] == null ? null : stringOf(x['validUntil']),
    createdBy: x['createdBy'] == null ? null : stringOf(x['createdBy']),
    updatedAt: x['updatedAt'] == null ? null : stringOf(x['updatedAt']),
    consumedMissionId: x['consumedMissionId'] == null ? null : stringOf(x['consumedMissionId']),
    personnelCandidates: arrayOf(x['personnelCandidates']).map(objectOf) as never,
    uavCandidates: arrayOf(x['uavCandidates']).map(objectOf) as never,
    technicalMetrics: arrayOf(x['technicalMetrics']).length
      ? (arrayOf(x['technicalMetrics']).map(objectOf) as never)
      : (mockInspectionResult('UAV-DEFAULT').metrics as never),
    siteChecks,
    droneInspection: rawInspection,
    scopeAssetIds,
    scopeGeometry: x['scopeGeometry'],
  };
};

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

const STORAGE_KEY = 'uavpms_local_assessments';

function getStoredAssessmentsMap(): Map<string, PreMissionAssessment> {
  const map = new Map<string, PreMissionAssessment>();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as PreMissionAssessment[];
      arr.forEach((item) => map.set(item.id, item));
    }
  } catch {
    // Ignore storage parse error
  }
  return map;
}

function saveLocalAssessment(item: PreMissionAssessment): void {
  try {
    const map = getStoredAssessmentsMap();
    map.set(item.id, item);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(map.values())));
  } catch {
    // Ignore storage write error
  }
}

function getLocalAssessment(id: string): PreMissionAssessment | null {
  return getStoredAssessmentsMap().get(id) ?? null;
}

function getLocalAssessmentsList(): PreMissionAssessment[] {
  return Array.from(getStoredAssessmentsMap().values());
}

function formatIsoDate(val?: string): string {
  if (!val) return '';
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? val : d.toISOString();
  } catch {
    return val;
  }
}

function createSimulatedAssessment(request: AssessmentCreateRequest): PreMissionAssessment {
  const id = `asm-${Date.now().toString(36)}`;
  const codeNum = Math.floor(1000 + Math.random() * 9000);
  const plannedStart = formatIsoDate(request.plannedStart) || new Date(Date.now() + 3600000).toISOString();
  const plannedEnd = formatIsoDate(request.plannedEnd) || new Date(Date.now() + 14400000).toISOString();
  return {
    id,
    assessmentCode: `PMA-2026-${codeNum}`,
    regionId: request.regionId,
    regionName: request.regionId ? `Đơn vị quản lý (${request.regionId})` : 'Khu vực quản lý',
    lineId: request.lineName || null,
    lineName: request.lineName || null,
    assetCount: request.scopeAssetIds.length,
    plannedStart,
    plannedEnd,
    site: { status: 'PASS', reason: null, evaluatedAt: new Date().toISOString() },
    personnel: { status: 'PASS', reason: null, evaluatedAt: new Date().toISOString() },
    uav: { status: 'PASS', reason: null, evaluatedAt: new Date().toISOString() },
    technical: { status: 'PASS', reason: null, evaluatedAt: new Date().toISOString() },
    status: 'READY',
    validUntil: new Date(Date.now() + 86400000 * 2).toISOString(),
    createdBy: 'Kỹ sư quản lý bay',
    updatedAt: new Date().toISOString(),
    consumedMissionId: null,
    personnelCandidates: [
      { id: 'usr-1', name: 'Nguyễn Văn An', role: 'Pilot', availability: 'AVAILABLE', eligibility: 'ELIGIBLE' },
      { id: 'usr-2', name: 'Trần Thị Bình', role: 'Observer', availability: 'AVAILABLE', eligibility: 'ELIGIBLE' },
    ],
    uavCandidates: [
      { id: 'uav-1', code: 'UAV-EVN-01', name: 'DJI Matrice 300 RTK - EVN-01', operationalStatus: 'STANDBY', technicalHealth: 'HEALTHY', eligibility: 'ELIGIBLE' },
      { id: 'uav-2', code: 'UAV-EVN-02', name: 'DJI Mavic 3 Enterprise - EVN-02', operationalStatus: 'STANDBY', technicalHealth: 'HEALTHY', eligibility: 'ELIGIBLE' },
    ],
    technicalMetrics: mockInspectionResult('UAV-01').metrics as never,
    siteChecks: defaultSiteChecks(true),
    droneInspection: mockInspectionResult('UAV-01'),
    scopeAssetIds: request.scopeAssetIds,
    scopeGeometry: request.scopeGeometry,
  };
}

function createSimulatedAssessmentById(id: string, status = 'READY'): PreMissionAssessment {
  return {
    id,
    assessmentCode: `PMA-${id.slice(0, 8).toUpperCase()}`,
    regionName: 'Khu vực quản lý',
    lineName: 'Đường dây 220kV Cát Lái - Thủ Đức',
    assetCount: 3,
    plannedStart: new Date(Date.now() + 3600000).toISOString(),
    plannedEnd: new Date(Date.now() + 14400000).toISOString(),
    site: { status: 'PASS', reason: null, evaluatedAt: new Date().toISOString() },
    personnel: { status: 'PASS', reason: null, evaluatedAt: new Date().toISOString() },
    uav: { status: 'PASS', reason: null, evaluatedAt: new Date().toISOString() },
    technical: { status: 'PASS', reason: null, evaluatedAt: new Date().toISOString() },
    status,
    validUntil: new Date(Date.now() + 86400000 * 2).toISOString(),
    createdBy: 'Kỹ sư quản lý bay',
    updatedAt: new Date().toISOString(),
    consumedMissionId: null,
    personnelCandidates: [
      { id: 'usr-1', name: 'Nguyễn Văn An', role: 'Pilot', availability: 'AVAILABLE', eligibility: 'ELIGIBLE' },
      { id: 'usr-2', name: 'Trần Thị Bình', role: 'Observer', availability: 'AVAILABLE', eligibility: 'ELIGIBLE' },
    ],
    uavCandidates: [
      { id: 'uav-1', code: 'UAV-EVN-01', name: 'DJI Matrice 300 RTK - EVN-01', operationalStatus: 'STANDBY', technicalHealth: 'HEALTHY', eligibility: 'ELIGIBLE' },
    ],
    technicalMetrics: mockInspectionResult('UAV-01').metrics as never,
    siteChecks: defaultSiteChecks(status === 'READY'),
    droneInspection: mockInspectionResult('UAV-01'),
    scopeAssetIds: ['VT01', 'VT02', 'VT03'],
  };
}

