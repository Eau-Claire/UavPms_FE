export interface FlightControllerMetadata {
  readonly uid: string;
  readonly boardIdentifier?: string;
  readonly firmwareName?: string;
  readonly firmwareVersion?: string;
  readonly deviceName?: string;
  readonly apiVersion?: string;
}

export interface FlightControllerDrone {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly model?: string;
  readonly operationalStatus?: string;
  readonly technicalHealth?: string;
}

export interface FlightControllerBinding {
  readonly id: string;
  readonly droneId: string;
  readonly flightControllerUid: string;
  readonly boardIdentifier?: string;
  readonly firmwareName?: string;
  readonly firmwareVersion?: string;
  readonly pairedAt: string;
  readonly unpairedAt?: string | null;
  readonly lastSeenAt?: string | null;
  readonly isActive: boolean;
}

export interface FlightControllerResolveResult {
  readonly registered: boolean;
  readonly flightControllerUid: string;
  readonly drone?: FlightControllerDrone | null;
  readonly binding?: FlightControllerBinding | null;
}

export interface PairFlightControllerPayload {
  readonly flightControllerUid: string;
  readonly boardIdentifier?: string;
  readonly firmwareName?: string;
  readonly firmwareVersion?: string;
}
