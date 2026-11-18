export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const statusTone = (status: string): StatusTone => {
  const value = (status || '').toUpperCase();
  if (['READY', 'HEALTHY', 'AVAILABLE', 'ACCEPTED', 'COMPLETED', 'CONSUMED', 'FEASIBLE', 'PASSED', 'ELIGIBLE', 'ASSIGNED'].includes(value)) return 'success';
  if (['WARNING', 'POSTPONED', 'RESERVED', 'PENDINGACCEPTANCE', 'PENDING_ACCEPTANCE'].includes(value)) return 'warning';
  if (['CRITICAL', 'NOT_READY', 'INCOMPLETE', 'FAILED', 'UNAVAILABLE', 'EMERGENCY', 'EXPIRED', 'NOT_ELIGIBLE', 'SUSPENDED'].includes(value)) return 'danger';
  if (['IN_PROGRESS', 'INPROGRESS', 'PREPARING', 'EVALUATING', 'PENDING', 'DRAFT'].includes(value)) return 'info';
  return 'neutral';
};

const STATUS_VI_LABELS: Record<string, string> = {
  DRAFT: 'Bản nháp',
  EVALUATING: 'Đang đánh giá',
  READY: 'Sẵn sàng',
  NOT_READY: 'Chưa sẵn sàng',
  EXPIRED: 'Hết hạn',
  COMPLETED: 'Đã hoàn thành',
  CANCELLED: 'Đã hủy',
  CANCELED: 'Đã hủy',
  CONSUMED: 'Đã hoàn thành',
  INCOMPLETE: 'Chưa sẵn sàng',
  NOTREADY: 'Chưa sẵn sàng',
  // Readiness check statuses
  PASS: 'Đạt',
  PASSED: 'Đạt',
  FAIL: 'Không đạt',
  FAILED: 'Không đạt',
  PENDING: 'Đang chờ',
  WARNING: 'Cảnh báo',
  HEALTHY: 'Tốt',
  AVAILABLE: 'Sẵn sàng',
  UNAVAILABLE: 'Không khả dụng',
  ELIGIBLE: 'Đủ điều kiện',
  NOT_ELIGIBLE: 'Không đủ điều kiện',
  // Mission statuses (the backend sends PascalCase, e.g. PendingAcceptance)
  PENDINGACCEPTANCE: 'Chờ xác nhận',
  PENDING_ACCEPTANCE: 'Chờ xác nhận',
  ASSIGNED: 'Đã phân công',
  PREPARING: 'Đang chuẩn bị',
  INPROGRESS: 'Đang thực hiện',
  IN_PROGRESS: 'Đang thực hiện',
  SUSPENDED: 'Tạm dừng',
  POSTPONED: 'Tạm hoãn',
  // Account & asset statuses
  ACTIVE: 'Hoạt động',
  INACTIVE: 'Tạm ngưng',
  LOCKED: 'Đã khóa',
  INUSE: 'Đang hoạt động',
  IN_USE: 'Đang hoạt động',
  MAINTENANCE: 'Bảo dưỡng',
  RESERVED: 'Đã giữ chỗ',
  LOST: 'Mất thiết bị',
  IDLE: 'Chờ bay',
  FLYING: 'Đang bay',
  OFFLINE: 'Ngoại tuyến',
  ONLINE: 'Trực tuyến',
  // Approval, alert & ticket statuses
  APPROVED: 'Đã duyệt',
  REJECTED: 'Đã bác bỏ',
  OPEN: 'Chờ xử lý',
  RESOLVED: 'Đã giải quyết',
  CLOSED: 'Đã đóng',
  CONFIRMED: 'Đã xác nhận',
  DISMISSED: 'Đã bác bỏ',
  ESCALATED: 'Đã chuyển cấp',
  // Priority & capability
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
  EMERGENCY: 'Khẩn cấp',
  NORMAL: 'Bình thường',
  CRITICAL: 'Nghiêm trọng',
  SUITABLE: 'Phù hợp',
  UNSUITABLE: 'Không phù hợp',
  SUITABLE_WITH_SPLIT: 'Phù hợp khi chia chuyến',
};

export const statusLabel = (status: string): string => {
  if (!status) return '';
  const key = status.trim().toUpperCase().replace(/[-\s]/g, '_');
  if (STATUS_VI_LABELS[key]) {
    return STATUS_VI_LABELS[key];
  }
  return status.replaceAll('_', ' ').toLowerCase().replace(/(^| )\w/g, (letter) => letter.toUpperCase());
};
