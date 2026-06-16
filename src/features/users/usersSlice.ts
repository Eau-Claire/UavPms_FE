import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { isAxiosError } from 'axios';
import { userService } from '@services/api/userService';
import type {
  ApiError,
  CreateUserRequest,
  CreateUserResponse,
  ResetPasswordResponse,
  UpdateUserRequest,
  User,
} from '@types';

interface UsersState {
  users: User[];
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
}

const initialState: UsersState = {
  users: [],
  isLoading: false,
  isSubmitting: false,
  error: null,
};

const getErrorMessage = (error: unknown): string => {
  if (isAxiosError(error) && error.response?.data) {
    const data = error.response.data as ApiError;
    return data.message || 'Đã có lỗi xảy ra';
  }
  return 'Lỗi kết nối mạng';
};

export const fetchUsersThunk = createAsyncThunk<User[], void, { rejectValue: string }>(
  'users/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      return await userService.getAll();
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const createUserThunk = createAsyncThunk<
  CreateUserResponse,
  CreateUserRequest,
  { rejectValue: string }
>('users/create', async (data, { rejectWithValue }) => {
  try {
    return await userService.create(data);
  } catch (error) {
    return rejectWithValue(getErrorMessage(error));
  }
});

export const updateUserThunk = createAsyncThunk<
  User,
  { id: string; data: UpdateUserRequest },
  { rejectValue: string }
>('users/update', async ({ id, data }, { rejectWithValue }) => {
  try {
    return await userService.update(id, data);
  } catch (error) {
    return rejectWithValue(getErrorMessage(error));
  }
});

export const resetUserPasswordThunk = createAsyncThunk<
  ResetPasswordResponse,
  string,
  { rejectValue: string }
>('users/resetPassword', async (id, { rejectWithValue }) => {
  try {
    return await userService.resetPassword(id);
  } catch (error) {
    return rejectWithValue(getErrorMessage(error));
  }
});

export const deleteUserThunk = createAsyncThunk<string, string, { rejectValue: string }>(
  'users/delete',
  async (id, { rejectWithValue }) => {
    try {
      await userService.delete(id);
      return id;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

const usersSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    clearUsersError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsersThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchUsersThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.users = action.payload;
      })
      .addCase(fetchUsersThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Không thể tải danh sách người dùng';
      })

      .addCase(createUserThunk.pending, (state) => {
        state.isSubmitting = true;
      })
      .addCase(createUserThunk.fulfilled, (state, action) => {
        state.isSubmitting = false;
        state.users.unshift(action.payload.user);
      })
      .addCase(createUserThunk.rejected, (state) => {
        state.isSubmitting = false;
      })

      .addCase(updateUserThunk.pending, (state) => {
        state.isSubmitting = true;
      })
      .addCase(updateUserThunk.fulfilled, (state, action) => {
        state.isSubmitting = false;
        const index = state.users.findIndex((u) => u.id === action.payload.id);
        if (index !== -1) state.users[index] = action.payload;
      })
      .addCase(updateUserThunk.rejected, (state) => {
        state.isSubmitting = false;
      })

      .addCase(deleteUserThunk.fulfilled, (state, action) => {
        state.users = state.users.filter((u) => u.id !== action.payload);
      });
  },
});

export const { clearUsersError } = usersSlice.actions;
export default usersSlice.reducer;
