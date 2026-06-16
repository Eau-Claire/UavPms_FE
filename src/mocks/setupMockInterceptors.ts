import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse, AuthTokens, User, UserRole, UserStatus } from '@types';
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

  // ── Auth ───────────────────────────────────────────────────────────────────
  if (url.includes('/auth/login') && method === 'post') {
    const { username, password } = body;
    const user = mockUserStore.findByUsername(username);

    if (!user || user.password !== password) {
      return mockError(401, 'Sai tên đăng nhập hoặc mật khẩu');
    }

    if (user.status === 'Locked' || user.status === 'Inactive') {
      return mockError(423, 'Tài khoản đã bị vô hiệu hóa hoặc khóa');
    }

    const mockTokens: AuthTokens = {
      accessToken: `mock_access_${username}`,
      refreshToken: `mock_refresh_${username}`,
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pwd, ...mockUser } = user;

    return Promise.resolve(
      mockSuccess({ user: mockUser as User, tokens: mockTokens }, 'Đăng nhập thành công'),
    );
  }

  if (url.includes('/auth/logout') && method === 'post') {
    return Promise.resolve(mockSuccess(null, 'Đăng xuất thành công'));
  }

  if (url.includes('/auth/refresh') && method === 'post') {
    return Promise.resolve(
      mockSuccess(
        { accessToken: 'mock_new_access_token', refreshToken: 'mock_new_refresh_token' },
        'Token đã được làm mới',
      ),
    );
  }

  if (url.includes('/auth/change-password') && method === 'post') {
    const { currentPassword, newPassword } = body;
    const authHeader =
      (config.headers?.Authorization as string | undefined) ??
      (config.headers?.authorization as string | undefined);
    const tokenUsername = authHeader?.replace(/^Bearer\s+mock_access_/, '');

    if (!tokenUsername) {
      return mockError(401, 'Chưa đăng nhập');
    }

    const updated = mockUserStore.changePassword(tokenUsername, currentPassword, newPassword);

    if (!updated) {
      return mockError(400, 'Không thể đổi mật khẩu');
    }

    return Promise.resolve(mockSuccess(updated, 'Đổi mật khẩu thành công'));
  }

  // ── Users CRUD ─────────────────────────────────────────────────────────────
  if (url.match(/\/users\/?$/) && method === 'get') {
    return Promise.resolve(mockSuccess(mockUserStore.getAll(), 'Lấy danh sách thành công'));
  }

  if (url.match(/\/users\/?$/) && method === 'post') {
    const { fullName, role } = body as { fullName: string; role: UserRole };
    if (!fullName?.trim() || !role) {
      return mockError(400, 'Họ tên và vai trò là bắt buộc');
    }

    const { user, temporaryPassword } = mockUserStore.create(fullName, role);
    return Promise.resolve(
      mockSuccess(
        { user, username: user.username, temporaryPassword },
        'Tạo tài khoản thành công',
        201,
      ),
    );
  }

  const userIdMatch = url.match(/\/users\/([^/]+)/);
  if (userIdMatch) {
    const userId = userIdMatch[1];

    if (url.includes('/reset-password') && method === 'post') {
      const result = mockUserStore.resetPassword(userId);
      if (!result) return mockError(404, 'Không tìm thấy người dùng');
      return Promise.resolve(mockSuccess(result, 'Đặt lại mật khẩu thành công'));
    }

    if (method === 'patch') {
      const { role, status } = body as { role?: UserRole; status?: UserStatus };
      const updated = mockUserStore.update(userId, { role, status });
      if (!updated) return mockError(404, 'Không tìm thấy người dùng');
      return Promise.resolve(mockSuccess(updated, 'Cập nhật thành công'));
    }

    if (method === 'delete') {
      const record = mockUserStore.findById(userId);
      if (!record) return mockError(404, 'Không tìm thấy người dùng');
      if (record.role === 'Admin') {
        return mockError(403, 'Không thể xóa tài khoản quản trị viên');
      }
      mockUserStore.delete(userId);
      return Promise.resolve(mockSuccess(null, 'Xóa người dùng thành công'));
    }
  }

  return null;
};

/**
 * Cài đặt mock interceptor cho axiosInstance.
 * Chỉ được gọi khi `VITE_USE_MOCK=true` (môi trường development).
 */
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
