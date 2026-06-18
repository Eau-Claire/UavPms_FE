export type UserRole = 'Admin' | 'Manager' | 'Technician' | 'Viewer';

export type UserStatus = 'Active' | 'Inactive' | 'Locked';

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
