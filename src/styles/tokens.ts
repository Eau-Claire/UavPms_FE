/**
 * @file Design tokens tập trung cho toàn bộ ứng dụng.
 *
 * Mọi màu sắc, spacing, font size đều khai báo ở đây.
 * Khi cần thay đổi giao diện, chỉ cần sửa file này — tự động áp dụng toàn app.
 *
 * @example
 * import { COLORS, TYPOGRAPHY, SPACING } from '@styles/tokens';
 * style={{ color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSizeBase }}
 */

// ─── Colors ──────────────────────────────────────────────────────────────────

/** Bảng màu toàn cục */
export const COLORS = {
  // Brand / Primary (EVN Brand Colors)
  primary: '#20398B',
  primaryHover: '#162865',
  primaryLight: '#E8EDF9',

  // Status
  success: '#52C41A',
  warning: '#FAAD14',
  error: '#FF4D4F',
  errorBg: '#FFF1F0',

  // Text
  textPrimary: '#000000E0',
  textSecondary: '#8C8C8C',
  textDisabled: '#BFBFBF',

  // Background
  bgBase: '#F9FAFB',
  bgWhite: '#FFFFFF',
  bgGray: '#F5F5F5',

  // Border
  border: '#F0F0F0',
  borderInput: '#D9D9D9',

  // Role badge colors (hex — dùng cho Badge, Avatar, v.v.)
  roleAdmin: '#FF4D4F',
  roleManager: '#1890FF',
  roleTechnician: '#52C41A',
  roleViewer: '#FAAD14',
} as const;

// ─── Spacing ─────────────────────────────────────────────────────────────────

/** Spacing (px) theo thang 4px */
export const SPACING = {
  xs: 4,
  sm: 8,
  smMd: 12, // gap phổ biến giữa sm và md
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// ─── Typography ───────────────────────────────────────────────────────────────

/** Font size và font weight */
export const TYPOGRAPHY = {
  // Font sizes (px)
  fontSizeXxs: 9,
  fontSizeXs: 11,
  fontSizeSm: 12,
  fontSizeBase: 13,
  fontSizeMd: 14,
  fontSizeLg: 16,
  fontSizeXl: 20,
  fontSizeXxl: 24,

  // Font weights
  fontWeightNormal: 400,
  fontWeightMedium: 500,
  fontWeightSemibold: 600,
  fontWeightBold: 700,
} as const;

// ─── Border Radius ────────────────────────────────────────────────────────────

/** Border radius (px) */
export const RADIUS = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
} as const;

// ─── Layout ───────────────────────────────────────────────────────────────────

/** Layout dimensions */
export const LAYOUT = {
  sidebarWidth: 200,
  sidebarCollapsedWidth: 64,
  headerHeight: 64,
  mobileBreakpoint: 768, // px — dưới giá trị này coi là mobile
} as const;

// ─── Ant Design Theme ─────────────────────────────────────────────────────────

/**
 * Ant Design theme token — truyền vào <ConfigProvider theme={{ token: ANT_THEME_TOKEN }}>
 * Tham khảo: https://ant.design/docs/react/customize-theme
 */
export const ANT_THEME_TOKEN = {
  colorPrimary: COLORS.primary,
  borderRadius: RADIUS.md,
  colorBgContainer: COLORS.bgWhite,
  colorBorder: COLORS.borderInput,
} as const;
