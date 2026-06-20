import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@hooks/useAuth';
import OtpPage from '../OtpPage';

vi.mock('@hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@hooks/useIsMobile', () => ({ useIsMobile: () => false }));

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

const renderPage = (
  purpose: 'ForgotPassword' | 'EmailVerification' | 'Login' = 'ForgotPassword',
) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/otp', state: { email: 'user@example.com', purpose } }]}>
      <Routes>
        <Route path="/otp" element={<OtpPage />} />
        <Route path="/reset-password" element={<div>reset page</div>} />
        <Route path="/login" element={<div>login page</div>} />
        <Route path="/dashboard" element={<div>dashboard page</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('OtpPage', () => {
  const verifyOtp = vi.fn();
  const sendOtp = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ verifyOtp, sendOtp, isLoading: false });
  });

  afterEach(() => vi.useRealTimers());

  it('shows email and distributes a pasted OTP across all inputs', () => {
    renderPage();

    expect(screen.getByDisplayValue('user@example.com')).toBeInTheDocument();
    fireEvent.paste(screen.getByLabelText('OTP digit 1'), {
      clipboardData: { getData: () => '123456' },
    });

    for (let index = 1; index <= 6; index += 1) {
      expect(screen.getByLabelText(`OTP digit ${index}`)).toHaveValue(String(index));
    }
  });

  it('counts down from three minutes', () => {
    vi.useFakeTimers();
    renderPage();
    expect(screen.getByText('3:00')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('2:59')).toBeInTheDocument();
  });

  it('sends otp field and opens reset page after forgot-password verification', async () => {
    verifyOtp.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ verificationToken: 'verification-token' }),
    });
    renderPage();
    fireEvent.paste(screen.getByLabelText('OTP digit 1'), {
      clipboardData: { getData: () => '123456' },
    });

    await userEvent.click(screen.getByRole('button', { name: 'otp.submit' }));

    await waitFor(() => {
      expect(verifyOtp).toHaveBeenCalledWith({
        email: 'user@example.com',
        otp: '123456',
        purpose: 'ForgotPassword',
      });
      expect(screen.getByText('reset page')).toBeInTheDocument();
    });
  });

  it('opens dashboard after authenticated login verification', async () => {
    verifyOtp.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({
        authentication: {
          tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' },
          user: { id: '1', email: 'user@example.com' },
        },
      }),
    });
    renderPage('Login');
    fireEvent.paste(screen.getByLabelText('OTP digit 1'), {
      clipboardData: { getData: () => '123456' },
    });

    await userEvent.click(screen.getByRole('button', { name: 'otp.submit' }));

    await waitFor(() => {
      expect(verifyOtp).toHaveBeenCalledWith({
        email: 'user@example.com',
        otp: '123456',
        purpose: 'Login',
      });
      expect(screen.getByText('dashboard page')).toBeInTheDocument();
    });
  });

  it('returns to login after email verification', async () => {
    verifyOtp.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) });
    renderPage('EmailVerification');
    fireEvent.paste(screen.getByLabelText('OTP digit 1'), {
      clipboardData: { getData: () => '123456' },
    });

    await userEvent.click(screen.getByRole('button', { name: 'otp.submit' }));

    await waitFor(() => {
      expect(verifyOtp).toHaveBeenCalledWith({
        email: 'user@example.com',
        otp: '123456',
        purpose: 'EmailVerification',
      });
      expect(screen.getByText('login page')).toBeInTheDocument();
    });
  });

  it('dispatches one verification request for rapid repeated clicks', () => {
    verifyOtp.mockReturnValue({ unwrap: vi.fn(() => new Promise(() => undefined)) });
    renderPage();
    fireEvent.paste(screen.getByLabelText('OTP digit 1'), {
      clipboardData: { getData: () => '123456' },
    });
    const submitButton = screen.getByRole('button', { name: 'otp.submit' });

    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    expect(verifyOtp).toHaveBeenCalledTimes(1);
  });
});
