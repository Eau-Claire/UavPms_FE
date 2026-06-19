import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Form, Input, Button, Alert, Card, Typography } from 'antd';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@hooks/useAuth';
import { ROUTES } from '@router/routes';
import logoUrl from '@assets/images/Logo.png';

const { Title, Text } = Typography;


type LoginFormInputs = {
  username: string;
  password: string;
};

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading, isAuthenticated, mustChangePassword } = useAuth();
  const { t } = useTranslation();
  const [apiError, setApiError] = useState<string | null>(null);
  const [isAccountLocked, setIsAccountLocked] = useState(false);

  const loginSchema = z.object({
    username: z.string().min(1, t('login.username_required')),
    password: z.string().min(6, t('login.password_required')),
  });

  const {
    control,
    handleSubmit,
    formState: { errors },
    resetField,
  } = useForm<LoginFormInputs>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

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
      const result = await login(data).unwrap();
      if (result.user.mustChangePassword) {
        navigate(ROUTES.CHANGE_PASSWORD, { replace: true });
        return;
      }
      const from = location.state?.from?.pathname || ROUTES.DASHBOARD;
      navigate(from);
    } catch (err: unknown) {
      const error = err as { statusCode?: number; response?: { status?: number } };
      if (error?.statusCode === 401 || error?.response?.status === 401) {
        setApiError(t('login.error_invalid_credentials'));
        resetField('password');
      } else if (error?.statusCode === 423 || error?.response?.status === 423) {
        setApiError(t('login.error_account_locked'));
        setIsAccountLocked(true);
        resetField('password');
      } else {
        setApiError(t('login.error_generic'));
      }
    }
  };

  return (
    <div className="auth-shell">
      <Card className="auth-card">
        <div className="auth-header">
          <img
            src={logoUrl}
            alt="EVN Logo"
            className="auth-logo"
          />
          <Title level={4} className="auth-title">
            {t('common.app_name')}
          </Title>
          <Text type="secondary" className="auth-subtitle">{t('common.app_tagline')}</Text>
        </div>

        {apiError && (
          <Alert
            title={apiError}
            type="error"
            showIcon
            className="auth-alert"
          />
        )}

        <Form layout="vertical" onFinish={handleSubmit(onSubmit)}>
          <Form.Item
            label={t('login.username_label')}
            validateStatus={errors.username ? 'error' : ''}
            help={errors.username?.message}
          >
            <Controller
              name="username"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  placeholder={t('login.username_placeholder')}
                  disabled={isLoading || isAccountLocked}
                  prefix={<UserOutlined className="icon-muted" />}
                  size="large"
                />
              )}
            />
          </Form.Item>

          <Form.Item
            label={t('login.password_label')}
            validateStatus={errors.password ? 'error' : ''}
            help={errors.password?.message}
          >
            <Controller
              name="password"
              control={control}
              render={({ field }) => (
                <Input.Password
                  {...field}
                  placeholder={t('login.password_placeholder')}
                  disabled={isLoading || isAccountLocked}
                  prefix={<LockOutlined className="icon-muted" />}
                  size="large"
                />
              )}
            />
          </Form.Item>

          <Form.Item className="auth-submit-item">
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={isLoading}
              disabled={isLoading || isAccountLocked}
            >
              {isLoading ? t('login.logging_in') : t('login.login_btn')}
            </Button>
          </Form.Item>

          <div className="auth-footer-action">
            <Button type="link" size="small" className="auth-link-muted">
              {t('login.forgot_password')}
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default LoginPage;
