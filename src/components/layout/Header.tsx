import { Button, Avatar, Dropdown } from 'antd';
import { MenuOutlined, UserOutlined } from '@ant-design/icons';
import { Layout } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@hooks/useAuth';
import { getInitials } from '@utils/formatters';
import { ROUTES } from '@router/routes';
import { LAYOUT } from '@theme/layout';
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
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();

  const handleLogout = async () => {
    await logout();
    navigate(ROUTES.LOGIN);
  };

  const userMenuItems = getUserMenuItems(handleLogout, t);

  return (
    <Layout.Header
      className="app-header"
      style={{
        height: LAYOUT.headerHeight,
        paddingRight: isMobile ? 12 : 24,
        paddingLeft: isMobile ? 12 : 24,
      }}
    >
      {/* Logo - hiển thị bên trái trên navbar */}
      {isMobile ? (
        <Button
          type="text"
          shape="circle"
          aria-label={t('common.open_menu')}
          icon={<MenuOutlined className="icon-lg" />}
          onClick={onMenuToggle}
        />
      ) : (
        <div className="app-brand">
          <div className="app-brand-mark">
            U
          </div>
          <div className="app-brand-copy">
            <div className="app-brand-title">
              UAV-PMS
            </div>
            <div className="app-brand-tagline">
              {t('common.app_tagline')}
            </div>
          </div>
        </div>
      )}

      {/* Phần phải: thông tin user + dropdown */}
      <div
        className="app-header-actions"
        style={{
          gap: isMobile ? 8 : 16,
        }}
      >
        {/* Desktop: hiện tên + vai trò (không avatar) */}
        {!isMobile && (
          <div className="app-user-summary">
            <div className="app-user-name-wrap">
              <div className="app-user-name">
                {user?.fullName}
              </div>
            </div>
          </div>
        )}

        {/* Language Switcher - Badge Style */}
        <div className="language-switcher">
          <Button
            type={i18n.language === 'vi' ? 'primary' : 'text'}
            size="small"
            className="language-button"
            style={{
              fontWeight: i18n.language === 'vi' ? 'bold' : 'normal',
            }}
            onClick={() => i18n.changeLanguage('vi')}
          >
            VI
          </Button>
          <div className="language-divider" />
          <Button
            type={i18n.language === 'en' ? 'primary' : 'text'}
            size="small"
            className="language-button"
            style={{
              fontWeight: i18n.language === 'en' ? 'bold' : 'normal',
            }}
            onClick={() => i18n.changeLanguage('en')}
          >
            EN
          </Button>
        </div>

        {/* Dropdown menu — luôn hiện (icon user trên mobile, avatar nhỏ trên desktop) */}
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
          <Button
            type="text"
            shape="circle"
            icon={
              isMobile ? (
                <UserOutlined className="icon-lg" />
              ) : (
                <Avatar
                  size={36}
                  className="app-avatar"
                >
                  {user && getInitials(user.fullName)}
                </Avatar>
              )
            }
            className="app-user-button"
          />
        </Dropdown>
      </div>
    </Layout.Header>
  );
};

export default Header;
