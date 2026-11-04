import { describe, expect, it } from 'vitest';
import { IdempotencyKeyTracker } from './idempotency-key';

describe('IdempotencyKeyTracker', () => {
  const sequence = () => {
    let n = 0;
    return () => `key-${++n}`;
  };

  it('keeps the key while the payload is unchanged (retry) and renews it when the payload changes', () => {
    const tracker = new IdempotencyKeyTracker(sequence());
    expect(tracker.keyFor({ a: 1, b: [1, 2] })).toBe('key-1');
    expect(tracker.keyFor({ b: [1, 2], a: 1 })).toBe('key-1');
    expect(tracker.keyFor({ a: 2, b: [1, 2] })).toBe('key-2');
    expect(tracker.keyFor({ a: 2, b: [2, 1] })).toBe('key-3');
  });

  it('issues a new key after reset', () => {
    const tracker = new IdempotencyKeyTracker(sequence());
    expect(tracker.keyFor({ a: 1 })).toBe('key-1');
    tracker.reset();
    expect(tracker.keyFor({ a: 1 })).toBe('key-2');
  });
});
