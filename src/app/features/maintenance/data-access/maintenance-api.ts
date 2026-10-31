import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
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
        const data = asRecord(unwrapApiData(response));
        const items = arrayOf(Array.isArray(data) ? data : data['items']).map(normalizeTicket);
        return {
          items,
          totalCount: numberOf(data['totalCount']) || items.length,
          pageIndex: numberOf(data['pageIndex'] ?? filters.pageIndex),
          pageSize: numberOf(data['pageSize']) || filters.pageSize,
        };
      }),
    );
  }

  /** Tickets assigned to the signed-in technician. */
  mine(): Observable<readonly MaintenanceTicket[]> {
    return this.http.get<unknown>(`${this.url}/my`).pipe(map((response) => itemsOf(unwrapApiData(response)).map(normalizeTicket)));
  }

  get(id: string): Observable<MaintenanceTicket> {
    return this.http.get<unknown>(`${this.url}/${id}`).pipe(map((response) => normalizeTicket(unwrapApiData(response))));
  }

  technicians(): Observable<readonly TechnicianSummary[]> {
    return this.http.get<unknown>(`${this.url}/technicians`).pipe(
      map((response) =>
        itemsOf(unwrapApiData(response)).map((item) => {
          const source = asRecord(item);
          return {
            id: stringOf(source['id']),
            fullName: stringOf(source['fullName']),
            email: stringOf(source['email']),
            activeTicketCount: numberOf(source['activeTicketCount']),
          };
        }),
      ),
    );
  }

  assign(id: string, request: AssignTechnicianRequest): Observable<MaintenanceTicket> {
    const body = { technicianId: request.technicianId, dueDate: request.dueDate ? toDueDateIso(request.dueDate) : undefined };
    return this.http.put<unknown>(`${this.url}/${id}/assign`, body).pipe(map((response) => normalizeTicket(unwrapApiData(response))));
  }

  updateStatus(id: string, status: 'InProgress' | 'PendingVerification'): Observable<MaintenanceTicket> {
    return this.http.put<unknown>(`${this.url}/${id}/status`, { status }).pipe(map((response) => normalizeTicket(unwrapApiData(response))));
  }

  uploadProof(id: string, file: File, technicianNotes: string): Observable<MaintenanceProof> {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('technicianNotes', technicianNotes.trim());
    return this.http.post<unknown>(`${this.url}/${id}/proof`, form).pipe(map((response) => normalizeProof(unwrapApiData(response))));
  }

  logMaterial(id: string, request: LogMaterialRequest): Observable<MaterialLog> {
    const body = {
      componentName: request.componentName.trim(),
      componentCode: request.componentCode?.trim() || undefined,
      quantityUsed: Math.trunc(Number(request.quantityUsed)),
      unit: request.unit.trim(),
      fieldObservations: request.fieldObservations?.trim() || undefined,
    };
    return this.http.post<unknown>(`${this.url}/${id}/materials`, body).pipe(map((response) => normalizeMaterial(unwrapApiData(response))));
  }

  close(id: string): Observable<MaintenanceTicket> {
    return this.http.put<unknown>(`${this.url}/${id}/close`, {}).pipe(map((response) => normalizeTicket(unwrapApiData(response))));
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
  const status = numberOf(source['status']);
  const body = asRecord(source['error']);
  const code = stringOf(body['errorCode']);
  const message = stringOf(body['message'] ?? body['title'] ?? body['detail']);
  const haystack = `${code} ${message}`.toLowerCase();
  const known = ERROR_MESSAGES.find(([needle]) => haystack.includes(needle.toLowerCase()));
  if (known) return known[1];
  if (status === 0 && 'status' in source) return 'Không thể kết nối đến máy chủ.';
  if (status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  if (status === 404) return 'Không tìm thấy phiếu bảo trì.';
  if (status === 413) return 'Ảnh quá lớn (tối đa 50MB).';
  return fallback;
};

export const maintenanceErrorStatus = (error: unknown): number => numberOf(asRecord(error)['status']);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const arrayOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

const itemsOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : arrayOf(asRecord(value)['items']));

