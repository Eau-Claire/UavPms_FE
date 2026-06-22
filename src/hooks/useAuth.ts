import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '@store/store';
import {
  changePasswordThunk,
  clearError,
  loginThunk,
  logoutThunk,
  resetPasswordThunk,
  sendOtpThunk,
  verifyOtpThunk,
} from '@features/auth/authSlice';
import type {
  ChangePasswordRequest,
  LoginRequest,
  ResetPasswordRequest,
  SendOtpRequest,
  VerifyOtpRequest,
} from '@shared/types';

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
    sendOtp: (data: SendOtpRequest) => dispatch(sendOtpThunk(data)),
    verifyOtp: (data: VerifyOtpRequest) => dispatch(verifyOtpThunk(data)),
    resetPassword: (data: ResetPasswordRequest) => dispatch(resetPasswordThunk(data)),
    clearError: () => dispatch(clearError()),
    mustChangePassword: user?.mustChangePassword ?? false,
  };
};
