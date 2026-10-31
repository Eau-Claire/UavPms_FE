import { MaintenanceTicket } from '../../../models/maintenance.models';
import { Mission, normalizeMissionStatus } from '../../../models/missions.models';
import { UavRecord } from '../../../models/drone-management.models';

// ---------------------------------------------------------------------------
// Inspector: GET /missions/my
// ---------------------------------------------------------------------------

export type InspectorGroupKey = 'awaiting' | 'upcoming' | 'flying' | 'paused' | 'completed';

export interface InspectorMissionGroups {
  /** My assignment is still PENDING: accept or postpone on `/missions/:id/inspector`. */
  readonly awaiting: readonly Mission[];
  /** Assigned / Preparing / Ready (and PendingAcceptance once I have accepted), earliest planned start first. */
  readonly upcoming: readonly Mission[];
  readonly flying: readonly Mission[];
  /** Suspended / Postponed missions, or ones I asked to postpone. */
  readonly paused: readonly Mission[];
  /** Most recently completed first, at most `RECENT_COMPLETED_LIMIT`. */
  readonly completed: readonly Mission[];
  readonly completedTotal: number;
}

export const RECENT_COMPLETED_LIMIT = 5;

const UPCOMING_STATUSES = new Set(['Assigned', 'Preparing', 'Ready', 'PendingAcceptance']);
const PAUSED_STATUSES = new Set(['Suspended', 'Postponed']);

const time = (value: string | null | undefined): number => {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isNaN(parsed) ? NaN : parsed;
};

/** Ascending by date, missing dates last. */
const byDateAsc = <T>(pick: (item: T) => string | null | undefined) => (a: T, b: T): number => {
  const ta = time(pick(a));
  const tb = time(pick(b));
  if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
  if (Number.isNaN(ta)) return 1;
  if (Number.isNaN(tb)) return -1;
  return ta - tb;
};

const plannedStartOf = (m: Mission): string | null => m.plannedStart ?? m.scheduledStartAt ?? null;
const completedAtOf = (m: Mission): string | null => m.actualCompleted ?? m.plannedEnd ?? m.updatedAt ?? m.createdAt ?? null;

/** My own response on the mission, or null when I am not in its active team (legacy single-inspector missions). */
export const myResponseStatus = (mission: Mission, userId: string | null | undefined): string | null => {
  if (!userId) return null;
  const mine = (mission.team ?? []).find((member) => member.userId.toLowerCase() === userId.toLowerCase() && member.status !== 'Revoked');
  return mine ? String(mine.responseStatus ?? 'PENDING').toUpperCase() : null;
};

export const groupInspectorMissions = (missions: readonly Mission[], userId: string | null | undefined): InspectorMissionGroups => {
  const awaiting: Mission[] = [];
  const upcoming: Mission[] = [];
  const flying: Mission[] = [];
  const paused: Mission[] = [];
  const completed: Mission[] = [];

  for (const mission of missions) {
    const status = normalizeMissionStatus(mission.status);
    if (status === 'Cancelled' || status === 'Draft') continue;
    if (status === 'Completed') {
      completed.push(mission);
      continue;
    }
    if (status === 'InProgress') {
      flying.push(mission);
      continue;
    }
    const response = myResponseStatus(mission, userId);
    if (response === 'PENDING' || (response === null && status === 'PendingAcceptance')) {
      awaiting.push(mission);
    } else if (response === 'POSTPONED' || PAUSED_STATUSES.has(status)) {
      paused.push(mission);
    } else if (UPCOMING_STATUSES.has(status)) {
      upcoming.push(mission);
    }
  }

  const sortedCompleted = completed.sort(byDateAsc(completedAtOf)).reverse();
  return {
    awaiting: awaiting.sort(byDateAsc((m) => m.confirmationDeadline ?? plannedStartOf(m))),
    upcoming: upcoming.sort(byDateAsc(plannedStartOf)),
    flying: flying.sort(byDateAsc((m) => m.actualStart ?? plannedStartOf(m))),
    paused: paused.sort(byDateAsc(plannedStartOf)),
    completed: sortedCompleted.slice(0, RECENT_COMPLETED_LIMIT),
    completedTotal: sortedCompleted.length,
  };
};

