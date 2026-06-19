import { useMemo, useState } from 'react';
import {
  Button,
  Table,
  Input,
  message,
  Select,
  Tooltip,
} from 'antd';
import {
  EditOutlined,
  FilterOutlined,
  MoreOutlined,
  PlusOutlined,
  SearchOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import { USER_ROLES, USER_STATUSES, type User, type UserRole, type UserStatus } from '@shared/types';
import { useTranslation } from 'react-i18next';
import { useUsers } from '@hooks/useUsers';
import { useAuth } from '@hooks/useAuth';
import UserFormModal from '@features/users/components/UserFormModal';
import CredentialModal from '@features/users/components/CredentialModal';

const ROLE_COLORS: Record<UserRole, string> = {
  Admin: 'role-admin',
  Manager: 'role-manager',
  Inspector: 'role-inspector',
  Technician: 'role-technician',
  Analyst: 'role-analyst',
  Viewer: 'role-viewer',
};

const STATUS_CLASSES: Record<UserStatus, string> = {
  Active: 'status-active',
  Inactive: 'status-inactive',
  Locked: 'status-locked',
};

const UserManagementPage = () => {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const { users, isLoading, isSubmitting, createUser, updateUser, resetPassword } =
    useUsers();

  const [searchText, setSearchText] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | undefined>();
  const [statusFilter, setStatusFilter] = useState<UserStatus | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [credentialModal, setCredentialModal] = useState<{
    title: string;
    email: string;
    password: string;
  } | null>(null);

  const filteredUsers = useMemo(() => {
    const keyword = appliedSearch.trim().toLowerCase();
    return users.filter((u) => {
      const matchesKeyword =
        !keyword ||
        u.fullName.toLowerCase().includes(keyword) ||
        u.username.toLowerCase().includes(keyword) ||
        u.email.toLowerCase().includes(keyword);

      return (
        (!roleFilter || u.role === roleFilter) &&
        (!statusFilter || u.status === statusFilter) &&
        matchesKeyword
      );
    });
  }, [users, appliedSearch, roleFilter, statusFilter]);

  const tableData = filteredUsers.map((user) => ({ ...user, key: user.id }));

  const handleSearch = () => setAppliedSearch(searchText);

  const openCreateModal = () => {
    setModalMode('create');
    setSelectedUser(null);
    setModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setModalMode('edit');
    setSelectedUser(user);
    setModalOpen(true);
  };

  const handleCreate = async (data: {
    fullName?: string;
    email?: string;
    phone?: string;
    role: User['role'];
    temporaryPassword?: string;
  }) => {
    try {
      const result = await createUser({
        fullName: data.fullName!,
        email: data.email!,
        phone: data.phone,
        role: data.role,
        temporaryPassword: data.temporaryPassword,
      }).unwrap();

      setModalOpen(false);
      setCredentialModal({
        title: t('user.create_success_title'),
        email: result.user.email,
        password: result.temporaryPassword,
      });
      message.success(t('user.create_success'));
    } catch {
      message.error(t('user.create_error'));
    }
  };

  const handleEdit = async (data: {
    role: User['role'];
    status?: User['status'];
  }) => {
    if (!selectedUser) return;

    try {
      await updateUser(selectedUser.id, {
        role: data.role,
        status: data.status,
      }).unwrap();

      setModalOpen(false);
      message.success(t('user.update_success'));
    } catch {
      message.error(t('user.update_error'));
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;

    try {
      const result = await resetPassword(selectedUser.id).unwrap();
      setModalOpen(false);
      setCredentialModal({
        title: t('user.reset_password_success_title'),
        email: selectedUser.email,
        password: result.temporaryPassword,
      });
      message.success(t('user.reset_password_success'));
    } catch {
      message.error(t('user.reset_password_error'));
    }
  };

  const handleUnlock = async (user: User) => {
    try {
      await updateUser(user.id, { status: 'Active' }).unwrap();
      message.success(t('user.unlock_success'));
    } catch {
      message.error(t('user.update_error'));
    }
  };

  const columns = [
    {
      title: t('user.col_user').toUpperCase(),
      key: 'user',
      render: (_: unknown, record: User) => (
        <div className="user-cell">
          <div>
            <div className="user-name">
              {record.fullName}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: t('user.col_email').toUpperCase(),
      dataIndex: 'email',
      key: 'email',
      render: (email: string) => <span className="user-table-email">{email}</span>,
    },
    {
      title: t('user.col_role').toUpperCase(),
      dataIndex: 'role',
      key: 'role',
      render: (role: User['role']) => (
        <span className={`role-pill ${ROLE_COLORS[role]}`}>{t(`user.roles.${role}`)}</span>
      ),
    },
    {
      title: t('user.col_status').toUpperCase(),
      dataIndex: 'status',
      key: 'status',
      render: (status: User['status']) => (
        <span className={`status-pill ${STATUS_CLASSES[status]}`}>
          <span className="status-dot" />
          {t(`user.statuses.${status}`)}
        </span>
      ),
    },
    {
      title: t('common.action').toUpperCase(),
      key: 'action',
      render: (_: unknown, record: User) => (
        <div className="table-actions">
          <Tooltip title={t('common.edit')}>
            <Button
              type="text"
              size="small"
              className="table-action-button table-action-edit"
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
            />
          </Tooltip>
          {record.status === 'Locked' ? (
            <Tooltip title={t('user.unlock')}>
              <Button
                size="small"
                icon={<UnlockOutlined />}
                className="table-action-unlock"
                onClick={() => handleUnlock(record)}
                disabled={record.id === currentUser?.id}
              >
                {t('user.unlock').toUpperCase()}
              </Button>
            </Tooltip>
          ) : (
            <Tooltip title={t('common.more')}>
              <Button
                type="text"
                size="small"
                icon={<MoreOutlined />}
                className="table-action-button table-action-more"
              />
            </Tooltip>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="page-stack user-management-page">
      <div className="page-header user-page-header">
        <div className="page-heading-group">
          <div className="page-breadcrumb">
            <span>{t('sidebar.settings').toUpperCase()}</span>
            <span>/</span>
            <strong>{t('user.breadcrumb')}</strong>
          </div>
          <h1 className="page-title">
            {t('user.title')}
          </h1>
          <p className="page-subtitle">
            {t('user.subtitle')}
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} size="large" onClick={openCreateModal}>
          {t('user.add_user').toUpperCase()}
        </Button>
      </div>

      <section className="filter-panel">
        <Input
          placeholder={t('user.search_placeholder')}
          prefix={<SearchOutlined className="icon-muted" />}
          className="filter-search"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onPressEnter={handleSearch}
        />
        <label className="filter-control">
          <span>{t('user.col_role').toUpperCase()}:</span>
          <Select
            allowClear
            placeholder={t('common.all')}
            className="filter-select"
            popupMatchSelectWidth={false}
            value={roleFilter}
            options={USER_ROLES.map((role) => ({ value: role, label: t(`user.roles.${role}`) }))}
            onChange={(value) => setRoleFilter(value)}
          />
        </label>
        <label className="filter-control filter-control-status">
          <span>{t('user.col_status').toUpperCase()}:</span>
          <Select
            allowClear
            placeholder={t('common.all')}
            className="filter-select"
            popupMatchSelectWidth={false}
            value={statusFilter}
            options={USER_STATUSES.map((status) => ({
              value: status,
              label: t(`user.statuses.${status}`),
            }))}
            onChange={(value) => setStatusFilter(value)}
          />
        </label>
        <Button className="filter-icon-button" icon={<FilterOutlined />} onClick={handleSearch} />
      </section>

      <section className="user-table-shell">
        <Table
          columns={columns}
          dataSource={tableData}
          loading={isLoading}
          rowClassName={(record) => (record.status === 'Locked' ? 'user-row-locked' : '')}
          pagination={{
            pageSize: 10,
            total: 47,
            showSizeChanger: false,
            showTotal: () => t('user.pagination_summary'),
          }}
          className="evn-table user-table"
        />
      </section>

      <UserFormModal
        open={modalOpen}
        mode={modalMode}
        user={selectedUser}
        isSubmitting={isSubmitting}
        onSubmit={(data) => (modalMode === 'create' ? handleCreate(data) : handleEdit(data))}
        onResetPassword={modalMode === 'edit' ? handleResetPassword : undefined}
        onClose={() => setModalOpen(false)}
      />

      {credentialModal && (
        <CredentialModal
          open
          title={credentialModal.title}
          email={credentialModal.email}
          password={credentialModal.password}
          onClose={() => setCredentialModal(null)}
        />
      )}
    </div>
  );
};

export default UserManagementPage;
