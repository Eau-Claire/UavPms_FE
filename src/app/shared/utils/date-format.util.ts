export type DateBoundary = 'start' | 'end';

interface CalendarDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const VIETNAMESE_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const MAX_DATE_DIGITS = 8;
const DAY_DIGITS_END = 2;
const MONTH_DIGITS_END = 4;
const MIN_MONTH = 1;
const MAX_MONTH = 12;
const MIN_DAY = 1;
const END_OF_DAY_HOUR = 23;
const END_OF_DAY_MINUTE = 59;
const END_OF_DAY_SECOND = 59;
const END_OF_DAY_MS = 999;

// Việt Nam dùng cố định UTC+7 (Asia/Ho_Chi_Minh), không có giờ mùa hè (DST).
const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

function padTwoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Tách và kiểm tra ngày lịch thật `dd/MM/yyyy`.
 * Đối chiếu ngược năm/tháng/ngày UTC để chặn JS tự cuộn ngày (vd: 31/02 -> 03/03).
 */
function parseVietnameseDateParts(input: string): CalendarDateParts | null {
  const match = VIETNAMESE_DATE_PATTERN.exec(input.trim());
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < MIN_MONTH || month > MAX_MONTH || day < MIN_DAY) return null;

  const probe = new Date(Date.UTC(year, month - 1, day));
  const isRealCalendarDate =
    probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;

  return isRealCalendarDate ? { year, month, day } : null;
}

function parseTimestampMs(value: string | Date | null | undefined): number | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : null;
}

/** Tự động chèn dấu `/` khi người dùng nhập chuỗi số thành dạng `dd/MM/yyyy`. */
export function formatVietnameseDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, MAX_DATE_DIGITS);
  if (digits.length <= DAY_DIGITS_END) return digits;
  if (digits.length <= MONTH_DIGITS_END) return `${digits.slice(0, DAY_DIGITS_END)}/${digits.slice(DAY_DIGITS_END)}`;
  return `${digits.slice(0, DAY_DIGITS_END)}/${digits.slice(DAY_DIGITS_END, MONTH_DIGITS_END)}/${digits.slice(MONTH_DIGITS_END)}`;
}

/**
 * Chuyển chuỗi ngày `dd/MM/yyyy` thành ISO-8601 UTC kết thúc bằng `Z`.
 * Dùng `'start'` cho `dateFrom` (00:00:00.000Z) và `'end'` cho `dateTo` (23:59:59.999Z).
 */
export function parseDateInputToIso(input: string | null | undefined, boundary: DateBoundary = 'start'): string | null {
  if (typeof input !== 'string') return null;
  const parts = parseVietnameseDateParts(input);
  if (!parts) return null;

  const timestamp =
    boundary === 'end'
      ? Date.UTC(parts.year, parts.month - 1, parts.day, END_OF_DAY_HOUR, END_OF_DAY_MINUTE, END_OF_DAY_SECOND, END_OF_DAY_MS)
      : Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);

  return new Date(timestamp).toISOString();
}

/**
 * Định dạng mốc UTC sang `dd/MM/yyyy` theo `UTC+7`, độc lập múi giờ OS và không trả `"Invalid Date"`.
 */
export function formatVietnamDate(value: string | Date | null | undefined, fallback = ''): string {
  const timestampMs = parseTimestampMs(value);
  if (timestampMs === null) return fallback;

  const shifted = new Date(timestampMs + VIETNAM_UTC_OFFSET_MS);
  const day = padTwoDigits(shifted.getUTCDate());
  const month = padTwoDigits(shifted.getUTCMonth() + 1);
  return `${day}/${month}/${shifted.getUTCFullYear()}`;
}

/**
 * Định dạng mốc UTC sang `dd/MM/yyyy HH:mm` theo `UTC+7` (`Asia/Ho_Chi_Minh`).
 */
export function formatVietnamDateTime(value: string | Date | null | undefined, fallback = ''): string {
  const timestampMs = parseTimestampMs(value);
  if (timestampMs === null) return fallback;

  const shifted = new Date(timestampMs + VIETNAM_UTC_OFFSET_MS);
  const day = padTwoDigits(shifted.getUTCDate());
  const month = padTwoDigits(shifted.getUTCMonth() + 1);
  const hours = padTwoDigits(shifted.getUTCHours());
  const minutes = padTwoDigits(shifted.getUTCMinutes());
  return `${day}/${month}/${shifted.getUTCFullYear()} ${hours}:${minutes}`;
}
