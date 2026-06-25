import { UserRole } from '../../auth/auth.models';

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
