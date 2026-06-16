import { Typography } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { COLORS, TYPOGRAPHY, SPACING } from '@styles/tokens';

const { Title, Text } = Typography;

interface ComingSoonPageProps {
  title: string;
}

/**
 * Component dùng làm placeholder cho các trang đang phát triển.
 *
 * @param title - Tên trang sẽ hiển thị ở thẻ h1
 *
 * @example
 * <ComingSoonPage title="Tổng quan" />
 */
const ComingSoonPage = ({ title }: ComingSoonPageProps) => {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.lg }}>
      <h1
        style={{
          margin: 0,
          fontSize: TYPOGRAPHY.fontSizeXxl,
          fontWeight: TYPOGRAPHY.fontWeightBold,
          color: COLORS.textPrimary,
        }}
      >
        {title}
      </h1>
      <div
        style={{
          backgroundColor: COLORS.bgWhite,
          borderRadius: 8,
          padding: 32,
          textAlign: 'center',
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <WarningOutlined style={{ fontSize: 64, color: '#faad14', marginBottom: 24 }} />
        <Title level={2} style={{ marginBottom: 16 }}>
          {t('common.coming_soon_title', { title })}
        </Title>
        <Text type="secondary" style={{ fontSize: 16 }}>
          {t('common.app_tagline')}
        </Text>
      </div>
    </div>
  );
};

export default ComingSoonPage;
