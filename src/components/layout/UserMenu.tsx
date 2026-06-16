import { Space } from 'antd';
import { UserOutlined, SettingOutlined, LogoutOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';

/**
 * Tạo danh sách menu item cho dropdown người dùng.
 *
 * Tách ra thành factory function thay vì component để dùng trực tiếp
 * với Ant Design `<Dropdown menu={{ items }}>` prop.
 *
 * @param onLogout - Callback xử lý đăng xuất (truyền từ Header)
 * @returns Mảng MenuProps['items'] compatible với Ant Design Dropdown
 *
 * @example
 * const items = getUserMenuItems(handleLogout);
 * <Dropdown menu={{ items }} placement="bottomRight">...</Dropdown>
 */
export const getUserMenuItems = (onLogout: () => void, t: any): MenuProps['items'] => [
  {
    key: 'profile',
    label: (
      <Space size={8}>
        <UserOutlined />
        <span>{t('header.profile')}</span>
      </Space>
    ),
  },
  {
    key: 'settings',
    label: (
      <Space size={8}>
        <SettingOutlined />
        <span>{t('header.settings')}</span>
      </Space>
    ),
  },
  { type: 'divider' as const },
  {
    key: 'logout',
    label: (
      <Space size={8}>
        <LogoutOutlined />
        <span>{t('header.logout')}</span>
      </Space>
    ),
    onClick: onLogout,
    danger: true,
  },
];
