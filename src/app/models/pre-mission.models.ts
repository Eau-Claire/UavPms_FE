/**
 * Trạng thái hồ sơ đánh giá tiền khả thi. Backend (`AssessmentMappingExtensions.ToDto`) trả về
 * chuỗi in hoa: `DRAFT`, `EVALUATING`, `READY`, `NOT_READY`, `EXPIRED`, `COMPLETED`, `CANCELLED`.
 */
export type AssessmentStatus =
  | 'DRAFT'
  | 'EVALUATING'
  | 'READY'
  | 'NOT_READY'
  | 'EXPIRED'
  | 'COMPLETED'
  | 'CANCELLED'
  | string;

export const ASSESSMENT_STATUSES: readonly AssessmentStatus[] = [
  'DRAFT',
  'EVALUATING',
  'READY',
  'NOT_READY',
  'EXPIRED',
  'COMPLETED',
  'CANCELLED',
];

/** Kết quả một trụ cột đánh giá (`AssessmentCheckResultDto`): `PASS` hoặc `FAIL`. */
export interface ReadinessCheck {
  readonly status: 'PASS' | 'FAIL' | string;
  readonly reason?: string | null;
  readonly evaluatedAt?: string | null;
}

export interface SiteCheckItem {
  readonly code: string;
  readonly name: string;
  readonly status: 'PASS' | 'WARNING' | 'FAIL';
  readonly details: string;
  readonly severity?: 'low' | 'medium' | 'high';
}

/** Vai trò vận hành chuẩn hóa từ `PreMissionAssessmentPersonnelDto.role`. */
export type OperationalRole = 'INSPECTOR' | 'ANALYST' | 'TECHNICIAN' | string;

/** Ứng viên nhân sự (`PreMissionAssessmentPersonnelDto`). `id` là `userId`. */
export interface PersonnelCandidate {
  readonly id: string;
  readonly candidateId: string;
  readonly name: string;
  readonly role: OperationalRole;
  /** Vai trò gốc backend trả về (`Inspector`, `Analyst`, `Technician`, `MaintenanceTechnician`...). */
  readonly rawRole: string;
  readonly isEligible: boolean;
  /** `Unknown` | `Eligible` | `Ineligible` | `RequiresInspection`. */
  readonly eligibilityStatus: string;
  /** `Unknown` | `Available` | `Conflict` | `Unavailable`. */
  readonly availabilityStatus: string;
  readonly reasonCode?: string | null;
  readonly findings: string;
}

export type UavSuitability = 'SUITABLE' | 'SUITABLE_WITH_SPLIT' | 'UNSUITABLE' | string;

/** Ứng viên drone (`PreMissionAssessmentDroneDto`). `id` là `droneId`. */
export interface UavCandidate {
  readonly id: string;
  readonly candidateId: string;
  readonly code: string;
  readonly model: string;
  readonly isEligible: boolean;
  /** `Available` | `Reserved` | `InUse` | `Maintenance` | `Unavailable` | `Lost` (đã kiểm tra trong khung giờ). */
  readonly operationalStatus: string;
  /** `Unknown` | `Healthy` | `Warning` | `Critical`. */
  readonly technicalHealth: string;
  readonly technicalInspectionId?: string | null;
  readonly reasonCode?: string | null;
  readonly batteryLevel: number;
  readonly suitability?: UavSuitability | null;
  readonly estimatedFlightsNeeded?: number | null;
  readonly coverageDistanceKm?: number | null;
  readonly suitabilityReason?: string | null;
}

/** Cột trong phạm vi hồ sơ (`PreMissionAssessmentTowerDto`). */
export interface AssessmentTower {
  readonly id: string;
  readonly towerId: string;
  readonly sequence: number;
  readonly towerCode?: string | null;
  readonly poleType?: string | null;
}

export interface TechnicalMetric {
  readonly subsystem: string;
  readonly metric: string;
  readonly value: string | number;
  readonly unit?: string | null;
  readonly required?: boolean | null;
  readonly severity?: string | null;
  readonly passed?: boolean | null;
}

