import { describe, expect, it } from 'vitest';
import {
  formatVietnamDate,
  formatVietnameseDateInput,
  formatVietnamDateTime,
  formatVietnamDateTimeWithSeconds,
  parseDateInputToIso,
} from './date-format.util';
import { formatAsiaDate } from './date-utils';

describe('date-format.util', () => {
  describe('parseDateInputToIso', () => {
    it('rejects non-existent calendar dates without rolling over to the next month', () => {
      expect(parseDateInputToIso('31/02/2026')).toBeNull();
      expect(parseDateInputToIso('30/02/2026')).toBeNull();
      expect(parseDateInputToIso('31/04/2026')).toBeNull();
      expect(parseDateInputToIso('29/02/2025')).toBeNull();
      expect(parseDateInputToIso('00/11/2026')).toBeNull();
      expect(parseDateInputToIso('15/13/2026')).toBeNull();
      expect(parseDateInputToIso('abc')).toBeNull();
      expect(parseDateInputToIso('')).toBeNull();
      expect(parseDateInputToIso(null)).toBeNull();
      expect(parseDateInputToIso(undefined)).toBeNull();
    });

    it('accepts valid leap-year dates and returns ISO-8601 UTC strings ending with Z', () => {
      expect(parseDateInputToIso('29/02/2024')).toBe('2024-02-29T00:00:00.000Z');
      expect(parseDateInputToIso('29/02/2028')).toBe('2028-02-29T00:00:00.000Z');
      expect(parseDateInputToIso('29/02/2024')?.endsWith('Z')).toBe(true);
    });

    it('produces ordered start and end UTC ISO boundaries for date ranges', () => {
      const dateFrom = parseDateInputToIso('26/11/2026', 'start');
      const dateTo = parseDateInputToIso('26/11/2026', 'end');

      expect(dateFrom).toBe('2026-11-26T00:00:00.000Z');
      expect(dateTo).toBe('2026-11-26T23:59:59.999Z');
      expect(dateFrom && dateTo ? dateFrom <= dateTo : false).toBe(true);
    });
  });

  describe('formatVietnamDate & formatVietnamDateTime (UTC -> UTC+7)', () => {
    it('formats UTC timestamps to Vietnam UTC+7 across midnight and start of day', () => {
      expect(formatVietnamDateTime('2026-11-26T17:30:00Z')).toBe('27/11/2026 00:30');
      expect(formatVietnamDateTimeWithSeconds('2026-11-26T17:30:09Z')).toBe('27/11/2026 00:30:09');
      expect(formatAsiaDate('2026-11-26T17:30:09Z', { includeSeconds: true })).toBe('27/11/2026 00:30:09');
      expect(formatVietnamDate('2026-11-26T17:30:00Z')).toBe('27/11/2026');

      expect(formatVietnamDateTime('2026-11-26T00:05:00Z')).toBe('26/11/2026 07:05');
      expect(formatVietnamDate('2026-11-26T00:05:00Z')).toBe('26/11/2026');
    });

    it('formats Date instances and returns safe fallback for invalid Date', () => {
      expect(formatVietnamDateTime(new Date('2026-11-26T17:30:00Z'))).toBe('27/11/2026 00:30');
      expect(formatVietnamDate(new Date('2026-11-26T17:30:00Z'))).toBe('27/11/2026');
      expect(formatVietnamDateTime(new Date('invalid'), '—')).toBe('—');
      expect(formatVietnamDateTimeWithSeconds(new Date('invalid'), '—')).toBe('—');
      expect(formatVietnamDate(new Date('invalid'))).toBe('');
      expect(formatVietnameseDateInput('26112026')).toBe('26/11/2026');
    });

    it('returns safe fallback and never Invalid Date for empty or malformed inputs', () => {
      const invalidInputs: (string | null | undefined)[] = [null, undefined, '', '   ', 'not-a-date'];

      for (const input of invalidInputs) {
        expect(formatVietnamDate(input)).toBe('');
        expect(formatVietnamDate(input, '—')).toBe('—');
        expect(formatVietnamDateTime(input)).toBe('');
        expect(formatVietnamDateTime(input, '—')).toBe('—');
        expect(formatVietnamDateTimeWithSeconds(input, '—')).toBe('—');
        expect(formatVietnamDateTime(input)).not.toContain('Invalid Date');
      }
    });
  });
});
