import { expect, test } from '@playwright/test';

test('manager creates and views a pre-mission assessment', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('uavpms.session', JSON.stringify({ user: { id: 'manager-1', email: 'manager@evn.vn', fullName: 'Manager', role: 'Manager', mustChangePassword: false }, tokens: { accessToken: 'test', refreshToken: 'test' } })));
  await page.route('https://uavpms.ddns.net/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/gis/regions') || url.includes('/regions')) {
      return route.fulfill({ json: { data: [{ id: 'region-1', name: 'Miền Trung - Tây Nguyên' }] } });
    }
    if (url.endsWith('/pre-mission-assessments') && route.request().method() === 'POST') {
      return route.fulfill({ json: { data: { id: 'assessment-1', code: 'ASM-001', status: 'READY', regionId: 'region-1', plannedStart: '2099-01-01T08:00:00Z', plannedEnd: '2099-01-01T10:00:00Z', scopeAssetIds: ['VT-01', 'VT-02'] } } });
    }
    if (url.includes('/pre-mission-assessments/assessment-1')) {
      return route.fulfill({ json: { data: { id: 'assessment-1', code: 'ASM-001', status: 'READY', assetCount: 2, plannedStart: '2099-01-01T08:00:00Z', plannedEnd: '2099-01-01T10:00:00Z', readinessStatus: 'READY' } } });
    }
    return route.fulfill({ json: { data: [] } });
  });

  await page.goto('/pre-mission/new');
  await expect(page.locator('#regionId')).toBeVisible();
  await page.locator('#regionId').selectOption({ index: 1 });
  await page.locator('#lineName').fill('Đường dây 220kV Hòa Khánh');
  await page.locator('#scopeAssetIds').fill('VT-01, VT-02');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/pre-mission\/assessment-1$/);
});
