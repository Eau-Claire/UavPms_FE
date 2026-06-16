import axios from 'axios';
import { storage } from '@utils/storage';
import type { ApiResponse, AuthTokens } from '@types';
import { setupMockInterceptors } from '@mocks/setupMockInterceptors';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

/**
 * Instance axios dùng chung cho toàn bộ app.
 *
 * Tính năng tích hợp sẵn:
 * - Tự động gắn Bearer token vào mọi request
 * - Tự động làm mới access token khi nhận 401 (silent refresh)
 * - Redirect về login khi không thể làm mới token
 * - Mock interceptor khi VITE_USE_MOCK=true
 *
 * @example
 * import axiosClient from '@services/api/axiosClient';
 * const res = await axiosClient.get('/users');
 */
export const axiosClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Kích hoạt mock interceptor khi chạy development (xem src/mocks/setupMockInterceptors.ts)
if (USE_MOCK) {
  setupMockInterceptors(axiosClient);
}

// ─── Request Interceptor ──────────────────────────────────────────────────────

/**
 * Tự động gắn access token vào header Authorization trước mỗi request.
 * Dùng storage.getAccessToken() thay vì truy cập localStorage trực tiếp.
 */
axiosClient.interceptors.request.use((config) => {
  const token = storage.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response Interceptor ─────────────────────────────────────────────────────

/**
 * Xử lý lỗi 401 (token hết hạn):
 * 1. Thử làm mới token với refreshToken
 * 2. Nếu thành công: retry request gốc tự động
 * 3. Nếu thất bại: xóa session và redirect về login
 *
 * Không áp dụng cho endpoint /auth/login (đang lấy token lần đầu).
 */
axiosClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const is401 = error.response?.status === 401;
    const isLoginEndpoint = originalRequest?.url?.includes('/auth/login');

    if (is401 && !originalRequest._retry && !isLoginEndpoint) {
      originalRequest._retry = true;

      try {
        const refreshToken = storage.getRefreshToken();
        if (!refreshToken) throw new Error('No refresh token available');

        // Dùng axios trực tiếp (không dùng axiosClient) để tránh interceptor này chạy lại
        const response = await axios.post<ApiResponse<AuthTokens>>(
          `${API_BASE_URL}/auth/refresh`,
          { refreshToken },
        );

        const newTokens = response.data.data;
        storage.setToken(newTokens);

        originalRequest.headers.Authorization = `Bearer ${newTokens.accessToken}`;
        return axiosClient(originalRequest);
      } catch {
        storage.clear();
        // Hard reload về login để clear toàn bộ React state
        // Dùng window.location.href vì interceptor không có access đến React Router
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);

export default axiosClient;
