import { useNavigate } from 'react-router-dom';
import { Button, Form, Input } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, LockOutlined } from '@ant-design/icons';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import AuthFrame from '@features/auth/components/AuthFrame';
import { ROUTES } from '@router/routes';

type ResetPasswordForm = {
  newPassword: string;
  confirmPassword: string;
};

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const schema = z
    .object({
      newPassword: z.string().min(8, t('change_password.new_min_length')),
      confirmPassword: z.string().min(1, t('change_password.confirm_required')),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t('change_password.confirm_mismatch'),
      path: ['confirmPassword'],
    });

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const onSubmit = () => {
    navigate(ROUTES.LOGIN);
  };

  return (
    <AuthFrame>
      <div className="auth-card auth-card-flow auth-card-reset">
        <Button
          type="link"
          className="auth-back-link"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(ROUTES.OTP)}
        >
          {t('otp.back')}
        </Button>

        <header className="auth-flow-header auth-flow-header-bordered">
          <h1>{t('reset_password.title')}</h1>
          <p>{t('reset_password.subtitle')}</p>
        </header>

        <Form layout="vertical" onFinish={handleSubmit(onSubmit)}>
          <Form.Item
            label={t('change_password.new_label')}
            validateStatus={errors.newPassword ? 'error' : ''}
            help={errors.newPassword?.message ?? t('reset_password.password_helper')}
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
                />
              )}
            />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            className="evn-primary-button"
            aria-label={t('reset_password.submit')}
            icon={<ArrowRightOutlined />}
            iconPlacement="end"
          >
            {t('reset_password.submit')}
          </Button>
        </Form>

        <p className="auth-muted-note">{t('reset_password.helper')}</p>
        <p className="auth-copyright">{t('common.copyright')}</p>
      </div>
    </AuthFrame>
  );
};

export default ResetPasswordPage;
