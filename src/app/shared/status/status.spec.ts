import { describe, expect, it } from 'vitest';
import { statusColorClass, statusLabel, statusTone } from './status';

describe('Status Utility', () => {
  describe('statusTone', () => {
    it('maps official Pre-Mission Assessment statuses to correct tone categories', () => {
      expect(statusTone('DRAFT')).toBe('info');
      expect(statusTone('EVALUATING')).toBe('info');
      expect(statusTone('READY')).toBe('success');
      expect(statusTone('NOT_READY')).toBe('danger');
      expect(statusTone('EXPIRED')).toBe('danger');
      expect(statusTone('COMPLETED')).toBe('success');
      expect(statusTone('CANCELLED')).toBe('neutral');
    });

    it('maps legacy statuses correctly', () => {
      expect(statusTone('CONSUMED')).toBe('success');
      expect(statusTone('INCOMPLETE')).toBe('danger');
    });

    it('maps readiness checks correctly', () => {
      expect(statusTone('PASSED')).toBe('success');
      expect(statusTone('FAILED')).toBe('danger');
      expect(statusTone('WARNING')).toBe('warning');
      expect(statusTone('PENDING')).toBe('info');
    });
  });

  describe('statusLabel', () => {
    it('translates official Pre-Mission Assessment statuses to standardized Vietnamese', () => {
      expect(statusLabel('DRAFT')).toBe('Bản nháp');
      expect(statusLabel('EVALUATING')).toBe('Đang đánh giá');
      expect(statusLabel('READY')).toBe('Sẵn sàng');
      expect(statusLabel('NOT_READY')).toBe('Chưa sẵn sàng');
      expect(statusLabel('EXPIRED')).toBe('Hết hạn');
      expect(statusLabel('COMPLETED')).toBe('Đã tạo nhiệm vụ');
      expect(statusLabel('CANCELLED')).toBe('Đã hủy');
    });

    it('maps legacy assessment status aliases to standardized Vietnamese', () => {
      expect(statusLabel('CONSUMED')).toBe('Đã tạo nhiệm vụ');
      expect(statusLabel('INCOMPLETE')).toBe('Chưa sẵn sàng');
      expect(statusLabel('NOTREADY')).toBe('Chưa sẵn sàng');
    });

    it('translates readiness check statuses consistently', () => {
      expect(statusLabel('PASS')).toBe('Đạt');
      expect(statusLabel('PASSED')).toBe('Đạt');
      expect(statusLabel('FAIL')).toBe('Không đạt');
      expect(statusLabel('FAILED')).toBe('Không đạt');
      expect(statusLabel('PENDING')).toBe('Chờ xử lý');
    });

    it('returns unknown custom status text unchanged', () => {
      expect(statusLabel('CUSTOM_STATE')).toBe('CUSTOM_STATE');
    });

    it('handles empty input gracefully', () => {
      expect(statusLabel('')).toBe('');
    });
  });

  describe('statusColorClass', () => {
    it('returns borderless Tailwind text color classes for each status group', () => {
      expect(statusColorClass('READY')).toBe('text-emerald-600 font-medium');
      expect(statusColorClass('PASS')).toBe('text-emerald-600 font-medium');
      expect(statusColorClass('NOT_READY')).toBe('text-rose-600 font-medium');
      expect(statusColorClass('FAIL')).toBe('text-rose-600 font-medium');
      expect(statusColorClass('EVALUATING')).toBe('text-sky-600 font-medium');
      expect(statusColorClass('COMPLETED')).toBe('text-slate-600 font-medium');
      expect(statusColorClass('EXPIRED')).toBe('text-amber-700 font-medium');
      expect(statusColorClass('CANCELLED')).toBe('text-red-500 font-medium');
    });
  });
});
