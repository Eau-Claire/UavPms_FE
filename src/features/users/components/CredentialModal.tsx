import { Modal, Typography, Space, Button, message } from 'antd';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const { Text, Paragraph } = Typography;

interface CredentialModalProps {
  open: boolean;
  title: string;
  username: string;
  password: string;
  onClose: () => void;
}

const CredentialModal = ({ open, title, username, password, onClose }: CredentialModalProps) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = `${t('user.credential_username')}: ${username}\n${t('user.credential_password')}: ${password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      message.success(t('user.credential_copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      message.error(t('common.copy_failed'));
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      onCancel={onClose}
      footer={[
        <Button key="copy" icon={copied ? <CheckOutlined /> : <CopyOutlined />} onClick={handleCopy}>
          {t('user.credential_copy')}
        </Button>,
        <Button key="close" type="primary" onClick={onClose}>
          {t('common.close')}
        </Button>,
      ]}
    >
      <Paragraph type="secondary">{t('user.credential_warning')}</Paragraph>
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <div>
          <Text type="secondary">{t('user.credential_username')}</Text>
          <div className="credential-value">
            {username}
          </div>
        </div>
        <div>
          <Text type="secondary">{t('user.credential_password')}</Text>
          <div className="credential-value credential-value-primary">
            {password}
          </div>
        </div>
      </Space>
    </Modal>
  );
};

export default CredentialModal;
