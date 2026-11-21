export type ReportType =
  | 'DefectReport'
  | 'PeriodicInspection'
  | 'CorridorOverview'
  | 'ThermalInspection'
  | 'defect'
  | 'periodic'
  | 'thermal'
  | 'corridor';

export type ReportStatus =
  | 'Draft'
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected';

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
  readonly createdBy?: string | null;
  readonly updatedBy?: string | null;
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

export interface ReportTemplateSection {
  readonly title: string;
  readonly desc: string;
  readonly icon: string;
}

export interface ReportTemplateConfig {
  readonly reportType: ReportType;
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly defaultTitle: string;
  readonly sections: readonly ReportTemplateSection[];
  readonly requiredData: readonly string[];
  readonly defaultExportFormats: readonly ReportFileFormat[];
}

export const REPORT_TEMPLATES: readonly ReportTemplateConfig[] = [
  {
    reportType: 'DefectReport',
    code: 'TPL-DEFECT-01',
    name: 'Báo cáo tổng hợp khuyết tật lưới điện (Defect Report)',
    description: 'Tổng hợp bất thường do AI phát hiện, phân loại mức độ nghiêm trọng từ cấp 1-5, ảnh chụp thực tế và đề xuất khắc phục.',
    defaultTitle: 'Báo cáo tổng hợp khuyết tật và hư hỏng thiết bị lưới điện',
    sections: [
      { title: '1. Thông tin chung đợt kiểm tra', desc: 'Khu vực quản lý, danh sách nhiệm vụ bay, thời gian khảo sát', icon: 'info-circle' },
      { title: '2. Thống kê khiếm khuyết theo mức độ', desc: 'Biểu đồ sự cố phân loại Cấp 1 (Nhẹ) đến Cấp 5 (Nguy cấp)', icon: 'bar-chart' },
      { title: '3. Danh mục chi tiết khuyết tật & Ảnh hiện trường', desc: 'Ảnh chụp UAV, vị trí tọa độ, mã cột, độ tin cậy AI', icon: 'picture' },
      { title: '4. Kết luận và Kế hoạch bảo trì', desc: 'Danh sách phiếu bảo trì cần khởi tạo, vật tư dự kiến thay thế', icon: 'tool' },
    ],
    requiredData: ['Ít nhất 1 nhiệm vụ bay đã hoàn thành', 'Phạm vi khu vực', 'Khung thời gian kiểm tra'],
    defaultExportFormats: ['pdf', 'excel'],
  },
  {
    reportType: 'PeriodicInspection',
    code: 'TPL-PERIODIC-02',
    name: 'Báo cáo kiểm tra định kỳ đường dây (Periodic Inspection)',
    description: 'Thống kê khối lượng hoàn thành tuyến bay định kỳ, tình trạng vận hành cột và thiết bị phụ trợ đường dây.',
    defaultTitle: 'Báo cáo kết quả kiểm tra định kỳ tuyến đường dây trên không',
    sections: [
      { title: '1. Khái quát tuyến bay kiểm tra', desc: 'Đội bay, thiết bị UAV sử dụng, thời tiết, quãng đường bay', icon: 'compass' },
      { title: '2. Tỷ lệ hoàn thành theo danh mục cột', desc: 'Số lượng cột kiểm tra thành công, cột bị gián đoạn/bỏ qua', icon: 'check-square' },
      { title: '3. Đánh giá trạng thái an toàn tổng thể', desc: 'Bình thường, cảnh báo nhẹ hoặc cần theo dõi thêm', icon: 'safety' },
    ],
    requiredData: ['Hồ sơ tiền nhiệm vụ (MF01)', 'Nhiệm vụ bay định kỳ'],
    defaultExportFormats: ['pdf', 'excel'],
  },
  {
    reportType: 'CorridorOverview',
    code: 'TPL-CORRIDOR-03',
    name: 'Báo cáo giám sát hành lang tuyến điện',
    description: 'Đánh giá vi phạm khoảng cách an toàn cây xanh, công trình dân sinh và nguy cơ cháy nổ dưới hành lang điện.',
    defaultTitle: 'Báo cáo an toàn hành lang bảo vệ an toàn lưới điện cao thế',
    sections: [
      { title: '1. Hiện trạng thảm thực vật & Cây cao', desc: 'Khoảng cách ngọn cây tới dây dẫn gần nhất, vị trí có nguy cơ', icon: 'alert' },
      { title: '2. Công trình và phương tiện xâm lấn', desc: 'Vật kiến trúc trong hành lang, phương tiện cơ giới hoạt động gần cột', icon: 'environment' },
      { title: '3. Bản đồ GIS các điểm vi phạm', desc: 'Tọa độ GPS điểm vi phạm khoảng cách pha - đất', icon: 'global' },
    ],
    requiredData: ['Khu vực quản lý', 'Dữ liệu không gian GIS'],
    defaultExportFormats: ['pdf', 'excel'],
  },
  {
    reportType: 'ThermalInspection',
    code: 'TPL-THERMAL-04',
    name: 'Báo cáo đo nhiệt hồng ngoại mối nối',
    description: 'Ghi nhận phân bố nhiệt độ máy biến áp, chuỗi sứ, điểm tiếp xúc lèo và kẹp cực để phát hiện quá nhiệt sớm.',
    defaultTitle: 'Báo cáo kiểm tra phát nhiệt mối nối và thiết bị trạm/cột bằng camera nhiệt',
    sections: [
      { title: '1. Bảng đo nhiệt độ các điểm tiếp xúc', desc: 'Nhiệt độ môi trường, nhiệt độ điểm đo, chênh lệch pha so sánh', icon: 'fire' },
      { title: '2. Ảnh nhiệt hồng ngoại', desc: 'Ảnh chụp quang phổ nhiệt kèm dải màu nhiệt kế (°C)', icon: 'camera' },
      { title: '3. Phân cấp mức độ nguy cơ quá nhiệt', desc: 'Theo dõi thường kỳ, cần bảo trì trong 7 ngày, hoặc ngắt điện khẩn cấp', icon: 'warning' },
    ],
    requiredData: ['Chuyến bay sử dụng camera nhiệt', 'Dữ liệu đo nhiệt'],
    defaultExportFormats: ['pdf', 'excel'],
  },
];

export const REPORT_TYPE_LABELS: Record<string, string> = {
  DefectReport: 'Báo cáo tổng hợp khuyết tật',
  PeriodicInspection: 'Báo cáo kiểm tra định kỳ',
  CorridorOverview: 'Báo cáo giám sát hành lang',
  ThermalInspection: 'Báo cáo kiểm tra nhiệt hồng ngoại',
  defect: 'Báo cáo tổng hợp khuyết tật',
  periodic: 'Báo cáo kiểm tra định kỳ',
  corridor: 'Báo cáo giám sát hành lang',
  thermal: 'Báo cáo kiểm tra nhiệt hồng ngoại',
};

export const REPORT_STATUS_LABELS: Record<string, string> = {
  Draft: 'Bản nháp',
  Pending: 'Chờ duyệt',
  Approved: 'Đã duyệt',
  Rejected: 'Bị từ chối',
  draft: 'Bản nháp',
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Bị từ chối',
};
