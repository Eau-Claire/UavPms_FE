import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { Auth } from '../../../core/auth/auth';
import { unwrapApiData } from '../../../models/api.models';
import {
  EmergencyAlertItem,
  AlertSeverity,
  AlertStatus,
  ReviewAlertPayload,
  EscalateAlertPayload,
  EscalationManagerOption,
} from '../models/emergency-alert.models';

const SEED_ACTIVE_ALERTS: EmergencyAlertItem[] = [
  {
    id: 'ea-001',
    title: 'Phát hiện đám cháy rừng sát hành lang an toàn cột 042',
    alertType: 'Cháy rừng / Nhiệt độ cao đe dọa đường dây',
    categoryCode: 'EMERGENCY-FIRE-CORRIDOR',
    severity: 'Critical',
    status: 'Active',
    detectedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    assetCode: 'TOW-220KV-042',
    assetName: 'Cột néo hãm đỡ số 42 - 220kV',
    towerCode: 'Cột 042 (TOW-220KV-042)',
    lineName: 'Đường dây 220kV Hòa Bình - Hà Đông',
    substationName: 'TBA 500kV Tây Hà Nội',
    latitude: 20.8924,
    longitude: 105.4182,
    imageUrl: '/images/defect-preview-frame.png',
    boundingBox: { x: 38, y: 32, width: 34, height: 38, isNormalized: true },
    confidenceScore: 96,
    aiModelName: 'EdgeYOLOv8-Thermal-UAV-v3.1',
    droneId: 'UAV-MATRICE-300-RTK-01',
    missionCode: 'MIS-20260904-EMG',
    description: 'Cảm biến hồng ngoại nhiệt độ phát hiện vùng nhiệt > 350°C cách dây dẫn pha C dưới 12 mét. Khói đậm đặc đe dọa sự cố phóng điện ion hóa.',
  },
  {
    id: 'ea-002',
    title: 'Xơ tưa, đứt nhiều tao dây dẫn pha B sắp đứt gãy',
    alertType: 'Tổn thương cơ học dây dẫn cấp bách',
    categoryCode: 'EMERGENCY-COND-BREAK',
    severity: 'Critical',
    status: 'Active',
    detectedAt: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    assetCode: 'COND-220KV-HB-043',
    assetName: 'Dây dẫn nhôm lõi thép ACSR 400mm2',
    towerCode: 'Khoảng cột 042 - 043',
    lineName: 'Đường dây 220kV Hòa Bình - Hà Đông',
    substationName: 'TBA 220kV Xuân Mai',
    latitude: 20.8988,
    longitude: 105.4295,
    imageUrl: '/images/defect-conductor-damage.png',
    boundingBox: { x: 45, y: 48, width: 32, height: 26, isNormalized: true },
    confidenceScore: 92,
    aiModelName: 'EdgeYOLOv8-GridStructural-v2.8',
    droneId: 'UAV-MATRICE-350-RTK-02',
    missionCode: 'MIS-20260904-INSP',
    description: 'Phát hiện 6 tao nhôm ngoài bị xé toạc, vặn xoắn nghiêm trọng do sét đánh hoặc rung lắc gió lớn. Nguy cơ đứt rơi dây dẫn khi tải cao.',
  },
  {
    id: 'ea-003',
    title: 'Phóng điện bề mặt chuỗi cách điện composite (Flashover)',
    alertType: 'Hư hỏng vật liệu cách điện cao áp',
    categoryCode: 'EMERGENCY-INS-FLASHOVER',
    severity: 'High',
    status: 'Active',
    detectedAt: new Date(Date.now() - 85 * 60 * 1000).toISOString(),
    assetCode: 'INS-COMP-TOW043-P1',
    assetName: 'Chuỗi cách điện néo polymer 220kV',
    towerCode: 'Cột 043 (TOW-220KV-043)',
    lineName: 'Đường dây 220kV Hòa Bình - Hà Đông',
    substationName: 'TBA 500kV Tây Hà Nội',
    latitude: 20.9015,
    longitude: 105.4358,
    imageUrl: '/images/defect-insulator-flashover.png',
    boundingBox: { x: 42, y: 35, width: 28, height: 32, isNormalized: true },
    confidenceScore: 89,
    aiModelName: 'EdgeYOLOv8-GridStructural-v2.8',
    droneId: 'UAV-MATRICE-300-RTK-01',
    missionCode: 'MIS-20260904-EMG',
    description: 'Vết cháy đen rãnh sâu do phóng điện vầng quang kéo dài. Bát cách điện bị nứt nẻ, có nguy cơ đánh thủng cách điện gây sự cố rã lưới.',
  },
];

