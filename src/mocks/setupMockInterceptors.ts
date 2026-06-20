import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse, AuthTokens, User, UserRole, UserStatus } from '@shared/types';
import { mockUserStore } from './mockUserStore';

const parseBody = (data: unknown): Record<string, string> => {
  if (typeof data === 'string') {
    return JSON.parse(data) as Record<string, string>;
  }
  return (data as Record<string, string>) ?? {};
};

const mockSuccess = <T>(data: T, message: string, statusCode = 200) => ({
  data: { statusCode, message, data, success: true } as ApiResponse<T>,
});

const mockError = (status: number, message: string) =>
  Promise.reject({
    response: {
      status,
      data: { statusCode: status, message, success: false },
    },
  });

const handleMockRequest = (config: InternalAxiosRequestConfig) => {
  const url = config.url ?? '';
  const method = (config.method ?? 'get').toLowerCase();
  const body = parseBody(config.data);

  if (url.includes('/auth/login') && method === 'post') {
    const { email, password } = body;
    const user = mockUserStore.findByEmail(email);

    if (!user || user.password !== password) {
      return mockError(401, 'Invalid email or password');
    }

    if (user.status === 'Locked' || user.status === 'Inactive') {
      return mockError(423, 'Account is locked or inactive');
    }

    const mockTokens: AuthTokens = {
      accessToken: `mock_access_${email}`,
      refreshToken: `mock_refresh_${email}`,
    };

    const { password: _pwd, ...mockUser } = user;
    void _pwd;

    return Promise.resolve(mockSuccess({ user: mockUser as User, tokens: mockTokens }, 'Login ok'));
  }

  if (url.includes('/auth/refresh-token') && method === 'post') {
    return Promise.resolve(
      mockSuccess(
        { accessToken: 'mock_new_access_token', refreshToken: 'mock_new_refresh_token' },
        'Token refreshed',
      ),
    );
  }

  if (url.includes('/auth/otp/send') && method === 'post') {
    return Promise.resolve(mockSuccess(null, 'OTP sent'));
  }

  if (url.includes('/auth/otp/verify') && method === 'post') {
    const { email, otp, purpose } = body;
    if (!otp || otp.length !== 6) {
      return mockError(400, 'Invalid OTP');
    }
    const mockUser = mockUserStore.findByEmail(email);
    const data = purpose === 'ForgotPassword'
      ? { token: 'mock_verification_token', authResult: null }
      : {
          token: null,
          authResult: {
            accessToken: `mock_access_${email}`,
            refreshToken: `mock_refresh_${email}`,
            user: mockUser ?? { id: 'mock-user', email, username: email, fullName: email },
          },
        };
    return Promise.resolve(mockSuccess(data, 'OTP verified'));
  }

  if (url.includes('/auth/reset-password') && method === 'post') {
    const { verificationToken, newPassword } = body;
    if (!verificationToken || !newPassword) {
      return mockError(400, 'Invalid reset password request');
    }
    return Promise.resolve(mockSuccess(null, 'Password reset'));
  }

  if (url.includes('/users/change-password') && method === 'post') {
    const { currentPassword, newPassword } = body;
    const authHeader =
      (config.headers?.Authorization as string | undefined) ??
      (config.headers?.authorization as string | undefined);
    const tokenEmail = authHeader?.replace(/^Bearer\s+mock_access_/, '');

    if (!tokenEmail) {
      return mockError(401, 'Unauthenticated');
    }

    const record = mockUserStore.findByEmail(tokenEmail);
    const current = currentPassword || record?.password || '';
    const updated = record ? mockUserStore.changePassword(record.username, current, newPassword) : null;

    if (!updated) {
      return mockError(400, 'Cannot change password');
    }

    return Promise.resolve(mockSuccess(updated, 'Password changed'));
  }

  if (url.match(/\/users\/?$/) && method === 'get') {
    return Promise.resolve(mockSuccess(mockUserStore.getAll(), 'Users loaded'));
  }

  if (url.match(/\/users\/?$/) && method === 'post') {
    const { fullName, email, phone, role, temporaryPassword } = body as {
      fullName: string;
      email: string;
      phone?: string;
      role: UserRole;
      temporaryPassword?: string;
    };
    if (!fullName?.trim() || !email?.trim() || !role) {
      return mockError(400, 'Full name, email, and role are required');
    }

    const result = mockUserStore.create(fullName, role, email, phone, temporaryPassword);
    return Promise.resolve(
      mockSuccess(
        { user: result.user, username: result.user.username, temporaryPassword: result.temporaryPassword },
        'User created',
        201,
      ),
    );
  }

  const userIdMatch = url.match(/\/users\/([^/]+)/);
  if (userIdMatch) {
    const userId = userIdMatch[1];

    if (url.includes('/reset-password') && method === 'post') {
      const result = mockUserStore.resetPassword(userId);
      if (!result) return mockError(404, 'User not found');
      return Promise.resolve(mockSuccess(result, 'Password reset'));
    }

    if (method === 'patch') {
      const { role, status } = body as { role?: UserRole; status?: UserStatus };
      const updated = mockUserStore.update(userId, { role, status });
      if (!updated) return mockError(404, 'User not found');
      return Promise.resolve(mockSuccess(updated, 'User updated'));
    }

    if (method === 'delete') {
      const record = mockUserStore.findById(userId);
      if (!record) return mockError(404, 'User not found');
      if (record.role === 'Admin') {
        return mockError(403, 'Cannot delete admin account');
      }
      mockUserStore.delete(userId);
      return Promise.resolve(mockSuccess(null, 'User deleted'));
    }
  }

  return null;
};

const toAxiosResponse = (
  config: InternalAxiosRequestConfig,
  result: { data: ApiResponse<unknown> },
  status = 200,
): AxiosResponse<ApiResponse<unknown>> => ({
  data: result.data,
  status,
  statusText: 'OK',
  headers: {},
  config,
});

export const setupMockInterceptors = (axiosInstance: AxiosInstance) => {
  axiosInstance.interceptors.request.use((config) => {
    const handled = handleMockRequest(config);
    if (!handled) return config;

    config.adapter = () =>
      handled.then((result) => {
        const status = result.data.statusCode ?? 200;
        return toAxiosResponse(config, result, status);
      });

    return config;
  });

  axiosInstance.interceptors.response.use(
    (response) => response,
    (error) => {
      const { config } = error;
      if (!config?.url) return Promise.reject(error);

      const handled = handleMockRequest(config);
      if (!handled) return Promise.reject(error);

      return handled.then((result) => {
        const status = result.data.statusCode ?? 200;
        return toAxiosResponse(config, result, status);
      });
    },
  );
};
