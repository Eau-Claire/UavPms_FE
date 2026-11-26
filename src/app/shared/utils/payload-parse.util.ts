/**
 * Chuyển `unknown` thành plain object; trả `null` cho `null`, `undefined`, primitive, `Array` và built-in object (như `Date`).
 */
export function asRecord(value: unknown): Record<string, unknown> | null {
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return null;
  }
  return value as Record<string, unknown>;
}

/** Đọc chuỗi tùy chọn đã trim; trả `null` nếu thiếu, toàn khoảng trắng hoặc sai kiểu. */
export function readOptionalString(record: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!record) return null;
  const raw = record[key];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Đọc chuỗi có giá trị dự phòng khi payload thiếu, rỗng hoặc sai kiểu. */
export function readString(record: Record<string, unknown> | null | undefined, key: string, fallback = ''): string {
  return readOptionalString(record, key) ?? fallback;
}

/**
 * Đọc số hữu hạn (gồm `0` và số âm); từ chối `NaN`, `Infinity`, chuỗi rỗng và boolean.
 */
export function readOptionalNumber(record: Record<string, unknown> | null | undefined, key: string): number | null {
  if (!record) return null;
  const raw = record[key];
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Đọc số hữu hạn có giá trị dự phòng khi payload thiếu hoặc không hợp lệ. */
export function readNumber(record: Record<string, unknown> | null | undefined, key: string, fallback = 0): number {
  return readOptionalNumber(record, key) ?? fallback;
}

/** Đọc cờ boolean tường minh; trả `fallback` nếu giá trị khác kiểu `boolean`. */
export function readBoolean(record: Record<string, unknown> | null | undefined, key: string, fallback = false): boolean {
  if (!record) return fallback;
  const raw = record[key];
  return typeof raw === 'boolean' ? raw : fallback;
}

/** Đảm bảo luôn trả mảng an toàn để vòng lặp normalize không văng lỗi khi API trả `null`/object. */
export function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
