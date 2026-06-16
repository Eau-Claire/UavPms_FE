import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@styles/tokens';
import { useTranslation } from 'react-i18next';

interface SidebarLogoProps {
  /** Sidebar đang ở trạng thái thu gọn */
  collapsed: boolean;
}

/**
 * Logo và tên ứng dụng hiển thị ở đầu sidebar.
 * Khi thu gọn: chỉ hiện icon hình vuông chữ "U".
 * Khi mở rộng: hiện thêm tên app và tagline.
 */
const SidebarLogo = ({ collapsed }: SidebarLogoProps) => {
  const { t } = useTranslation();

  return (
    <>
      {/* Icon logo */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: collapsed ? 0 : SPACING.sm,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: RADIUS.lg,
            background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.primaryHover} 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: COLORS.bgWhite,
            fontWeight: TYPOGRAPHY.fontWeightBold,
            fontSize: TYPOGRAPHY.fontSizeMd,
            flexShrink: 0,
          }}
        >
          U
        </div>
      </div>

      {/* Tên app — ẩn khi thu gọn */}
      {!collapsed && (
        <div style={{ textAlign: 'center' }}>
          <h2
            style={{
              color: COLORS.textPrimary,
              margin: '0 0 2px 0',
              fontSize: TYPOGRAPHY.fontSizeBase,
              fontWeight: TYPOGRAPHY.fontWeightBold,
            }}
          >
            {t('common.app_name')}
          </h2>
          <p
            style={{
              color: COLORS.textSecondary,
              fontSize: TYPOGRAPHY.fontSizeXxs,
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            {t('common.app_tagline')}
          </p>
        </div>
      )}
    </>
  );
};

export default SidebarLogo;
