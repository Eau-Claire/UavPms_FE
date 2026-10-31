import { UavCandidate, UavTechnicalEligibility } from '../../../models/pre-mission.models';

/**
 * Vietnamese labels for MF01 candidate results. `suitability` only describes the flight scope; availability and
 * technical readiness come from `isAvailable`, `technicalEligibility` and `reasonCode`.
 */
const UAV_REASON_LABELS: Readonly<Record<string, string>> = {
  DRONE_NOT_AVAILABLE: 'UAV không ở trạng thái sẵn sàng (bảo trì, đang dùng, không khả dụng hoặc thất lạc).',
  SCHEDULE_CONFLICT: 'UAV đã được đặt lịch trùng khung giờ bay của hồ sơ.',
  TECHNICAL_HEALTH_CRITICAL: 'Biên bản kiểm định gần nhất không đạt hoặc sức khỏe kỹ thuật ở mức nguy hiểm.',
  NO_VALID_TECHNICAL_INSPECTION: 'Chưa có biên bản kiểm định kỹ thuật còn hiệu lực tại thời điểm bắt đầu bay.',
  TECHNICAL_HEALTH_DEGRADED: 'Sức khỏe kỹ thuật chưa xác định hoặc suy giảm theo biên bản gần nhất.',
  SCOPE_EXCEEDS_CAPABILITY: 'Phạm vi bay vượt năng lực của UAV (cần quá nhiều chuyến bay).',
};

const PERSONNEL_REASON_LABELS: Readonly<Record<string, string>> = {
  USER_INACTIVE: 'Tài khoản chưa kích hoạt hoặc đã bị khóa',
  INVALID_ROLE: 'Không có vai trò hiện trường hợp lệ',
  OUTSIDE_MANAGEMENT_SCOPE: 'Không thuộc phạm vi khu vực',
  SCHEDULE_CONFLICT: 'Trùng lịch trong khung giờ bay',
};

const TECHNICAL_LABELS: Readonly<Record<UavTechnicalEligibility, string>> = {
  ELIGIBLE: 'Đạt – kiểm định còn hạn',
  REQUIRES_INSPECTION: 'Cần kiểm định',
  CRITICAL: 'Không đạt (Critical)',
  DEGRADED: 'Suy giảm',
  UNKNOWN: 'Chưa xác định',
};

const TECHNICAL_TONES: Readonly<Record<UavTechnicalEligibility, 'pass' | 'warning' | 'fail' | 'neutral'>> = {
  ELIGIBLE: 'pass',
  REQUIRES_INSPECTION: 'warning',
  CRITICAL: 'fail',
  DEGRADED: 'fail',
  UNKNOWN: 'neutral',
};

/** Vietnamese reason why a UAV candidate is not eligible (`null` when there is no reason). */
export const uavReasonLabel = (code: string | null | undefined): string | null => {
  if (!code) return null;
  const key = code.trim().toUpperCase();
  return UAV_REASON_LABELS[key] ?? `Không đủ điều kiện (${key}).`;
};

export const personnelReasonLabel = (code: string | null | undefined): string | null => {
  if (!code) return null;
  const key = code.trim().toUpperCase();
  return PERSONNEL_REASON_LABELS[key] ?? key;
};

export const technicalEligibilityLabel = (value: UavTechnicalEligibility | null | undefined): string =>
  TECHNICAL_LABELS[value ?? 'UNKNOWN'];

export const technicalEligibilityTone = (value: UavTechnicalEligibility | null | undefined): string =>
  TECHNICAL_TONES[value ?? 'UNKNOWN'];

/** True when a technician has to (re-)inspect the UAV before it can be chosen. */
export const needsTechnicianInspection = (uav: UavCandidate): boolean =>
  uav.technicalEligibility === 'REQUIRES_INSPECTION' ||
  uav.technicalEligibility === 'CRITICAL' ||
  uav.technicalEligibility === 'DEGRADED';

/** Vietnamese label for the scope suitability (scope vs. flight capability only). */
export const suitabilityLabel = (uav: UavCandidate): string => {
  switch (uav.suitability) {
    case 'SUITABLE':
      return 'Phù hợp – 1 chuyến';
    case 'SUITABLE_WITH_SPLIT':
      return `Chia ${uav.estimatedFlightsNeeded ?? 2} chuyến`;
    case 'UNSUITABLE':
      return 'Vượt năng lực bay';
    default:
      return 'Chưa đánh giá';
  }
};
