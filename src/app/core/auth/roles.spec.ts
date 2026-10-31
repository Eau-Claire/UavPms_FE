import { isFieldRole, isManagerRole, isTechnicianRole, roleFamily, roleLabel } from './roles';

describe('roles', () => {
  it('maps backend roles and legacy aliases to families', () => {
    expect(roleFamily('SystemAdmin')).toBe('admin');
    expect(roleFamily('Admin')).toBe('admin');
    expect(roleFamily('Supervisor')).toBe('manager');
    expect(roleFamily('Pilot')).toBe('inspector');
    expect(roleFamily('MaintenanceTechnician')).toBe('technician');
    expect(roleFamily(undefined)).toBe('other');
  });

  it('groups manager and field roles', () => {
    expect(isManagerRole('Manager')).toBe(true);
    expect(isManagerRole('Analyst')).toBe(false);
    expect(isFieldRole('Inspector')).toBe(true);
    expect(isFieldRole('Technician')).toBe(true);
    expect(isFieldRole('SystemAdmin')).toBe(false);
    expect(isTechnicianRole('maintenancetechnician')).toBe(true);
  });

  it('labels roles in Vietnamese', () => {
    expect(roleLabel('MaintenanceTechnician')).toBe('Kỹ thuật viên');
    expect(roleLabel('Analyst')).toBe('Chuyên viên phân tích');
  });
});
