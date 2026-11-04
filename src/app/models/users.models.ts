import { UserRole } from './auth.models';

export type UserStatus = 'Active' | 'Inactive' | 'Locked';

export interface UserRecord {
  readonly id: string;
  readonly username: string;
  readonly fullName: string;
  readonly email: string;
  readonly phone?: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly createdAt?: string;
}

export interface CreateUserRequest {
  readonly fullName: string;
  readonly email: string;
  readonly phone?: string;
  readonly role: UserRole;
}

/** A region in a user's default geographic scope (UserGeographicScopeRegionDto). */
export interface UserScopeRegion {
  readonly regionId: string;
  readonly code: string;
  readonly name: string;
  readonly type: string;
}

/** GET/PUT /users/{id}/geographic-scopes (UserGeographicScopesDto). */
export interface UserGeographicScopes {
  readonly userId: string;
  readonly regions: readonly UserScopeRegion[];
}