const SEED_HISTORY_ALERTS: EmergencyAlertItem[] = [
  {
    id: 'ea-hist-001',
    title: 'Cây ngã đổ đè dây cáp quang chống sét OPGW',
    alertType: 'Vi phạm khoảng cách an toàn hành lang',
    categoryCode: 'EMERGENCY-TREE-FALL',
    severity: 'Critical',
    status: 'Escalated',
    detectedAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    assetCode: 'OPGW-220KV-TOW039',
    assetName: 'Cáp quang kết hợp chống sét OPGW 70',
    towerCode: 'Khoảng cột 038 - 039',
    lineName: 'Đường dây 220kV Hòa Bình - Hà Đông',
    latitude: 20.8841,
    longitude: 105.4052,
    imageUrl: '/images/defect-preview-frame.png',
    boundingBox: { x: 50, y: 40, width: 35, height: 35, isNormalized: true },
    confidenceScore: 94,
    aiModelName: 'EdgeYOLOv8-Thermal-UAV-v3.1',
    droneId: 'UAV-MATRICE-300-RTK-01',
    missionCode: 'MIS-20260903-STORM',
    description: 'Cây keo lai cao 18m bị bật gốc sau bão, ngọn cây vắt ngang cáp OPGW tạo lực căng nguy hiểm.',
    reviewInfo: {
      reviewedBy: 'Nguyễn Văn Minh (Analyst)',
      reviewerRole: 'Analyst',
      reviewedAt: new Date(Date.now() - 23 * 3600 * 1000).toISOString(),
      decision: 'Escalated',
      escalatedToUserId: 'mgr-001',
      escalatedToUserName: 'Trần Hữu Nam (Trưởng Trung tâm Điều độ)',
      escalationReason: 'Tình trạng khẩn cấp cấp độ 1: Cần điều động ngay Đội Truyền tải điện khu vực chặt tỉa khẩn cấp và ngắt điện tạm thời đoạn tuyến.',
    },
  },
  {
    id: 'ea-hist-002',
    title: 'Bung bu lông thanh giằng chân cột néo góc 044',
    alertType: 'Hư hỏng kết cấu cơ khí cột',
    categoryCode: 'EMERGENCY-BOLT-MISSING',
    severity: 'High',
    status: 'Confirmed',
    detectedAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    assetCode: 'TWR-BOLT-TOW044',
    assetName: 'Khung giằng chịu lực góc dưới',
    towerCode: 'Cột néo 044 (TOW-220KV-044)',
    lineName: 'Đường dây 220kV Hòa Bình - Hà Đông',
    latitude: 20.9122,
    longitude: 105.4491,
    imageUrl: '/images/defect-bolt-loose.png',
    boundingBox: { x: 55, y: 44, width: 22, height: 26, isNormalized: true },
    confidenceScore: 91,
    aiModelName: 'EdgeYOLOv8-GridStructural-v2.8',
    droneId: 'UAV-MATRICE-350-RTK-02',
    missionCode: 'MIS-20260902-REG',
    description: '2 bu lông M24 bị bung đai ốc hoàn toàn do rung động cơ học.',
    reviewInfo: {
      reviewedBy: 'Lê Thu Trang (Analyst)',
      reviewerRole: 'Analyst',
      reviewedAt: new Date(Date.now() - 47 * 3600 * 1000).toISOString(),
      decision: 'Confirmed',
      notes: 'Đã xác nhận hình ảnh độ phân giải cao 4K. Chuyển thông tin sang Đội Bảo dưỡng để thay thế bu lông và siết lại toàn bộ thanh giằng.',
    },
  },
];