export interface SubsystemHealth {
  readonly id: string;
  readonly name: string;
  readonly status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
  readonly description?: string;
}

/** Biên bản kiểm định kỹ thuật (`DroneTechnicalInspectionDto`) đã chuẩn hóa cho giao diện. */
export interface DroneTechnicalInspectionResult {
  readonly id: string;
  readonly droneId: string;
  /** `Pending` | `InProgress` | `Passed` | `Failed` | `Incomplete`. */
  readonly status: string;
  readonly overallHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN' | string;
  readonly eligibility: 'ELIGIBLE' | 'NOT_ELIGIBLE';
  readonly technicianName?: string | null;
  readonly policyVersion?: string | null;
  readonly notes?: string | null;
  readonly inspectionSource?: string | null;
  readonly sourceVersion?: string | null;
  readonly inspectedAt: string;
  readonly validUntil?: string | null;
  readonly subsystems: readonly SubsystemHealth[];
  readonly metrics: readonly TechnicalMetric[];
}

/** Hồ sơ đánh giá tiền khả thi (`PreMissionAssessmentDto`). */
export interface PreMissionAssessment {
  readonly id: string;
  readonly assessmentCode: string;
  readonly managerId: string;
  readonly regionId: string;
  readonly regionName: string;
  readonly plannedStart: string;
  readonly plannedEnd: string;
  readonly status: AssessmentStatus;
  readonly overallTechnicalHealth: string;
  readonly siteFeasibilityStatus: string;
  readonly validUntil?: string | null;
  readonly version: number;
  readonly findings: string;
  readonly evaluationPolicyVersion?: string | null;
  /** Nhiệm vụ đã tạo từ hồ sơ (`consumedByMissionId` / `completedMissionId`). */
  readonly completedMissionId?: string | null;
  readonly towers: readonly AssessmentTower[];
  readonly personnelCandidates: readonly PersonnelCandidate[];
  readonly uavCandidates: readonly UavCandidate[];
  readonly site: ReadinessCheck;
  readonly personnel: ReadinessCheck;
  readonly uav: ReadinessCheck;
  readonly technical: ReadinessCheck;
  readonly createdAt: string;
  readonly updatedAt?: string | null;
}

/** `GET /pre-mission-assessments/{id}/resource-readiness` (`ResourceReadinessDto`). */
export interface ResourceReadiness {
  readonly assessmentId: string;
  readonly status: AssessmentStatus;
  readonly siteFeasibilityStatus: string;
  readonly overallTechnicalHealth: string;
  readonly isReady: boolean;
  readonly personnelCandidates: readonly PersonnelCandidate[];
  readonly uavCandidates: readonly UavCandidate[];
  readonly evaluatedAt: string;
}

export interface AssessmentPage {
  readonly items: readonly PreMissionAssessment[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly totalPages: number;
}

/** Bộ lọc `GET /pre-mission-assessments` (backend chỉ hỗ trợ `status`, `search`, `page`, `pageSize`). */
export interface AssessmentFilterOptions {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
}

/** Body của `POST /pre-mission-assessments` (`CreateAssessmentRequest`). */
export interface AssessmentCreateRequest {
  readonly regionId: string;
  readonly plannedStart: string;
  readonly plannedEnd: string;
  readonly towerIds: readonly string[];
  readonly boundaryWkt?: string | null;
  readonly idempotencyKey?: string | null;
}

/** Khu vực chọn khi lập hồ sơ (`RegionDto`). */
export interface RegionOption {
  readonly id: string;
  readonly name: string;
}

/**
 * Cột điện chọn khi lập hồ sơ (`TowerDto` của `GET /towers`).
 * Cùng cấu trúc với `TowerSummary` sẽ có trong `assets.models.ts`.
 */
export interface AssessmentTowerOption {
  readonly id: string;
  readonly regionId: string;
  readonly regionName?: string | null;
  readonly towerCode: string;
  readonly poleType?: string | null;
  readonly address?: string | null;
  readonly latitude: number;
  readonly longitude: number;
}
