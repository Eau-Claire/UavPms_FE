import { useState, useEffect } from 'react';
import { LAYOUT } from '@styles/tokens';

/**
 * Hook kiểm tra màn hình có phải mobile không.
 * Tự động cập nhật khi user resize window.
 *
 * Threshold: LAYOUT.mobileBreakpoint (768px)
 *
 * @returns `true` nếu chiều rộng viewport < 768px
 *
 * @example
 * const isMobile = useIsMobile();
 * <div style={{ padding: isMobile ? 12 : 24 }}>...</div>
 */
export const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState(
    // Dùng lazy initializer để tránh server-side rendering lỗi (nếu sau này dùng SSR)
    () => window.innerWidth < LAYOUT.mobileBreakpoint,
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < LAYOUT.mobileBreakpoint);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
};
