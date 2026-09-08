export type DroneOperationalStatus = 'Idle' | 'Flying' | 'Maintenance' | 'Offline' | string;

export interface DroneDto {
  readonly id: string;
  readonly droneCode: string;
  readonly name: string;
  readonly online: boolean;
  readonly battery: number;
  readonly operationalStatus: DroneOperationalStatus;
  readonly lastSeenAt?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly altitude?: number;
}
