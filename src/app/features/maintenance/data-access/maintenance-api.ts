import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { asRecord, readArray, readBoolean, readFirstString, readNumber, readOptionalNumber, readOptionalString, readString } from '../../../shared/utils';
import {
  AssignTechnicianRequest,
  LogMaterialRequest,
  MaintenanceAnomalyRef,
  MaintenancePerson,
  MaintenanceProof,
  MaintenanceTicket,
  MaintenanceTicketFilters,
  MaintenanceTicketPage,
  MaintenanceTowerRef,
  MaterialLog,
  TechnicianSummary,
} from '../../../models/maintenance.models';
import { parseBoundingBox } from '../../analyst-review/data-access/anomaly-api';

export function sanitizeTicketImage(url?: string | null, categoryCode?: string): string {
  if (!url || url.startsWith('blob:')) {
    switch ((categoryCode || '').toUpperCase()) {
      case 'CORROSION':
        return '/images/defect-insulator-dirty.png';
      case 'INSULATOR_CRACK':
        return '/images/defect-insulator-crack.png';
      case 'MISSING_BOLT':
        return '/images/defect-bolt-missing.png';
      case 'VEGETATION_CLEARANCE':
        return '/images/defect-corridor-tree.png';
      default:
        return '/images/defect-preview-frame.png';
    }
  }
  return url;
}

/** Technicians from real backend endpoints only (no hardcoded fallback users). */
export const REAL_DB_TECHNICIANS: readonly TechnicianSummary[] = [];

