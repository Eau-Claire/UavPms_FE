import { describe, expect, it } from 'vitest';
import { canAccess, ROUTE_ROLES } from './route-access';

describe('canAccess', () => {
  it('applies the same aliases as roleGuard', () => {
    expect(canAccess('SystemAdmin', ['Admin'])).toBe(true);
    expect(canAccess('Administrator', ['SystemAdmin'])).toBe(true);
    expect(canAccess('Supervisor', ['Manager'])).toBe(true);
    expect(canAccess('Pilot', ['Inspector'])).toBe(true);
    expect(canAccess('MaintenanceTechnician', ['Technician'])).toBe(true);
    expect(canAccess('Viewer', ['Viewer'])).toBe(true);
    expect(canAccess('Viewer', ['Admin', 'Manager'])).toBe(false);
    expect(canAccess(undefined, ['Admin'])).toBe(false);
  });

  it('opens GIS to every backend role and keeps pre-mission away from analysts', () => {
    for (const role of ['SystemAdmin', 'Manager', 'Inspector', 'Analyst', 'Technician', 'MaintenanceTechnician']) {
      expect(canAccess(role, ROUTE_ROLES.gis)).toBe(true);
    }
    expect(canAccess('Technician', ROUTE_ROLES.preMission)).toBe(true);
    expect(canAccess('Inspector', ROUTE_ROLES.preMission)).toBe(true);
    expect(canAccess('Analyst', ROUTE_ROLES.preMission)).toBe(false);
  });

  it('limits review, alerts and maintenance pages to their roles', () => {
    expect(canAccess('Analyst', ROUTE_ROLES.aiReview)).toBe(true);
    expect(canAccess('Inspector', ROUTE_ROLES.aiReview)).toBe(false);
    expect(canAccess('Technician', ROUTE_ROLES.emergencyAlerts)).toBe(false);
    expect(canAccess('MaintenanceTechnician', ROUTE_ROLES.maintenance)).toBe(true);
    expect(canAccess('Analyst', ROUTE_ROLES.maintenance)).toBe(false);
  });
});
