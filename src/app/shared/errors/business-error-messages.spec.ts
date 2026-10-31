import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import {
  BUSINESS_ERROR_MESSAGES,
  businessErrorMessage,
  describeHttpError,
  isStaleDataError,
  readBackendError,
} from './business-error-messages';

const httpError = (status: number, error: unknown) => new HttpErrorResponse({ status, error });

describe('business error messages', () => {
  it('maps the errorCode of an ApiResponse and drops the English "CODE: message" text', () => {
    const err = httpError(400, {
      success: false,
      message: 'MULTIPLE_DRONES_NOT_SUPPORTED: A mission flies exactly one UAV; send one DroneId.',
      errorCode: 'MULTIPLE_DRONES_NOT_SUPPORTED',
    });
    const text = describeHttpError(err, 'fallback');
    expect(text).toBe(BUSINESS_ERROR_MESSAGES['MULTIPLE_DRONES_NOT_SUPPORTED']);
    expect(text).not.toContain('UAV; send one DroneId');
  });

  it('reads the real code from a 403 message when errorCode is the generic FORBIDDEN', () => {
    const scope = httpError(403, { message: 'REGION_MANAGEMENT_SCOPE_REQUIRED', errorCode: 'FORBIDDEN' });
    expect(readBackendError(scope).code).toBe('REGION_MANAGEMENT_SCOPE_REQUIRED');
    expect(describeHttpError(scope, 'x')).toContain('phạm vi quản lý khu vực');

    const notMember = httpError(403, { message: 'USER_NOT_ASSIGNED: You are not assigned to this mission.', errorCode: 'FORBIDDEN' });
    expect(describeHttpError(notMember, 'x')).toBe(BUSINESS_ERROR_MESSAGES['USER_NOT_ASSIGNED']);
  });

  it('has Vietnamese text for every MF01/MF02 code the backend now returns', () => {
    const codes = [
      'METRICS_REQUIRED',
      'DRONE_ID_MISMATCH',
      'NO_VALID_TECHNICAL_INSPECTION',
      'ASSESSMENT_CANCELLED',
      'ASSESSMENT_EXPIRED',
      'REGION_MANAGEMENT_SCOPE_REQUIRED',
      'IDEMPOTENCY_KEY_REUSED',
      'MULTIPLE_DRONES_NOT_SUPPORTED',
      'DUPLICATE_PERSONNEL',
      'DUPLICATE_DRONE',
      'REQUIRED_MEMBER_REQUIRED',
      'ASSIGNEE_ROLE_NOT_ELIGIBLE',
      'ASSIGNEE_OUT_OF_SCOPE',
      'ASSIGNEE_NOT_ELIGIBLE',
      'INVALID_CONFIRMATION_DEADLINE',
      'MANAGER_INSTRUCTIONS_TOO_LONG',
      'ASSIGNEE_ALREADY_ASSIGNED',
      'ASSIGNMENT_ID_REQUIRED',
      'USER_NOT_ASSIGNED',
      'REQUIRED_ACCEPTANCE_PENDING',
      'MISSION_START_TOO_EARLY',
      'DRONE_IN_USE',
      'HANDOVER_REJECTED',
      'DRONE_NOT_AVAILABLE',
      'DRONE_CRITICAL_HEALTH',
      'DRONE_ASSIGNMENT_REQUIRED',
      'INVALID_MISSION_STATE',
      'MISSION_IMMUTABLE_AFTER_START',
      'RESOURCE_BOOKING_CONFLICT',
      'DUPLICATE_ASSIGNMENT',
      'DUPLICATE_CHECK_IN',
      'DUPLICATE_HANDOVER',
      'CONCURRENCY_CONFLICT',
    ];
    for (const code of codes) {
      expect(businessErrorMessage(code), code).toBeTruthy();
    }
  });

  it('accepts a code embedded only in the message', () => {
    const err = httpError(400, { message: 'ASSESSMENT_EXPIRED', errorCode: 'BUSINESS_RULE_VIOLATION' });
    expect(describeHttpError(err, 'x')).toBe(BUSINESS_ERROR_MESSAGES['ASSESSMENT_EXPIRED']);
  });

  it('keeps Vietnamese backend text for unknown codes but never shows unknown English text', () => {
    const vi = httpError(400, { message: 'SOME_NEW_CODE: Không thể thực hiện vì lý do mới.', errorCode: 'SOME_NEW_CODE' });
    expect(describeHttpError(vi, 'fallback')).toBe('Không thể thực hiện vì lý do mới.');

    const en = httpError(400, { message: 'SOME_NEW_CODE: Something went wrong.', errorCode: 'SOME_NEW_CODE' });
    expect(describeHttpError(en, 'Không thể lưu.')).toBe('Không thể lưu.');
  });

  it('falls back by status when there is no code', () => {
    expect(describeHttpError(httpError(0, null), 'x')).toContain('Không kết nối được máy chủ');
    expect(describeHttpError(httpError(404, { message: 'Entity "MissionAssignment" (1) was not found.' }), 'x')).toContain(
      'Không tìm thấy',
    );
    expect(describeHttpError(httpError(500, { message: 'An unexpected error occurred.' }), 'Lỗi máy chủ.')).toBe('Lỗi máy chủ.');
    expect(describeHttpError(new Error('boom'), 'Không rõ.')).toBe('Không rõ.');
  });

  it('flags only concurrency 409s as stale data', () => {
    expect(isStaleDataError(httpError(409, { errorCode: 'ASSESSMENT_CONCURRENCY_CONFLICT', message: 'x' }))).toBe(true);
    expect(isStaleDataError(httpError(409, { errorCode: 'RESOURCE_BOOKING_CONFLICT', message: 'x' }))).toBe(false);
    expect(isStaleDataError(httpError(400, { errorCode: 'CONCURRENCY_CONFLICT', message: 'x' }))).toBe(false);
  });
});
