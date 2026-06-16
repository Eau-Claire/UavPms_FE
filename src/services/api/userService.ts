import axiosClient from '@services/api/axiosClient';
import type {
  ApiResponse,
  CreateUserRequest,
  CreateUserResponse,
  ResetPasswordResponse,
  UpdateUserRequest,
  User,
} from '@types';

export const userService = {
  getAll: async (): Promise<User[]> => {
    const response = await axiosClient.get<ApiResponse<User[]>>('/users');
    return response.data.data;
  },

  create: async (data: CreateUserRequest): Promise<CreateUserResponse> => {
    const response = await axiosClient.post<ApiResponse<CreateUserResponse>>('/users', data);
    return response.data.data;
  },

  update: async (id: string, data: UpdateUserRequest): Promise<User> => {
    const response = await axiosClient.patch<ApiResponse<User>>(`/users/${id}`, data);
    return response.data.data;
  },

  resetPassword: async (id: string): Promise<ResetPasswordResponse> => {
    const response = await axiosClient.post<ApiResponse<ResetPasswordResponse>>(
      `/users/${id}/reset-password`,
    );
    return response.data.data;
  },

  delete: async (id: string): Promise<void> => {
    await axiosClient.delete(`/users/${id}`);
  },
};
