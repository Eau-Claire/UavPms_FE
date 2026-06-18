import { useState } from 'react';
import { Layout } from 'antd';
import { useIsMobile } from '@hooks/useIsMobile';
import { COLORS, SPACING, TYPOGRAPHY } from '@theme/tokens';
import Sidebar from './layout/Sidebar';
import Header from './layout/Header';

interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * Layout khung chính của ứng dụng.
 *
 * Cấu trúc:
 * ```
 * <Layout>
 *   <Sidebar />          ← bên trái, có thể thu gọn
 *   <Layout>
 *     <Header />         ← sticky, toggle sidebar + user menu
 *     <Content />        ← vùng cuộn, render children
 *     <Footer />         ← cố định, copyright
 *   </Layout>
 * </Layout>
 * ```
 *
 * Responsive:
 * - Desktop: Sidebar chiếm không gian, Content dịch phải theo
 * - Mobile: Sidebar dạng overlay fixed, Content luôn full width
 *
 * @example
 * // Dùng trong PrivateRoute (router/index.tsx)
 * <AppLayout><Outlet /></AppLayout>
 */
const AppLayout = ({ children }: AppLayoutProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = useIsMobile();
  const sidebarCollapsed = isMobile ? !mobileMenuOpen : collapsed;

  const handleSidebarToggle = () => {
    if (isMobile) {
      setMobileMenuOpen((prev) => !prev);
      return;
    }
    setCollapsed((prev) => !prev);
  };

  return (
    <Layout style={{ minHeight: '100vh', display: 'flex' }}>
      <Sidebar collapsed={sidebarCollapsed} isMobile={isMobile} onToggle={handleSidebarToggle} />
      {isMobile && mobileMenuOpen && (
        <div
          aria-hidden="true"
          onClick={() => setMobileMenuOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.28)',
            zIndex: 998,
          }}
        />
      )}

      <Layout
        style={{
          marginLeft: 0,
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          transition: 'margin-left 0.2s ease',
        }}
      >
        <Header isMobile={isMobile} onMenuToggle={handleSidebarToggle} />

        <Layout.Content
          style={{
            padding: isMobile ? SPACING.md : SPACING.md,
            backgroundColor: COLORS.bgBase,
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ flex: 1 }}>{children}</div>
        </Layout.Content>

        <footer
          style={{
            backgroundColor: COLORS.bgWhite,
            borderTop: `1px solid ${COLORS.border}`,
            padding: `${SPACING.smMd}px ${SPACING.lg}px`,
            textAlign: 'center',
            fontSize: TYPOGRAPHY.fontSizeSm,
            color: COLORS.textSecondary,
          }}
        >
          © 2026 UAV-PMS. All rights reserved.
        </footer>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
