/**
 * Infrastructure models after ERD v2.2: Region → Tower only.
 * Substations, transmission lines, management units, asset components,
 * health score and risk level no longer exist in the backend.
 */

/** Mirrors the backend TowerDto. */
export interface TowerSummary {
  readonly id: string;
  readonly regionId: string;
  readonly regionName?: string;
  readonly towerCode: string;
  readonly poleType?: string;
  readonly address?: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface TowerFilters {
  readonly page: number;
  readonly pageSize: number;
  readonly regionId?: string;
  readonly search?: string;
}

export interface PaginationMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface TowerPage {
  readonly items: readonly TowerSummary[];
  readonly pagination: PaginationMeta;
}

/** Body of POST /towers and PUT /towers/{id}. */
export interface TowerUpsertRequest {
  readonly regionId: string;
  readonly towerCode: string;
  readonly poleType?: string;
  readonly address?: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface TowerImportResult {
  readonly importedCount: number;
  readonly skippedCount: number;
}

/** detected_anomalies.validation_status values accepted by GET /towers/{id}/history. */
export type AnomalyValidationStatus = 'Pending' | 'Confirmed' | 'Rejected' | 'Resolved';

export interface TowerHistoryFilters {
  readonly page: number;
  readonly pageSize: number;
  readonly validationStatus?: AnomalyValidationStatus | '';
  /** ISO date (yyyy-MM-dd) or date-time. */
  readonly from?: string;
  readonly to?: string;
}

export interface TowerAnomaly {
  readonly id: string;
  readonly mediaId: string;
  readonly missionId: string;
  readonly categoryCode?: string;
  readonly categoryName?: string;
  readonly confidenceScore: number;
  readonly validationStatus: string;
  readonly aiSource: string;
  readonly imageUrl?: string;
  readonly cropUrl?: string;
  readonly detectedAt: string;
  readonly validatedAt?: string;
}

export interface TowerMaintenanceProof {
  readonly id: string;
  readonly proofType: string;
  readonly fileUrl: string;
  readonly technicianNotes: string;
  readonly uploadedAt: string;
}

export interface TowerMaterialLog {
  readonly id: string;
  readonly componentCode: string;
  readonly componentName: string;
  readonly quantityUsed: number;
  readonly unit: string;
  readonly loggedAt: string;
}

export interface TowerMaintenanceRecord {
  readonly id: string;
  readonly ticketCode: string;
  readonly anomalyId: string;
  readonly status: string;
  readonly priority: string;
  readonly description: string;
  readonly managerId: string;
  readonly technicianId?: string;
  readonly createdAt: string;
  readonly dueDate?: string;
  readonly startedAt?: string;
  readonly resolvedAt?: string;
  readonly proofs: readonly TowerMaintenanceProof[];
  readonly materials: readonly TowerMaterialLog[];
}

/** Live counts for the whole tower (not affected by the history filters). */
export interface TowerHistoryStats {
  readonly totalAnomalies: number;
  readonly pendingAnomalies: number;
  readonly confirmedAnomalies: number;
  readonly openAnomalies: number;
  readonly totalTickets: number;
  readonly openTickets: number;
  readonly inProgressTickets: number;
  readonly activeTickets: number;
  readonly lastInspectedAt?: string;
}

export interface TowerHistory {
  readonly tower: TowerSummary;
  readonly anomalies: readonly TowerAnomaly[];
  readonly maintenanceHistory: readonly TowerMaintenanceRecord[];
  readonly stats: TowerHistoryStats;
  readonly anomaliesPagination: PaginationMeta;
  readonly maintenancePagination: PaginationMeta;
}

export interface RegionLookup {
  readonly id: string;
  readonly name: string;
}

export interface GeoJsonPolygon {
  readonly type: 'Polygon';
  readonly coordinates: readonly (readonly (readonly [number, number])[])[];
}

/** Body of POST /towers/spatial-query. */
export interface SpatialTowerQueryRequest {
  readonly geometry: GeoJsonPolygon;
  readonly filters?: { readonly regionId?: string };
}

/**
 * A tower candidate found by drawing a region on the GIS map.
 * Result row of POST /towers/spatial-query on the GIS page. `towerId` is the tower id.
 */
export interface SelectableAsset {
  readonly towerId: string;
  readonly code: string;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly status?: string;
}
