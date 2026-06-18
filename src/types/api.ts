export interface ApiResponse<T = unknown> {
  statusCode: number;
  message: string;
  data: T;
  success: boolean;
}

export interface ApiError {
  statusCode: number;
  message: string;
  success: false;
}