const MOCK_MANAGERS: EscalationManagerOption[] = [
  {
    id: 'mgr-001',
    fullName: 'Trần Hữu Nam',
    email: 'nam.tran@evn-uavpms.vn',
    role: 'Manager',
    department: 'Trung Tâm Điều Độ Hệ Thống Điện Miền Bắc',
    phone: '0912 345 678',
  },
  {
    id: 'mgr-002',
    fullName: 'Lê Đình Khoa',
    email: 'khoa.le@evn-uavpms.vn',
    role: 'Manager',
    department: 'Ban Kỹ Thuật An Toàn & Bảo Dưỡng Lưới Điện',
    phone: '0987 654 321',
  },
  {
    id: 'mgr-003',
    fullName: 'Vũ Đức Cường',
    email: 'cuong.vu@evn-uavpms.vn',
    role: 'Supervisor',
    department: 'Đội Truyền Tải Điện Khu Vực Tây Hà Nội',
    phone: '0904 888 999',
  },
];

function mapBackendAlertItem(raw: any): EmergencyAlertItem {
  const lat = raw.latitude ?? raw.location?.latitude ?? 20.8924;
  const lng = raw.longitude ?? raw.location?.longitude ?? 105.4182;
  const tower = raw.towerCode ?? raw.location?.towerCode ?? raw.assetCode ?? 'Cột điện';
  const img = raw.imageUrl ?? raw.evidence?.mediaUrl ?? '/images/defect-preview-frame.png';

  let bbox = raw.boundingBox;
  if (!bbox && raw.evidence?.boundingBox) {
    try {
      bbox = typeof raw.evidence.boundingBox === 'string'
        ? JSON.parse(raw.evidence.boundingBox)
        : raw.evidence.boundingBox;
    } catch {
      bbox = { x: 35, y: 30, width: 30, height: 30, isNormalized: true };
    }
  }

  const confidence = raw.confidenceScore ?? raw.evidence?.confidenceScore ?? 90;
  const rawSev = raw.severity ?? raw.priority ?? 'Critical';
  const severity: AlertSeverity = ['Critical', 'High', 'Medium', 'Low'].includes(rawSev) ? rawSev : 'Critical';
  const rawStatus = raw.status ?? 'Active';
  const status: AlertStatus = ['Active', 'Confirmed', 'Dismissed', 'Escalated'].includes(rawStatus) ? rawStatus : 'Active';
  const detectedAt = raw.detectedAt ?? raw.triggeredAt ?? new Date().toISOString();

  return {
    id: String(raw.id ?? ''),
    title: raw.title ?? `Cảnh báo sự cố: ${raw.alertType || 'Bất thường'} tại ${tower}`,
    alertType: raw.alertType ?? 'Sự cố lưới điện khẩn cấp',
    categoryCode: raw.categoryCode ?? raw.categoryName ?? 'EMERGENCY-GRID',
    severity,
    status,
    detectedAt: String(detectedAt),
    assetCode: raw.assetCode ?? 'ASSET-220KV',
    assetName: raw.assetName ?? `Thiết bị tại ${tower}`,
    towerCode: tower,
    lineName: raw.lineName ?? 'Đường dây 220kV Hòa Bình - Hà Đông',
    substationName: raw.substationName ?? 'TBA 500kV Tây Hà Nội',
    latitude: Number(lat),
    longitude: Number(lng),
    imageUrl: img,
    boundingBox: bbox,
    confidenceScore: Number(confidence),
    aiModelName: raw.aiModelName ?? 'EdgeYOLOv8-Emergency-Drone-v3.2',
    droneId: raw.droneId ?? 'UAV-MATRICE-300-RTK-01',
    missionCode: raw.missionCode ?? 'MIS-2026-REALTIME',
    description: raw.description ?? raw.notes ?? 'Phát hiện sự cố bất thường từ hệ thống giám sát.',
    reviewInfo: raw.reviewInfo ?? (raw.reviewedBy ? {
      reviewedBy: raw.reviewedBy,
      reviewerRole: 'Analyst',
      reviewedAt: raw.resolvedAt ?? detectedAt,
      decision: status === 'Active' ? 'Confirmed' : (status as any),
      notes: raw.notes,
    } : undefined),
  };
}

