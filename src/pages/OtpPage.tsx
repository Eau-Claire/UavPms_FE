import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Input } from 'antd';
import type { InputRef } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, MailOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import AuthFrame from '@features/auth/components/AuthFrame';
import { ROUTES } from '@router/routes';
import { useAuth } from '@hooks/useAuth';
import type { OtpPurpose } from '@shared/types';

const OTP_LENGTH = 6;
const OTP_TTL_SECONDS = 3 * 60;

type OtpRouteState = {
  email?: string;
  purpose?: OtpPurpose;
};

const OtpPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { sendOtp, verifyOtp, isLoading } = useAuth();
  const routeState = location.state as OtpRouteState | null;
  const email = routeState?.email ?? '';
  const purpose = routeState?.purpose ?? 'ForgotPassword';
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [apiError, setApiError] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(OTP_TTL_SECONDS);
  const [activeAction, setActiveAction] = useState<'verify' | 'resend' | null>(null);
  const inputRefs = useRef<Array<InputRef | null>>([]);
  const actionLockRef = useRef(false);
  const isBusy = isLoading || activeAction !== null;

  useEffect(() => {
    if (secondsRemaining <= 0) return;
    const timerId = window.setInterval(() => {
      setSecondsRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timerId);
  }, [secondsRemaining]);

  const maskedOtp = useMemo(
    () => Array.from({ length: OTP_LENGTH }, (_, index) => otp[index] ?? ''),
    [otp],
  );

  const handleChange = (index: number, value: string) => {
    const nextValue = value.replace(/\D/g, '').slice(-1);
    setApiError(null);
    setOtp((current) => {
      const next = [...current];
      next[index] = nextValue;
      return next;
    });
    if (nextValue && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  };

  const handlePaste = (index: number, event: React.ClipboardEvent<HTMLInputElement>) => {
    const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!digits) return;
    event.preventDefault();
    setApiError(null);
    setOtp((current) => {
      const next = [...current];
      digits.split('').forEach((digit, offset) => {
        if (index + offset < OTP_LENGTH) next[index + offset] = digit;
      });
      return next;
    });
    inputRefs.current[Math.min(index + digits.length, OTP_LENGTH) - 1]?.focus();
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    if (actionLockRef.current) return;
    const code = otp.join('');
    if (!email) {
      navigate(ROUTES.FORGOT_PASSWORD, { replace: true });
      return;
    }
    if (code.length !== OTP_LENGTH) {
      setApiError(t('otp.error_required'));
      return;
    }

    actionLockRef.current = true;
    setActiveAction('verify');
    try {
      const result = await verifyOtp({
        email,
        otp: code,
        purpose,
      }).unwrap();
      if (purpose === 'EmailVerification') {
        if (result.authentication) {
          navigate(ROUTES.DASHBOARD, { replace: true });
          return;
        }
        navigate(ROUTES.LOGIN, { replace: true, state: { email } });
        return;
      }
      if (purpose === 'Login') {
        if (!result.authentication) {
          setApiError(t('otp.error_generic'));
          return;
        }
        navigate(ROUTES.DASHBOARD, { replace: true });
        return;
      }
      if (!result.verificationToken) {
        setApiError(t('otp.error_generic'));
        return;
      }
      navigate(ROUTES.RESET_PASSWORD, {
        state: { email, verificationToken: result.verificationToken },
      });
    } catch (err: unknown) {
      const error = err as { message?: string };
      setApiError(error?.message ?? t('otp.error_generic'));
    } finally {
      actionLockRef.current = false;
      setActiveAction(null);
    }
  };

  const handleResend = async () => {
    if (actionLockRef.current) return;
    if (!email) {
      navigate(ROUTES.FORGOT_PASSWORD, { replace: true });
      return;
    }

    setApiError(null);
    actionLockRef.current = true;
    setActiveAction('resend');
    try {
      await sendOtp({ email, purpose, isResend: true }).unwrap();
      setOtp(['', '', '', '', '', '']);
      setSecondsRemaining(OTP_TTL_SECONDS);
      inputRefs.current[0]?.focus();
    } catch (err: unknown) {
      const error = err as { message?: string };
      setApiError(error?.message ?? t('otp.error_resend'));
    } finally {
      actionLockRef.current = false;
      setActiveAction(null);
    }
  };

  return (
    <AuthFrame>
      <div className="auth-card auth-card-flow auth-card-otp">
        <Button
          type="link"
          className="auth-back-link"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(purpose === 'ForgotPassword' ? ROUTES.FORGOT_PASSWORD : ROUTES.LOGIN)}
        >
          {t('otp.back')}
        </Button>

        <header className="auth-flow-header">
          <h1>{t('otp.title')}</h1>
          <p>{t('otp.subtitle', { email })}</p>
        </header>

        <div className="otp-label">{t('otp.label')}</div>
        {apiError && <Alert title={apiError} type="error" showIcon className="auth-alert" />}
        <Input
          value={email}
          readOnly
          prefix={<MailOutlined className="auth-input-icon" />}
          size="large"
          className="auth-input otp-email"
          aria-label={t('forgot_password.email_label')}
        />
        <div className="otp-grid" aria-label={t('otp.label')}>
          {maskedOtp.map((value, index) => (
            <Input
              key={`otp-${index}`}
              ref={(element) => { inputRefs.current[index] = element; }}
              value={value}
              placeholder="-"
              className="otp-input"
              maxLength={1}
              inputMode="numeric"
              aria-label={`OTP digit ${index + 1}`}
              disabled={isBusy}
              onChange={(event) => handleChange(index, event.target.value)}
              onPaste={(event) => handlePaste(index, event)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onFocus={(event) => event.target.select()}
            />
          ))}
        </div>

        <div className="otp-meta">
          <span>{`${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, '0')}`}</span>
          <Button
            type="link"
            className="auth-link"
            loading={activeAction === 'resend'}
            disabled={isBusy || secondsRemaining > 0}
            onClick={handleResend}
          >
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
          loading={activeAction === 'verify'}
          disabled={isBusy}
          onClick={handleVerify}
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
