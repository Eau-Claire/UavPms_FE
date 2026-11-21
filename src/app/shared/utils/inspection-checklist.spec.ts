import { describe, expect, it } from 'vitest';
import { buildInspectionChecklist } from './inspection-checklist';

/** Items the backend always treats as critical; a critical item without a reading fails. */
const CRITICAL = ['FRAME_BODY', 'PROP_INTEGRITY', 'MOTORS', 'BATTERY_HEALTH', 'IMU_CALIBRATION', 'GPS_FIX', 'FLIGHT_CONTROLLER', 'RF_LINK_TELEMETRY'];

describe('buildInspectionChecklist', () => {
  it('gives every critical item a reading', () => {
    const metrics = buildInspectionChecklist({ preset: 'healthy', batteryLevel: 96, gpsSatellites: 28, rfLinkQuality: 98 });
    for (const code of CRITICAL) {
      const m = metrics.find((x) => x.metricCode === code);
      expect(m, code).toBeTruthy();
      expect(m?.numericValue != null || m?.boolValue != null, code).toBe(true);
      expect(m?.passed, code).toBe(true);
    }
  });

  it('fails battery and RF readings below the backend thresholds', () => {
    const metrics = buildInspectionChecklist({ preset: 'healthy', batteryLevel: 25, gpsSatellites: 20, rfLinkQuality: 40 });
    expect(metrics.find((m) => m.metricCode === 'BATTERY_HEALTH')?.passed).toBe(false);
    expect(metrics.find((m) => m.metricCode === 'RF_LINK_TELEMETRY')?.passed).toBe(false);
  });

  it('marks the mechanical items failed for the critical preset', () => {
    const metrics = buildInspectionChecklist({ preset: 'critical', batteryLevel: 96, gpsSatellites: 28, rfLinkQuality: 98 });
    expect(metrics.find((m) => m.metricCode === 'FRAME_BODY')?.passed).toBe(false);
    expect(metrics.find((m) => m.metricCode === 'IMU_CALIBRATION')?.passed).toBe(false);
  });
});