@Injectable({
  providedIn: 'root',
})
export class EmergencyAlertsApi {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);

  // Reactive state
  private readonly activeAlertsSignal = signal<EmergencyAlertItem[]>(SEED_ACTIVE_ALERTS);
  private readonly historyAlertsSignal = signal<EmergencyAlertItem[]>(SEED_HISTORY_ALERTS);
  private readonly managersSignal = signal<EscalationManagerOption[]>(MOCK_MANAGERS);

  readonly activeAlerts = computed(() => this.activeAlertsSignal());
  readonly historyAlerts = computed(() => this.historyAlertsSignal());
  readonly managers = computed(() => this.managersSignal());
  readonly activeCount = computed(() => this.activeAlertsSignal().length);

  /**
   * Fetch active alerts from backend or fallback to local signal
   */
  fetchActiveAlerts(): Observable<EmergencyAlertItem[]> {
    return this.http.get<unknown>(`${environment.apiBaseUrl}/alerts/active`).pipe(
      map((res) => {
        const data = unwrapApiData<any>(res);
        const items = Array.isArray(data)
          ? data
          : data?.items && Array.isArray(data.items)
            ? data.items
            : [];
        return items.length > 0 ? items.map(mapBackendAlertItem) : this.activeAlertsSignal();
      }),
      tap((alerts) => this.activeAlertsSignal.set(alerts)),
      catchError((err: HttpErrorResponse) => {
        console.warn('[EmergencyAlertsApi] Backend /alerts/active not yet deployed or error, using local queue:', err.status);
        return of(this.activeAlertsSignal());
      }),
    );
  }

  /**
   * Fetch alert history
   */
  fetchAlertHistory(params?: { status?: string; page?: number; pageSize?: number }): Observable<EmergencyAlertItem[]> {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.set('status', params.status);
    if (params?.page) queryParams.set('page', String(params.page));
    if (params?.pageSize) queryParams.set('pageSize', String(params.pageSize));
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';

    return this.http.get<unknown>(`${environment.apiBaseUrl}/alerts${queryString}`).pipe(
      map((res) => {
        const data = unwrapApiData<any>(res);
        const items = Array.isArray(data)
          ? data
          : data?.items && Array.isArray(data.items)
            ? data.items
            : [];
        return items.length > 0 ? items.map(mapBackendAlertItem) : this.historyAlertsSignal();
      }),
      tap((history) => this.historyAlertsSignal.set(history)),
      catchError((err: HttpErrorResponse) => {
        console.warn('[EmergencyAlertsApi] Backend /alerts history not yet deployed, using local queue:', err.status);
        return of(this.historyAlertsSignal());
      }),
    );
  }

  /**
   * Confirm or Dismiss (Reject) an alert: PUT /api/v1/alerts/{id}/review
   */
  reviewAlert(id: string, payload: ReviewAlertPayload): Observable<void> {
    const user = this.auth.user();
    const reviewerName = user?.fullName || user?.email || 'Chuyên viên Analyst';
    const reviewerRole = user?.role || 'Analyst';

    return this.http.put<void>(`${environment.apiBaseUrl}/alerts/${id}/review`, payload).pipe(
      catchError((err: HttpErrorResponse) => {
        console.warn('[EmergencyAlertsApi] Fallback local review for alert:', id, err.status);
        return of(undefined as void);
      }),
      tap(() => {
        // Move item from active to history
        const active = this.activeAlertsSignal();
        const target = active.find((a) => a.id === id);
        if (target) {
          const updated: EmergencyAlertItem = {
            ...target,
            status: payload.status,
            reviewInfo: {
              reviewedBy: reviewerName,
              reviewerRole: reviewerRole,
              reviewedAt: new Date().toISOString(),
              decision: payload.status,
              notes: payload.notes,
            },
          };
          this.activeAlertsSignal.set(active.filter((a) => a.id !== id));
          this.historyAlertsSignal.update((hist) => [updated, ...hist]);
        }
      }),
    );
  }

  /**
   * Escalate an alert: POST /api/v1/alerts/{id}/escalate
   */
  escalateAlert(id: string, payload: EscalateAlertPayload): Observable<void> {
    const user = this.auth.user();
    const reviewerName = user?.fullName || user?.email || 'Chuyên viên Analyst';
    const reviewerRole = user?.role || 'Analyst';
    const manager = this.managersSignal().find((m) => m.id === payload.escalatedToUserId);
    const targetManagerName = manager ? `${manager.fullName} (${manager.department})` : 'Cấp Quản Lý Hệ Thống';

    return this.http.post<void>(`${environment.apiBaseUrl}/alerts/${id}/escalate`, payload).pipe(
      catchError((err: HttpErrorResponse) => {
        console.warn('[EmergencyAlertsApi] Fallback local escalate for alert:', id, err.status);
        return of(undefined as void);
      }),
      tap(() => {
        const active = this.activeAlertsSignal();
        const target = active.find((a) => a.id === id);
        if (target) {
          const updated: EmergencyAlertItem = {
            ...target,
            status: 'Escalated',
            reviewInfo: {
              reviewedBy: reviewerName,
              reviewerRole: reviewerRole,
              reviewedAt: new Date().toISOString(),
              decision: 'Escalated',
              escalatedToUserId: payload.escalatedToUserId,
              escalatedToUserName: targetManagerName,
              escalationReason: payload.reason,
            },
          };
          this.activeAlertsSignal.set(active.filter((a) => a.id !== id));
          this.historyAlertsSignal.update((hist) => [updated, ...hist]);
        }
      }),
    );
  }

  /**
   * Ingest real-time alert received from SignalR
   */
  ingestRealtimeAlert(alert: EmergencyAlertItem): void {
    const exists = this.activeAlertsSignal().some((a) => a.id === alert.id);
    if (!exists) {
      this.activeAlertsSignal.update((list) => [alert, ...list]);
    }
  }

  /**
   * Simulation helper for demo & manual testing of Edge AI incoming emergency detection
   */
  simulateRealtimeAlert(): EmergencyAlertItem {
    const randomId = 'ea-' + Math.random().toString(36).substring(2, 7);
    const mockTypes = [
      {
        title: 'Phát hiện phóng điện hồ quang chuỗi bát cách điện pha A',
        type: 'Hồ quang điện nguy hiểm',
        code: 'EMG-ARC-FLASHOVER',
        image: '/images/defect-insulator-crack.png',
        desc: 'Tia lửa hồ quang sáng chói kèm nhiệt độ > 400°C phát hiện qua cảm biến quang phổ UV.',
      },
      {
        title: 'Vật thể lạ (Bạt rơm / Diều khổng lồ) vướng vào đường dây',
        type: 'Dị vật vi phạm khoảng cách phóng điện',
        code: 'EMG-FOREIGN-OBJECT',
        image: '/images/defect-conductor-damage.png',
        desc: 'Màng bạt nông nghiệp dài 4 mét mắc trên dây dẫn đang cháy xém do phóng điện vầng quang.',
      },
      {
        title: 'Sạt lở đất đe dọa sập móng trụ néo số 045',
        type: 'Sạt lở địa chất nguy cơ đổ cột',
        code: 'EMG-GEO-LANDSLIDE',
        image: '/images/defect-preview-frame.png',
        desc: 'Mưa lớn gây sạt lở taluy âm cách móng trụ néo 1.8 mét. Đất đá đang sụt lún nhanh.',
      },
    ];

    const pick = mockTypes[Math.floor(Math.random() * mockTypes.length)];
    const newAlert: EmergencyAlertItem = {
      id: randomId,
      title: pick.title,
      alertType: pick.type,
      categoryCode: pick.code,
      severity: 'Critical',
      status: 'Active',
      detectedAt: new Date().toISOString(),
      assetCode: `TOW-220KV-0${Math.floor(Math.random() * 20 + 35)}`,
      assetName: 'Cột đỡ néo đường dây 220kV',
      towerCode: `Cột 0${Math.floor(Math.random() * 20 + 35)}`,
      lineName: 'Đường dây 220kV Hòa Bình - Hà Đông',
      substationName: 'TBA 500kV Tây Hà Nội',
      latitude: 20.89 + Math.random() * 0.05,
      longitude: 105.41 + Math.random() * 0.05,
      imageUrl: pick.image,
      boundingBox: { x: 35 + Math.random() * 15, y: 30 + Math.random() * 15, width: 30, height: 30, isNormalized: true },
      confidenceScore: Math.floor(Math.random() * 10 + 90),
      aiModelName: 'EdgeYOLOv8-Emergency-Drone-v3.2',
      droneId: 'UAV-MATRICE-300-RTK-01',
      missionCode: 'MIS-20260904-REALTIME',
      description: pick.desc,
    };

    this.ingestRealtimeAlert(newAlert);
    return newAlert;
  }
}
