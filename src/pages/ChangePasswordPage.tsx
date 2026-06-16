import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Alert, Card, Typography } from 'antd';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LockOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@hooks/useAuth';
import { ROUTES } from '@constants/routes';
import { COLORS, SPACING, RADIUS } from '@styles/tokens';

const { Title, Text } = Typography;

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
    formState: { errors },
  } = useForm<ChangePasswordForm>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

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
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: COLORS.bgBase,
        alignItems: 'center',
        justifyContent: 'center',
        padding: SPACING.lg,
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: 440,
          borderRadius: RADIUS.lg,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: SPACING.xl }}>
          <Title level={4} style={{ margin: 0, color: COLORS.textPrimary }}>
            {t('change_password.title')}
          </Title>
          <Text type="secondary">
            {user?.mustChangePassword
              ? t('change_password.first_login_subtitle')
              : t('change_password.subtitle')}
          </Text>
        </div>

        {apiError && (
          <Alert title={apiError} type="error" showIcon style={{ marginBottom: SPACING.lg }} />
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
                  prefix={<LockOutlined style={{ color: COLORS.textDisabled }} />}
                  size="large"
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
                  prefix={<LockOutlined style={{ color: COLORS.textDisabled }} />}
                  size="large"
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
                  prefix={<LockOutlined style={{ color: COLORS.textDisabled }} />}
                  size="large"
                />
              )}
            />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            loading={isLoading}
            disabled={isLoading}
          >
            {t('change_password.submit')}
          </Button>
        </Form>
      </Card>
    </div>
  );
};

export default ChangePasswordPage;
