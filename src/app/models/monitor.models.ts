export interface MonitorSummary {
  readonly totalMissions: number;
  readonly pendingMissions: number;
  readonly inProgressMissions: number;
  readonly completedMissions: number;
  readonly totalInspections: number;
  readonly totalDefects: number;
  readonly criticalDefects: number;
}

export interface RecentDefect {
  readonly id: string;
  readonly missionId?: string;
  readonly missionName: string;
  readonly defectType: string;
  readonly detectedAt: string;
  readonly imageUrl?: string;
  readonly severity?: string;
}

export interface DefectStatistic {
  readonly defectType: string;
  readonly count: number;
}

export interface MissionStatus {
  readonly status: 'Pending' | 'InProgress' | 'Completed' | string;
  readonly count: number;
}

export interface MonitorAlert {
  readonly id: string;
  readonly title: string;
  readonly message: string;
  readonly createdAt: string;
  readonly isRead: boolean;
  readonly severity?: string;
}

export interface InspectionRecord {
  readonly id: string;
  readonly missionId: string;
  readonly missionName: string;
  readonly imageUrl?: string;
  readonly isDefect: boolean;
  readonly defectType?: string;
  readonly detectedAt: string;
}

export interface InspectionFilters {
  readonly missionId: string;
  readonly isDefect: boolean | null;
  readonly fromDate: string;
  readonly toDate: string;
  readonly page: number;
  readonly pageSize: number;
}

export interface PagedResponse<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly totalPages: number;
}

export interface DashboardSnapshot {
  readonly summary: MonitorSummary;
  readonly recentDefects: PagedResponse<RecentDefect>;
  readonly defectStatistics: readonly DefectStatistic[];
  readonly missionStatus: readonly MissionStatus[];
  readonly alerts: readonly MonitorAlert[];
}
