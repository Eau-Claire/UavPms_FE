import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Form, Input, Button, Divider } from "antd";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
 ArrowRightOutlined,
 ExclamationCircleOutlined,
 LockOutlined,
 MailOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@hooks/useAuth";
import { ROUTES } from "@router/routes";
import AuthFrame from "@features/auth/components/AuthFrame";

type LoginFormInputs = {
 email: string;
 password: string;
};

const isEmailVerificationRequired = (message: string) =>
 /\bemail(?:\s+is)?\s+not\s+verified\b/i.test(message);

const isLoginOtpRequired = (message: string) =>
 /\botp(?:\s+is)?\s+required\b/i.test(message);

const LoginPage = () => {
 const navigate = useNavigate();
 const location = useLocation();
 const { login, sendOtp, isLoading, isAuthenticated, mustChangePassword } =
  useAuth();
 const { t } = useTranslation();
 const [apiError, setApiError] = useState<string | null>(null);
 const [isAccountLocked, setIsAccountLocked] = useState(false);

 const loginSchema = z.object({
  // email: z.string().min(1, t('login.email_required')).email(t('login.email_invalid')),
  email: z.string().min(1, t("login.email_required")),
  password: z.string().min(1, t("login.password_required")),
 });

 const {
  control,
  handleSubmit,
  formState: { errors, isSubmitting },
  resetField,
 } = useForm<LoginFormInputs>({
  resolver: zodResolver(loginSchema),
  defaultValues: {
   email: (location.state as { email?: string } | null)?.email ?? "",
   password: "",
  },
 });
 const isBusy = isLoading || isSubmitting;

 useEffect(() => {
  if (isAuthenticated) {
   if (mustChangePassword) {
    navigate(ROUTES.CHANGE_PASSWORD, { replace: true });
    return;
   }
   const from = location.state?.from?.pathname || ROUTES.DASHBOARD;
   navigate(from);
  }
 }, [isAuthenticated, mustChangePassword, navigate, location]);

 const onSubmit = async (data: LoginFormInputs) => {
  setApiError(null);
  setIsAccountLocked(false);

  try {
   const result = await login({
    email: data.email,
    password: data.password,
   }).unwrap();
   if (result.otpRequired) {
    navigate(ROUTES.OTP, {
     state: { email: result.email, purpose: "Login" },
    });
    return;
   }
   if (result.user.mustChangePassword) {
    navigate(ROUTES.CHANGE_PASSWORD, { replace: true });
    return;
   }
   const from = location.state?.from?.pathname || ROUTES.DASHBOARD;
   navigate(from);
  } catch (err: unknown) {
   const error = err as { statusCode?: number; message?: string };
   const message = error?.message ?? "";
   if (isEmailVerificationRequired(message)) {
    try {
     await sendOtp({
      email: data.email,
      purpose: "EmailVerification",
     }).unwrap();
     navigate(ROUTES.OTP, {
      state: { email: data.email, purpose: "EmailVerification" },
     });
    } catch (sendError: unknown) {
     const otpError = sendError as { message?: string };
     setApiError(otpError.message ?? t("login.error_generic"));
    }
   } else if (isLoginOtpRequired(message)) {
    navigate(ROUTES.OTP, {
     state: { email: data.email, purpose: "Login" },
    });
   } else if (error?.statusCode === 401) {
    setApiError(t("login.error_invalid_credentials"));
    resetField("password");
   } else if (error?.statusCode === 423) {
    setApiError(t("login.error_account_locked"));
    setIsAccountLocked(true);
    resetField("password");
   } else {
    setApiError(t("login.error_generic"));
   }
  }
 };

 const renderAuthError = (message?: string | null) =>
  message ? (
   <span className='auth-field-error'>
    <ExclamationCircleOutlined />
    {message}
   </span>
  ) : undefined;

 return (
  <AuthFrame>
   <div className='auth-card auth-card-login'>
    <header className='auth-card-header'>
     <h1 className='auth-system-title'>{t("common.app_name")}</h1>
     <div className='auth-title-rule' />
     <h2 className='auth-form-title'>{t("login.form_title")}</h2>
     <p className='auth-form-copy'>{t("login.form_subtitle")}</p>
    </header>

    <Form
     layout='vertical'
     onFinish={handleSubmit(onSubmit)}
    >
     <Form.Item
      className='auth-email-item'
      validateStatus={errors.email ? "error" : ""}
      help={renderAuthError(errors.email?.message)}
     >
      <Controller
       name='email'
       control={control}
       render={({ field }) => (
        <Input
         {...field}
         placeholder={t("login.email_placeholder")}
         disabled={isBusy || isAccountLocked}
         prefix={<MailOutlined className='auth-input-icon' />}
         size='large'
         className='auth-input'
        />
       )}
      />
     </Form.Item>

     <Form.Item
      className='auth-password-item'
      validateStatus={errors.password || apiError ? "error" : ""}
      help={renderAuthError(errors.password?.message ?? apiError)}
     >
      <Controller
       name='password'
       control={control}
       render={({ field }) => (
        <Input.Password
         {...field}
         placeholder={t("login.password_placeholder")}
         disabled={isBusy || isAccountLocked}
         prefix={<LockOutlined className='auth-input-icon' />}
         size='large'
         className='auth-input'
        />
       )}
      />
     </Form.Item>

     <div className='auth-form-row'>
      <Button
       type='link'
       className='auth-link'
       onClick={() => navigate(ROUTES.FORGOT_PASSWORD)}
      >
       {t("login.forgot_password")}
      </Button>
     </div>

     <Form.Item className='auth-submit-item'>
      <Button
       type='primary'
       htmlType='submit'
       block
       size='large'
       loading={isBusy}
       disabled={isBusy || isAccountLocked}
       className='evn-primary-button'
       aria-label={isBusy ? t("login.logging_in") : t("login.login_btn")}
       icon={<ArrowRightOutlined />}
       iconPlacement='end'
      >
       {isBusy ? t("login.logging_in") : t("login.login_btn")}
      </Button>
     </Form.Item>
    </Form>
    <Divider className='auth-divider' />
    <p className='auth-support'>{t("login.support_note")}</p>
    <p className='auth-copyright'>{t("common.copyright")}</p>
   </div>
  </AuthFrame>
 );
};

export default LoginPage;
