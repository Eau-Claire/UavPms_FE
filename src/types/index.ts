/** Vai trò người dùng trong hệ thống */
export type UserRole = 'Admin' | 'Manager' | 'Technician' | 'Viewer';

/** Trạng thái tài khoản người dùng */
export type UserStatus = 'Active' | 'Inactive' | 'Locked';

export interface User {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  /** Bắt buộc đổi mật khẩu khi đăng nhập lần đầu hoặc sau khi admin reset */
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

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

/** Chuẩn response trả về từ API */
export interface ApiResponse<T = unknown> {
  statusCode: number;
  message: string;
  data: T;
  success: boolean;
}

/**
 * Lỗi từ API — type-safe thay cho `string | null` cũ.
 * Giữ lại statusCode để component xử lý các trường hợp lỗi cụ thể (401, 423...).
 */
export interface ApiError {
  statusCode: number;
  message: string;
  success: false;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** null khi chưa có lỗi; ApiError khi đăng nhập thất bại */
  error: ApiError | null;
}
