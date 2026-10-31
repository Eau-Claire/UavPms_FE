export type ReportType = 'defect' | 'periodic' | 'thermal' | 'corridor';
export type ReportStatus = 'draft' | 'pending' | 'approved';
export type ReportFileFormat = 'pdf' | 'excel';

export interface ReportRegion {
  readonly id: string;
  readonly name: string;
}

export interface ReportCreator {
  readonly id: string;
  readonly fullName: string;
}

/** Item of `GET /reports` (api_spec 11.1). Reports store no files: PDF/Excel are generated on download. */
export interface ReportItem {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly type: ReportType;
  readonly typeName: string;
  readonly status: ReportStatus;
  readonly statusName: string;
  readonly createdAt: string;
  readonly region: ReportRegion | null;
  readonly creator: ReportCreator | null;
  /** Read from the approval snapshot when `hasSnapshot`, otherwise computed live. */
  readonly defectCount: number;
  /** True for approved reports frozen from a snapshot at approval time. */
  readonly hasSnapshot: boolean;
}

export interface ReportMissionSummary {
  readonly id: string;
  readonly missionCode: string;
  readonly title: string;
  readonly status: string;
  readonly plannedStart: string | null;
}

/** `GET /reports/{id}` (api_spec 11.3). */
export interface ReportDetail extends ReportItem {
  readonly description: string | null;
  readonly updatedAt: string | null;
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
  readonly rejectionReason: string | null;
  readonly approvedBy: ReportCreator | null;
  readonly approvedAt: string | null;
  readonly missions: readonly ReportMissionSummary[];
}

export interface ReportStatistics {
  readonly total: number;
  readonly byType: {
    readonly defect: number;
    readonly periodic: number;
    readonly thermal: number;
    readonly corridor: number;
  };
  readonly byStatus: {
    readonly approved: number;
    readonly pending: number;
    readonly draft: number;
  };
}

export interface ReportFilterParams {
  readonly search?: string;
  readonly type?: string;
  readonly status?: string;
  readonly regionId?: string;
  readonly sortBy?: 'createdAt' | 'code' | 'title' | 'type' | 'status';
  readonly sortOrder?: 'desc' | 'asc';
  readonly page?: number;
  readonly pageSize?: number;
}

export interface ReportPagination {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface ReportListResult {
  readonly items: readonly ReportItem[];
  readonly pagination: ReportPagination;
}

/** `POST /reports` body (api_spec 11.4). */
export interface ReportCreateRequest {
  readonly title: string;
  readonly type: ReportType;
  readonly regionId?: string | null;
  readonly missionIds?: readonly string[];
  readonly description?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

export interface RegionOption {
  readonly id: string;
  readonly name: string;
}

/** A generated report file streamed by `GET /reports/{id}/download?format=`. */
export interface ReportFile {
  readonly blob: Blob;
  /** From `Content-Disposition`, when the server sends it. */
  readonly fileName: string | null;
}

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  defect: 'Khuyết tật AI',
  periodic: 'Kiểm tra định kỳ UAV',
  thermal: 'Nhiệt hồng ngoại',
  corridor: 'Hành lang tuyến',
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  approved: 'Đã duyệt',
  pending: 'Chờ duyệt',
  draft: 'Bản nháp',
};
