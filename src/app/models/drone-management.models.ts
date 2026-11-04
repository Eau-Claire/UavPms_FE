/** Trạng thái khai thác của drone (`DroneOperationalStatus`), đúng giá trị backend trả về. */
export type UavOperationalStatus = 'Available' | 'Reserved' | 'InUse' | 'Maintenance' | 'Unavailable' | 'Lost' | string;

export const UAV_OPERATIONAL_STATUSES: readonly { readonly value: UavOperationalStatus; readonly label: string }[] = [
  { value: 'Available', label: 'Khả dụng' },
  { value: 'Reserved', label: 'Đã giữ chỗ' },
  { value: 'InUse', label: 'Đang làm nhiệm vụ' },
  { value: 'Maintenance', label: 'Bảo dưỡng' },
  { value: 'Unavailable', label: 'Tạm ngưng' },
  { value: 'Lost', label: 'Mất thiết bị' },
];

/** Sức khỏe kỹ thuật (`TechnicalHealth`). */
export type UavTechnicalHealth = 'Unknown' | 'Healthy' | 'Warning' | 'Critical' | string;

export const UAV_TECHNICAL_HEALTHS: readonly { readonly value: UavTechnicalHealth; readonly label: string }[] = [
  { value: 'Healthy', label: 'Đạt an toàn' },
  { value: 'Warning', label: 'Cảnh báo' },
  { value: 'Critical', label: 'Lỗi - không bay' },
  { value: 'Unknown', label: 'Chưa kiểm tra' },
];

/** Mức phù hợp phạm vi bay (`GisDroneCapabilityItemDto.suitability`). */
export type UavScopeSuitability = 'SUITABLE' | 'SUITABLE_WITH_SPLIT' | 'UNSUITABLE' | string;

/** `FlightControllerBindingDto`. */
export interface ActiveFlightControllerDto {
  readonly id: string;
  readonly droneId: string;
  readonly flightControllerUid: string;
  readonly boardIdentifier?: string | null;
  readonly firmwareName?: string | null;
  readonly firmwareVersion?: string | null;
  readonly pairedAt: string;
  readonly unpairedAt?: string | null;
  readonly lastSeenAt?: string | null;
  readonly isActive: boolean;
}

/** `DroneTechnicalInspectionSummaryDto`. Trạng thái: Pending, InProgress, Passed, Failed, Incomplete. */
export interface DroneTechnicalInspectionSummaryDto {
  readonly id: string;
  readonly status: string;
  readonly health: string;
  readonly technicianName?: string | null;
  readonly notes?: string | null;
  readonly completedAt?: string | null;
  readonly validUntil?: string | null;
  readonly metricCount: number;
}

/** `UavDetailsDto` (`GET /drones?detailed=true`, `GET /drones/{id}`). */
export interface UavRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly model: string;
  readonly category: string;
  readonly serialNumber: string;
  readonly assignedRegionId?: string | null;
  readonly assignedRegionName?: string | null;
  readonly operationalStatus: UavOperationalStatus;
  readonly technicalHealth: UavTechnicalHealth;
  readonly flightEnduranceMinutes: number;
  readonly operationalRangeKm: number;
  readonly cameraPayloadInfo?: string | null;
  readonly batteryLevel: number;
  readonly lastMaintenanceAt?: string | null;
  readonly technicalHealthUpdatedAt?: string | null;
  readonly activeFlightController?: ActiveFlightControllerDto | null;
  readonly lastTechnicalInspection?: DroneTechnicalInspectionSummaryDto | null;
  readonly createdAt: string;
  readonly updatedAt?: string | null;
}

/** Body `POST /drones` (`CreateUavRequest`). */
export interface CreateUavRequest {
  readonly code: string;
  readonly name: string;
  readonly model: string;
  readonly category?: string;
  readonly serialNumber?: string;
  readonly assignedRegionId?: string | null;
  readonly operationalStatus?: UavOperationalStatus;
  readonly technicalHealth?: UavTechnicalHealth;
  readonly flightEnduranceMinutes?: number;
  readonly operationalRangeKm?: number;
  readonly cameraPayloadInfo?: string;
  readonly batteryLevel?: number;
}

