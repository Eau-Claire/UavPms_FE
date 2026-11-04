import { Mission, MissionAssignment } from '../../../models/missions.models';
import {
  acceptanceState,
  activitySenderKind,
  activitySenderRole,
  assignmentRoleLabel,
  canManageMission,
  canPostponeWholeMission,
  canOpenEmergencyAlerts,
  canOpenMaintenanceTicket,
  canOpenPreMissionAssessment,
  canOperateFlight,
  canReviewDetections,
  canUploadMissionMedia,
  canViewAllMissions,
  defaultMissionTab,
  findMyAssignment,
  maintenanceStatusLabel,
  missionPriorityLabel,
  missionRowLink,
  missionStartBlocker,
  pendingRequiredMembers,
  towerInspectionStatusLabel,
  userDirectorySource,
} from './mission-access';

const assignment = (overrides: Partial<MissionAssignment> = {}): MissionAssignment => ({
  id: 'a1',
  userId: 'u-me',
  userName: 'Me',
  assignmentRole: 'INSPECTOR',
  status: 'Active',
  responseStatus: 'PENDING',
  ...overrides,
});

const mission = (overrides: Partial<Mission> = {}): Mission =>
  ({
    id: 'm1',
    missionCode: 'MS-1',
    title: 'Mission',
    routeData: '',
    assignedToUserId: '',
    assignedToUsername: '',
    droneCode: '',
    status: 'PendingAcceptance',
    description: '',
    managerId: 'mgr',
    managerUsername: '',
    createdAt: '',
    updatedAt: null,
    targets: [],
    team: [assignment()],
    ...overrides,
  }) as Mission;

