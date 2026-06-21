import { Button, Dropdown, Input } from 'antd';
import {
  AppstoreOutlined,
  BellOutlined,
  MenuOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Layout } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@hooks/useAuth';
import { ROUTES } from '@router/routes';
import { getUserMenuItems } from './UserMenu';

interface HeaderProps {
  /** Đang chạy trên thiết bị mobile */
  isMobile: boolean;
  onMenuToggle: () => void;
}

/**
 * Header bar cố định phía trên màn hình.
 *
 * Bao gồm:
 * - Thông tin người dùng: tên + vai trò (desktop only)
 * - Nút chuyển ngôn ngữ
 * - Dropdown menu người dùng (phải)
 */
const Header = ({ isMobile, onMenuToggle }: HeaderProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const showAssetSearch = !isMobile && location.pathname === ROUTES.ASSETS;

  const handleLogout = async () => {
    await logout();
    navigate(ROUTES.LOGIN);
  };

  const userMenuItems = getUserMenuItems(handleLogout, t);

  return (
    <Layout.Header className="app-header">
      {isMobile ? (
        <Button
          type="text"
          shape="circle"
          aria-label={t('common.open_menu')}
          icon={<MenuOutlined className="icon-lg" />}
          onClick={onMenuToggle}
        />
      ) : (
        <div className="app-header-spacer">
          {showAssetSearch && (
            <Input
              prefix={<SearchOutlined />}
              placeholder={t('asset.search_placeholder')}
              className="asset-header-search"
            />
          )}
        </div>
      )}

      <div className="app-header-actions">
        <button type="button" className="app-header-icon" aria-label={t('common.notifications')}>
          <BellOutlined />
          <span className="app-header-dot" />
        </button>
        <button type="button" className="app-header-icon" aria-label={t('common.apps')}>
          <AppstoreOutlined />
        </button>

        <div className="app-header-divider" />
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
          <button type="button" className="app-profile-button">
            {isMobile ? (
              <UserOutlined className="icon-lg" />
            ) : null}
            {!isMobile && (
              <span className="app-user-name-wrap">
                <span className="app-user-name">{user?.role === 'Admin' ? 'Administrator' : user?.fullName}</span>
                <span className="app-user-role">System Admin</span>
              </span>
            )}
          </button>
        </Dropdown>
      </div>
    </Layout.Header>
  );
};

export default Header;
