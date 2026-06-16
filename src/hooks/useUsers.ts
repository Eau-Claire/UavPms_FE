import { useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@store/store';
import {
  clearUsersError,
  createUserThunk,
  deleteUserThunk,
  fetchUsersThunk,
  resetUserPasswordThunk,
  updateUserThunk,
} from '@features/users/usersSlice';
import type { CreateUserRequest, UpdateUserRequest } from '@types';

export const useUsers = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { users, isLoading, isSubmitting, error } = useSelector((state: RootState) => state.users);

  useEffect(() => {
    dispatch(fetchUsersThunk());
  }, [dispatch]);

  return {
    users,
    isLoading,
    isSubmitting,
    error,
    fetchUsers: useCallback(() => dispatch(fetchUsersThunk()), [dispatch]),
    createUser: useCallback(
      (data: CreateUserRequest) => dispatch(createUserThunk(data)),
      [dispatch],
    ),
    updateUser: useCallback(
      (id: string, data: UpdateUserRequest) => dispatch(updateUserThunk({ id, data })),
      [dispatch],
    ),
    resetPassword: useCallback((id: string) => dispatch(resetUserPasswordThunk(id)), [dispatch]),
    deleteUser: useCallback((id: string) => dispatch(deleteUserThunk(id)), [dispatch]),
    clearError: useCallback(() => dispatch(clearUsersError()), [dispatch]),
  };
};
