import { TechnicalInspectionMetricInput } from './pre-mission-api';

export type ChecklistPreset = 'healthy' | 'warning' | 'critical';

export interface InspectionChecklistInput {
  /** `critical` marks the mechanical/sensor items as failed; the numeric readings decide the rest. */
  readonly preset: ChecklistPreset;
  readonly batteryLevel: number;
  readonly gpsSatellites: number;
  readonly rfLinkQuality: number;
  /** A Flight Controller of this UAV is connected (Web Serial or simulator) and paired. */
  readonly flightControllerConnected?: boolean;
}

/** Backend thresholds (`Drone:CriticalBatteryThreshold`, `Drone:MinRfLinkThreshold`); readings below them fail. */
export const MIN_BATTERY_PERCENT = 30;
export const MIN_RF_LINK_PERCENT = 60;
export const MIN_GPS_SATELLITES = 6;

/**
 * Checklist sent with `POST /drone-technical-inspections`. The backend rejects an empty list
 * (`METRICS_REQUIRED`) and fails every critical item without a reading, so each critical item
 * (frame, propellers, motors, battery, IMU, GPS, flight controller, RF link) carries a value.
 */
export function buildInspectionChecklist(input: InspectionChecklistInput): TechnicalInspectionMetricInput[] {
  const mechanicalOk = input.preset !== 'critical';
  const severity = mechanicalOk ? 'Medium' : 'Critical';
  const batteryOk = mechanicalOk && input.batteryLevel >= MIN_BATTERY_PERCENT;
  const gpsOk = mechanicalOk && input.gpsSatellites >= MIN_GPS_SATELLITES;
  const rfOk = mechanicalOk && input.rfLinkQuality >= MIN_RF_LINK_PERCENT;

  const check = (metricCode: string, subsystem: string, passed: boolean, critical = true): TechnicalInspectionMetricInput => ({
    metricCode,
    subsystem,
    boolValue: passed,
    passed,
    isRequired: true,
    critical,
    severity: passed ? (critical ? 'Medium' : 'Low') : severity,
  });

  return [
    check('FRAME_BODY', 'Airframe', mechanicalOk),
    check('PROP_INTEGRITY', 'Propulsion', mechanicalOk),
    check('MOTORS', 'Propulsion', mechanicalOk),
    {
      metricCode: 'BATTERY_HEALTH',
      subsystem: 'Power',
      numericValue: input.batteryLevel,
      unit: '%',
      passed: batteryOk,
      isRequired: true,
      critical: true,
      severity: batteryOk ? (input.preset === 'warning' ? 'Medium' : 'Low') : 'Critical',
    },
    check('IMU_CALIBRATION', 'Sensors', mechanicalOk),
    {
      metricCode: 'GPS_FIX',
      subsystem: 'Navigation',
      numericValue: input.gpsSatellites,
      unit: 'sats',
      passed: gpsOk,
      isRequired: true,
      critical: true,
      severity: gpsOk ? 'Medium' : 'Critical',
    },
    {
      metricCode: 'FLIGHT_CONTROLLER',
      subsystem: 'Avionics',
      boolValue: mechanicalOk,
      valueText: input.flightControllerConnected ? 'Đã kết nối Flight Controller khi kiểm định' : null,
      passed: mechanicalOk,
      isRequired: true,
      critical: true,
      severity,
    },
    {
      metricCode: 'RF_LINK_TELEMETRY',
      subsystem: 'Communication',
      numericValue: input.rfLinkQuality,
      unit: '%',
      passed: rfOk,
      isRequired: true,
      critical: true,
      severity: rfOk ? 'Medium' : 'Critical',
    },
    check('CAMERA_PAYLOAD', 'Payload', true, false),
  ];
}
