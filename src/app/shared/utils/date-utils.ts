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

