import axiosClient from "@services/api/axiosClient";
import type {
 ApiResponse,
 AuthTokens,
 ChangePasswordRequest,
 LoginRequest,
 LoginResult,
 ResetPasswordRequest,
 SendOtpRequest,
 User,
 UserRole,
 UserStatus,
 VerifyOtpRequest,
 VerifyOtpResponse,
} from "@shared/types";

type BackendUserRole = {
 role?: {
  roleName?: string | null;
 } | null;
};

type BackendUser = Partial<User> & {
 userRoles?: BackendUserRole[] | null;
};

type LoginResponseShape = {
 user?: BackendUser | null;
 accessToken?: string | null;
 refreshToken?: string | null;
 token?: string | null;
 tokens?: Partial<AuthTokens> | null;
 authResult?: LoginResponseShape | null;
 otpRequired?: boolean;
 email?: string | null;
};

const DEFAULT_ROLE: UserRole = "Viewer";
const DEFAULT_STATUS: UserStatus = "Active";

const unwrapData = <T>(payload: ApiResponse<T> | T): T => {
 if (payload && typeof payload === "object" && "data" in payload) {
  return (payload as ApiResponse<T>).data;
 }
 return payload as T;
};

const normalizeAuthentication = (
 payload: LoginResponseShape,
): { user: User; tokens: AuthTokens } | undefined => {
 const authResult = payload.authResult ?? payload;
 const accessToken =
  authResult.tokens?.accessToken ??
  authResult.accessToken ??
  authResult.token ??
  payload.token;
 const refreshToken =
  authResult.tokens?.refreshToken ?? authResult.refreshToken;

 if (!accessToken || !refreshToken) return undefined;

 return {
  user: normalizeUser(authResult.user ?? {}),
  tokens: { accessToken, refreshToken },
 };
};

const normalizeUser = (payload: BackendUser): User => {
 const roleName = payload.userRoles?.[0]?.role?.roleName as
  | UserRole
  | undefined;
 const now = new Date().toISOString();

 return {
  id: payload.id ?? "",
  username: payload.username ?? payload.email ?? "",
  fullName: payload.fullName ?? payload.username ?? payload.email ?? "",
  email: payload.email ?? "",
  phone: payload.phone ?? undefined,
  role: roleName ?? payload.role ?? DEFAULT_ROLE,
  status: (payload.status as UserStatus | undefined) ?? DEFAULT_STATUS,
  mustChangePassword: payload.mustChangePassword ?? false,
  createdAt: payload.createdAt ?? now,
  updatedAt: payload.updatedAt ?? payload.createdAt ?? now,
 };
};

const normalizeVerificationResult = (payload: unknown): VerifyOtpResponse => {
 if (payload == null) return {};

 if (typeof payload === "string") {
  return { verificationToken: payload };
 }

 if (payload && typeof payload === "object") {
  const value = payload as LoginResponseShape & {
   verificationToken?: string;
   resetToken?: string;
  };
  const verificationToken =
   value.verificationToken ?? value.token ?? value.resetToken;
  const authentication = normalizeAuthentication(value);
  return {
   ...(verificationToken ? { verificationToken } : {}),
   ...(authentication ? { authentication } : {}),
  };
 }

 return {};
};

export const authService = {
 login: async (
  credentials: LoginRequest,
 ): Promise<LoginResult> => {
  const response = await axiosClient.post<
   ApiResponse<LoginResponseShape> | LoginResponseShape
  >("/auth/login", credentials);
  const responseMessage =
   response.data && typeof response.data === "object" && "message" in response.data
    ? String(response.data.message)
    : "";
  const data = unwrapData(response.data);
  const loginResult = data.authResult ?? data;
  if (
   loginResult.otpRequired ||
   responseMessage.toLowerCase().includes("otp required")
  ) {
   return {
    otpRequired: true,
    email: loginResult.email ?? credentials.email,
   };
  }
  const authentication = normalizeAuthentication(data);
  if (!authentication) throw new Error("Auth response missing tokens");
  return { otpRequired: false, ...authentication };
 },

 sendOtp: async (data: SendOtpRequest): Promise<void> => {
  await axiosClient.post("/auth/otp/send", data);
 },

 verifyOtp: async (data: VerifyOtpRequest): Promise<VerifyOtpResponse> => {
  const response = await axiosClient.post<ApiResponse<unknown> | unknown>(
   "/auth/otp/verify",
   data,
  );
  const result = normalizeVerificationResult(unwrapData(response.data));
  if (data.purpose === "Login" && !result.authentication) {
   throw new Error("Login OTP response missing authentication");
  }
  return result;
 },

 resetPassword: async (data: ResetPasswordRequest): Promise<void> => {
  await axiosClient.post("/auth/reset-password", data);
 },

 changePassword: async (data: ChangePasswordRequest): Promise<User | null> => {
  const response = await axiosClient.post<
   ApiResponse<BackendUser | null> | BackendUser | null
  >("/users/change-password", { newPassword: data.newPassword });
  const payload = unwrapData(response.data);
  return payload ? normalizeUser(payload) : null;
 },
};
