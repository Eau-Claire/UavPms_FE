import { useMemo, useState } from 'react';
import {
  Card,
  Button,
  Space,
  Table,
  Tag,
  Avatar,
  Row,
  Col,
  Input,
  message,
  Popconfirm,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import type { User, UserRole, UserStatus } from '@shared/types';
import { getInitials } from '@utils/formatters';
import { useTranslation } from 'react-i18next';
import { useUsers } from '@hooks/useUsers';
import { useAuth } from '@hooks/useAuth';
import UserFormModal from '@features/users/components/UserFormModal';
import CredentialModal from '@features/users/components/CredentialModal';

const ROLE_COLORS: Record<UserRole, string> = {
  Admin: '#FF4D4F',
  Manager: '#1890FF',
  Technician: '#52C41A',
  Viewer: '#FAAD14',
};

const STATUS_COLORS: Record<UserStatus, string> = {
  Active: 'green',
  Inactive: 'orange',
  Locked: 'red',
};

const UserManagementPage = () => {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const { users, isLoading, isSubmitting, createUser, updateUser, resetPassword, deleteUser } =
    useUsers();

  const [searchText, setSearchText] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [credentialModal, setCredentialModal] = useState<{
    title: string;
    username: string;
    password: string;
  } | null>(null);

  const filteredUsers = useMemo(() => {
    const keyword = appliedSearch.trim().toLowerCase();
    if (!keyword) return users;
    return users.filter(
      (u) =>
        u.fullName.toLowerCase().includes(keyword) ||
        u.username.toLowerCase().includes(keyword) ||
        u.email.toLowerCase().includes(keyword),
    );
  }, [users, appliedSearch]);

  const tableData = filteredUsers.map((user) => ({ ...user, key: user.id }));

  const handleSearch = () => setAppliedSearch(searchText);
  const handleClearFilter = () => {
    setSearchText('');
    setAppliedSearch('');
  };

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

  const handleCreate = async (data: { fullName?: string; role: User['role'] }) => {
    try {
      const result = await createUser({
        fullName: data.fullName!,
        role: data.role,
      }).unwrap();

      setModalOpen(false);
      setCredentialModal({
        title: t('user.create_success_title'),
        username: result.username,
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
        username: result.username,
        password: result.temporaryPassword,
      });
      message.success(t('user.reset_password_success'));
    } catch {
      message.error(t('user.reset_password_error'));
    }
  };

  const handleDelete = async (user: User) => {
    if (user.id === currentUser?.id) {
      message.warning(t('user.cannot_delete_self'));
      return;
    }

    try {
      await deleteUser(user.id).unwrap();
      message.success(t('user.delete_success'));
    } catch {
      message.error(t('user.delete_error'));
    }
  };

  const columns = [
    {
      title: t('user.col_user'),
      key: 'user',
      render: (_: unknown, record: User) => (
        <div className="user-cell">
          <Avatar className="user-avatar">
            {getInitials(record.fullName)}
          </Avatar>
          <div>
            <div className="user-name">
              {record.fullName}
            </div>
            <div className="user-email">
              {record.email}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: t('user.col_account'),
      dataIndex: 'username',
      key: 'username',
      render: (text: string) => (
        <span className="mono-sm">{text}</span>
      ),
    },
    {
      title: t('user.col_role'),
      dataIndex: 'role',
      key: 'role',
      render: (role: User['role']) => (
        <Tag color={ROLE_COLORS[role]}>{t(`user.roles.${role}`)}</Tag>
      ),
    },
    {
      title: t('user.col_status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: User['status']) => (
        <Tag color={STATUS_COLORS[status]}>{t(`user.statuses.${status}`)}</Tag>
      ),
    },
    {
      title: t('common.action'),
      key: 'action',
      render: (_: unknown, record: User) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            title={t('common.edit')}
            onClick={() => openEditModal(record)}
          />
          <Popconfirm
            title={t('user.delete_confirm')}
            onConfirm={() => handleDelete(record)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            disabled={record.id === currentUser?.id}
          >
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              danger
              title={t('common.delete')}
              disabled={record.id === currentUser?.id}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {t('user.title')}
          </h1>
          <p className="page-subtitle">
            {t('user.subtitle')}
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} size="large" onClick={openCreateModal}>
          {t('user.add_user')}
        </Button>
      </div>

      <Card
        className="surface-card"
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={8}>
            <Input
              placeholder={t('user.search_placeholder')}
              prefix={<SearchOutlined className="icon-muted" />}
              className="input-rounded"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={handleSearch}
            />
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Button block onClick={handleSearch}>
              {t('common.search')}
            </Button>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Button block onClick={handleClearFilter}>
              {t('common.clear_filter')}
            </Button>
          </Col>
        </Row>
      </Card>

      <Card
        className="surface-card"
        styles={{ body: { padding: 0 } }}
      >
        <Table
          columns={columns}
          dataSource={tableData}
          loading={isLoading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => t('common.total_records', { total }),
          }}
          className="input-rounded"
        />
      </Card>

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
          username={credentialModal.username}
          password={credentialModal.password}
          onClose={() => setCredentialModal(null)}
        />
      )}
    </div>
  );
};

export default UserManagementPage;
