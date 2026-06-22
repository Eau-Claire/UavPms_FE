import type { User } from "./user";
import type { ApiError } from "./api";

export interface ChangePasswordRequest {
 currentPassword: string;
 newPassword: string;
}

export interface AuthTokens {
 accessToken: string;
 refreshToken: string;
}

export interface LoginRequest {
 email: string;
 password: string;
}

export type LoginResult =
 | { otpRequired: true; email: string }
 | { otpRequired: false; user: User; tokens: AuthTokens };

export type OtpPurpose =
 | "Login"
 | "ForgotPassword"
 | "EmailVerification"
 | "ChangePassword"
 | "ChangeEmail"
 | "DeleteAccount";

export interface SendOtpRequest {
 email: string;
 purpose: OtpPurpose;
 isResend?: boolean;
}

export interface VerifyOtpRequest {
 email: string;
 otp: string;
 purpose: OtpPurpose;
}

export interface VerifyOtpResponse {
 verificationToken?: string;
 authentication?: {
  user: User;
  tokens: AuthTokens;
 };
}

export interface ResetPasswordRequest {
 verificationToken: string;
 newPassword: string;
}

export interface AuthState {
 user: User | null;
 isAuthenticated: boolean;
 isLoading: boolean;
 error: ApiError | null;
}
