import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { isAxiosError } from 'axios';
import axiosClient from '@services/api/axiosClient';
import { storage } from '@utils/storage';
import type {
  AuthState,
  User,
  LoginRequest,
  ApiResponse,
  AuthTokens,
  ApiError,
  ChangePasswordRequest,
} from '@types';

const storedUser = storage.getUser();
const hasToken = !!storage.getAccessToken();

const initialState: AuthState = {
  user: storedUser,
  isAuthenticated: hasToken && !!storedUser,
  isLoading: false,
  error: null,
};

/**
 * Thunk đăng nhập.
 * Gọi POST /auth/login, lưu tokens + user vào storage khi thành công.
 *
 * @rejects ApiError khi server trả về lỗi (401 sai mật khẩu, 423 bị khóa, v.v.)
 */
export const loginThunk = createAsyncThunk<
  { user: User; tokens: AuthTokens },
  LoginRequest,
  { rejectValue: ApiError }
>('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const response = await axiosClient.post<ApiResponse<{ user: User; tokens: AuthTokens }>>(
      '/auth/login',
      credentials,
    );

    const { user, tokens } = response.data.data;

    // Lưu token và user vào localStorage thông qua storage utility (tập trung, không hardcode key)
    storage.setToken(tokens);
    storage.setUser(user);

    return { user, tokens };
  } catch (error) {
    if (isAxiosError(error) && error.response) {
      return rejectWithValue(error.response.data as ApiError);
    }
    return rejectWithValue({ statusCode: 0, message: 'Lỗi kết nối mạng', success: false });
  }
});

/**
 * Thunk đăng xuất.
 * Gọi POST /auth/logout để invalidate token phía server, sau đó xóa storage.
 * Frontend luôn logout dù API có thất bại (mất mạng, token hết hạn, v.v.).
 */
export const changePasswordThunk = createAsyncThunk<
  User,
  ChangePasswordRequest,
  { rejectValue: ApiError }
>('auth/changePassword', async (data, { rejectWithValue }) => {
  try {
    const response = await axiosClient.post<ApiResponse<User>>('/auth/change-password', data);
    const updatedUser = response.data.data;
    storage.setUser(updatedUser);
    return updatedUser;
  } catch (error) {
    if (isAxiosError(error) && error.response) {
      return rejectWithValue(error.response.data as ApiError);
    }
    return rejectWithValue({ statusCode: 0, message: 'Lỗi kết nối mạng', success: false });
  }
});

export const logoutThunk = createAsyncThunk('auth/logout', async () => {
  try {
    await axiosClient.post('/auth/logout');
  } catch (error) {
    // Vẫn xóa session frontend dù API thất bại
    console.error('[Auth] Logout API error:', error);
  }

  storage.clear();
  return null;
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /**
     * Xóa lỗi đăng nhập.
     * Dùng khi user bắt đầu nhập lại sau khi thấy thông báo lỗi.
     */
    clearError: (state) => {
      state.error = null;
    },

    /**
     * Logout đồng bộ — không gọi API.
     * Dùng trong interceptor khi refresh token cũng thất bại.
     */
    logout: (state) => {
      state.user = null;
      state.isAuthenticated = false;
      state.error = null;
      storage.clear();
    },

    updateUser: (state, action: { payload: User }) => {
      state.user = action.payload;
      storage.setUser(action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      // ── Login ──────────────────────────────────────────────────────────────
      .addCase(loginThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.isAuthenticated = true;
        state.error = null;
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? {
          statusCode: 0,
          message: 'Lỗi không xác định',
          success: false,
        };
      })

      // ── Logout ─────────────────────────────────────────────────────────────
      .addCase(logoutThunk.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(logoutThunk.fulfilled, (state) => {
        state.isLoading = false;
        state.user = null;
        state.isAuthenticated = false;
        state.error = null;
      })

      // ── Change Password ────────────────────────────────────────────────────
      .addCase(changePasswordThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(changePasswordThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload;
        state.error = null;
      })
      .addCase(changePasswordThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? {
          statusCode: 0,
          message: 'Lỗi không xác định',
          success: false,
        };
      });
  },
});

export const { logout, clearError, updateUser } = authSlice.actions;
export default authSlice.reducer;
