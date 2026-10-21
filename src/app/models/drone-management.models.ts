export type UavOperationalStatus =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'IN_USE'
  | 'MAINTENANCE'
  | 'UNAVAILABLE'
  | 'LOST'
  | string;

export type UavTechnicalHealth =
  | 'UNKNOWN'
  | 'HEALTHY'
  | 'WARNING'
  | 'CRITICAL'
  | string;

export type UavScopeSuitability =
  | 'SUITABLE'
  | 'SUITABLE_WITH_SPLIT'
  | 'UNSUITABLE'
  | string;

export interface ActiveFlightControllerDto {
  readonly id: string;
  readonly flightControllerUid: string;
  readonly boardIdentifier?: string;
  readonly firmwareName?: string;
  readonly firmwareVersion?: string;
  readonly pairedAt: string;
  readonly lastSeenAt?: string | null;
  readonly isActive: boolean;
}

export interface DroneTechnicalInspectionSummaryDto {
  readonly id: string;
  readonly status: string;
  readonly health: string;
  readonly technicianName?: string | null;
  readonly completedAt?: string | null;
  readonly validUntil?: string | null;
  readonly metricsCount: number;
}

export interface UavRecord {
  readonly id: string;
  readonly uavCode: string;
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
  readonly cameraPayloadInfo: string;
  readonly batteryLevel: number;
  readonly isOnline: boolean;
  readonly activeFlightController?: ActiveFlightControllerDto | null;
  readonly lastTechnicalInspection?: DroneTechnicalInspectionSummaryDto | null;
  readonly createdAt: string;
  readonly updatedAt?: string | null;
}

export interface CreateUavRequest {
  readonly uavCode: string;
  readonly name: string;
  readonly model: string;
  readonly category?: string;
  readonly serialNumber?: string;
  readonly assignedRegionId?: string | null;
  readonly flightEnduranceMinutes?: number;
  readonly operationalRangeKm?: number;
  readonly cameraPayloadInfo?: string;
  readonly batteryLevel?: number;
}

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

export interface BasicTechnicalCheckRequest {
  readonly frameBodyPassed: boolean;
  readonly frameBodyNote?: string;
  readonly propellersPassed: boolean;
  readonly propellersNote?: string;
  readonly motorsPassed: boolean;
  readonly motorsNote?: string;
  readonly cameraPayloadPassed: boolean;
  readonly cameraPayloadNote?: string;
  readonly batteryPassed: boolean;
  readonly batteryVoltage?: number;
  readonly batteryPercent?: number;
  readonly batteryCellCount?: number;
  readonly batteryNote?: string;
  readonly gpsPassed: boolean;
  readonly gpsFixStatus?: string;
  readonly gpsSatelliteCount?: number;
  readonly gpsNote?: string;
  readonly communicationPassed: boolean;
  readonly communicationSignal?: string;
  readonly communicationNote?: string;
  readonly flightControllerPassed: boolean;
  readonly flightControllerUid?: string;
  readonly flightControllerBoard?: string;
  readonly flightControllerFirmware?: string;
  readonly flightControllerNote?: string;
  readonly notes?: string;
}

export interface GisDroneCapabilityItemDto {
  readonly droneId: string;
  readonly droneCode: string;
  readonly droneName: string;
  readonly flightEnduranceMinutes: number;
  readonly operationalRangeKm: number;
  readonly operationalStatus: string;
  readonly technicalHealth: string;
  readonly suitability: UavScopeSuitability;
  readonly estimatedFlightsNeeded: number;
  readonly maxCorridorPerFlightKm: number;
  readonly recommendation: string;
}

export interface GisDroneEstimationResult {
  readonly corridorLengthKm: number;
  readonly assetCount: number;
  readonly totalEstimatedMissionMinutes: number;
  readonly recommendedMinEnduranceMinutes: number;
  readonly drones: readonly GisDroneCapabilityItemDto[];
}

export interface GisDroneEstimationRequest {
  readonly corridorLengthKm: number;
  readonly assetCount: number;
  readonly averageSpeedKmH?: number;
  readonly batteryReservePercent?: number;
  readonly inspectionTimePerAssetMinutes?: number;
}
