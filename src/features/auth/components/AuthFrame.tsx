import type { ReactNode } from 'react';
import logoUrl from '@assets/images/Logo.png';

interface AuthFrameProps {
  children: ReactNode;
}

const AuthFrame = ({ children }: AuthFrameProps) => (
  <main className="auth-split">
    <section className="auth-brand-panel" aria-label="EVN">
      <img src={logoUrl} alt="EVN Logo" className="auth-brand-logo" />
      <div className="auth-brand-vi">TẬP ĐOÀN ĐIỆN LỰC VIỆT NAM</div>
      <div className="auth-brand-en">VIETNAM ELECTRICITY</div>
    </section>
    <section className="auth-form-panel">{children}</section>
  </main>
);

export default AuthFrame;
