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
  { value: 'Missions', label: 'Nhiệm vụ bay' },
  { value: 'PreMissionAssessments', label: 'Đánh giá tiền khả thi' },
  { value: 'InspectionMedia', label: 'Ảnh / video kiểm tra' },
  { value: 'DetectedAnomalies', label: 'Khuyết tật phát hiện' },
  { value: 'EmergencyAlerts', label: 'Cảnh báo khẩn cấp' },
  { value: 'MaintenanceTickets', label: 'Phiếu bảo trì' },
  { value: 'Reports', label: 'Báo cáo' },
  { value: 'Regions', label: 'Khu vực' },
  { value: 'Towers', label: 'Cột điện' },
  { value: 'UAVs', label: 'Thiết bị bay UAV' },
  { value: 'DroneTechnicalInspections', label: 'Kiểm định kỹ thuật UAV' },
  { value: 'DroneFlightControllers', label: 'Bộ điều khiển bay' },
  { value: 'Users', label: 'Tài khoản người dùng' },
];

export const AUDIT_ACTION_OPTIONS: readonly ActionOption[] = [
  { value: '', label: 'Tất cả hành động' },
  { value: 'Added', label: 'Tạo mới / Thêm' },
  { value: 'Modified', label: 'Cập nhật / Thay đổi' },
  { value: 'Deleted', label: 'Xóa' },
];
