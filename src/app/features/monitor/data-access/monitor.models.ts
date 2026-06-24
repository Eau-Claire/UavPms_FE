export interface MonitorSummary { totalMissions: number; pendingMissions: number; inProgressMissions: number; completedMissions: number; totalInspections: number; totalDefects: number; criticalDefects: number }
export interface RecentDefect { id: string; missionId?: string; missionName: string; defectType: string; detectedAt: string; imageUrl?: string; severity?: string }
export interface DefectStatistic { defectType: string; count: number }
export interface MissionStatus { status: 'Pending' | 'InProgress' | 'Completed' | string; count: number }
export interface MonitorAlert { id: string; title: string; message: string; createdAt: string; isRead: boolean; severity?: string }
export interface InspectionRecord { id: string; missionId: string; missionName: string; imageUrl?: string; isDefect: boolean; defectType?: string; detectedAt: string }
export interface InspectionFilters { missionId: string; isDefect: boolean | null; fromDate: string; toDate: string; page: number; pageSize: number }
export interface PagedResponse<T> { items: readonly T[]; page: number; pageSize: number; totalCount: number; totalPages: number }
export interface DashboardSnapshot { summary: MonitorSummary; recentDefects: PagedResponse<RecentDefect>; defectStatistics: readonly DefectStatistic[]; missionStatus: readonly MissionStatus[]; alerts: readonly MonitorAlert[] }
