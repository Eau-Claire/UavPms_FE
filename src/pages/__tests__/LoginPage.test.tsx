import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { vi, describe, it, expect, beforeEach } from "vitest";
import LoginPage from "../LoginPage";
import { useAuth } from "@hooks/useAuth";

// --- Mocks ---

// Mock hook useAuth
vi.mock("@hooks/useAuth", () => ({
 useAuth: vi.fn(),
}));

// Mock react-i18next
vi.mock("react-i18next", () => ({
 useTranslation: () => ({
  t: (key: string) => key,
  i18n: {
   changeLanguage: vi.fn(),
   language: "vi",
  },
 }),
}));

// Mock hook useIsMobile (để render giao diện Desktop theo mặc định)
vi.mock("@hooks/useIsMobile", () => ({
 useIsMobile: vi.fn(() => false),
}));

// Khởi tạo mock implementation cho useAuth
const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

const OtpRouteProbe = () => {
 const location = useLocation();
 const purpose = (location.state as { purpose?: string } | null)?.purpose;
 return (
  <>
   <div>otp page</div>
   <div>otp purpose: {purpose}</div>
  </>
 );
};

describe("LoginPage", () => {
 const mockLogin = vi.fn();
 const mockSendOtp = vi.fn();

 beforeEach(() => {
  vi.clearAllMocks();

  // Mặc định: Chưa đăng nhập, không loading
  mockUseAuth.mockReturnValue({
   login: mockLogin,
   sendOtp: mockSendOtp,
   isLoading: false,
   isAuthenticated: false,
  });
 });

 const renderComponent = () => {
  return render(
   <MemoryRouter initialEntries={["/login"]}>
    <Routes>
     <Route path="/login" element={<LoginPage />} />
     <Route path="/otp" element={<OtpRouteProbe />} />
     <Route path="/dashboard" element={<div>dashboard page</div>} />
    </Routes>
   </MemoryRouter>,
  );
 };

 it("renders login form correctly", () => {
  renderComponent();

  // Kiểm tra các phần tử hiển thị (sử dụng keys do đã mock t() trả về key)
  expect(screen.getByText("common.app_name")).toBeInTheDocument();
  expect(
   screen.getByPlaceholderText("login.email_placeholder"),
  ).toBeInTheDocument();
  expect(
   screen.getByPlaceholderText("login.password_placeholder"),
  ).toBeInTheDocument();
  expect(
   screen.getByRole("button", { name: "login.login_btn" }),
  ).toBeInTheDocument();
 });

 it("shows validation errors when submitting empty form", async () => {
  renderComponent();
  const user = userEvent.setup();

  // Bấm nút đăng nhập mà không nhập gì
  const loginButton = screen.getByRole("button", { name: "login.login_btn" });
  await user.click(loginButton);

  // Form dùng react-hook-form nên cần waitFor để đợi validation update DOM
  await waitFor(() => {
   expect(screen.getByText("login.email_required")).toBeInTheDocument();
   expect(screen.getByText("login.password_required")).toBeInTheDocument();
  });

  // Đảm bảo không gọi api login
  expect(mockLogin).not.toHaveBeenCalled();
 });

 it("calls login function with correct credentials on submit", async () => {
  mockLogin.mockReturnValue({
   unwrap: vi.fn().mockResolvedValue({
    otpRequired: false,
    user: { mustChangePassword: false },
   }),
  });
  renderComponent();
  const user = userEvent.setup();

  // Nhập thôngত্তিn hợp lệ
  const emailInput = screen.getByPlaceholderText("login.email_placeholder");
  const passwordInput = screen.getByPlaceholderText(
   "login.password_placeholder",
  );
  const loginButton = screen.getByRole("button", { name: "login.login_btn" });

  await user.type(emailInput, "admin@evn.vn");
  await user.type(passwordInput, "admin@123");
  await user.click(loginButton);

  // Kiểm tra hàm login được gọi với đúng data
  await waitFor(() => {
   expect(mockLogin).toHaveBeenCalledWith({
    email: "admin@evn.vn",
    password: "admin@123",
   });
  });
 });

 it("shows api error when login fails", async () => {
  // Giả lập lỗi 401
  const mockError = { statusCode: 401 };
  mockLogin.mockReturnValue({ unwrap: vi.fn().mockRejectedValue(mockError) });

  renderComponent();
  const user = userEvent.setup();

  await user.type(
   screen.getByPlaceholderText("login.email_placeholder"),
   "admin@evn.vn",
  );
  await user.type(
   screen.getByPlaceholderText("login.password_placeholder"),
   "wrongpass",
  );
  await user.click(screen.getByRole("button", { name: "login.login_btn" }));

  // Kiểm tra hiển thị thông báo lỗi
  await waitFor(() => {
   expect(
    screen.getByText("login.error_invalid_credentials"),
   ).toBeInTheDocument();
  });
 });

 it("sends verification OTP when backend reports unverified email", async () => {
  mockLogin.mockReturnValue({
   unwrap: vi
    .fn()
    .mockRejectedValue({ statusCode: 401, message: "Email is not verified" }),
  });
  mockSendOtp.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(undefined) });
  renderComponent();
  const user = userEvent.setup();

  await user.type(
   screen.getByPlaceholderText("login.email_placeholder"),
   "user@example.com",
  );
  await user.type(
   screen.getByPlaceholderText("login.password_placeholder"),
   "123",
  );
  await user.click(screen.getByRole("button", { name: "login.login_btn" }));

  await waitFor(() => {
   expect(mockSendOtp).toHaveBeenCalledWith({
    email: "user@example.com",
    purpose: "EmailVerification",
   });
  });
  expect(screen.getByText("otp purpose: EmailVerification")).toBeInTheDocument();
 });

 it("opens OTP page when login returns OTP-required result", async () => {
  mockLogin.mockReturnValue({
   unwrap: vi.fn().mockResolvedValue({
    otpRequired: true,
    email: "user@example.com",
   }),
  });
  renderComponent();
  const user = userEvent.setup();

  await user.type(
   screen.getByPlaceholderText("login.email_placeholder"),
   "user@example.com",
  );
  await user.type(screen.getByPlaceholderText("login.password_placeholder"), "123");
  await user.click(screen.getByRole("button", { name: "login.login_btn" }));

  await waitFor(() => expect(screen.getByText("otp page")).toBeInTheDocument());
  expect(screen.getByText("otp purpose: Login")).toBeInTheDocument();
 expect(mockSendOtp).not.toHaveBeenCalled();
 });

 it("opens Login OTP for rejected OTP-required response", async () => {
  mockLogin.mockReturnValue({
   unwrap: vi.fn().mockRejectedValue({
    statusCode: 401,
    message: "OTP is required",
   }),
  });
  renderComponent();
  const user = userEvent.setup();

  await user.type(
   screen.getByPlaceholderText("login.email_placeholder"),
   "user@example.com",
  );
  await user.type(screen.getByPlaceholderText("login.password_placeholder"), "123");
  await user.click(screen.getByRole("button", { name: "login.login_btn" }));

  await waitFor(() => expect(screen.getByText("otp page")).toBeInTheDocument());
  expect(screen.getByText("otp purpose: Login")).toBeInTheDocument();
  expect(mockSendOtp).not.toHaveBeenCalled();
 });

 it.each([
  ["wrong password", "Invalid credentials"],
  ["unknown email", "Invalid credentials"],
 ])("maps %s 401 to generic credentials error", async (_case, message) => {
  mockLogin.mockReturnValue({
   unwrap: vi.fn().mockRejectedValue({ statusCode: 401, message }),
  });
  renderComponent();
  const user = userEvent.setup();

  await user.type(
   screen.getByPlaceholderText("login.email_placeholder"),
   "user@example.com",
  );
  await user.type(screen.getByPlaceholderText("login.password_placeholder"), "wrong");
  await user.click(screen.getByRole("button", { name: "login.login_btn" }));

  await waitFor(() => {
   expect(screen.getByText("login.error_invalid_credentials")).toBeInTheDocument();
  });
  expect(screen.queryByText("otp page")).not.toBeInTheDocument();
 });
});
