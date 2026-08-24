export type MissionStatus = 'Pending' | 'Executing' | 'Completed' | 'Failed' | 'Cancelled' | string;

export interface Mission {
  readonly id: string;
  readonly missionCode: string;
  readonly title: string;
  readonly routeData: string;
  readonly assignedToUserId: string;
  readonly assignedToUsername: string;
  readonly droneCode: string;
  readonly status: MissionStatus;
  readonly description: string;
  readonly managerId: string;
  readonly managerUsername: string;
  readonly createdAt: string;
  readonly updatedAt: string | null;
}

export interface MissionPage {
  readonly items: readonly Mission[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly totalPages: number;
}

export interface MissionMutationRequest {
  readonly title?: string;
  readonly routeData?: string;
  readonly assignedToUserId: string;
  readonly droneCode?: string;
  readonly status?: string;
  readonly description?: string;
}
