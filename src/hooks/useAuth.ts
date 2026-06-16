import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '@store/store';
import { loginThunk, logoutThunk, clearError, changePasswordThunk } from '@features/auth/authSlice';
import type { ChangePasswordRequest, LoginRequest } from '@types';

export const useAuth = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { user, isAuthenticated, isLoading, error } = useSelector(
    (state: RootState) => state.auth,
  );

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    login: (credentials: LoginRequest) => dispatch(loginThunk(credentials)),
    logout: () => dispatch(logoutThunk()),
    changePassword: (data: ChangePasswordRequest) => dispatch(changePasswordThunk(data)),
    clearError: () => dispatch(clearError()),
    mustChangePassword: user?.mustChangePassword ?? false,
  };
};
