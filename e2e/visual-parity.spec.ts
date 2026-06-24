import { expect, test } from '@playwright/test';

test('login keeps React reference geometry and Ant controls', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('.auth-brand-panel')).toHaveCSS('width', '720px');
  await expect(page.locator('.auth-form-panel')).toHaveCSS('width', '720px');
  await expect(page.locator('.auth-card-login')).toHaveCSS('width', '480px');
  await expect(page.locator('.auth-card-login')).toHaveCSS('height', '566px');
  await expect(page.locator('.auth-submit-item .ant-btn')).toHaveCSS('width', '398px');
  await expect(page.getByRole('heading', { name: 'Đăng nhập hệ thống' })).toBeVisible();
});

test('authenticated shell keeps fixed sidebar and horizontal layout', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('uavpms.session', JSON.stringify({ user: { id: '1', email: 'admin@evn.com.vn', fullName: 'Administrator', role: 'Admin', mustChangePassword: false }, tokens: { accessToken: 'audit', refreshToken: 'audit' } })));
  await page.route('https://uavpms.ddns.net/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { items: [], totalCount: 0 } }) }));
  await page.goto('/assets');
  const sidebar = await page.locator('.app-sidebar').boundingBox();
  const header = await page.locator('.app-header').boundingBox();
  expect(sidebar).toMatchObject({ x: 0, y: 0, width: 256, height: 900 });
  expect(header).toMatchObject({ x: 256, y: 0, width: 1184, height: 64 });
  await expect(page.getByText('Quản lý tài sản', { exact: true })).toBeVisible();
});
