import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { isAxiosError } from 'axios';
import { authService } from '@services/api/authService';
import { storage } from '@utils/storage';
import type {
  ApiError,
  AuthState,
  ChangePasswordRequest,
  LoginRequest,
  LoginResult,
  ResetPasswordRequest,
  SendOtpRequest,
  User,
  VerifyOtpRequest,
  VerifyOtpResponse,
} from '@shared/types';

const storedUser = storage.getUser();
const hasToken = !!storage.getAccessToken();

const initialState: AuthState = {
  user: storedUser,
  isAuthenticated: hasToken && !!storedUser,
  isLoading: false,
  error: null,
};

const networkError = (): ApiError => ({
  statusCode: 0,
  message: 'Network connection error',
  success: false,
});

const unknownError = (): ApiError => ({
  statusCode: 0,
  message: 'Unknown error',
  success: false,
});

const toRejectValue = (error: unknown): ApiError => {
  if (isAxiosError(error) && error.response) {
    const response = error.response.data as Partial<ApiError> | undefined;
    return {
      statusCode: error.response.status,
      message: response?.message ?? error.message,
      success: false,
    };
  }
  if (error instanceof Error) {
    return { statusCode: 0, message: error.message, success: false };
  }
  return networkError();
};

export const loginThunk = createAsyncThunk<
  LoginResult,
  LoginRequest,
  { rejectValue: ApiError }
>('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const result = await authService.login(credentials);
    if (!result.otpRequired) {
      storage.setToken(result.tokens);
      storage.setUser(result.user);
    }
    return result;
  } catch (error) {
    return rejectWithValue(toRejectValue(error));
  }
});

export const changePasswordThunk = createAsyncThunk<
  User | null,
  ChangePasswordRequest,
  { rejectValue: ApiError }
>('auth/changePassword', async (data, { rejectWithValue }) => {
  try {
    const updatedUser = await authService.changePassword(data);
    if (updatedUser) storage.setUser(updatedUser);
    return updatedUser;
  } catch (error) {
    return rejectWithValue(toRejectValue(error));
  }
});

export const sendOtpThunk = createAsyncThunk<void, SendOtpRequest, { rejectValue: ApiError }>(
  'auth/sendOtp',
  async (data, { rejectWithValue }) => {
    try {
      await authService.sendOtp(data);
    } catch (error) {
      return rejectWithValue(toRejectValue(error));
    }
  },
);

export const verifyOtpThunk = createAsyncThunk<
  VerifyOtpResponse,
  VerifyOtpRequest,
  { rejectValue: ApiError }
>('auth/verifyOtp', async (data, { rejectWithValue }) => {
  try {
    const result = await authService.verifyOtp(data);
    if (
      (data.purpose === 'Login' || data.purpose === 'EmailVerification') &&
      result.authentication
    ) {
      storage.setToken(result.authentication.tokens);
      storage.setUser(result.authentication.user);
    }
    return result;
  } catch (error) {
    return rejectWithValue(toRejectValue(error));
  }
});

export const resetPasswordThunk = createAsyncThunk<
  void,
  ResetPasswordRequest,
  { rejectValue: ApiError }
>('auth/resetPassword', async (data, { rejectWithValue }) => {
  try {
    await authService.resetPassword(data);
  } catch (error) {
    return rejectWithValue(toRejectValue(error));
  }
});

export const logoutThunk = createAsyncThunk('auth/logout', async () => {
  storage.clear();
  return null;
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },

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
      .addCase(loginThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        if (!action.payload.otpRequired) {
          state.user = action.payload.user;
          state.isAuthenticated = true;
        }
        state.error = null;
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? unknownError();
      })

      .addCase(logoutThunk.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(logoutThunk.fulfilled, (state) => {
        state.isLoading = false;
        state.user = null;
        state.isAuthenticated = false;
        state.error = null;
      })

      .addCase(changePasswordThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(changePasswordThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        if (action.payload) {
          state.user = action.payload;
        } else if (state.user) {
          state.user.mustChangePassword = false;
          storage.setUser(state.user);
        }
        state.error = null;
      })
      .addCase(changePasswordThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? unknownError();
      })

      .addCase(sendOtpThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(sendOtpThunk.fulfilled, (state) => {
        state.isLoading = false;
        state.error = null;
      })
      .addCase(sendOtpThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? unknownError();
      })

      .addCase(verifyOtpThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(verifyOtpThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        if (
          (action.meta.arg.purpose === 'Login' ||
            action.meta.arg.purpose === 'EmailVerification') &&
          action.payload.authentication
        ) {
          state.user = action.payload.authentication.user;
          state.isAuthenticated = true;
        }
        state.error = null;
      })
      .addCase(verifyOtpThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? unknownError();
      })

      .addCase(resetPasswordThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(resetPasswordThunk.fulfilled, (state) => {
        state.isLoading = false;
        state.error = null;
      })
      .addCase(resetPasswordThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? unknownError();
      });
  },
});

export const { logout, clearError, updateUser } = authSlice.actions;
export default authSlice.reducer;
