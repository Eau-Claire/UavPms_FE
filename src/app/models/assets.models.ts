export type AssetType = 'Insulator' | 'Cable' | 'Tower Structure' | 'Vibration Damper' | string;
export type RiskLevel = 'Critical Risk' | 'High Risk' | 'Medium Risk' | 'Low Risk' | string;
export type AssetStatus = 'Operational' | 'Maintenance' | 'Decommissioned' | string;
export type MaintenancePriority = 'Immediate' | 'High' | 'Medium' | 'Routine' | 'Low';

export interface AssetAnomaly {
  readonly id: string;
  readonly categoryName: string;
  readonly confidenceScore: number;
  readonly validationStatus: string;
  readonly createdAt: string;
}

export interface AssetHealthItem {
  readonly id: string;
  readonly towerId: string;
  readonly towerCode?: string;
  readonly assetType: AssetType;
  readonly assetCode: string;
  readonly status: AssetStatus;
  readonly currentHealthScore: number;
  readonly riskLevel: RiskLevel;
  readonly lastInspectedAt?: string;
  readonly maintenancePriority?: MaintenancePriority;
  readonly activeDefectsCount?: number;
}

export interface AssetDetail extends AssetHealthItem {
  readonly activeAnomalies: readonly AssetAnomaly[];
}

export interface AssetFilters {
  readonly page: number;
  readonly pageSize: number;
  readonly towerId?: string;
  readonly assetType?: string;
  readonly status?: string;
  readonly riskLevel?: string;
  readonly minHealthScore?: number;
  readonly maxHealthScore?: number;
  readonly search?: string;
  readonly sortBy?: 'currentHealthScore' | 'riskLevel' | 'assetCode' | 'lastInspectedAt';
  readonly sortOrder?: 'asc' | 'desc';
}

export interface AssetPage {
  readonly items: readonly AssetHealthItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface AssetDashboardSummary {
  readonly totalAssets: number;
  readonly criticalRiskCount: number;
  readonly highRiskCount: number;
  readonly mediumRiskCount: number;
  readonly lowRiskCount: number;
  readonly averageHealthScore: number;
  readonly criticalDefectsCount: number;
}

export interface AssetHealthSummary {
  readonly totalAssets: number;
  readonly criticalRiskCount: number;
  readonly highRiskCount: number;
  readonly mediumRiskCount: number;
  readonly lowRiskCount: number;
  readonly averageHealthScore: number;
}

export interface TowerLookup {
  readonly id: string;
  readonly code: string;
  readonly lineId?: string;
  readonly lineName?: string;
}

export interface RegionLookup {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface LineLookup {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly regionId?: string;
}

export interface GeoJsonPolygon {
  readonly type: 'Polygon';
  readonly coordinates: readonly (readonly (readonly [number, number])[])[];
}

export interface SpatialAssetQueryRequest {
  readonly geometry: GeoJsonPolygon;
}

export interface SelectableAsset {
  readonly assetId: string;
  readonly code: string;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly status: AssetStatus;
}
