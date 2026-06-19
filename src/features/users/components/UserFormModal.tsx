import { useEffect } from 'react';
import { Modal, Form, Input, Select, Button, Space, Popconfirm } from 'antd';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { USER_ROLES, USER_STATUSES, type User, type UserRole, type UserStatus } from '@shared/types';

type FormMode = 'create' | 'edit';

interface UserFormModalProps {
  open: boolean;
  mode: FormMode;
  user?: User | null;
  isSubmitting: boolean;
  onSubmit: (data: { fullName?: string; role: UserRole; status?: UserStatus }) => void;
  onResetPassword?: () => void;
  onClose: () => void;
}

type CreateFormValues = { fullName: string; role: UserRole };
type EditFormValues = { role: UserRole; status: UserStatus };

const UserFormModal = ({
  open,
  mode,
  user,
  isSubmitting,
  onSubmit,
  onResetPassword,
  onClose,
}: UserFormModalProps) => {
  const { t } = useTranslation();
  const isCreate = mode === 'create';

  const createSchema = z.object({
    fullName: z.string().min(2, t('user.fullname_required')),
    role: z.enum(USER_ROLES),
  });

  const editSchema = z.object({
    role: z.enum(USER_ROLES),
    status: z.enum(USER_STATUSES),
  });

  const createForm = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { fullName: '', role: 'Technician' },
  });

  const editForm = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { role: 'Technician', status: 'Active' },
  });

  useEffect(() => {
    if (open && isCreate) {
      createForm.reset({ fullName: '', role: 'Technician' });
    }
    if (open && !isCreate && user) {
      editForm.reset({ role: user.role, status: user.status });
    }
  }, [open, isCreate, user, createForm, editForm]);

  const roleOptions = USER_ROLES
    .filter((role) => isCreate || role !== 'Admin' || user?.role === 'Admin')
    .map((role) => ({ value: role, label: t(`user.roles.${role}`) }));

  const statusOptions = USER_STATUSES.filter((status) => status !== 'Locked').map((status) => ({
    value: status,
    label: t(`user.statuses.${status}`),
  }));

  const handleCreateSubmit = createForm.handleSubmit((data) => {
    onSubmit(data);
  });

  const handleEditSubmit = editForm.handleSubmit((data) => {
    onSubmit(data);
  });

  return (
    <Modal
      open={open}
      title={isCreate ? t('user.add_user') : t('user.edit_user')}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
    >
      {isCreate ? (
        <Form layout="vertical" onFinish={handleCreateSubmit}>
          <Form.Item
            label={t('user.fullname_label')}
            validateStatus={createForm.formState.errors.fullName ? 'error' : ''}
            help={createForm.formState.errors.fullName?.message}
            required
          >
            <Controller
              name="fullName"
              control={createForm.control}
              render={({ field }) => (
                <Input {...field} placeholder={t('user.fullname_placeholder')} />
              )}
            />
          </Form.Item>

          <Form.Item
            label={t('user.col_role')}
            validateStatus={createForm.formState.errors.role ? 'error' : ''}
            help={createForm.formState.errors.role?.message}
            required
          >
            <Controller
              name="role"
              control={createForm.control}
              render={({ field }) => (
                <Select {...field} options={roleOptions.filter((o) => o.value !== 'Admin')} />
              )}
            />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="primary" htmlType="submit" loading={isSubmitting}>
              {t('user.create_account')}
            </Button>
          </div>
        </Form>
      ) : (
        <Form layout="vertical" onFinish={handleEditSubmit}>
          <Form.Item label={t('user.col_account')}>
            <Input value={user?.username} disabled />
          </Form.Item>

          <Form.Item label={t('user.fullname_label')}>
            <Input value={user?.fullName} disabled />
          </Form.Item>

          <Form.Item
            label={t('user.col_role')}
            validateStatus={editForm.formState.errors.role ? 'error' : ''}
            help={editForm.formState.errors.role?.message}
          >
            <Controller
              name="role"
              control={editForm.control}
              render={({ field }) => <Select {...field} options={roleOptions} />}
            />
          </Form.Item>

          <Form.Item
            label={t('user.col_status')}
            validateStatus={editForm.formState.errors.status ? 'error' : ''}
            help={editForm.formState.errors.status?.message}
          >
            <Controller
              name="status"
              control={editForm.control}
              render={({ field }) => <Select {...field} options={statusOptions} />}
            />
          </Form.Item>

          <Space style={{ width: '100%', justifyContent: 'space-between', marginTop: 16 }}>
            {onResetPassword && (
              <Popconfirm
                title={t('user.reset_password_confirm')}
                onConfirm={onResetPassword}
                okText={t('common.confirm')}
                cancelText={t('common.cancel')}
              >
                <Button danger>{t('user.reset_password')}</Button>
              </Popconfirm>
            )}
            <Space>
              <Button onClick={onClose}>{t('common.cancel')}</Button>
              <Button type="primary" htmlType="submit" loading={isSubmitting}>
                {t('common.save')}
              </Button>
            </Space>
          </Space>
        </Form>
      )}
    </Modal>
  );
};

export default UserFormModal;