/** Maintenance tickets (MF04): OperationsService `/maintenance/tickets`. */
@Injectable({ providedIn: 'root' })
export class MaintenanceApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/maintenance/tickets`;

  /** All tickets, paged (pageIndex is 0-based). */
  list(filters: MaintenanceTicketFilters): Observable<MaintenanceTicketPage> {
    let params = new HttpParams().set('pageIndex', Math.max(0, filters.pageIndex)).set('pageSize', filters.pageSize);
    if (filters.status) params = params.set('status', filters.status);
    if (filters.priority) params = params.set('priority', filters.priority);
    return this.http.get<unknown>(this.url, { params }).pipe(
      map((response) => {
        const unwrapped = unwrapApiData(response);
        const data = asRecord(unwrapped);
        const backendItems = (Array.isArray(unwrapped) ? unwrapped : readArray(data?.['items'])).map(normalizeTicket);
        return {
          items: backendItems,
          totalCount: readNumber(data, 'totalCount') || backendItems.length,
          pageIndex: readNumber(data, 'pageIndex', filters.pageIndex),
          pageSize: readNumber(data, 'pageSize') || filters.pageSize,
        };
      }),
      catchError(() => {
        return of({
          items: [],
          totalCount: 0,
          pageIndex: filters.pageIndex,
          pageSize: filters.pageSize,
        });
      }),
    );
  }

  /** Tickets assigned to the signed-in technician. */
  mine(): Observable<readonly MaintenanceTicket[]> {
    return this.http.get<unknown>(`${this.url}/my`).pipe(map((response) => itemsOf(unwrapApiData(response)).map(normalizeTicket)));
  }

  get(id: string): Observable<MaintenanceTicket> {
    return this.http.get<unknown>(`${this.url}/${id}`).pipe(
      map((response) => normalizeTicket(unwrapApiData(response))),
    );
  }

  technicians(): Observable<readonly TechnicianSummary[]> {
    return this.http.get<unknown>(`${this.url}/technicians`).pipe(
      map((response) =>
        itemsOf(unwrapApiData(response)).map((item) => {
          const source = asRecord(item);
          return {
            id: readString(source, 'id'),
            fullName: readString(source, 'fullName'),
            email: readString(source, 'email'),
            activeTicketCount: readNumber(source, 'activeTicketCount'),
          };
        }),
      ),
      catchError(() => {
        return this.http.get<unknown>(`${environment.apiBaseUrl}/users/assignable`).pipe(
          map((resp) => {
            const data = unwrapApiData<Record<string, unknown>>(resp);
            const list = Array.isArray(data) ? data : Array.isArray(data?.['items']) ? (data['items'] as unknown[]) : [];
            const techs = list
              .map((u) => asRecord(u))
              .filter((u) => {
                const r = readString(u, 'role');
                const roles = readArray(u?.['roles']).map(String);
                return r.toLowerCase().includes('tech') || roles.some((x) => x.toLowerCase().includes('tech'));
              })
              .map((u) => ({
                id: readString(u, 'id'),
                fullName: readFirstString(u, ['fullName', 'username']),
                email: readString(u, 'email'),
                activeTicketCount: 0,
              }));
            return techs.length > 0 ? techs : REAL_DB_TECHNICIANS;
          }),
          catchError(() => of(REAL_DB_TECHNICIANS)),
        );
      }),
    );
  }

  assign(id: string, request: AssignTechnicianRequest): Observable<MaintenanceTicket> {
    const body = { technicianId: request.technicianId, dueDate: request.dueDate ? toDueDateIso(request.dueDate) : undefined };
    return this.http.put<unknown>(`${this.url}/${id}/assign`, body).pipe(
      map((response) => normalizeTicket(unwrapApiData(response))),
    );
  }

  updateStatus(id: string, status: 'InProgress' | 'PendingVerification'): Observable<MaintenanceTicket> {
    return this.http.put<unknown>(`${this.url}/${id}/status`, { status }).pipe(
      map((response) => normalizeTicket(unwrapApiData(response))),
    );
  }

  uploadProof(id: string, file: File, technicianNotes: string): Observable<MaintenanceProof> {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('technicianNotes', technicianNotes.trim());
    return this.http.post<unknown>(`${this.url}/${id}/proof`, form).pipe(
      map((response) => normalizeProof(unwrapApiData(response))),
    );
  }

  logMaterial(id: string, request: LogMaterialRequest): Observable<MaterialLog> {
    const body = {
      componentName: request.componentName.trim(),
      componentCode: request.componentCode?.trim() || undefined,
      quantityUsed: Math.trunc(Number(request.quantityUsed)),
      unit: request.unit.trim(),
      fieldObservations: request.fieldObservations?.trim() || undefined,
    };
    return this.http.post<unknown>(`${this.url}/${id}/materials`, body).pipe(
      map((response) => normalizeMaterial(unwrapApiData(response))),
    );
  }

  close(id: string): Observable<MaintenanceTicket> {
    return this.http.put<unknown>(`${this.url}/${id}/close`, {}).pipe(
      map((response) => normalizeTicket(unwrapApiData(response))),
    );
  }
}

/** Vietnamese messages for the maintenance endpoints' errors (errorCode, or the English BusinessRule message). */
const ERROR_MESSAGES: readonly (readonly [string, string])[] = [
  ['TICKET_NOT_OPEN', 'Chỉ có thể giao kỹ thuật viên cho phiếu đang chờ xử lý.'],
  ['TICKET_NOT_PENDING_VERIFICATION', 'Chỉ có thể nghiệm thu phiếu đang chờ nghiệm thu.'],
  ['TICKET_CLOSE_REQUIRES_MANAGER', 'Chỉ Quản lý hoặc Quản trị viên mới được nghiệm thu và đóng phiếu.'],
  ['TICKET_CLOSED', 'Phiếu đã đóng, không thể thêm minh chứng hoặc vật tư.'],
  ['STORAGE_FAILURE', 'Không thể lưu ảnh minh chứng vào kho lưu trữ. Vui lòng thử lại.'],
  ['Due date cannot be in the past', 'Hạn xử lý không được ở trong quá khứ.'],
  ['Assigned user is not a Technician', 'Người được chọn không phải kỹ thuật viên.'],
  ['Technician not found', 'Không tìm thấy kỹ thuật viên.'],
  ['Maintenance ticket not found', 'Không tìm thấy phiếu bảo trì.'],
  ['Anomaly not found', 'Không tìm thấy bất thường liên quan.'],
  ['no technician assigned', 'Phiếu chưa được giao kỹ thuật viên nên chưa thể bắt đầu sửa chữa.'],
  ['Cannot start progress on ticket', 'Chỉ có thể bắt đầu sửa chữa phiếu đang chờ xử lý.'],
  ['without repair proof photo', 'Cần tải lên ít nhất một ảnh minh chứng sau sửa chữa.'],
  ['already closed ticket', 'Phiếu đã đóng, không thể thay đổi trạng thái.'],
  ['Cannot transition ticket', 'Trạng thái hiện tại của phiếu không cho phép thao tác này.'],
  ['Cannot close ticket from status', 'Chỉ có thể nghiệm thu phiếu đang chờ nghiệm thu.'],
  ['cannot exceed 50MB', 'Ảnh minh chứng không được rỗng và tối đa 50MB.'],
  ['File extension is prohibited', 'Định dạng tệp không được hỗ trợ (chỉ JPG, PNG, WEBP, TIFF).'],
  ['componentName and unit are required', 'Tên vật tư và đơn vị tính là bắt buộc.'],
  ['quantityUsed must be greater than 0', 'Số lượng phải lớn hơn 0.'],
  ['not assigned to this ticket', 'Bạn không được giao phiếu bảo trì này.'],
];

export const maintenanceErrorMessage = (error: unknown, fallback: string): string => {
  const source = asRecord(error);
  const status = readOptionalNumber(source, 'status');
  const body = asRecord(source?.['error']);
  const code = readString(body, 'errorCode');
  const message = readFirstString(body, ['message', 'title', 'detail']);
  const haystack = `${code} ${message}`.toLowerCase();
  const known = ERROR_MESSAGES.find(([needle]) => haystack.includes(needle.toLowerCase()));
  if (known) return known[1];
  if (status === 0) return 'Không thể kết nối đến máy chủ.';
  if (status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  if (status === 404) return 'Không tìm thấy phiếu bảo trì.';
  if (status === 413) return 'Ảnh quá lớn (tối đa 50MB).';
  return fallback;
};

export const maintenanceErrorStatus = (error: unknown): number => readNumber(asRecord(error), 'status');

const itemsOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : readArray(asRecord(value)?.['items']));

const optionalText = (source: Record<string, unknown> | null, key: string): string | undefined =>
  readOptionalString(source, key) ?? undefined;

const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';
const optionalId = (source: Record<string, unknown> | null, key: string): string | undefined => {
  const id = readOptionalString(source, key);
  return id && id !== EMPTY_GUID ? id : undefined;
};

/**
 * A date input gives a local calendar day (yyyy-MM-dd): send the end of that day as a UTC instant ("…Z") so a due
 * date of "today" is not rejected as being in the past and ASP.NET binds it as DateTimeKind.Utc.
 */
export const toDueDateIso = (value: string): string => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T23:59:59`) : new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
};

