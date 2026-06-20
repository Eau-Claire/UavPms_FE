import { beforeEach, describe, expect, it, vi } from 'vitest';
import axiosClient from '@services/api/axiosClient';
import { authService } from '@services/api/authService';

vi.mock('@services/api/axiosClient', () => ({
  default: { post: vi.fn() },
}));

const mockPost = axiosClient.post as unknown as ReturnType<typeof vi.fn>;

describe('authService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('normalizes nested login authResult', async () => {
    mockPost.mockResolvedValue({
      data: {
        success: true,
        message: 'Login successful',
        data: {
          success: true,
          authResult: {
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            user: { id: '1', email: 'user@example.com' },
          },
        },
        errors: null,
      },
    });

    const result = await authService.login({ email: 'user@example.com', password: '123' });

    expect(result).toMatchObject({
      otpRequired: false,
      tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' },
      user: { email: 'user@example.com' },
    });
  });

  it('returns OTP-required login without demanding tokens', async () => {
    mockPost.mockResolvedValue({
      data: {
        success: true,
        message: 'OTP required',
        data: { email: 'user@example.com' },
        errors: null,
      },
    });

    await expect(
      authService.login({ email: 'user@example.com', password: '123' }),
    ).resolves.toEqual({ otpRequired: true, email: 'user@example.com' });
  });

  it('extracts authentication from successful login verification', async () => {
    mockPost.mockResolvedValue({
      data: {
        success: true,
        message: 'Verification success.',
        data: {
          success: true,
          token: null,
          authResult: {
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            user: { id: '1', email: 'user@example.com' },
          },
        },
        errors: null,
      },
    });

    await expect(
      authService.verifyOtp({
        email: 'user@example.com',
        otp: '123456',
        purpose: 'Login',
      }),
    ).resolves.toMatchObject({
      authentication: {
        tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' },
        user: { id: '1', email: 'user@example.com' },
      },
    });
  });

  it('allows email verification without creating a session', async () => {
    mockPost.mockResolvedValue({
      data: {
        success: true,
        message: 'Verification success.',
        data: { success: true, token: null, authResult: null },
        errors: null,
      },
    });

    await expect(
      authService.verifyOtp({
        email: 'user@example.com',
        otp: '123456',
        purpose: 'EmailVerification',
      }),
    ).resolves.toEqual({});
  });

  it('extracts forgot-password verification token', async () => {
    mockPost.mockResolvedValue({
      data: {
        success: true,
        message: 'Verification success.',
        data: { success: true, token: 'verification-token', authResult: null },
        errors: null,
      },
    });

    await expect(
      authService.verifyOtp({
        email: 'user@example.com',
        otp: '123456',
        purpose: 'ForgotPassword',
      }),
    ).resolves.toEqual({ verificationToken: 'verification-token' });
  });
});
