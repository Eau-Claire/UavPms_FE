export const USER_ROLES = ['Admin', 'Manager', 'Technician', 'Viewer'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['Active', 'Inactive', 'Locked'] as const;

export type UserStatus = (typeof USER_STATUSES)[number];

export interface User {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  mustChangePassword?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserRequest {
  fullName: string;
  role: UserRole;
}

export interface UpdateUserRequest {
  role?: UserRole;
  status?: UserStatus;
}

export interface CreateUserResponse {
  user: User;
  username: string;
  temporaryPassword: string;
}

export interface ResetPasswordResponse {
  username: string;
  temporaryPassword: string;
}
