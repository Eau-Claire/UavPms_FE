import { expect, test } from '@playwright/test';

test('selects assets from a drawn area and creates a mission', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('uavpms.session', JSON.stringify({
    user: { id: 'u1', email: 'manager@evn.vn', fullName: 'Manager', role: 'Manager', mustChangePassword: false },
    tokens: { accessToken: 'test', refreshToken: 'test' },
  })));

  await page.route('https://uavpms.ddns.net/**', async (route) => {
    const url = route.request().url();
    if (url.endsWith('/assets/spatial-query')) {
      await route.fulfill({ json: { data: { assets: [{ assetId: 'a1', code: 'T-01', name: 'Tower 01', latitude: 21.01, longitude: 105.81, status: 'Operational' }] } } });
    } else if (url.endsWith('/missions') && route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { targetAssetIds: string[] };
      expect(body.targetAssetIds).toEqual(['a1']);
      await route.fulfill({ json: { data: { id: 'm1', name: 'Area inspection', missionTargets: [] } } });
    } else if (url.endsWith('/users/assignable')) {
      await route.fulfill({ json: { data: [{ id: 'u1', email: 'manager@evn.vn', fullName: 'Manager' }] } });
    } else {
      await route.fulfill({ json: { data: [] } });
    }
  });

  await page.goto('/gis');

  // 1. Click the drawing tool in the right-side toolbar
  await page.getByRole('button', { name: 'Chọn tài sản theo vùng' }).click();

  // 2. Popup should open — choose Rectangle
  await page.getByRole('button', { name: 'Vẽ vùng chữ nhật' }).click();

  // 3. Draw a rectangle on the map
  const map = page.locator('#leaflet-map-target');
  const box = await map.boundingBox();
  if (!box) throw new Error('Map was not rendered');
  await page.mouse.move(box.x + 350, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 650, box.y + 500, { steps: 8 });
  await page.mouse.up();

  // 4. Candidate assets appear in popup
  await expect(page.getByText('Tower 01 · Operational')).toBeVisible();

  // 5. Select all and create mission
  await page.getByRole('button', { name: 'Chọn tất cả' }).click();
  await page.getByRole('button', { name: 'Tạo nhiệm vụ (1)' }).click();
  await page.getByLabel('Tên nhiệm vụ *').fill('Area inspection');
  await page.getByLabel('Lịch thực hiện *').fill('2026-09-03T08:00');
  await page.getByLabel('UAV *').fill('drone-1');
  await page.getByRole('button', { name: /Tạo nhiệm vụ/ }).click();
  await expect(page).toHaveURL(/\/missions\/m1$/);
});
