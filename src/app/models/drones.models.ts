/** Trạng thái bay của drone (`DroneStatus`): Idle, Flying, Maintenance, Offline, Online. */
export type DroneFlightStatus = 'Idle' | 'Flying' | 'Maintenance' | 'Offline' | 'Online' | string;

/**
 * Drone dạng rút gọn của `GET /drones` (không `detailed`), `GET /drones/available` và `GET /drones/{id}/status`.
 * Lưu ý: trường `operationalStatus` của DTO này chứa trạng thái bay (`DroneFlightStatus`),
 * khác với `operationalStatus` của `UavDetailsDto` (Available, Reserved, InUse...).
 */
export interface DroneDto {
  readonly id: string;
  readonly droneCode: string;
  readonly name: string;
  readonly online: boolean;
  readonly battery: number | null;
  readonly operationalStatus: DroneFlightStatus;
  readonly lastSeenAt?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly altitude?: number | null;
}
