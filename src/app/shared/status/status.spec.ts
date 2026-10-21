import { describe, expect, it } from 'vitest';
import { statusLabel, statusTone } from './status';

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
    it('returns official Vietnamese labels for Pre-Mission Assessment statuses', () => {
      expect(statusLabel('DRAFT')).toBe('Bản nháp');
      expect(statusLabel('EVALUATING')).toBe('Đang đánh giá');
      expect(statusLabel('READY')).toBe('Sẵn sàng');
      expect(statusLabel('NOT_READY')).toBe('Chưa sẵn sàng');
      expect(statusLabel('EXPIRED')).toBe('Hết hạn');
      expect(statusLabel('COMPLETED')).toBe('Đã hoàn thành');
      expect(statusLabel('CANCELLED')).toBe('Đã hủy');
    });

    it('maps legacy statuses to unified Vietnamese labels', () => {
      expect(statusLabel('CONSUMED')).toBe('Đã hoàn thành');
      expect(statusLabel('INCOMPLETE')).toBe('Chưa sẵn sàng');
      expect(statusLabel('NOTREADY')).toBe('Chưa sẵn sàng');
    });

    it('maps readiness checks to Vietnamese labels', () => {
      expect(statusLabel('PASS')).toBe('Đạt');
      expect(statusLabel('PASSED')).toBe('Đạt');
      expect(statusLabel('FAIL')).toBe('Không đạt');
      expect(statusLabel('FAILED')).toBe('Không đạt');
      expect(statusLabel('WARNING')).toBe('Cảnh báo');
      expect(statusLabel('PENDING')).toBe('Đang chờ');
    });

    it('falls back to title case for unmapped statuses', () => {
      expect(statusLabel('CUSTOM_STATE')).toBe('Custom State');
    });

    it('handles empty input gracefully', () => {
      expect(statusLabel('')).toBe('');
    });
  });
});
