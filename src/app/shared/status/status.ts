export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const statusTone = (status: string): StatusTone => {
  const value = (status || '').toUpperCase();
  if (['READY', 'HEALTHY', 'AVAILABLE', 'ACCEPTED', 'COMPLETED', 'CONSUMED', 'FEASIBLE', 'PASSED', 'ELIGIBLE'].includes(value)) return 'success';
  if (['WARNING', 'POSTPONED', 'RESERVED'].includes(value)) return 'warning';
  if (['CRITICAL', 'NOT_READY', 'INCOMPLETE', 'FAILED', 'UNAVAILABLE', 'EMERGENCY', 'EXPIRED', 'NOT_ELIGIBLE'].includes(value)) return 'danger';
  if (['IN_PROGRESS', 'EVALUATING', 'PENDING', 'DRAFT'].includes(value)) return 'info';
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
};

export const statusLabel = (status: string): string => {
  if (!status) return '';
  const key = status.trim().toUpperCase().replace(/[-\s]/g, '_');
  if (STATUS_VI_LABELS[key]) {
    return STATUS_VI_LABELS[key];
  }
  return status.replaceAll('_', ' ').toLowerCase().replace(/(^| )\w/g, (letter) => letter.toUpperCase());
};
