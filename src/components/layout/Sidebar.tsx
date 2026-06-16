import { Layout, Menu, Button } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePermission } from '@hooks/usePermission';
import { ROUTES } from '@constants/routes';
import { COLORS, LAYOUT, SPACING, TYPOGRAPHY } from '@styles/tokens';

interface SidebarProps {
  /** Sidebar đang thu gọn (chỉ hiện icon) */
  collapsed: boolean;
  /** Đang chạy trên thiết bị mobile */
  isMobile: boolean;
  /** Callback khi nhấn nút toggle sidebar */
  onToggle: () => void;
}

/**
 * Sidebar navigation chính.
 *
 * Hành vi:
 * - Desktop: nằm cố định bên trái, đẩy content sang phải
 * - Mobile: overlay fixed, đè lên content (zIndex cao hơn)
 *
 * Menu item động:
 * - "Quản lý người dùng" chỉ hiện với Admin (`usePermission().isAdmin`)
 * - Các item có `disabled: true` là placeholder cho tính năng chưa làm
 */
const Sidebar = ({ collapsed, isMobile, onToggle }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = usePermission();
  const { t } = useTranslation();

  // Danh sách menu item — Admin có thêm mục Quản lý người dùng
  const menuItems = [
    {
      key: ROUTES.DASHBOARD,
      label: t('sidebar.dashboard'),
      icon: <DashboardOutlined />,
    },
    ...(isAdmin
      ? [
          {
            key: ROUTES.ADMIN_USERS,
            label: t('sidebar.user_management'),
            icon: <TeamOutlined />,
          },
        ]
      : []),
    { key: 'tasks', label: t('sidebar.task_management'), disabled: true, icon: <SettingOutlined /> },
    { key: 'inspection', label: t('sidebar.inspection'), disabled: true, icon: <SettingOutlined /> },
    { key: 'maintenance', label: t('sidebar.maintenance'), disabled: true, icon: <SettingOutlined /> },
    { key: 'analytics', label: t('sidebar.analytics'), disabled: true, icon: <SettingOutlined /> },
  ];

  return (
    <Layout.Sider
      collapsed={collapsed}
      collapsible
      trigger={null}
      width={LAYOUT.sidebarWidth}
      collapsedWidth={LAYOUT.sidebarCollapsedWidth}
      style={{
        backgroundColor: COLORS.bgWhite,
        position: isMobile ? 'fixed' : 'relative',
        height: '100vh',
        left: 0,
        top: 0,
        zIndex: isMobile ? 999 : 'auto',
        borderRight: `1px solid ${COLORS.border}`,
        overflow: 'auto',
        boxShadow: isMobile ? '2px 0 8px rgba(0, 0, 0, 0.08)' : 'none',
      }}
    >
      {/* Toggle button - positioned at top right of sidebar */}
      {!isMobile && (
        <Button
          type="text"
          size="small"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={onToggle}
          style={{
            position: 'absolute',
            top: SPACING.md,
            right: SPACING.smMd,
            fontSize: TYPOGRAPHY.fontSizeBase,
            color: COLORS.textPrimary,
            transition: 'all 0.3s ease',
            padding: '4px 8px',
            height: 'auto',
            zIndex: 10,
          }}
          title={collapsed ? 'Mở sidebar' : 'Đóng sidebar'}
        />
      )}

      <Menu
        mode="inline"
        selectedKeys={[location.pathname]}
        onClick={({ key }) => navigate(key)}
        items={menuItems}
        style={{
          backgroundColor: COLORS.bgWhite,
          color: COLORS.textPrimary,
          borderRight: 'none',
          marginTop: SPACING.lg,
          paddingTop: SPACING.md,
        }}
        theme="light"
      />
    </Layout.Sider>
  );
};

export default Sidebar;
