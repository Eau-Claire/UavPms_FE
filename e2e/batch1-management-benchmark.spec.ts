import { expect, test } from '@playwright/test';

const MANAGER_SESSION = JSON.stringify({
  user: {
    id: 'manager-1',
    email: 'manager@evn.vn',
    fullName: 'Manager',
    role: 'Manager',
    mustChangePassword: false,
  },
  tokens: { accessToken: 'test', refreshToken: 'test' },
});

test('Batch 1 pages (/missions, /towers, /drones, /maintenance) match Quiet Chrome benchmark', async ({ page }) => {
  await page.addInitScript((session) => localStorage.setItem('uavpms.session', session), MANAGER_SESSION);

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/missions')) {
      return route.fulfill({
        json: {
          data: {
            items: [
              {
                id: 'm-1',
                missionCode: 'MS-2026-001',
                title: 'Kiểm tra tuyến 220kV Hòa Khánh',
                priority: 'EMERGENCY',
                status: 'InProgress',
                createdAt: '2026-11-23T06:00:00Z',
                routeData: 'Đà Nẵng - Tuyến 220kV',
                assignedToUsername: 'Nguyen Van A',
                droneCode: 'UAV-001',
              },
            ],
            page: 1,
            pageSize: 10,
            totalCount: 1,
            totalPages: 1,
          },
        },
      });
    }
    if (url.includes('/regions')) {
      return route.fulfill({ json: { data: { items: [{ id: 'reg-1', name: 'Phường 25, Quận Bình Thạnh' }], pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 } } } });
    }
    if (url.includes('/towers')) {
      return route.fulfill({
        json: {
          data: {
            items: [
              {
                id: 'tw-1',
                towerCode: 'VT-220-01',
                regionId: 'reg-1',
                regionName: 'Phường 25, Quận Bình Thạnh',
                poleType: 'Thép bu-lông',
                address: 'Đường Điện Biên Phủ, Bình Thạnh',
                latitude: 10.801234,
                longitude: 106.712345,
              },
            ],
            pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
          },
        },
      });
    }
    if (url.includes('/drones')) {
      return route.fulfill({
        json: {
          data: [
            {
              id: 'dr-1',
              code: 'UAV-001',
              name: 'Matrice 350 RTK',
              model: 'M350',
              operationalStatus: 'Available',
              technicalHealth: 'Healthy',
              flightEnduranceMinutes: 45,
              operationalRangeKm: 15,
              batteryLevel: 96,
            },
          ],
        },
      });
    }
    if (url.includes('/maintenance/tickets')) {
      return route.fulfill({
        json: {
          data: {
            items: [
              {
                id: 'mt-1',
                ticketCode: 'MT-2026-001',
                description: 'Nứt sứ cách điện chuỗi neo',
                priority: 'High',
                status: 'Open',
                dueDate: '2026-11-20T00:00:00Z',
                createdAt: '2026-11-18T08:00:00Z',
                technicianId: null,
              },
            ],
            totalCount: 1,
            pageIndex: 0,
            pageSize: 10,
          },
        },
      });
    }
    return route.fulfill({ json: { data: [] } });
  });

  // 1. /missions
  await page.goto('/missions');
  await expect(page.locator('tbody tr').first()).toContainText('MS-2026-001');
  await expect(page.locator('.mission-kpi-bar')).toHaveCount(0);
  await expect(page.locator('.mission-list-benchmark [nz-icon], .mission-list-benchmark svg')).toHaveCount(0);
  await expect(page.locator('tbody tr').first().locator('td').first().locator('a')).toHaveCount(0);
  await expect(page.locator('tbody tr').first()).toContainText('Khẩn cấp');
  await expect(page.locator('tbody tr').first()).toContainText('Đang thực hiện');

  // 2. /towers
  await page.goto('/towers');
  await expect(page.locator('tbody tr').first()).toContainText('VT-220-01');
  await expect(page.locator('.tower-list-benchmark [nz-icon], .tower-list-benchmark svg')).toHaveCount(0);
  await expect(page.locator('tbody tr').first().locator('td').first().locator('a')).toHaveCount(0);
  await expect(page.getByText('Nhập Excel')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thêm cột điện' })).toBeVisible();

  // 3. /drones
  await page.goto('/drones');
  await expect(page.locator('tbody tr').first()).toContainText('UAV-001');
  await expect(page.locator('.pre-mission-summary-strip')).toHaveCount(0);
  await expect(page.locator('.uav-management-container [nz-icon], .uav-management-container svg')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ước tính tải GIS' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thêm UAV mới' })).toBeVisible();

  // 4. /maintenance
  await page.goto('/maintenance');
  await expect(page.locator('tbody tr').first()).toContainText('MT-2026-001');
  await expect(page.locator('.maintenance-list-benchmark [nz-icon], .maintenance-list-benchmark svg')).toHaveCount(0);
  await expect(page.locator('tbody tr').first().locator('td').first().locator('a')).toHaveCount(0);
  await expect(page.locator('tbody tr').first()).toContainText('Cao');
  await expect(page.locator('tbody tr').first()).toContainText('Đang mở');
});