const stringOf = (value: unknown): string => (value === undefined || value === null ? '' : String(value));

const optionalString = (value: unknown): string | undefined => stringOf(value) || undefined;

const numberOf = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';
const optionalId = (value: unknown): string | undefined => {
  const id = stringOf(value);
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
  const id = optionalId(source['id']);
  if (!id) return undefined;
  return { id, email: stringOf(source['email']), fullName: stringOf(source['fullName'] ?? source['username']) };
};

const normalizeTower = (value: unknown): MaintenanceTowerRef | undefined => {
  const source = asRecord(value);
  const id = optionalId(source['id']);
  if (!id) return undefined;
  return { id, towerCode: stringOf(source['towerCode']), poleType: optionalString(source['poleType']), regionId: optionalId(source['regionId']) };
};

const normalizeAnomaly = (value: unknown): MaintenanceAnomalyRef | undefined => {
  const source = asRecord(value);
  const id = optionalId(source['id']);
  if (!id) return undefined;
  const confidence = numberOf(source['confidenceScore']);
  return {
    id,
    validationStatus: stringOf(source['validationStatus']),
    confidenceScore: confidence <= 1 ? confidence * 100 : confidence,
    mediaId: optionalId(source['mediaId']),
    missionId: optionalId(source['missionId']),
    categoryCode: optionalString(source['categoryCode']),
    categoryName: optionalString(source['categoryName']),
    isEmergencyClass: source['isEmergencyClass'] === true,
    imageUrl: optionalString(source['imageUrl']),
    cropUrl: optionalString(source['cropUrl']),
    boundingBox: parseBoundingBox(source['boundingBox']),
    analystNotes: optionalString(source['analystNotes']),
    validatedAt: optionalString(source['validatedAt']),
  };
};

export const normalizeProof = (value: unknown): MaintenanceProof => {
  const source = asRecord(value);
  return {
    id: stringOf(source['id']),
    proofType: stringOf(source['proofType']) || 'After',
    fileUrl: stringOf(source['fileUrl'] || source['afterRepairImageUrl']),
    technicianNotes: stringOf(source['technicianNotes']),
    uploadedAt: stringOf(source['uploadedAt']),
  };
};

export const normalizeMaterial = (value: unknown): MaterialLog => {
  const source = asRecord(value);
  return {
    id: stringOf(source['id']),
    componentName: stringOf(source['componentName']),
    componentCode: stringOf(source['componentCode']),
    quantityUsed: numberOf(source['quantityUsed']),
    unit: stringOf(source['unit']),
    fieldObservations: stringOf(source['fieldObservations']),
    loggedAt: stringOf(source['loggedAt']),
  };
};

export const normalizeTicket = (value: unknown): MaintenanceTicket => {
  const source = asRecord(value);
  const tower = normalizeTower(source['tower']);
  return {
    id: stringOf(source['id']),
    ticketCode: stringOf(source['ticketCode']),
    anomalyId: stringOf(source['anomalyId']),
    towerId: optionalId(source['towerId']) ?? tower?.id,
    managerId: stringOf(source['managerId']),
    technicianId: optionalId(source['technicianId']),
    status: stringOf(source['status']),
    priority: stringOf(source['priority']),
    description: stringOf(source['description']),
    dueDate: optionalString(source['dueDate']),
    assignedAt: optionalString(source['assignedAt']),
    startedAt: optionalString(source['startedAt']),
    resolvedAt: optionalString(source['resolvedAt']),
    createdAt: stringOf(source['createdAt']),
    tower,
    anomaly: normalizeAnomaly(source['anomaly']),
    manager: normalizePerson(source['manager']),
    technician: normalizePerson(source['technician']),
    proofs: arrayOf(source['maintenanceProofs'] ?? source['proofs']).map(normalizeProof),
    materials: arrayOf(source['materialLogs'] ?? source['materials']).map(normalizeMaterial),
  };
};
