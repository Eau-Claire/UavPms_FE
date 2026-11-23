import { expect, test } from '@playwright/test';

const ADMIN_SESSION = JSON.stringify({
  user: {
    id: 'admin-1',
    email: 'admin@evn.vn',
    fullName: 'System Admin',
    role: 'SystemAdmin',
    mustChangePassword: false,
  },
  tokens: { accessToken: 'test', refreshToken: 'test' },
});

const SAMPLE_IMG_DATA_URL =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="%231d4f91"/></svg>';

test('Batch 2 pages (/inspections, /reports, /admin/users) match Quiet Chrome benchmark and image preview modal', async ({ page }) => {
  await page.addInitScript((session) => localStorage.setItem('uavpms.session', session), ADMIN_SESSION);

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/inspections')) {
      return route.fulfill({
        json: {
          data: {
            items: [
              {
                id: 'insp-1',
                missionId: 'm-1',
                missionName: 'Kiểm tra tuyến 220kV Hòa Khánh',
                imageUrl: SAMPLE_IMG_DATA_URL,
                isDefect: true,
                defectType: 'Nứt sứ cách điện',
                detectedAt: '2026-11-23T06:30:00Z',
              },
            ],
            pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
          },
        },
      });
    }
    if (url.includes('/reports')) {
      return route.fulfill({
        json: {
          data: {
            items: [
              {
                id: 'rep-1',
                code: 'RPT-2026-001',
                title: 'Báo cáo khuyết tật Quý 4',
                type: 'DefectReport',
                typeName: 'Báo cáo khuyết tật',
                status: 'approved',
                statusName: 'Đã duyệt',
                defectCount: 5,
                createdAt: '2026-11-22T09:00:00Z',
                region: { id: 'reg-1', name: 'Phường 25, Bình Thạnh' },
                creator: { id: 'u-1', fullName: 'An Nguyen' },
              },
            ],
            pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
          },
        },
      });
    }
    if (url.includes('/users')) {
      return route.fulfill({
        json: {
          data: {
            items: [
              {
                id: 'u-1',
                fullName: 'Nguyen Van An',
                username: 'an.nguyen',
                email: 'an@evn.vn',
                phone: '0901234567',
                role: 'Manager',
                roles: ['Manager'],
                status: 'Active',
                createdAt: '2026-11-01T08:00:00Z',
              },
            ],
            pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
          },
        },
      });
    }
    return route.fulfill({ json: { data: [] } });
  });

  // 1. /inspections — 0 icons, dd/MM/yyyy filters, quick-view image modal
  await page.goto('/inspections');
  await expect(page.locator('tbody tr').first()).toContainText('Kiểm tra tuyến 220kV Hòa Khánh');
  await expect(page.locator('.inspection-history-benchmark [nz-icon], .inspection-history-benchmark svg')).toHaveCount(0);
  await expect(page.locator('.inspection-history-benchmark input[type="date"]')).toHaveCount(0);
  await expect(page.locator('input.filter-date-input')).toHaveCount(2);
  await expect(page.locator('tbody tr').first()).toContainText('Phát hiện sự cố');

  // Open & close quick-view image preview modal (on-demand "Xem ảnh" avoids decoding 10 full-res photos on load)
  await page.getByRole('button', { name: /Xem nhanh ảnh kiểm tra/ }).first().click();
  await expect(page.locator('#inspection-preview-title')).toContainText('Kiểm tra tuyến 220kV Hòa Khánh');
  await expect(page.locator('.inspection-preview-dialog [nz-icon], .inspection-preview-dialog svg')).toHaveCount(0);
  await page.locator('.inspection-preview-dialog').getByRole('button', { name: 'Đóng' }).click();
  await expect(page.locator('#inspection-preview-title')).toHaveCount(0);

  // 2. /reports — 0 KPI strip, 0 icons in page chrome/table, PDF/Excel buttons
  await page.goto('/reports');
  await expect(page.locator('tbody tr').first()).toContainText('Báo cáo khuyết tật Quý 4');
  await expect(page.locator('.pre-mission-summary-strip')).toHaveCount(0);
  await expect(page.locator('.reports-page-benchmark [nz-icon], .reports-page-benchmark svg')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Lập báo cáo mới' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tải PDF', exact: true })).toBeDisabled();
  await page.locator('tbody tr').first().click();
  await expect(page.getByRole('button', { name: 'Tải PDF', exact: true })).toBeEnabled();

  // 3. /admin/users — 0 KPI strip, single Làm mới button, 0 icons
  await page.goto('/admin/users');
  await expect(page.locator('tbody tr').first()).toContainText('Nguyen Van An');
  await expect(page.locator('.pre-mission-summary-strip')).toHaveCount(0);
  await expect(page.locator('.user-management-benchmark [nz-icon], .user-management-benchmark svg')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Làm mới' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Thêm người dùng' })).toBeVisible();
});

