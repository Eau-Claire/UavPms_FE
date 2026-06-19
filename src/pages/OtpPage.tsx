import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Input } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import AuthFrame from '@features/auth/components/AuthFrame';
import { ROUTES } from '@router/routes';

const OTP_LENGTH = 6;

const OtpPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const email = (location.state as { email?: string } | null)?.email ?? 'nguyenvana@evn.com.vn';
  const [otp, setOtp] = useState(['4', '8', '2', '', '', '']);

  const maskedOtp = useMemo(
    () => Array.from({ length: OTP_LENGTH }, (_, index) => otp[index] ?? ''),
    [otp],
  );

  const handleChange = (index: number, value: string) => {
    const nextValue = value.replace(/\D/g, '').slice(-1);
    setOtp((current) => {
      const next = [...current];
      next[index] = nextValue;
      return next;
    });
  };

  return (
    <AuthFrame>
      <div className="auth-card auth-card-flow auth-card-otp">
        <Button
          type="link"
          className="auth-back-link"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(ROUTES.FORGOT_PASSWORD)}
        >
          {t('otp.back')}
        </Button>

        <header className="auth-flow-header">
          <h1>{t('otp.title')}</h1>
          <p>{t('otp.subtitle', { email })}</p>
        </header>

        <div className="otp-label">{t('otp.label')}</div>
        <div className="otp-grid" aria-label={t('otp.label')}>
          {maskedOtp.map((value, index) => (
            <Input
              key={`otp-${index}`}
              value={value}
              placeholder="-"
              className="otp-input"
              maxLength={1}
              inputMode="numeric"
              onChange={(event) => handleChange(index, event.target.value)}
              onFocus={(event) => event.target.select()}
            />
          ))}
        </div>

        <div className="otp-meta">
          <span>{t('otp.timer')}</span>
          <Button type="link" className="auth-link">
            {t('otp.resend')}
          </Button>
        </div>

        <Button
          type="primary"
          block
          size="large"
          className="evn-primary-button"
          aria-label={t('otp.submit')}
          icon={<ArrowRightOutlined />}
          iconPlacement="end"
          onClick={() => navigate(ROUTES.RESET_PASSWORD)}
        >
          {t('otp.submit')}
        </Button>

        <p className="auth-muted-note">{t('otp.helper')}</p>
        <p className="auth-copyright">{t('common.copyright')}</p>
      </div>
    </AuthFrame>
  );
};

export default OtpPage;
