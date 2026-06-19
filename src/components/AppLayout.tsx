import { Layout } from 'antd';
import { useIsMobile } from '@hooks/useIsMobile';
import { useUiStore } from '@store/uiStore';
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
  const isMobile = useIsMobile();
  const sidebarCollapsedState = useUiStore((state) => state.sidebarCollapsed);
  const mobileMenuOpen = useUiStore((state) => state.mobileMenuOpen);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const toggleMobileMenu = useUiStore((state) => state.toggleMobileMenu);
  const closeMobileMenu = useUiStore((state) => state.closeMobileMenu);
  const sidebarCollapsed = isMobile ? !mobileMenuOpen : sidebarCollapsedState;

  const handleSidebarToggle = () => {
    if (isMobile) {
      toggleMobileMenu();
      return;
    }
    toggleSidebar();
  };

  return (
    <Layout className="app-shell">
      <Sidebar collapsed={sidebarCollapsed} isMobile={isMobile} onToggle={handleSidebarToggle} />
      {isMobile && mobileMenuOpen && (
        <div
          aria-hidden="true"
          onClick={closeMobileMenu}
          className="app-backdrop"
        />
      )}

      <Layout className="app-main">
        <Header isMobile={isMobile} onMenuToggle={handleSidebarToggle} />

        <Layout.Content className="app-content">
          <div className="app-content-inner">{children}</div>
        </Layout.Content>

        <footer className="app-footer">
          © 2026 UAV-PMS. All rights reserved.
        </footer>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