/** Accept / postpone happens on the inspector page; everything else on the mission detail page. */
export const inspectorMissionLink = (mission: Mission, group: InspectorGroupKey): readonly string[] =>
  group === 'awaiting' ? ['/missions', mission.id, 'inspector'] : ['/missions', mission.id];

// ---------------------------------------------------------------------------
// Technician: GET /maintenance/tickets/my, GET /drones?detailed=true
// ---------------------------------------------------------------------------

export type TechnicianTicketGroupKey = 'Open' | 'InProgress' | 'PendingVerification';

export interface TechnicianTicketGroups {
  readonly Open: readonly MaintenanceTicket[];
  readonly InProgress: readonly MaintenanceTicket[];
  readonly PendingVerification: readonly MaintenanceTicket[];
  readonly overdueCount: number;
}

const PRIORITY_RANK: Record<string, number> = { Emergency: 0, High: 1, Medium: 2, Low: 3 };

/** A ticket still waiting on the technician (Open / InProgress) whose due date has passed. */
export const isTicketOverdue = (ticket: MaintenanceTicket, now: number): boolean => {
  if (ticket.status !== 'Open' && ticket.status !== 'InProgress') return false;
  const due = time(ticket.dueDate);
  return !Number.isNaN(due) && due < now;
};

export const groupTechnicianTickets = (tickets: readonly MaintenanceTicket[], now: number): TechnicianTicketGroups => {
  const sortTickets = (list: MaintenanceTicket[]): MaintenanceTicket[] =>
    list.sort((a, b) => {
      const overdue = Number(isTicketOverdue(b, now)) - Number(isTicketOverdue(a, now));
      if (overdue) return overdue;
      const priority = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
      if (priority) return priority;
      return byDateAsc<MaintenanceTicket>((t) => t.dueDate ?? t.createdAt)(a, b);
    });

  return {
    Open: sortTickets(tickets.filter((t) => t.status === 'Open')),
    InProgress: sortTickets(tickets.filter((t) => t.status === 'InProgress')),
    PendingVerification: sortTickets(tickets.filter((t) => t.status === 'PendingVerification')),
    overdueCount: tickets.filter((t) => isTicketOverdue(t, now)).length,
  };
};

export type DroneAttentionReason = 'Critical' | 'Warning' | 'NeverInspected';

export interface DroneAttentionItem {
  readonly drone: UavRecord;
  readonly reason: DroneAttentionReason;
}

const ATTENTION_RANK: Record<DroneAttentionReason, number> = { Critical: 0, Warning: 1, NeverInspected: 2 };

/** Drones whose technical health is Warning / Critical, or that have never had a technical check. Lost drones are skipped. */
export const dronesNeedingAttention = (drones: readonly UavRecord[]): readonly DroneAttentionItem[] =>
  drones
    .filter((drone) => drone.operationalStatus !== 'Lost')
    .map((drone): DroneAttentionItem | null => {
      if (drone.technicalHealth === 'Critical') return { drone, reason: 'Critical' };
      if (drone.technicalHealth === 'Warning') return { drone, reason: 'Warning' };
      if (!drone.lastTechnicalInspection || !drone.technicalHealth || drone.technicalHealth === 'Unknown') return { drone, reason: 'NeverInspected' };
      return null;
    })
    .filter((item): item is DroneAttentionItem => item !== null)
    .sort((a, b) => ATTENTION_RANK[a.reason] - ATTENTION_RANK[b.reason] || a.drone.code.localeCompare(b.drone.code));

export const DRONE_ATTENTION_LABELS: Record<DroneAttentionReason, string> = {
  Critical: 'Lỗi - không bay',
  Warning: 'Cảnh báo kỹ thuật',
  NeverInspected: 'Chưa kiểm tra kỹ thuật',
};
