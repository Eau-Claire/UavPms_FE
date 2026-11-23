export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const statusTone = (status: string): StatusTone => {
  const value = (status || '').toUpperCase().replace(/[\s_-]/g, '');
  if (
    [
      'READY',
      'HEALTHY',
      'AVAILABLE',
      'ACCEPTED',
      'COMPLETED',
      'CONSUMED',
      'FEASIBLE',
      'PASS',
      'PASSED',
      'ELIGIBLE',
      'ASSIGNED',
      'RESOLVED',
      'CLOSED',
      'CONFIRMED',
    ].includes(value)
  ) {
    return 'success';
  }
  if (
    [
      'WARNING',
      'POSTPONED',
      'RESERVED',
      'PENDINGACCEPTANCE',
      'INREVIEW',
      'UNDERREVIEW',
      'PENDINGVERIFICATION',
      'ACKNOWLEDGED',
    ].includes(value)
  ) {
    return 'warning';
  }
  if (
    [
      'CRITICAL',
      'NOTREADY',
      'INCOMPLETE',
      'FAIL',
      'FAILED',
      'UNAVAILABLE',
      'EMERGENCY',
      'EXPIRED',
      'NOTELIGIBLE',
      'SUSPENDED',
      'REJECTED',
    ].includes(value)
  ) {
    return 'danger';
  }
  if (
    [
      'INPROGRESS',
      'PREPARING',
      'EVALUATING',
      'PENDING',
      'DRAFT',
      'OPEN',
      'QUEUED',
      'PROCESSING',
    ].includes(value)
  ) {
    return 'info';
  }
  return 'neutral';
};

/**
 * Từ điển chuẩn hóa trạng thái tiếng Việt thống nhất toàn hệ thống (Single Source of Truth).
 */
const VIETNAMESE_STATUS_MAP: Readonly<Record<string, string>> = {
  // PreMissionAssessment State Machine
  EVALUATING: 'Đang đánh giá',
  READY: 'Sẵn sàng',
  NOTREADY: 'Chưa sẵn sàng',
  NOT_READY: 'Chưa sẵn sàng',
  INCOMPLETE: 'Chưa sẵn sàng',
  COMPLETED: 'Đã tạo nhiệm vụ',
  CONSUMED: 'Đã tạo nhiệm vụ',
  CANCELLED: 'Đã hủy',
  CANCELED: 'Đã hủy',
  EXPIRED: 'Hết hạn',

  // Mission State Machine
  DRAFT: 'Bản nháp',
  PENDINGACCEPTANCE: 'Chờ tiếp nhận',
  PENDING_ACCEPTANCE: 'Chờ tiếp nhận',
  PREPARING: 'Đang chuẩn bị',
  POSTPONED: 'Tạm hoãn',
  CONFIRMED: 'Đã xác nhận',
  INPROGRESS: 'Đang thực hiện',
  IN_PROGRESS: 'Đang thực hiện',
  SUSPENDED: 'Tạm dừng',

  // Drone Operational & Health Statuses
  INUSE: 'Đang bay',
  IN_USE: 'Đang bay',
  RESERVED: 'Đã giữ chỗ',
  MAINTENANCE: 'Bảo trì',
  LOST: 'Mất tín hiệu',
  WARNING: 'Cảnh báo',
  CRITICAL: 'Lỗi nghiêm trọng',
  UNKNOWN: 'Chưa kiểm định',

  // MaintenanceTicket State Machine
  OPEN: 'Đang mở',
  ASSIGNED: 'Đã phân công',
  PENDINGVERIFICATION: 'Chờ xác minh',
  PENDING_VERIFICATION: 'Chờ xác minh',
  CLOSED: 'Đã đóng',
  RESOLVED: 'Đã xử lý',

  // DetectedAnomaly State Machine
  PENDING: 'Chờ duyệt',
  INREVIEW: 'Đang thẩm định',
  IN_REVIEW: 'Đang thẩm định',
  UNDERREVIEW: 'Đang thẩm định',
  UNDER_REVIEW: 'Đang thẩm định',
  REJECTED: 'Đã từ chối',
  SUPERSEDED: 'Đã thay thế',

  // AIAnalysisRun State Machine
  QUEUED: 'Chờ xử lý',
  PROCESSING: 'Đang xử lý',
  FAILED: 'Không đạt',

  // EmergencyAlert State Machine
  ACKNOWLEDGED: 'Đã tiếp nhận',

  // Binary readiness & technical checks
  PASS: 'Đạt',
  PASSED: 'Đạt',
  FEASIBLE: 'Đạt',
  HEALTHY: 'Đạt',
  ELIGIBLE: 'Đạt',
  AVAILABLE: 'Sẵn sàng',
  FAIL: 'Không đạt',
  NOTELIGIBLE: 'Không đạt',
  NOT_ELIGIBLE: 'Không đạt',
  UNAVAILABLE: 'Không sẵn sàng',
};

