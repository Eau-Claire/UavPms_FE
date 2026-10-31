import { describe, expect, it } from 'vitest';
import { MaintenanceTicket } from '../../../models/maintenance.models';
import { UavRecord } from '../../../models/drone-management.models';
import { normalizeMission } from '../../missions/data-access/missions-api';
import { dronesNeedingAttention, groupInspectorMissions, groupTechnicianTickets, inspectorMissionLink, isTicketOverdue } from './field-dashboard';

const ME = 'aaaaaaaa-0000-0000-0000-000000000001';

const mission = (id: string, status: string, extra: Record<string, unknown> = {}) =>
  normalizeMission({ id, missionCode: `NV-${id}`, title: `Nhiệm vụ ${id}`, status, ...extra });

const team = (responseStatus: string) => ({ team: [{ id: 'as-1', userId: ME, userName: 'Tôi', assignmentRole: 'Pilot', status: 'Active', responseStatus }] });

describe('groupInspectorMissions', () => {
  it('groups my missions by what I have to do next', () => {
    const groups = groupInspectorMissions(
      [
        mission('pending', 'PendingAcceptance', team('Pending')),
        mission('legacy', 'PendingAcceptance'),
        mission('accepted-wait', 'PendingAcceptance', team('Accepted')),
        mission('late', 'Ready', { plannedStart: '2026-11-05T08:00:00Z', ...team('Accepted') }),
        mission('soon', 'Assigned', { plannedStart: '2026-11-01T08:00:00Z', ...team('Accepted') }),
        mission('flying', 'InProgress', team('Accepted')),
        mission('postponed-by-me', 'PendingAcceptance', team('Postponed')),
        mission('suspended', 'Suspended', team('Accepted')),
        mission('cancelled', 'Cancelled', team('Accepted')),
        ...Array.from({ length: 7 }, (_, i) => mission(`done-${i}`, 'Completed', { actualCompleted: `2026-10-0${i + 1}T08:00:00Z` })),
      ],
      ME,
    );

    expect(groups.awaiting.map((m) => m.id)).toEqual(['pending', 'legacy']);
    expect(groups.upcoming.map((m) => m.id)).toEqual(['soon', 'late', 'accepted-wait']);
    expect(groups.flying.map((m) => m.id)).toEqual(['flying']);
    expect(groups.paused.map((m) => m.id).sort()).toEqual(['postponed-by-me', 'suspended']);
    expect(groups.completedTotal).toBe(7);
    expect(groups.completed.map((m) => m.id)).toEqual(['done-6', 'done-5', 'done-4', 'done-3', 'done-2']);
  });

  it('links not-yet-accepted missions to the inspector page and the rest to the detail page', () => {
    const m = mission('x', 'Ready');
    expect(inspectorMissionLink(m, 'awaiting')).toEqual(['/missions', 'x', 'inspector']);
    expect(inspectorMissionLink(m, 'upcoming')).toEqual(['/missions', 'x']);
    expect(inspectorMissionLink(m, 'flying')).toEqual(['/missions', 'x']);
  });
});

const ticket = (id: string, status: string, extra: Partial<MaintenanceTicket> = {}): MaintenanceTicket => ({
  id,
  ticketCode: `PBT-${id}`,
  anomalyId: 'an-1',
  managerId: 'mgr',
  status,
  priority: 'Medium',
  description: '',
  createdAt: '2026-10-01T00:00:00Z',
  proofs: [],
  materials: [],
  ...extra,
});

describe('groupTechnicianTickets', () => {
  const now = Date.parse('2026-10-31T12:00:00Z');

  it('groups by status and puts overdue tickets first', () => {
    const groups = groupTechnicianTickets(
      [
        ticket('a', 'Open', { dueDate: '2026-11-10T00:00:00Z' }),
        ticket('b', 'Open', { dueDate: '2026-10-30T00:00:00Z' }),
        ticket('c', 'InProgress', { priority: 'Emergency' }),
        ticket('d', 'PendingVerification', { dueDate: '2026-10-01T00:00:00Z' }),
        ticket('e', 'Closed'),
      ],
      now,
    );
    expect(groups.Open.map((t) => t.id)).toEqual(['b', 'a']);
    expect(groups.InProgress.map((t) => t.id)).toEqual(['c']);
    expect(groups.PendingVerification.map((t) => t.id)).toEqual(['d']);
    expect(groups.overdueCount).toBe(1);
  });

  it('only treats tickets still with the technician as overdue', () => {
    expect(isTicketOverdue(ticket('x', 'InProgress', { dueDate: '2026-10-01T00:00:00Z' }), now)).toBe(true);
    expect(isTicketOverdue(ticket('y', 'PendingVerification', { dueDate: '2026-10-01T00:00:00Z' }), now)).toBe(false);
    expect(isTicketOverdue(ticket('z', 'Open'), now)).toBe(false);
  });
});

describe('dronesNeedingAttention', () => {
  const drone = (code: string, technicalHealth: string, extra: Partial<UavRecord> = {}): UavRecord => ({
    id: code,
    code,
    name: code,
    model: 'M300',
    category: 'Quadcopter',
    serialNumber: code,
    operationalStatus: 'Available',
    technicalHealth,
    flightEnduranceMinutes: 30,
    operationalRangeKm: 10,
    batteryLevel: 90,
    createdAt: '2026-01-01T00:00:00Z',
    lastTechnicalInspection: { id: 'i', status: 'Passed', health: technicalHealth, metricCount: 5 },
    ...extra,
  });

  it('lists Critical, then Warning, then never-inspected drones', () => {
    const items = dronesNeedingAttention([
      drone('UAV-1', 'Healthy'),
      drone('UAV-2', 'Warning'),
      drone('UAV-3', 'Healthy', { lastTechnicalInspection: null }),
      drone('UAV-4', 'Critical'),
      drone('UAV-5', 'Unknown'),
      drone('UAV-6', 'Critical', { operationalStatus: 'Lost' }),
    ]);
    expect(items.map((i) => [i.drone.code, i.reason])).toEqual([
      ['UAV-4', 'Critical'],
      ['UAV-2', 'Warning'],
      ['UAV-3', 'NeverInspected'],
      ['UAV-5', 'NeverInspected'],
    ]);
  });
});
