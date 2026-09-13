import { expect, test } from '@playwright/test';

test('manager creates and re-evaluates a pre-mission assessment', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('uavpms.session', JSON.stringify({ user: { id: 'manager-1', email: 'manager@evn.vn', fullName: 'Manager', role: 'Manager', mustChangePassword: false }, tokens: { accessToken: 'test', refreshToken: 'test' } })));
  await page.route('https://uavpms.ddns.net/**', async route => {
    const request = route.request();
    if (request.url().endsWith('/pre-mission-assessments') && request.method() === 'POST') {
      expect(request.postDataJSON()).toMatchObject({ assetIds: ['asset-1'] });
      return route.fulfill({ json: { id: 'assessment-1', status: 'EVALUATING', regionId: 'region-1', plannedStart: '2099-01-01T08:00:00Z', plannedEnd: '2099-01-01T10:00:00Z', assets: [{ assetId: 'asset-1' }] } });
    }
    if (request.url().endsWith('/pre-mission-assessments/assessment-1')) return route.fulfill({ json: { id: 'assessment-1', code: 'ASM-001', status: 'READY', assetCount: 1, plannedStart: '2099-01-01T08:00:00Z', plannedEnd: '2099-01-01T10:00:00Z', site: { status: 'PASS' }, personnel: { status: 'PASS' }, uav: { status: 'PASS' }, technical: { status: 'PASS' }, validUntil: '2099-01-01T12:00:00Z' } });
    return route.fulfill({ json: [] });
  });
  await page.goto('/pre-mission/new');
  await page.getByLabel('Region ID*').fill('region-1');
  await page.getByLabel('Asset IDs*').fill('asset-1');
  await page.getByLabel('Planned start*').fill('2099-01-01T08:00');
  await page.getByLabel('Planned end*').fill('2099-01-01T10:00');
  await page.getByRole('button', { name: 'Create assessment' }).click();
  await expect(page).toHaveURL(/\/pre-mission\/assessment-1$/);
  await expect(page.getByText('READY')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Re-evaluate' })).toBeVisible();
});
