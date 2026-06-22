import { Layout } from 'antd';
import type { ReactNode } from 'react';
import {
  AppstoreOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  QuestionCircleOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ROUTES } from '@router/routes';
import { LAYOUT } from '@theme/layout';
import logoUrl from '@assets/images/evn-sidebar-logo.png';

interface SidebarProps {
  /** Sidebar đang thu gọn (chỉ hiện icon) */
  collapsed: boolean;
  /** Đang chạy trên thiết bị mobile */
  isMobile: boolean;
  /** Callback khi nhấn nút toggle sidebar */
  onToggle: () => void;
}

interface SidebarNavItem {
  key: string;
  label: string;
  icon: ReactNode;
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
  const { t } = useTranslation();

  if (isMobile && collapsed) {
    return null;
  }

  const primaryItems: SidebarNavItem[] = [
    {
      key: ROUTES.DASHBOARD,
      label: t('sidebar.dashboard'),
      icon: <DashboardOutlined />,
    },
    {
      key: ROUTES.ADMIN_USERS,
      label: t('sidebar.user_management'),
      icon: <TeamOutlined />,
    },
    {
      key: ROUTES.ASSETS,
      label: t('sidebar.asset_management'),
      icon: <DatabaseOutlined />,
    },
    {
      key: ROUTES.ADMIN_TASKS,
      label: t('sidebar.missions'),
      icon: <AppstoreOutlined />,
    },
    {
      key: ROUTES.ANALYTICS,
      label: t('sidebar.reports'),
      icon: <FileTextOutlined />,
    },
  ];

  const secondaryItems: SidebarNavItem[] = [
    {
      key: ROUTES.MAINTENANCE,
      label: t('sidebar.settings'),
      icon: <SettingOutlined />,
    },
    {
      key: ROUTES.INSPECTION,
      label: t('sidebar.support'),
      icon: <QuestionCircleOutlined />,
    },
  ];

  const renderNavItem = (item: SidebarNavItem) => {
    const isActive = location.pathname === item.key;
    return (
      <button
        key={item.key}
        type="button"
        className={isActive ? 'app-nav-item app-nav-item-active' : 'app-nav-item'}
        onClick={() => {
          navigate(item.key);
          if (isMobile) onToggle();
        }}
      >
        <span className="app-nav-icon">{item.icon}</span>
        {!collapsed && <span className="app-nav-label">{item.label}</span>}
      </button>
    );
  };

  return (
    <Layout.Sider
      collapsed={collapsed}
      collapsible={isMobile}
      trigger={null}
      width={LAYOUT.sidebarWidth}
      collapsedWidth={isMobile ? 0 : LAYOUT.sidebarCollapsedWidth}
      className={isMobile ? 'app-sidebar app-sidebar-mobile' : 'app-sidebar'}
    >
      <div className="app-sidebar-brand">
        <img src={logoUrl} alt="EVN Logo" className="app-sidebar-logo" />
      </div>

      <nav className="app-sidebar-nav" aria-label={t('common.main_navigation')}>
        <div className="app-sidebar-nav-primary">{primaryItems.map(renderNavItem)}</div>
        <div className="app-sidebar-nav-secondary">
          {secondaryItems.map(renderNavItem)}
        </div>
      </nav>
    </Layout.Sider>
  );
};

export default Sidebar;
