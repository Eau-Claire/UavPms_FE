import { Typography } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

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
    <div className="page-stack">
      <h1 className="page-title">
        {title}
      </h1>
      <div className="coming-soon-panel">
        <WarningOutlined className="coming-soon-icon" />
        <Title level={2} className="coming-soon-title">
          {t('common.coming_soon_title', { title })}
        </Title>
        <Text type="secondary" className="coming-soon-text">
          {t('common.app_tagline')}
        </Text>
      </div>
    </div>
  );
};

export default ComingSoonPage;