/** Body `PUT /drones/{id}` (`UpdateUavRequest`). */
export interface UpdateUavRequest {
  readonly name?: string;
  readonly model?: string;
  readonly category?: string;
  readonly serialNumber?: string;
  readonly assignedRegionId?: string | null;
  readonly operationalStatus?: UavOperationalStatus;
  readonly technicalHealth?: UavTechnicalHealth;
  readonly flightEnduranceMinutes?: number;
  readonly operationalRangeKm?: number;
  readonly cameraPayloadInfo?: string;
  readonly batteryLevel?: number;
}

/** Body `POST /drones/{id}/basic-technical-check` (`BasicTechnicalCheckRequest`). */
export interface BasicTechnicalCheckRequest {
  readonly frameBodyPassed: boolean;
  readonly frameBodyNotes?: string;
  readonly propellersPassed: boolean;
  readonly propellersNotes?: string;
  readonly motorsPassed: boolean;
  readonly motorsNotes?: string;
  readonly cameraPayloadPassed: boolean;
  readonly cameraPayloadNotes?: string;
  readonly batteryPassed: boolean;
  readonly batteryVoltage?: number;
  readonly batteryPercent?: number;
  readonly batteryCellCount?: number;
  readonly batteryNotes?: string;
  readonly gpsPassed: boolean;
  readonly gpsFixStatus?: string;
  readonly gpsSatelliteCount?: number;
  readonly gpsNotes?: string;
  readonly communicationPassed: boolean;
  readonly communicationConnected?: boolean;
  readonly communicationSignalInfo?: string;
  readonly communicationNotes?: string;
  readonly flightControllerPassed: boolean;
  readonly flightControllerUid?: string;
  readonly flightControllerBoard?: string;
  readonly flightControllerFirmware?: string;
  readonly flightControllerConnected?: boolean;
  readonly flightControllerNotes?: string;
  readonly notes?: string;
  readonly policyVersion?: string;
  readonly preMissionAssessmentId?: string;
}

/** `GisDroneCapabilityItemDto`. */
export interface GisDroneCapabilityItemDto {
  readonly droneId: string;
  readonly droneCode: string;
  readonly droneName: string;
  readonly model: string;
  readonly category: string;
  readonly operationalStatus: UavOperationalStatus;
  readonly technicalHealth: UavTechnicalHealth;
  readonly flightEnduranceMinutes: number;
  readonly operationalRangeKm: number;
  readonly effectiveFlightMinutes: number;
  readonly maxCoverageDistanceKm: number;
  readonly estimatedFlightsNeeded: number;
  readonly estimatedDronesNeeded: number;
  readonly suitability: UavScopeSuitability;
  readonly isAvailable: boolean;
  readonly isTechnicallyReady: boolean;
  readonly recommendation: string;
}

/** `GisDroneEstimationResult`. `assetCount` là số cột điện trong phạm vi (tên trường giữ nguyên của backend). */
export interface GisDroneEstimationResult {
  readonly corridorLengthKm: number;
  readonly assetCount: number;
  readonly estimatedMissionDurationMinutes: number;
  readonly averageSpeedKmh: number;
  readonly reserveBatteryPercent: number;
  readonly inspectionMinutesPerAsset: number;
  readonly drones: readonly GisDroneCapabilityItemDto[];
}

/**
 * Body `POST /drones/estimate-gis-scope` (`GisDroneEstimationRequest`).
 * Truyền `assessmentId` để backend tự lấy phạm vi cột của hồ sơ, hoặc chiều dài hành lang và số cột.
 */
export interface GisDroneEstimationRequest {
  readonly assessmentId?: string;
  readonly corridorLengthKm?: number;
  readonly assetCount?: number;
  readonly regionId?: string;
}
