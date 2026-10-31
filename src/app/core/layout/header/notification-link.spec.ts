import { describe, expect, it } from 'vitest';
import { notificationLink, referenceTypeLabel } from './notification-link';

describe('notificationLink', () => {
  const mission = (type: string, referenceType = 'MISSION') => ({ type, referenceType, referenceId: 'm1' });

  it('sends field roles to the acceptance page for assignment notifications', () => {
    for (const role of ['Inspector', 'Analyst', 'Technician', 'MaintenanceTechnician']) {
      expect(notificationLink(mission('MISSION_DISPATCH'), role)?.commands).toEqual(['/missions', 'm1', 'inspector']);
      expect(notificationLink(mission('MISSION_ASSIGNED', 'Mission'), role)?.commands).toEqual(['/missions', 'm1', 'inspector']);
      expect(notificationLink(mission('MISSION_REMINDER'), role)?.commands).toEqual(['/missions', 'm1', 'inspector']);
    }
  });

  it('sends field roles to the mission detail for other mission notifications', () => {
    expect(notificationLink(mission('MISSION_CANCELLED'), 'Inspector')?.commands).toEqual(['/missions', 'm1']);
    expect(notificationLink(mission('MISSION_COMMUNICATION', 'Mission'), 'Technician')?.commands).toEqual(['/missions', 'm1']);
  });

  it('always sends managers to the mission detail', () => {
    expect(notificationLink(mission('MISSION_DISPATCH'), 'Manager')?.commands).toEqual(['/missions', 'm1']);
    expect(notificationLink(mission('MISSION_CONFIRMATION_OVERDUE', 'Mission'), 'SystemAdmin')?.commands).toEqual(['/missions', 'm1']);
  });

  it('opens maintenance tickets only for roles allowed on /maintenance', () => {
    const ticket = { type: 'MAINTENANCE_ASSIGNED', referenceType: 'MaintenanceTicket', referenceId: 't1' };
    expect(notificationLink(ticket, 'MaintenanceTechnician')?.commands).toEqual(['/maintenance', 't1']);
    expect(notificationLink(ticket, 'Manager')?.commands).toEqual(['/maintenance', 't1']);
    expect(notificationLink(ticket, 'Inspector')).toBeNull();
  });

  it('opens detected anomalies only for reviewers', () => {
    const anomaly = { type: 'CriticalAlert', referenceType: 'DetectedAnomaly', referenceId: 'a1' };
    expect(notificationLink(anomaly, 'Analyst')?.commands).toEqual(['/ai-review', 'a1']);
    expect(notificationLink(anomaly, 'Manager')?.commands).toEqual(['/ai-review', 'a1']);
    expect(notificationLink(anomaly, 'Inspector')).toBeNull();
    expect(notificationLink(anomaly, 'Technician')).toBeNull();
  });

  it('opens emergency alerts only for roles allowed on /emergency-alerts', () => {
    const alert = { type: 'EmergencyAlert', referenceType: 'EmergencyAlert', referenceId: 'e1' };
    expect(notificationLink(alert, 'Analyst')?.commands).toEqual(['/emergency-alerts']);
    expect(notificationLink(alert, 'Inspector')).toBeNull();
  });

  it('has no link for unknown or empty references', () => {
    expect(notificationLink({ type: 'X', referenceType: '', referenceId: '' }, 'Manager')).toBeNull();
    expect(notificationLink({ type: 'X', referenceType: 'Mission', referenceId: '' }, 'Manager')).toBeNull();
    expect(notificationLink({ type: 'X', referenceType: 'Other', referenceId: 'x' }, 'Manager')).toBeNull();
  });

  it('labels reference types in Vietnamese', () => {
    expect(referenceTypeLabel('MISSION')).toBe('Nhiệm vụ');
    expect(referenceTypeLabel('MaintenanceTicket')).toBe('Phiếu bảo trì');
    expect(referenceTypeLabel(undefined)).toBe('Mục liên quan');
  });
});
