import { describe, expect, it } from 'vitest';
import {
  asRecord,
  readArray,
  readBoolean,
  readFirstNumber,
  readFirstString,
  readNumber,
  readOptionalNumber,
  readOptionalString,
  readString,
} from './payload-parse.util';

describe('payload-parse.util', () => {
  it('asRecord accepts plain objects and rejects null, undefined, primitives, arrays, and Date', () => {
    expect(asRecord({ id: 'uav-01', count: 2 })).toEqual({ id: 'uav-01', count: 2 });
    expect(asRecord(null)).toBeNull();
    expect(asRecord(undefined)).toBeNull();
    expect(asRecord('text')).toBeNull();
    expect(asRecord(123)).toBeNull();
    expect(asRecord(true)).toBeNull();
    expect(asRecord([1, 2])).toBeNull();
    expect(asRecord(new Date('2026-11-26T00:00:00Z'))).toBeNull();
  });

  it('readString & readOptionalString trim valid strings and fallback safely for invalid values', () => {
    const payload: Record<string, unknown> = {
      code: '  MS-2026-01  ',
      blank: '   ',
      empty: '',
      missing: undefined,
      nil: null,
      numeric: 42,
      nested: { label: 'x' },
    };

    expect(readString(payload, 'code')).toBe('MS-2026-01');
    expect(readOptionalString(payload, 'code')).toBe('MS-2026-01');
    expect(readString(payload, 'blank', 'N/A')).toBe('N/A');
    expect(readOptionalString(payload, 'blank')).toBeNull();
    expect(readOptionalString(payload, 'empty')).toBeNull();
    expect(readString(payload, 'missing', 'fallback')).toBe('fallback');
    expect(readOptionalString(payload, 'nil')).toBeNull();
    expect(readString(payload, 'numeric', 'default')).toBe('default');
    expect(readOptionalString(payload, 'nested')).toBeNull();
    expect(readString(null, 'code', 'safe')).toBe('safe');
  });

  it('readNumber & readOptionalNumber accept finite numbers (0, negative) and reject NaN/Infinity/blank/boolean', () => {
    const payload: Record<string, unknown> = {
      zero: 0,
      negative: -12.5,
      positive: 98.4,
      numericString: ' 15.5 ',
      negativeString: '-42.5',
      mixedString: '123abc',
      infinityString: 'Infinity',
      nanValue: Number.NaN,
      posInf: Number.POSITIVE_INFINITY,
      negInf: Number.NEGATIVE_INFINITY,
      emptyString: '',
      blankString: '   ',
      badString: 'abc',
      nil: null,
      missing: undefined,
      flag: true,
    };

    expect(readNumber(payload, 'zero', 99)).toBe(0);
    expect(readOptionalNumber(payload, 'zero')).toBe(0);
    expect(readNumber(payload, 'negative')).toBe(-12.5);
    expect(readOptionalNumber(payload, 'positive')).toBe(98.4);
    expect(readOptionalNumber(payload, 'numericString')).toBe(15.5);
    expect(readOptionalNumber(payload, 'negativeString')).toBe(-42.5);

    for (const key of ['mixedString', 'infinityString', 'nanValue', 'posInf', 'negInf', 'emptyString', 'blankString', 'badString', 'nil', 'missing', 'flag']) {
      expect(readOptionalNumber(payload, key)).toBeNull();
    }
    expect(readNumber(payload, 'nanValue', -1)).toBe(-1);
    expect(readNumber(payload, 'flag', 7)).toBe(7);
  });

  it('readBoolean handles true/false strictly and readArray returns [] for non-arrays', () => {
    const payload: Record<string, unknown> = { active: true, archived: false, strBool: 'true', numBool: 1, nil: null };

    expect(readBoolean(payload, 'active')).toBe(true);
    expect(readBoolean(payload, 'archived', true)).toBe(false);
    expect(readBoolean(payload, 'strBool', false)).toBe(false);
    expect(readBoolean(payload, 'numBool', false)).toBe(false);
    expect(readBoolean(payload, 'nil', true)).toBe(true);
    expect(readBoolean(undefined, 'active', false)).toBe(false);

    expect(readArray(['a', 'b'])).toEqual(['a', 'b']);
    expect(readArray(null)).toEqual([]);
    expect(readArray(undefined)).toEqual([]);
    expect(readArray({ items: [1] })).toEqual([]);
    expect(readArray('not-array')).toEqual([]);
  });

  it('normalizes malformed unknown payloads without throwing uncaught exceptions', () => {
    const raw: unknown = { id: 12345, title: '  Kiểm tra cột 110kV  ', confidence: 'NaN', isEmergency: 'yes', tags: 'invalid' };
    const rec = asRecord(raw);

    expect(() => ({
      id: readString(rec, 'id', 'unknown-id'),
      title: readString(rec, 'title'),
      confidence: readNumber(rec, 'confidence', 0),
      isEmergency: readBoolean(rec, 'isEmergency', false),
      tags: readArray(rec?.['tags']),
    })).not.toThrow();

    expect(readString(rec, 'id', 'unknown-id')).toBe('unknown-id');
    expect(readString(rec, 'title')).toBe('Kiểm tra cột 110kV');
    expect(readNumber(rec, 'confidence', 0)).toBe(0);
    expect(readBoolean(rec, 'isEmergency', false)).toBe(false);
    expect(readArray(rec?.['tags'])).toEqual([]);
  });

  it('readFirstString & readFirstNumber pick the first valid alias key or fallback', () => {
    const payload: Record<string, unknown> = {
      primary: '   ',
      secondary: '  EVN-CPC  ',
      badCount: 'abc',
      totalCount: 0,
      altCount: 15,
    };

    expect(readFirstString(payload, ['missing', 'primary', 'secondary'], 'N/A')).toBe('EVN-CPC');
    expect(readFirstString(payload, ['missing', 'primary'], 'N/A')).toBe('N/A');
    expect(readFirstNumber(payload, ['missing', 'badCount', 'totalCount', 'altCount'], -1)).toBe(0);
    expect(readFirstNumber(payload, ['missing', 'badCount'], -1)).toBe(-1);
  });
});
