export interface ApiEnvelope<T> { readonly data: T; readonly message?: string; readonly success?: boolean; readonly statusCode?: number }
export interface PageResult<T> { readonly items: readonly T[]; readonly page: number; readonly pageSize: number; readonly totalCount: number; readonly totalPages: number }
export const unwrapApiData = <T>(value: unknown): T => value && typeof value === 'object' && 'data' in value ? (value as ApiEnvelope<T>).data : value as T;

/**
 * Standard enterprise auditable fields applied across all database tables.
 * Soft deletion uses updatedAt (deletedAt unified into updatedAt).
 */
export interface BaseAuditableEntity {
  readonly id: string;
  readonly createdBy?: string | null;
  readonly updatedBy?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}
