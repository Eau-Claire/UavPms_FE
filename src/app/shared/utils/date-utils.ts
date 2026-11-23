/**
 * Centralized utility for formatting timestamps to Asia/Ho_Chi_Minh (UTC+7) timezone
 * per project business rules (BR-009).
 */
export function formatAsiaDate(
  value: string | number | Date | null | undefined,
  options?: { includeSeconds?: boolean; dateOnly?: boolean; timeOnly?: boolean },
): string {
  if (value === null || value === undefined || value === '') return '—';
  const date = typeof value === 'object' ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const timeZone = 'Asia/Ho_Chi_Minh';

  if (options?.dateOnly) {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  if (options?.timeOnly) {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: options.includeSeconds ? '2-digit' : undefined,
      hour12: false,
    }).format(date);
  }

  return new Intl.DateTimeFormat('vi-VN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: options?.includeSeconds ? '2-digit' : undefined,
    hour12: false,
  }).format(date);
}

/** Auto-formats numeric digits into `dd/MM/yyyy` while typing. */
export function formatVietnameseDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Parses `dd/MM/yyyy` (or `yyyy-MM-dd`) into `yyyy-MM-dd` ISO calendar day, or `''` if invalid/incomplete. */
export function parseVietnameseDateToIso(display: string): string {
  const trimmed = display.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) return '';
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  const probe = new Date(year, month - 1, day);
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) return '';
  return `${year}-${match[2]}-${match[1]}`;
}