export const statusLabel = (status: string): string => {
  if (!status) return '';
  const key = status.trim().toUpperCase().replace(/[\s-]/g, '_');
  const compactKey = key.replace(/_/g, '');
  if (VIETNAMESE_STATUS_MAP[key]) return VIETNAMESE_STATUS_MAP[key];
  if (VIETNAMESE_STATUS_MAP[compactKey]) return VIETNAMESE_STATUS_MAP[compactKey];
  return status;
};

/**
 * Class Tailwind chỉ đổi màu chữ trạng thái (không viền màu, đạt độ tương phản WCAG AA).
 */
export const statusColorClass = (status: string): string => {
  const compact = (status || '').trim().toUpperCase().replace(/[\s_-]/g, '');

  if (
    [
      'READY',
      'PASS',
      'PASSED',
      'FEASIBLE',
      'HEALTHY',
      'AVAILABLE',
      'ELIGIBLE',
      'CONFIRMED',
      'ACCEPTED',
      'RESOLVED',
      'CLOSED',
    ].includes(compact)
  ) {
    return 'text-emerald-600 font-medium';
  }

  if (
    [
      'NOTREADY',
      'INCOMPLETE',
      'FAIL',
      'FAILED',
      'NOTELIGIBLE',
      'UNAVAILABLE',
      'REJECTED',
      'CRITICAL',
      'EMERGENCY',
      'SUSPENDED',
      'LOST',
    ].includes(compact)
  ) {
    return 'text-rose-600 font-medium';
  }

  if (['CANCELLED', 'CANCELED'].includes(compact)) {
    return 'text-red-500 font-medium';
  }

  if (
    [
      'EXPIRED',
      'WARNING',
      'MAINTENANCE',
      'POSTPONED',
      'RESERVED',
      'PENDINGACCEPTANCE',
      'INREVIEW',
      'UNDERREVIEW',
      'PENDINGVERIFICATION',
      'ACKNOWLEDGED',
    ].includes(compact)
  ) {
    return 'text-amber-700 font-medium';
  }

  if (
    [
      'EVALUATING',
      'INPROGRESS',
      'INUSE',
      'PREPARING',
      'PENDING',
      'DRAFT',
      'OPEN',
      'QUEUED',
      'PROCESSING',
      'ASSIGNED',
    ].includes(compact)
  ) {
    return 'text-sky-600 font-medium';
  }

  if (['COMPLETED', 'CONSUMED', 'UNKNOWN'].includes(compact)) {
    return 'text-slate-600 font-medium';
  }

  return 'text-slate-600 font-medium';
};

/** Chuẩn hóa nhãn mức độ ưu tiên tiếng Việt thống nhất toàn hệ thống. */
export const priorityLabel = (priority?: string | null): string => {
  const key = (priority || 'NORMAL').trim().toUpperCase();
  if (key === 'EMERGENCY' || key === 'CRITICAL') return 'Khẩn cấp';
  if (key === 'HIGH') return 'Cao';
  if (key === 'MEDIUM') return 'Trung bình';
  if (key === 'LOW') return 'Thấp';
  return 'Bình thường';
};

/** Class Tailwind chỉ đổi màu chữ cho mức độ ưu tiên (không viền màu, chuẩn WCAG AA). */
export const priorityColorClass = (priority?: string | null): string => {
  const key = (priority || 'NORMAL').trim().toUpperCase();
  if (key === 'EMERGENCY' || key === 'CRITICAL') return 'text-rose-600 font-medium';
  if (key === 'HIGH') return 'text-amber-700 font-medium';
  if (key === 'MEDIUM') return 'text-sky-600 font-medium';
  if (key === 'LOW') return 'text-slate-500 font-medium';
  return 'text-slate-600 font-medium';
};
