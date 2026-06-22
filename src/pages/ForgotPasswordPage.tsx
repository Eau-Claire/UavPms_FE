import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Form, Input } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, MailOutlined } from '@ant-design/icons';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import AuthFrame from '@features/auth/components/AuthFrame';
import { ROUTES } from '@router/routes';
import { useAuth } from '@hooks/useAuth';

type ForgotPasswordForm = {
  email: string;
};

const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { sendOtp, isLoading } = useAuth();
  const [apiError, setApiError] = useState<string | null>(null);

  const schema = z.object({
    email: z.string().email(t('forgot_password.email_invalid')),
  });

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });
  const isBusy = isLoading || isSubmitting;

  const onSubmit = async (data: ForgotPasswordForm) => {
    setApiError(null);
    try {
      await sendOtp({ email: data.email, purpose: 'ForgotPassword' }).unwrap();
      navigate(ROUTES.OTP, { state: { email: data.email, purpose: 'ForgotPassword' } });
    } catch (err: unknown) {
      const error = err as { message?: string };
      setApiError(error?.message ?? t('forgot_password.error_generic'));
    }
  };

  return (
    <AuthFrame>
      <div className="auth-card auth-card-flow auth-card-forgot">
        <Button
          type="link"
          className="auth-back-link"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(ROUTES.LOGIN)}
        >
          {t('forgot_password.back_to_login')}
        </Button>

        <header className="auth-flow-header">
          <h1>{t('forgot_password.title')}</h1>
          <p>{t('forgot_password.subtitle')}</p>
        </header>

        {apiError && <Alert title={apiError} type="error" showIcon className="auth-alert" />}

        <Form layout="vertical" onFinish={handleSubmit(onSubmit)}>
          <Form.Item
            label={t('forgot_password.email_label')}
            validateStatus={errors.email ? 'error' : ''}
            help={errors.email?.message}
          >
            <Controller
              name="email"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  placeholder={t('forgot_password.email_placeholder')}
                  prefix={<MailOutlined className="auth-input-icon" />}
                  size="large"
                  className="auth-input"
                  disabled={isBusy}
                  onBlur={() => setApiError(null)}
                />
              )}
            />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            loading={isBusy}
            disabled={isBusy}
            className="evn-primary-button"
            aria-label={t('forgot_password.submit')}
            icon={<ArrowRightOutlined />}
            iconPlacement="end"
          >
            {t('forgot_password.submit')}
          </Button>
        </Form>

        <p className="auth-muted-note">{t('forgot_password.helper')}</p>
        <p className="auth-copyright">{t('common.copyright')}</p>
      </div>
    </AuthFrame>
  );
};

export default ForgotPasswordPage;
