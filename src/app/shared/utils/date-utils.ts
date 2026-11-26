import {
  formatVietnamDate,
  formatVietnamDateTime,
  formatVietnameseDateInput,
  parseDateInputToIso,
} from './date-format.util';

export { formatVietnameseDateInput };

const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DAY_LENGTH = 10;
const EMPTY_FALLBACK = '—';

/**
 * Tầng tương thích cho các điểm gọi cũ — ủy quyền định dạng UTC+7 về `date-format.util.ts`.
 */
export function formatAsiaDate(
  value: string | number | Date | null | undefined,
  options?: { includeSeconds?: boolean; dateOnly?: boolean; timeOnly?: boolean },
): string {
  if (value === null || value === undefined || value === '') return EMPTY_FALLBACK;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return EMPTY_FALLBACK;

  if (options?.dateOnly) {
    return formatVietnamDate(date, EMPTY_FALLBACK);
  }
  if (!options?.timeOnly && !options?.includeSeconds) {
    return formatVietnamDateTime(date, EMPTY_FALLBACK);
  }

  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: options.timeOnly ? undefined : 'numeric',
    month: options.timeOnly ? undefined : '2-digit',
    day: options.timeOnly ? undefined : '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: options.includeSeconds ? '2-digit' : undefined,
    hour12: false,
  }).format(date);
}

/** Chuyển `dd/MM/yyyy` (hoặc `yyyy-MM-dd`) sang `yyyy-MM-dd`, ủy quyền kiểm tra lịch cho `parseDateInputToIso`. */
export function parseVietnameseDateToIso(display: string): string {
  const trimmed = display.trim();
  if (ISO_DAY_PATTERN.test(trimmed)) return trimmed;
  const iso = parseDateInputToIso(trimmed, 'start');
  return iso ? iso.slice(0, ISO_DAY_LENGTH) : '';
}
