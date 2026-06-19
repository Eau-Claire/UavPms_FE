import { useEffect } from 'react';
import { Modal, Form, Input, Select, Button, Space, Popconfirm } from 'antd';
import { InfoCircleOutlined, LockFilled, MailOutlined } from '@ant-design/icons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { USER_ROLES, USER_STATUSES, type User, type UserRole, type UserStatus } from '@shared/types';
import { generatePassword } from '@utils/userGenerator';

type FormMode = 'create' | 'edit';

interface UserFormModalProps {
  open: boolean;
  mode: FormMode;
  user?: User | null;
  isSubmitting: boolean;
  onSubmit: (data: {
    fullName?: string;
    email?: string;
    phone?: string;
    role: UserRole;
    status?: UserStatus;
    temporaryPassword?: string;
  }) => void;
  onResetPassword?: () => void;
  onClose: () => void;
}

type CreateFormValues = {
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  temporaryPassword: string;
};
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
    email: z.string().email(t('user.email_invalid')),
    phone: z.string().min(8, t('user.phone_required')),
    role: z.enum(USER_ROLES),
    temporaryPassword: z.string().min(8, t('user.temp_password_required')),
  });

  const editSchema = z.object({
    role: z.enum(USER_ROLES),
    status: z.enum(USER_STATUSES),
  });

  const createForm = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      role: 'Technician',
      temporaryPassword: generatePassword(),
    },
  });

  const editForm = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { role: 'Technician', status: 'Active' },
  });

  useEffect(() => {
    if (open && isCreate) {
      createForm.reset({
        fullName: '',
        email: '',
        phone: '',
        role: 'Technician',
        temporaryPassword: generatePassword(),
      });
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
      centered
      width={isCreate ? 520 : 680}
      className="user-form-modal"
    >
      {isCreate ? (
        <Form layout="vertical" onFinish={handleCreateSubmit} className="user-create-form">
          <p className="user-modal-description">
            {t('user.create_user_description')}
          </p>
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
                <Input {...field} placeholder={t('user.fullname_example')} />
              )}
            />
          </Form.Item>

          <Form.Item
            label={t('user.col_email')}
            validateStatus={createForm.formState.errors.email ? 'error' : ''}
            help={createForm.formState.errors.email?.message}
            required
          >
            <Controller
              name="email"
              control={createForm.control}
              render={({ field }) => (
                <Input
                  {...field}
                  prefix={<MailOutlined className="auth-input-icon" />}
                  placeholder={t('user.email_placeholder')}
                />
              )}
            />
          </Form.Item>

          <Form.Item
            label={t('user.phone_label')}
            validateStatus={createForm.formState.errors.phone ? 'error' : ''}
            help={createForm.formState.errors.phone?.message}
            required
          >
            <Controller
              name="phone"
              control={createForm.control}
              render={({ field }) => (
                <Input {...field} placeholder={t('user.phone_placeholder')} />
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
                <Select
                  {...field}
                  placeholder={t('user.role_placeholder')}
                  options={roleOptions.filter((o) => o.value !== 'Admin')}
                />
              )}
            />
          </Form.Item>

          <Form.Item
            label={(
              <span className="modal-password-label">
                <span>{t('user.temp_password_label')}</span>
                <Button
                  type="link"
                  className="modal-random-password"
                  onClick={() => createForm.setValue('temporaryPassword', generatePassword(), {
                    shouldDirty: true,
                    shouldValidate: true,
                  })}
                >
                  {t('user.generate_random')}
                </Button>
              </span>
            )}
            validateStatus={createForm.formState.errors.temporaryPassword ? 'error' : ''}
            help={createForm.formState.errors.temporaryPassword?.message ?? t('user.temp_password_helper')}
            required
          >
            <Controller
              name="temporaryPassword"
              control={createForm.control}
              render={({ field }) => (
                <Input.Password {...field} placeholder="********" />
              )}
            />
          </Form.Item>

          <div className="modal-action-bar">
            <Button className="modal-secondary-button" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={isSubmitting}
              className="evn-primary-button modal-primary-button"
            >
              {t('user.create_account')}
            </Button>
          </div>
        </Form>
      ) : (
        <Form layout="vertical" onFinish={handleEditSubmit}>
          <Form.Item label={t('user.fullname_label')}>
            <Input defaultValue={user?.fullName} />
          </Form.Item>

          <Form.Item label={t('user.col_email')}>
            <Input defaultValue={user?.email} disabled suffix={<LockFilled />} />
          </Form.Item>

          <Form.Item label={t('user.phone_label')}>
            <Input defaultValue="090 123 4567" />
          </Form.Item>

          <div className="modal-field-grid">
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
              label={(
                <span className="modal-label-with-icon">
                  {t('user.col_status')}
                  <InfoCircleOutlined />
                </span>
              )}
              validateStatus={editForm.formState.errors.status ? 'error' : ''}
              help={editForm.formState.errors.status?.message}
            >
              <Controller
                name="status"
                control={editForm.control}
                render={({ field }) => <Select {...field} options={statusOptions} />}
              />
            </Form.Item>
          </div>

          <div className="modal-action-bar modal-action-bar-split">
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
            <Space className="modal-action-buttons">
              <Button className="modal-secondary-button" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={isSubmitting}
                className="evn-primary-button modal-primary-button"
              >
                {t('common.save')}
              </Button>
            </Space>
          </div>
        </Form>
      )}
    </Modal>
  );
};

export default UserFormModal;
