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
    it('normalizes uppercase or separated doc statuses into PascalCase without translating to Vietnamese', () => {
      expect(statusLabel('DRAFT')).toBe('Draft');
      expect(statusLabel('EVALUATING')).toBe('Evaluating');
      expect(statusLabel('READY')).toBe('Ready');
      expect(statusLabel('NOT_READY')).toBe('NotReady');
      expect(statusLabel('EXPIRED')).toBe('Expired');
      expect(statusLabel('COMPLETED')).toBe('Completed');
      expect(statusLabel('CANCELLED')).toBe('Cancelled');
    });

    it('maps legacy assessment status aliases', () => {
      expect(statusLabel('CONSUMED')).toBe('Completed');
      expect(statusLabel('INCOMPLETE')).toBe('NotReady');
      expect(statusLabel('NOTREADY')).toBe('NotReady');
    });

    it('keeps readiness check statuses in uppercase or PascalCase', () => {
      expect(statusLabel('PASS')).toBe('PASS');
      expect(statusLabel('PASSED')).toBe('Passed');
      expect(statusLabel('FAIL')).toBe('FAIL');
      expect(statusLabel('FAILED')).toBe('Failed');
      expect(statusLabel('PENDING')).toBe('Pending');
    });

    it('returns custom or Vietnamese status text unchanged', () => {
      expect(statusLabel('CUSTOM_STATE')).toBe('CUSTOM_STATE');
    });

    it('handles empty input gracefully', () => {
      expect(statusLabel('')).toBe('');
    });
  });
});
