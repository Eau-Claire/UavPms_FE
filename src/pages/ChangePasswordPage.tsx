import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Alert } from 'antd';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRightOutlined, LockOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@hooks/useAuth';
import AuthFrame from '@features/auth/components/AuthFrame';
import { ROUTES } from '@router/routes';

type ChangePasswordForm = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const ChangePasswordPage = () => {
  const navigate = useNavigate();
  const { changePassword, isLoading, user } = useAuth();
  const { t } = useTranslation();
  const [apiError, setApiError] = useState<string | null>(null);

  const schema = z
    .object({
      currentPassword: z.string().min(1, t('change_password.current_required')),
      newPassword: z.string().min(8, t('change_password.new_min_length')),
      confirmPassword: z.string().min(1, t('change_password.confirm_required')),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t('change_password.confirm_mismatch'),
      path: ['confirmPassword'],
    })
    .refine((data) => data.newPassword !== data.currentPassword, {
      message: t('change_password.same_as_current'),
      path: ['newPassword'],
    });

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordForm>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const isBusy = isLoading || isSubmitting;

  const onSubmit = async (data: ChangePasswordForm) => {
    setApiError(null);
    try {
      await changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      }).unwrap();
      navigate(ROUTES.DASHBOARD, { replace: true });
    } catch (err: unknown) {
      const error = err as { message?: string };
      setApiError(error?.message ?? t('change_password.error_generic'));
    }
  };

  return (
    <AuthFrame>
      <div className="auth-card auth-card-flow">
        <header className="auth-flow-header auth-flow-header-bordered">
          <h1>{t('change_password.title')}</h1>
          <p>
            {user?.mustChangePassword
              ? t('change_password.first_login_subtitle')
              : t('change_password.subtitle')}
          </p>
        </header>

        {apiError && (
          <Alert title={apiError} type="error" showIcon className="auth-alert" />
        )}

        <Form layout="vertical" onFinish={handleSubmit(onSubmit)}>
          <Form.Item
            label={t('change_password.current_label')}
            validateStatus={errors.currentPassword ? 'error' : ''}
            help={errors.currentPassword?.message}
          >
            <Controller
              name="currentPassword"
              control={control}
              render={({ field }) => (
                <Input.Password
                  {...field}
                  prefix={<LockOutlined className="auth-input-icon" />}
                  size="large"
                  className="auth-input"
                  disabled={isBusy}
                />
              )}
            />
          </Form.Item>

          <Form.Item
            label={t('change_password.new_label')}
            validateStatus={errors.newPassword ? 'error' : ''}
            help={errors.newPassword?.message}
          >
            <Controller
              name="newPassword"
              control={control}
              render={({ field }) => (
                <Input.Password
                  {...field}
                  prefix={<LockOutlined className="auth-input-icon" />}
                  size="large"
                  className="auth-input"
                  disabled={isBusy}
                />
              )}
            />
          </Form.Item>

          <Form.Item
            label={t('change_password.confirm_label')}
            validateStatus={errors.confirmPassword ? 'error' : ''}
            help={errors.confirmPassword?.message}
          >
            <Controller
              name="confirmPassword"
              control={control}
              render={({ field }) => (
                <Input.Password
                  {...field}
                  prefix={<LockOutlined className="auth-input-icon" />}
                  size="large"
                  className="auth-input"
                  disabled={isBusy}
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
            aria-label={t('change_password.submit')}
            icon={<ArrowRightOutlined />}
            iconPlacement="end"
          >
            {t('change_password.submit')}
          </Button>
        </Form>
      </div>
    </AuthFrame>
  );
};

export default ChangePasswordPage;
