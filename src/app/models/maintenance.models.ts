import { BaseAuditableEntity } from './api.models';

/** Maintenance tickets (MF04) — OperationsService MaintenanceTicketController. */

export type TicketStatus = 'Open' | 'Assigned' | 'InProgress' | 'PendingVerification' | 'Closed' | 'Cancelled' | 'Resolved';
export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Emergency';

export const TICKET_STATUSES: readonly TicketStatus[] = ['Open', 'Assigned', 'InProgress', 'PendingVerification', 'Closed', 'Cancelled'];
export const TICKET_PRIORITIES: readonly TicketPriority[] = ['Low', 'Medium', 'High', 'Emergency'];

export interface MaintenancePerson {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
}

export interface MaintenanceTowerRef {
  readonly id: string;
  readonly towerCode: string;
  readonly poleType?: string;
  readonly regionId?: string;
}

/** Percentages (0..100) when `isNormalized`, otherwise pixels of the original image. */
export interface MaintenanceBoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly isNormalized?: boolean;
}

export interface MaintenanceAnomalyRef {
  readonly id: string;
  readonly validationStatus: string;
  /** 0..100. */
  readonly confidenceScore: number;
  readonly mediaId?: string;
  readonly missionId?: string;
  readonly categoryCode?: string;
  readonly categoryName?: string;
  readonly isEmergencyClass: boolean;
  readonly imageUrl?: string;
  readonly cropUrl?: string;
  readonly boundingBox?: MaintenanceBoundingBox;
  readonly analystNotes?: string;
  readonly validatedAt?: string;
}

export interface MaintenanceProof extends BaseAuditableEntity {
  readonly id: string;
  readonly proofType: string;
  readonly fileUrl: string;
  readonly technicianNotes: string;
  readonly uploadedAt: string;
  readonly createdBy?: string | null;
  readonly updatedBy?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export interface MaterialLog extends BaseAuditableEntity {
  readonly id: string;
  readonly componentName: string;
  readonly componentCode: string;
  readonly quantityUsed: number;
  readonly unit: string;
  readonly fieldObservations: string;
  readonly loggedAt: string;
  readonly createdBy?: string | null;
  readonly updatedBy?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export interface MaintenanceTicket extends BaseAuditableEntity {
  readonly id: string;
  readonly ticketCode: string;
  readonly anomalyId: string;
  readonly towerId?: string;
  readonly managerId: string;
  readonly technicianId?: string;
  readonly status: TicketStatus | string;
  readonly priority: TicketPriority | string;
  readonly description: string;
  readonly dueDate?: string;
  readonly assignedAt?: string;
  readonly startedAt?: string;
  readonly resolvedAt?: string;
  readonly createdAt: string;
  readonly updatedAt?: string | null;
  readonly createdBy?: string | null;
  readonly updatedBy?: string | null;
  /** Only filled by GET /maintenance/tickets/{id}. */
  readonly tower?: MaintenanceTowerRef;
  readonly anomaly?: MaintenanceAnomalyRef;
  readonly manager?: MaintenancePerson;
  readonly technician?: MaintenancePerson;
  readonly proofs: readonly MaintenanceProof[];
  readonly materials: readonly MaterialLog[];
}

/** `pageIndex` is 0-based, as in the backend. */
export interface MaintenanceTicketPage {
  readonly items: readonly MaintenanceTicket[];
  readonly totalCount: number;
  readonly pageIndex: number;
  readonly pageSize: number;
}

export interface MaintenanceTicketFilters {
  readonly pageIndex: number;
  readonly pageSize: number;
  readonly status?: TicketStatus | '';
  readonly priority?: TicketPriority | '';
}

export interface TechnicianSummary {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly activeTicketCount: number;
}

export interface AssignTechnicianRequest {
  readonly technicianId: string;
  /** yyyy-MM-dd (local day) or an ISO instant. */
  readonly dueDate?: string;
}

export interface LogMaterialRequest {
  readonly componentName: string;
  readonly componentCode?: string;
  readonly quantityUsed: number;
  readonly unit: string;
  readonly fieldObservations?: string;
}