const normalizePerson = (value: unknown): MaintenancePerson | undefined => {
  const source = asRecord(value);
  const id = optionalId(source, 'id');
  if (!id) return undefined;
  return { id, email: readString(source, 'email'), fullName: readFirstString(source, ['fullName', 'username']) };
};

const normalizeTower = (value: unknown): MaintenanceTowerRef | undefined => {
  const source = asRecord(value);
  const id = optionalId(source, 'id');
  if (!id) return undefined;
  return { id, towerCode: readString(source, 'towerCode'), poleType: optionalText(source, 'poleType'), regionId: optionalId(source, 'regionId') };
};

const normalizeAnomaly = (value: unknown): MaintenanceAnomalyRef | undefined => {
  const source = asRecord(value);
  const id = optionalId(source, 'id');
  if (!id) return undefined;
  const confidence = readNumber(source, 'confidenceScore');
  return {
    id,
    validationStatus: readString(source, 'validationStatus'),
    confidenceScore: confidence <= 1 ? confidence * 100 : confidence,
    mediaId: optionalId(source, 'mediaId'),
    missionId: optionalId(source, 'missionId'),
    categoryCode: optionalText(source, 'categoryCode'),
    categoryName: optionalText(source, 'categoryName'),
    isEmergencyClass: readBoolean(source, 'isEmergencyClass'),
    imageUrl: optionalText(source, 'imageUrl'),
    cropUrl: optionalText(source, 'cropUrl'),
    boundingBox: parseBoundingBox(source?.['boundingBox']),
    analystNotes: optionalText(source, 'analystNotes'),
    validatedAt: optionalText(source, 'validatedAt'),
  };
};

export const normalizeProof = (value: unknown): MaintenanceProof => {
  const source = asRecord(value);
  return {
    id: readString(source, 'id'),
    proofType: readString(source, 'proofType', 'After'),
    fileUrl: readFirstString(source, ['fileUrl', 'afterRepairImageUrl']),
    technicianNotes: readString(source, 'technicianNotes'),
    uploadedAt: readString(source, 'uploadedAt'),
  };
};

export const normalizeMaterial = (value: unknown): MaterialLog => {
  const source = asRecord(value);
  return {
    id: readString(source, 'id'),
    componentName: readString(source, 'componentName'),
    componentCode: readString(source, 'componentCode'),
    quantityUsed: readNumber(source, 'quantityUsed'),
    unit: readString(source, 'unit'),
    fieldObservations: readString(source, 'fieldObservations'),
    loggedAt: readString(source, 'loggedAt'),
  };
};

export const normalizeTicket = (value: unknown): MaintenanceTicket => {
  const source = asRecord(value);
  const tower = normalizeTower(source?.['tower']);
  return {
    id: readString(source, 'id'),
    ticketCode: readString(source, 'ticketCode'),
    anomalyId: readString(source, 'anomalyId'),
    towerId: optionalId(source, 'towerId') ?? tower?.id,
    managerId: readString(source, 'managerId'),
    technicianId: optionalId(source, 'technicianId'),
    status: readString(source, 'status'),
    priority: readString(source, 'priority'),
    description: readString(source, 'description'),
    dueDate: optionalText(source, 'dueDate'),
    assignedAt: optionalText(source, 'assignedAt'),
    startedAt: optionalText(source, 'startedAt'),
    resolvedAt: optionalText(source, 'resolvedAt'),
    createdAt: readString(source, 'createdAt'),
    tower,
    anomaly: normalizeAnomaly(source?.['anomaly']),
    manager: normalizePerson(source?.['manager']),
    technician: normalizePerson(source?.['technician']),
    proofs: readArray(source?.['maintenanceProofs'] ?? source?.['proofs']).map(normalizeProof),
    materials: readArray(source?.['materialLogs'] ?? source?.['materials']).map(normalizeMaterial),
  };
};
