import { Button, Avatar, Dropdown } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { Layout } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@hooks/useAuth';
import { getInitials } from '@utils/formatters';
import { ROUTES } from '@constants/routes';
import { COLORS, LAYOUT, SPACING, TYPOGRAPHY } from '@styles/tokens';
import { getUserMenuItems } from './UserMenu';

interface HeaderProps {
  /** Đang chạy trên thiết bị mobile */
  isMobile: boolean;
}

/**
 * Header bar cố định phía trên màn hình.
 *
 * Bao gồm:
 * - Thông tin người dùng: tên + vai trò (desktop only)
 * - Nút chuyển ngôn ngữ
 * - Dropdown menu người dùng (phải)
 */
const Header = ({ isMobile }: HeaderProps) => {
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
      style={{
        backgroundColor: COLORS.bgWhite,
        height: LAYOUT.headerHeight,
        paddingRight: isMobile ? SPACING.smMd : SPACING.lg,
        paddingLeft: isMobile ? SPACING.smMd : SPACING.lg,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: `1px solid ${COLORS.border}`,
        position: 'sticky',
        top: 0,
        zIndex: 998,
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)',
      }}
    >
      {/* Logo - hiển thị bên trái trên navbar */}
      {!isMobile && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: SPACING.sm,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.primaryHover} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: COLORS.bgWhite,
              fontWeight: 'bold',
              fontSize: TYPOGRAPHY.fontSizeMd,
            }}
          >
            U
          </div>
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: TYPOGRAPHY.fontSizeBase, fontWeight: 'bold', color: COLORS.textPrimary }}>
              UAV-PMS
            </div>
            <div style={{ fontSize: TYPOGRAPHY.fontSizeXxs, color: COLORS.textSecondary }}>
              {t('common.app_tagline')}
            </div>
          </div>
        </div>
      )}

      {/* Phần phải: thông tin user + dropdown */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? SPACING.sm : SPACING.md,
          flex: 'none',
        }}
      >
        {/* Desktop: hiện tên + vai trò (không avatar) */}
        {!isMobile && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: SPACING.sm,
              paddingLeft: SPACING.md,
              borderLeft: `1px solid ${COLORS.border}`,
              height: '100%',
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, minWidth: 0, overflow: 'hidden' }}>
              <div
                style={{
                  fontSize: TYPOGRAPHY.fontSizeBase,
                  fontWeight: TYPOGRAPHY.fontWeightSemibold,
                  color: COLORS.textPrimary,
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 200,
                }}
              >
                {user?.fullName}
              </div>
            </div>
          </div>
        )}

        {/* Language Switcher - Badge Style */}
        <div
          style={{
            display: 'flex',
            gap: 0,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 5,
            overflow: 'hidden',
            backgroundColor: COLORS.bgBase,
          }}
        >
          <Button
            type={i18n.language === 'vi' ? 'primary' : 'text'}
            size="small"
            style={{
              borderRadius: 0,
              border: 'none',
              fontWeight: i18n.language === 'vi' ? 'bold' : 'normal',
              padding: '3px 10px',
              height: 'auto',
            }}
            onClick={() => i18n.changeLanguage('vi')}
          >
            VI
          </Button>
          <div style={{ width: 1,  backgroundColor: COLORS.border }} />
          <Button
            type={i18n.language === 'en' ? 'primary' : 'text'}
            size="small"
            style={{
              borderRadius: 0,
              border: 'none',
              fontWeight: i18n.language === 'en' ? 'bold' : 'normal',
              padding: '3px 10px',
              height: 'auto',
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
                <UserOutlined style={{ fontSize: TYPOGRAPHY.fontSizeLg }} />
              ) : (
                <Avatar
                  size={36}
                  style={{
                    backgroundColor: COLORS.primary,
                    color: COLORS.bgWhite,
                    fontWeight: TYPOGRAPHY.fontWeightSemibold,
                  }}
                >
                  {user && getInitials(user.fullName)}
                </Avatar>
              )
            }
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s ease',
            }}
          />
        </Dropdown>
      </div>
    </Layout.Header>
  );
};

export default Header;
