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

test('pre-mission list benchmark UI meets Quiet Chrome, page cache, zero-flicker, and Vietnamese status rules', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'uavpms.session',
      JSON.stringify({
        user: { id: 'manager-1', email: 'manager@evn.vn', fullName: 'Manager', role: 'Manager', mustChangePassword: false },
        tokens: { accessToken: 'test', refreshToken: 'test' },
      }),
    ),
  );

  const makeRow = (index: number, status: string, failTech = false) => ({
    id: `asm-${index}`,
    assessmentCode: `PMA-2026-${String(index).padStart(3, '0')}`,
    regionId: 'reg-1',
    regionName: 'Đà Nẵng - Miền Trung',
    plannedStart: index === 1 ? '2026-11-23T06:57:00Z' : '2026-11-24T01:00:00Z',
    plannedEnd: index === 1 ? '2026-11-25T12:57:00Z' : '2026-11-24T04:00:00Z',
    validUntil: index === 1 ? '2026-11-23T09:57:00Z' : index === 2 ? '2026-11-20T05:00:00Z' : null,
    status,
    towers: [{ id: `t-${index}`, towerCode: `VT-${index}` }],
    site: { status: 'PASS' },
    personnel: { status: failTech ? 'FAIL' : 'PASS' },
    uav: { status: 'PASS' },
    technical: { status: failTech ? 'FAIL' : 'PASS' },
    completedMissionId: null,
  });

  const page1Items = Array.from({ length: 10 }, (_, idx) =>
    makeRow(idx + 1, idx === 0 ? 'READY' : idx === 1 ? 'EXPIRED' : 'NOT_READY', idx > 0),
  );
  const page2Items = Array.from({ length: 4 }, (_, idx) => makeRow(idx + 11, 'COMPLETED', false));
  const listRequests: string[] = [];

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/regions')) {
      return route.fulfill({ json: { data: [{ id: 'reg-1', name: 'Đà Nẵng - Miền Trung' }] } });
    }
    if (url.includes('/pre-mission-assessments')) {
      listRequests.push(url);
      const parsed = new URL(url);
      const reqPage = Number(parsed.searchParams.get('page') ?? '1');
      // Simulate real backend returning raw JSON array without totalCount
      return route.fulfill({ json: reqPage === 1 ? page1Items : page2Items });
    }
    return route.fulfill({ json: { data: [] } });
  });

  await page.goto('/pre-mission');

  // 1. Wait for initial data load, verify 0 KPI bar, 0 icons, and 0 pagination-info div
  const firstRow = page.locator('tbody tr').first();
  await expect(firstRow).toContainText('PMA-2026-001');
  await expect(page.locator('.pre-mission-kpi-bar')).toHaveCount(0);
  await expect(page.locator('.assessment-benchmark-page [nz-icon], .assessment-benchmark-page svg')).toHaveCount(0);
  await expect(page.locator('.pagination-info')).toHaveCount(0);
  expect(listRequests.length).toBe(1);

  // 2. Date filter uses dd/MM/yyyy text input (no input[type="date"]) & "Xóa lọc" disabled initially
  await expect(page.locator('.assessment-benchmark-page input[type="date"]')).toHaveCount(0);
  const dateInput = page.locator('input.filter-date-input');
  await expect(dateInput).toHaveAttribute('placeholder', 'dd/MM/yyyy');
  const clearBtn = page.getByRole('button', { name: 'Xóa lọc' });
  await expect(clearBtn).toBeVisible();
  await expect(clearBtn).toBeDisabled();

  // 3. Column rules: plain Mã đánh giá, Phạm vi without tower count, Ngày dự kiến bay single date, expired color
  await expect(page.locator('thead')).toContainText('Ngày dự kiến bay');
  await expect(firstRow.locator('td').first().locator('a')).toHaveCount(0);
  await expect(firstRow).toContainText('PMA-2026-001');
  await expect(firstRow.locator('td').nth(1)).toHaveText('Đà Nẵng - Miền Trung');
  await expect(firstRow.locator('td').nth(2)).toHaveText('23/11/2026 13:57');
  await expect(firstRow).toContainText('23/11/2026 16:57');
  await expect(firstRow).toContainText('Sẵn sàng');
  const expiredRow = page.locator('tbody tr').nth(1);
  await expect(expiredRow).toContainText('Hết hạn');
  await expect(expiredRow.locator('td').nth(8).locator('span')).toHaveClass(/text-amber-700/);

  // Record pagination bar Y position & column widths on Page 1 (10 rows)
  const footerBoxPage1 = await page.locator('.assessment-pagination-wrap').boundingBox();
  const colWidthsPage1 = await page.locator('thead th').evaluateAll((ths) => ths.map((th) => th.getBoundingClientRect().width));

  // 5. Navigate to Page 2 -> fetches page=2 (4 rows)
  await page.getByRole('button', { name: 'Trang 2' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(4);
  expect(listRequests.length).toBe(2);

  // Verify fixed table height & locked column widths: 0 horizontal or vertical jitter
  const footerBoxPage2 = await page.locator('.assessment-pagination-wrap').boundingBox();
  const colWidthsPage2 = await page.locator('thead th').evaluateAll((ths) => ths.map((th) => th.getBoundingClientRect().width));
  expect(Math.abs((footerBoxPage1?.y ?? 0) - (footerBoxPage2?.y ?? 0))).toBeLessThanOrEqual(2);
  colWidthsPage1.forEach((w, idx) => expect(Math.abs(w - colWidthsPage2[idx])).toBeLessThanOrEqual(1));

  // 6. Navigate back to Page 1 -> 0 new HTTP requests (local page cache hit!)
  await page.getByRole('button', { name: 'Trang 1' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(10);
  expect(listRequests.length).toBe(2);

  // 7. Typing date auto-formats to dd/MM/yyyy, enables "Xóa lọc", and filters list
  await dateInput.fill('23112026');
  await expect(dateInput).toHaveValue('23/11/2026');
  await expect(clearBtn).toBeEnabled();
  await expect(page.locator('tbody tr')).toHaveCount(1);

  await clearBtn.click();
  await expect(dateInput).toHaveValue('');
  await expect(clearBtn).toBeDisabled();
  await expect(page.locator('tbody tr')).toHaveCount(10);

  await page.screenshot({ path: '.playwright-mcp/pre-mission-after.png', fullPage: true });
});
