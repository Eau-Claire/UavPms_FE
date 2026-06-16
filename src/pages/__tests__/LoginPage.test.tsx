import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import LoginPage from '../LoginPage';
import { useAuth } from '@hooks/useAuth';

// --- Mocks ---

// Mock hook useAuth
vi.mock('@hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      changeLanguage: vi.fn(),
      language: 'vi',
    },
  }),
}));

// Mock hook useIsMobile (để render giao diện Desktop theo mặc định)
vi.mock('@hooks/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

// Khởi tạo mock implementation cho useAuth
const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

describe('LoginPage', () => {
  const mockLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mặc định: Chưa đăng nhập, không loading
    mockUseAuth.mockReturnValue({
      login: mockLogin,
      isLoading: false,
      isAuthenticated: false,
    });
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
  };

  it('renders login form correctly', () => {
    renderComponent();
    
    // Kiểm tra các phần tử hiển thị (sử dụng keys do đã mock t() trả về key)
    expect(screen.getByText('common.app_name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('login.username_placeholder')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('login.password_placeholder')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'login.login_btn' })).toBeInTheDocument();
  });

  it('shows validation errors when submitting empty form', async () => {
    renderComponent();
    const user = userEvent.setup();
    
    // Bấm nút đăng nhập mà không nhập gì
    const loginButton = screen.getByRole('button', { name: 'login.login_btn' });
    await user.click(loginButton);

    // Form dùng react-hook-form nên cần waitFor để đợi validation update DOM
    await waitFor(() => {
      expect(screen.getByText('login.username_required')).toBeInTheDocument();
      expect(screen.getByText('login.password_required')).toBeInTheDocument();
    });
    
    // Đảm bảo không gọi api login
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('calls login function with correct credentials on submit', async () => {
    mockLogin.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) });
    renderComponent();
    const user = userEvent.setup();
    
    // Nhập thôngত্তিn hợp lệ
    const usernameInput = screen.getByPlaceholderText('login.username_placeholder');
    const passwordInput = screen.getByPlaceholderText('login.password_placeholder');
    const loginButton = screen.getByRole('button', { name: 'login.login_btn' });

    await user.type(usernameInput, 'admin');
    await user.type(passwordInput, 'admin@123');
    await user.click(loginButton);

    // Kiểm tra hàm login được gọi với đúng data
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({ username: 'admin', password: 'admin@123' });
    });
  });

  it('shows api error when login fails', async () => {
    // Giả lập lỗi 401
    const mockError = { statusCode: 401 };
    mockLogin.mockReturnValue({ unwrap: vi.fn().mockRejectedValue(mockError) });
    
    renderComponent();
    const user = userEvent.setup();
    
    await user.type(screen.getByPlaceholderText('login.username_placeholder'), 'admin');
    await user.type(screen.getByPlaceholderText('login.password_placeholder'), 'wrongpass');
    await user.click(screen.getByRole('button', { name: 'login.login_btn' }));

    // Kiểm tra hiển thị thông báo lỗi
    await waitFor(() => {
      expect(screen.getByText('login.error_invalid_credentials')).toBeInTheDocument();
    });
  });
});
