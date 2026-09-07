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
  { value: 'Missions', label: 'Chuyến bay UAV (Missions)' },
  { value: 'Inspections', label: 'Kiểm tra / Giám sát (Inspections)' },
  { value: 'Regions', label: 'Khu vực (Regions)' },
  { value: 'Substations', label: 'Trạm biến áp (Substations)' },
  { value: 'TransmissionLines', label: 'Đường dây truyền tải (TransmissionLines)' },
  { value: 'Towers', label: 'Cột / Tháp điện (Towers)' },
  { value: 'Assets', label: 'Tài sản / Thiết bị (Assets)' },
  { value: 'Devices', label: 'Thiết bị bay / IoT (Devices)' },
  { value: 'Users', label: 'Tài khoản người dùng (Users)' },
];

export const AUDIT_ACTION_OPTIONS: readonly ActionOption[] = [
  { value: '', label: 'Tất cả hành động' },
  { value: 'Added', label: 'Tạo mới / Thêm' },
  { value: 'Modified', label: 'Cập nhật / Thay đổi' },
  { value: 'Deleted', label: 'Xóa' },
];
