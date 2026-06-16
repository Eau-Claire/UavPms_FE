import type { User, AuthTokens } from '@types';

/**
 * Keys localStorage dùng trong app — tập trung để tránh typo và dễ đổi tên.
 * Không export ra ngoài; dùng các hàm trong `storage` object.
 */
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'accessToken',
  REFRESH_TOKEN: 'refreshToken',
  USER: 'user',
} as const;

/**
 * Utility quản lý dữ liệu xác thực trong localStorage.
 *
 * Chỉ thao tác với đúng các key của app này.
 * KHÔNG dùng `localStorage.clear()` để tránh xóa data của thư viện khác trên cùng domain.
 *
 * @example
 * storage.setToken(tokens); // lưu cả access + refresh token
 * const token = storage.getAccessToken(); // đọc access token
 * storage.clear(); // xóa phiên đăng nhập
 */
export const storage = {
  /**
   * Lưu cả access token và refresh token.
   * @param tokens - Object chứa accessToken và refreshToken
   */
  setToken: (tokens: AuthTokens) => {
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken);
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken);
  },

  /** Lấy access token (dùng để gắn vào header Authorization). */
  getAccessToken: (): string | null => localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN),

  /** Lấy refresh token (dùng để làm mới access token khi hết hạn). */
  getRefreshToken: (): string | null => localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN),

  /**
   * @deprecated Dùng `getRefreshToken()` thay thế để rõ ý nghĩa hơn.
   * Giữ lại để không làm vỡ code cũ trong quá trình migration.
   */
  getToken: (): string | null => localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN),

  /** Lưu thông tin người dùng (sau khi đăng nhập thành công). */
  setUser: (user: User) => {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  },

  /**
   * Lấy thông tin người dùng đã lưu.
   * @returns User object hoặc null nếu chưa đăng nhập / dữ liệu bị lỗi
   */
  getUser: (): User | null => {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      // Dữ liệu bị corrupt — xóa để tránh lỗi lặp lại
      localStorage.removeItem(STORAGE_KEYS.USER);
      return null;
    }
  },

  /**
   * Xóa toàn bộ dữ liệu phiên đăng nhập.
   * Chỉ xóa các key của app này — KHÔNG dùng localStorage.clear().
   */
  clear: () => {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
  },
};
