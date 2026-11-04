export type AuditActionType = 'Added' | 'Modified' | 'Deleted';

export interface AuditRecord {
  readonly id: string;
  readonly userId: string | null;
  readonly operatorEmail: string;
  readonly tableName: string;
  readonly recordId: string;
  readonly actionType: AuditActionType | string;
  readonly oldValues: string | null;
  readonly newValues: string | null;
  readonly ipAddress: string;
  readonly userAgent: string;
  readonly createdAt: string;
}

export interface AuditPagination {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface AuditLogPage {
  readonly items: readonly AuditRecord[];
  readonly pagination: AuditPagination;
}

export interface AuditFilters {
  readonly page: number;
  readonly pageSize: number;
  readonly tableName?: string;
  readonly actionType?: string;
  readonly search?: string;
}

export interface TableOption {
  readonly value: string;
  readonly label: string;
}

export interface ActionOption {
  readonly value: string;
  readonly label: string;
}

export const AUDIT_TABLE_OPTIONS: readonly TableOption[] = [
  { value: '', label: 'Tất cả đối tượng' },
  { value: 'Missions', label: 'Nhiệm vụ bay (Missions)' },
  { value: 'PreMissionAssessments', label: 'Đánh giá tiền khả thi (PreMissionAssessments)' },
  { value: 'InspectionMedia', label: 'Ảnh / video kiểm tra (InspectionMedia)' },
  { value: 'DetectedAnomalies', label: 'Bất thường phát hiện (DetectedAnomalies)' },
  { value: 'EmergencyAlerts', label: 'Cảnh báo khẩn cấp (EmergencyAlerts)' },
  { value: 'MaintenanceTickets', label: 'Phiếu bảo trì (MaintenanceTickets)' },
  { value: 'Reports', label: 'Báo cáo (Reports)' },
  { value: 'Regions', label: 'Khu vực (Regions)' },
  { value: 'Towers', label: 'Cột điện (Towers)' },
  { value: 'UAVs', label: 'Thiết bị bay UAV (UAVs)' },
  { value: 'DroneTechnicalInspections', label: 'Kiểm định kỹ thuật UAV (DroneTechnicalInspections)' },
  { value: 'DroneFlightControllers', label: 'Bộ điều khiển bay (DroneFlightControllers)' },
  { value: 'Users', label: 'Tài khoản người dùng (Users)' },
];

export const AUDIT_ACTION_OPTIONS: readonly ActionOption[] = [
  { value: '', label: 'Tất cả hành động' },
  { value: 'Added', label: 'Tạo mới / Thêm' },
  { value: 'Modified', label: 'Cập nhật / Thay đổi' },
  { value: 'Deleted', label: 'Xóa' },
];