describe('mission access rules', () => {
  describe('list tab visibility', () => {
    it('shows "all missions" only to managers and analysts', () => {
      expect(canViewAllMissions('SystemAdmin')).toBe(true);
      expect(canViewAllMissions('Manager')).toBe(true);
      expect(canViewAllMissions('Analyst')).toBe(true);
      expect(canViewAllMissions('Inspector')).toBe(false);
      expect(canViewAllMissions('Pilot')).toBe(false);
      expect(canViewAllMissions('Technician')).toBe(false);
      expect(canViewAllMissions('MaintenanceTechnician')).toBe(false);
    });
  });

  describe('row target', () => {
    it('opens the dashboard for managers', () => {
      expect(missionRowLink(mission(), 'Manager', 'u-mgr', 'all')).toEqual({ commands: ['/missions', 'm1'] });
    });

    it('opens the acceptance page while the field user still has to answer', () => {
      expect(missionRowLink(mission(), 'Inspector', 'u-me', 'my')).toEqual({ commands: ['/missions', 'm1', 'inspector'] });
      const postponed = mission({ status: 'Postponed', team: [assignment({ responseStatus: 'POSTPONED' })] });
      expect(missionRowLink(postponed, 'Technician', 'u-me', 'my').commands).toEqual(['/missions', 'm1', 'inspector']);
    });

    it('opens the dashboard once accepted or once the mission has started', () => {
      const accepted = mission({ team: [assignment({ responseStatus: 'ACCEPTED' })] });
      expect(missionRowLink(accepted, 'Inspector', 'u-me', 'my')).toEqual({ commands: ['/missions', 'm1'] });
      const started = mission({ status: 'InProgress' });
      expect(missionRowLink(started, 'Inspector', 'u-me', 'my')).toEqual({ commands: ['/missions', 'm1'] });
    });

    it('opens the dashboard when the user has no assignment', () => {
      expect(missionRowLink(mission(), 'Inspector', 'someone-else', 'my')).toEqual({ commands: ['/missions', 'm1'] });
    });

    it('sends analysts on the "all" tab to the results tab', () => {
      expect(missionRowLink(mission(), 'Analyst', 'u-me', 'all')).toEqual({
        commands: ['/missions', 'm1'],
        queryParams: { tab: 'results' },
      });
      expect(missionRowLink(mission(), 'Analyst', 'u-me', 'my').commands).toEqual(['/missions', 'm1', 'inspector']);
    });
  });

  describe('command console gating', () => {
    it('limits dispatch commands to managers', () => {
      expect(canManageMission('Manager')).toBe(true);
      expect(canManageMission('SystemAdmin')).toBe(true);
      expect(canManageMission('Inspector')).toBe(false);
      expect(canManageMission('Analyst')).toBe(false);
      expect(canManageMission('Technician')).toBe(false);
    });

    it('allows start/complete flight and uploads for managers and the flight crew only', () => {
      for (const role of ['Manager', 'SystemAdmin', 'Inspector', 'Pilot']) {
        expect(canOperateFlight(role)).toBe(true);
        expect(canUploadMissionMedia(role)).toBe(true);
      }
      for (const role of ['Analyst', 'Technician', 'MaintenanceTechnician']) {
        expect(canOperateFlight(role)).toBe(false);
        expect(canUploadMissionMedia(role)).toBe(false);
      }
    });

    it('limits detection review and the emergency centre to managers and analysts', () => {
      expect(canReviewDetections('Analyst')).toBe(true);
      expect(canReviewDetections('Manager')).toBe(true);
      expect(canReviewDetections('Inspector')).toBe(false);
      expect(canReviewDetections('Technician')).toBe(false);
      expect(canOpenEmergencyAlerts('Inspector')).toBe(false);
    });

    it('hides the pre-mission link for analysts and maintenance links for non-technicians', () => {
      expect(canOpenPreMissionAssessment('Analyst')).toBe(false);
      expect(canOpenPreMissionAssessment('Technician')).toBe(true);
      expect(canOpenMaintenanceTicket('MaintenanceTechnician')).toBe(true);
      expect(canOpenMaintenanceTicket('Inspector')).toBe(false);
    });

    it('only loads the user directory for roles that may read it', () => {
      expect(userDirectorySource('SystemAdmin')).toBe('all');
      expect(userDirectorySource('Manager')).toBe('assignable');
      expect(userDirectorySource('Inspector')).toBe('none');
      expect(userDirectorySource('Analyst')).toBe('none');
    });
  });

  describe('acceptance state', () => {
    it('is "none" without an assignment', () => {
      expect(acceptanceState(mission({ team: [] }), null)).toBe('none');
    });

    it('allows answering only before execution', () => {
      const m = mission();
      expect(acceptanceState(m, findMyAssignment(m, 'u-me'))).toBe('awaiting');
      const done = mission({ status: 'Completed' });
      expect(acceptanceState(done, findMyAssignment(done, 'u-me'))).toBe('closed');
      const flying = mission({ status: 'InProgress' });
      expect(acceptanceState(flying, findMyAssignment(flying, 'u-me'))).toBe('closed');
    });

    it('shows its own banner when postponed, accepted or suspended', () => {
      const postponed = mission({ status: 'Postponed', team: [assignment({ responseStatus: 'POSTPONED' })] });
      expect(acceptanceState(postponed, findMyAssignment(postponed, 'u-me'))).toBe('postponed');
      const accepted = mission({ status: 'Assigned', team: [assignment({ responseStatus: 'ACCEPTED' })] });
      expect(acceptanceState(accepted, findMyAssignment(accepted, 'u-me'))).toBe('accepted');
      const suspended = mission({ status: 'Suspended' });
      expect(acceptanceState(suspended, findMyAssignment(suspended, 'u-me'))).toBe('suspended');
    });

    it('ignores replaced assignments', () => {
      const m = mission({ team: [assignment({ responseStatus: 'REPLACED' })] });
      expect(findMyAssignment(m, 'u-me')).toBeNull();
    });
  });

  describe('default tab', () => {
    it('picks a tab per role', () => {
      expect(defaultMissionTab('Analyst', 'Completed')).toBe('results');
      expect(defaultMissionTab('Technician', 'Completed')).toBe('maintenance');
      expect(defaultMissionTab('Inspector', 'Assigned')).toBe('overview');
      expect(defaultMissionTab('Inspector', 'InProgress')).toBe('upload');
      expect(defaultMissionTab('Manager', 'InProgress')).toBe('overview');
    });
  });

  describe('activity roles and labels', () => {
    it('sends the real role', () => {
      expect(activitySenderRole('Manager', null)).toBe('MANAGER');
      expect(activitySenderRole('Analyst', null)).toBe('ANALYST');
      expect(activitySenderRole('MaintenanceTechnician', null)).toBe('TECHNICIAN');
      expect(activitySenderRole('Inspector', assignment({ assignmentRole: 'PILOT' }))).toBe('PILOT');
    });

    it('maps analyst and technician senders instead of "system"', () => {
      expect(activitySenderKind('ANALYST')).toBe('ANALYST');
      expect(activitySenderKind('TECHNICIAN')).toBe('TECHNICIAN');
      expect(activitySenderKind('SYSTEM')).toBe('SYSTEM');
      expect(activitySenderKind(undefined)).toBe('SYSTEM');
    });

    it('translates enums', () => {
      expect(assignmentRoleLabel('INSPECTOR')).toBe('Phi công / Inspector');
      expect(missionPriorityLabel('EMERGENCY')).toBe('Khẩn cấp');
      expect(towerInspectionStatusLabel('Inspected')).toBe('Đã kiểm tra');
      expect(maintenanceStatusLabel('Pending')).toBe('Chờ xử lý');
      expect(maintenanceStatusLabel('InProgress')).toBe('Đang sửa chữa');
      expect(maintenanceStatusLabel('PendingVerification')).toBe('Chờ nghiệm thu');
      expect(maintenanceStatusLabel('Completed')).toBe('Đã đóng');
    });
  });

  describe('MF02 lifecycle rules', () => {
    it('lets members answer in PendingAcceptance/Assigned/Preparing/Ready only (409 INVALID_MISSION_STATE otherwise)', () => {
      for (const status of ['PendingAcceptance', 'Assigned', 'Preparing', 'Ready'] as const) {
        const m = mission({ status });
        expect(acceptanceState(m, findMyAssignment(m, 'u-me')), status).toBe('awaiting');
      }
      for (const status of ['Draft', 'Postponed'] as const) {
        const m = mission({ status });
        expect(acceptanceState(m, findMyAssignment(m, 'u-me')), status).toBe('closed');
      }
    });

    it('keeps the whole-mission postpone for managers; members postpone their own assignment', () => {
      expect(canPostponeWholeMission('Manager')).toBe(true);
      expect(canPostponeWholeMission('SystemAdmin')).toBe(true);
      expect(canPostponeWholeMission('Inspector')).toBe(false);
    });

    it('blocks the start while a required member has not accepted', () => {
      const m = mission({
        status: 'Assigned',
        droneId: 'd1',
        plannedStart: new Date(Date.now() + 30 * 60_000).toISOString(),
        team: [
          assignment({ id: 'a1', responseStatus: 'ACCEPTED' }),
          assignment({ id: 'a2', userId: 'u-2', responseStatus: 'PENDING', isRequired: true }),
          assignment({ id: 'a3', userId: 'u-3', responseStatus: 'PENDING', isRequired: false }),
        ],
      });
      expect(pendingRequiredMembers(m).map((a) => a.id)).toEqual(['a2']);
      expect(missionStartBlocker(m, Date.now())).toContain('1 thành viên bắt buộc');
    });

    it('blocks the start more than 2 hours before the planned start and allows it inside the window', () => {
      const plannedStart = new Date('2099-01-01T10:00:00Z');
      const m = mission({
        status: 'Ready',
        droneId: 'd1',
        plannedStart: plannedStart.toISOString(),
        team: [assignment({ responseStatus: 'ACCEPTED' })],
      });
      expect(missionStartBlocker(m, plannedStart.getTime() - 3 * 3_600_000)).toContain('Chưa đến khung giờ bay');
      expect(missionStartBlocker(m, plannedStart.getTime() - 90 * 60_000)).toBeNull();
    });

    it('blocks the start without a UAV or outside the startable states', () => {
      const noDrone = mission({ status: 'Assigned', team: [assignment({ responseStatus: 'ACCEPTED' })] });
      expect(missionStartBlocker(noDrone, Date.now())).toContain('chưa có UAV');
      expect(missionStartBlocker(mission({ status: 'PendingAcceptance', droneId: 'd1' }), Date.now())).toContain('trạng thái');
    });
  });
});
