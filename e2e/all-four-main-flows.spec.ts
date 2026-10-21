import { expect, test } from '@playwright/test';

test.describe('4 Main Flows Verification (MF01 - MF04)', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate as Manager/Admin
    await page.addInitScript(() => {
      localStorage.setItem(
        'uavpms.session',
        JSON.stringify({
          user: {
            id: '11111111-1111-1111-1111-111111111111',
            email: 'manager@evn.com.vn',
            fullName: 'EVN Operations Manager',
            role: 'Manager',
            mustChangePassword: false,
          },
          tokens: { accessToken: 'valid-test-token', refreshToken: 'valid-refresh-token' },
        })
      );
    });

    // Mock API requests for both local dev and production urls
    await page.route('**/{api,hubs}/**', async (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();

      // GIS Regions & Lines
      if (url.includes('/gis/regions') || url.includes('/regions')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              items: [
                { id: '22222222-2222-2222-2222-222222222222', name: 'EVN Miền Trung' },
              ],
              pagination: { totalPages: 1 },
            },
          }),
        });
      }

      if (url.includes('/gis/lines')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              {
                id: 'line-1',
                lineCode: 'DZ-220-HK',
                lineName: 'Đường dây 220kV Hòa Khánh',
                voltage: '220',
                coordinates: [[16.05, 108.20], [16.08, 108.25]],
              },
            ],
          }),
        });
      }

      // Users Assignable
      if (url.includes('/users/assignable') || url.includes('/users')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              { id: '33333333-3333-3333-3333-333333333331', fullName: 'Phi công Nguyễn Văn A', role: 'INSPECTOR' },
              { id: '33333333-3333-3333-3333-333333333332', fullName: 'Chuyên viên AI Trần Thị B', role: 'ANALYST' },
              { id: '33333333-3333-3333-3333-333333333333', fullName: 'Kỹ thuật viên Lê Văn C', role: 'TECHNICIAN' },
            ],
          }),
        });
      }

      // Drones Available
      if (url.includes('/drones/available') || url.includes('/drones')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              {
                id: '44444444-4444-4444-4444-444444444444',
                droneCode: 'EVN-UAV-01',
                name: 'Matrice 350 RTK',
                operationalStatus: 'Available',
                online: true,
              },
            ],
          }),
        });
      }

      // MF01: Pre-Mission Assessments
      if (url.includes('/pre-mission-assessments')) {
        if (method === 'POST' && url.endsWith('/pre-mission-assessments')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                id: '55555555-5555-5555-5555-555555555555',
                code: 'PMA-2026-001',
                status: 'READY',
                readinessStatus: 'READY',
                regionId: '22222222-2222-2222-2222-222222222222',
                plannedStart: '2026-10-15T08:00:00Z',
                plannedEnd: '2026-10-15T11:00:00Z',
                scopeAssetIds: ['VT-01', 'VT-02'],
              },
            }),
          });
        }

        if (url.includes('/evaluate') || url.includes('/re-evaluate')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                id: '55555555-5555-5555-5555-555555555555',
                status: 'READY',
                readinessStatus: 'READY',
              },
            }),
          });
        }

        if (url.includes('/cancel')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                id: '55555555-5555-5555-5555-555555555555',
                status: 'CANCELLED',
                readinessStatus: 'CANCELLED',
              },
            }),
          });
        }

        // Single Assessment Get
        if (url.includes('/55555555-5555-5555-5555-555555555555')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                id: '55555555-5555-5555-5555-555555555555',
                code: 'PMA-2026-001',
                status: 'READY',
                readinessStatus: 'READY',
                regionId: '22222222-2222-2222-2222-222222222222',
                regionName: 'EVN Miền Trung',
                plannedStart: '2026-10-15T08:00:00Z',
                plannedEnd: '2026-10-15T11:00:00Z',
                scopeAssetIds: ['VT-01', 'VT-02'],
                assetCount: 2,
                weatherStatus: 'PASS',
                airspaceStatus: 'PASS',
                droneStatus: 'PASS',
                personnelStatus: 'PASS',
              },
            }),
          });
        }

        // List
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              items: [
                {
                  id: '55555555-5555-5555-5555-555555555555',
                  code: 'PMA-2026-001',
                  status: 'READY',
                  readinessStatus: 'READY',
                  regionId: '22222222-2222-2222-2222-222222222222',
                  regionName: 'EVN Miền Trung',
                  assetCount: 2,
                  plannedStart: '2026-10-15T08:00:00Z',
                  plannedEnd: '2026-10-15T11:00:00Z',
                },
              ],
              totalCount: 1,
              page: 1,
              pageSize: 10,
            },
          }),
        });
      }

      // MF02: Missions
      if (url.includes('/missions')) {
        if (method === 'POST' && (url.endsWith('/missions') || url.includes('/create'))) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                id: '66666666-6666-6666-6666-666666666666',
                missionCode: 'MSN-2026-001',
                title: 'Kiểm tra đường dây 220kV Hòa Khánh',
                status: 'Assigned',
                priority: 'NORMAL',
                objective: 'PERIODIC_INSPECTION',
              },
            }),
          });
        }

        if (url.includes('/66666666-6666-6666-6666-666666666666')) {
          // Mission Detail & sub-actions
          if (url.includes('/reassign')) {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                data: {
                  id: 'asg-new',
                  userId: '33333333-3333-3333-3333-333333333331',
                  assignmentRole: 'INSPECTOR',
                  status: 'Active',
                  responseStatus: 'Pending',
                },
              }),
            });
          }

          if (url.includes('/media') && method === 'POST') {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                data: {
                  id: 'media-1',
                  fileName: 'capture_tower_01.jpg',
                  uploadedAt: new Date().toISOString(),
                },
              }),
            });
          }

          if (url.includes('/flight-logs')) {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                data: [
                  {
                    id: 'log-1',
                    fileName: 'flight_telemetry_01.bin',
                    uploadedAt: new Date().toISOString(),
                    flightDurationSeconds: 1200,
                  },
                ],
              }),
            });
          }

          if (url.includes('/incidents')) {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                data: [
                  {
                    id: 'inc-1',
                    severity: 'Low',
                    description: 'Gió giật nhẹ tại đỉnh cột VT-01',
                    reportedAt: new Date().toISOString(),
                  },
                ],
              }),
            });
          }

          if (url.includes('/drone-handover')) {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                data: {
                  id: 'ho-1',
                  status: 'Confirmed',
                  condition: 'Tốt, sẵn sàng bay',
                },
              }),
            });
          }

          // Mission Detail GET
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                id: '66666666-6666-6666-6666-666666666666',
                missionCode: 'MSN-2026-001',
                title: 'Kiểm tra đường dây 220kV Hòa Khánh',
                status: 'Assigned',
                priority: 'Normal',
                objective: 'PeriodicInspection',
                plannedStart: '2026-10-15T08:00:00Z',
                plannedEnd: '2026-10-15T11:00:00Z',
                scheduledStartAt: '2026-10-15T08:00:00Z',
                droneCode: 'EVN-UAV-01',
                team: [
                  {
                    id: 'asg-1',
                    userId: '33333333-3333-3333-3333-333333333331',
                    userName: 'Nguyễn Văn A',
                    assignmentRole: 'INSPECTOR',
                    status: 'Active',
                    responseStatus: 'Accepted',
                  },
                ],
                targets: [
                  { towerId: 'tow-1', towerCode: 'VT-01', assetCode: 'T-01', inspectionStatus: 'Pending' },
                ],
              },
            }),
          });
        }

        // Missions List GET
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              items: [
                {
                  id: '66666666-6666-6666-6666-666666666666',
                  missionCode: 'MSN-2026-001',
                  title: 'Kiểm tra đường dây 220kV Hòa Khánh',
                  status: 'Assigned',
                  priority: 'Normal',
                  objective: 'PeriodicInspection',
                  scheduledStartAt: '2026-10-15T08:00:00Z',
                },
              ],
              totalCount: 1,
              page: 1,
              pageSize: 10,
            },
          }),
        });
      }

      // MF04: AI Review & Detections
      if (url.includes('/ai-review') || url.includes('/detections')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              items: [
                {
                  id: '77777777-7777-7777-7777-777777777777',
                  missionId: '66666666-6666-6666-6666-666666666666',
                  defectType: 'Rỉ sét bu lông cách điện',
                  severity: 'Medium',
                  status: 'Pending',
                  confidenceScore: 0.94,
                  imageUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=400',
                  detectedAt: new Date().toISOString(),
                },
              ],
              totalCount: 1,
            },
          }),
        });
      }

      // Default fallback
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    });
  });

  test('MF01: Pre-Mission Readiness Assessment list and creation flow', async ({ page }) => {
    // 1. Visit Pre-Mission Assessment list
    await page.goto('/pre-mission');
    await expect(page.locator('.pre-mission-page')).toBeVisible();
    await expect(page.getByText('PMA-2026-001')).toBeVisible();

    // 2. Open Create Assessment
    await page.goto('/pre-mission/new');
    await expect(page.locator('.pre-mission-page')).toBeVisible();
    await expect(page.locator('#regionId')).toBeVisible();

    // Select region and fill data
    await page.locator('#regionId').selectOption({ index: 1 });
    await page.locator('#lineName').fill('Đường dây 220kV Hòa Khánh');
    await page.locator('#scopeAssetIds').fill('VT-01, VT-02');

    // Submit
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/pre-mission\/55555555-5555-5555-5555-555555555555/);
    await expect(page.getByRole('heading', { name: 'PMA-2026-001' })).toBeVisible();
  });

  test('MF02: Mission Planning & Dispatch flow', async ({ page }) => {
    // 1. Mission Create from Ready Assessment
    await page.goto('/missions/new?assessmentId=55555555-5555-5555-5555-555555555555');
    await expect(page.locator('.mission-dispatch-page')).toBeVisible();

    // Fill form fields
    await page.locator('input[formControlName="name"]').fill('Kiểm tra đường dây 220kV Hòa Khánh');
    await page.locator('input[formControlName="scheduledAt"]').fill('2026-10-15T08:00');
    await page.locator('input[formControlName="plannedEnd"]').fill('2026-10-15T11:00');
    await page.locator('input[formControlName="confirmationDeadline"]').fill('2026-10-15T06:00');

    // Select Inspector, Analyst, Technician, Drone
    await page.locator('select[formControlName="inspectorId"]').selectOption('33333333-3333-3333-3333-333333333331');
    await page.locator('select[formControlName="analystId"]').selectOption('33333333-3333-3333-3333-333333333332');
    await page.locator('select[formControlName="technicianId"]').selectOption('33333333-3333-3333-3333-333333333333');
    await page.locator('select[formControlName="droneId"]').selectOption('44444444-4444-4444-4444-444444444444');

    // Dispatch
    await page.locator('.footer-right button.primary').click();
    await expect(page).toHaveURL(/\/missions\/66666666-6666-6666-6666-666666666666/);
    await expect(page.getByText('MSN-2026-001')).toBeVisible();

    // 2. View Mission List
    await page.goto('/missions');
    await expect(page.locator('.mission-list-page')).toBeVisible();
    await expect(page.getByText('MSN-2026-001')).toBeVisible();
  });

  test('MF03: Field Mission Execution & Media Ingestion in Mission Detail', async ({ page }) => {
    // Navigate to Mission Detail
    await page.goto('/missions/66666666-6666-6666-6666-666666666666');
    await expect(page.locator('.mission-live-page')).toBeVisible();
    await expect(page.getByText('MSN-2026-001')).toBeVisible();

    // Check presence of action bar and tabs
    await expect(page.locator('.mission-live-header')).toBeVisible();
    await expect(page.locator('.header-mission-code')).toContainText('MSN-2026-001');
  });

  test('MF04: AI Defect Review and Standalone Upload', async ({ page }) => {
    // 1. Visit AI Review list
    await page.goto('/ai-review');
    await expect(page.locator('main')).toBeVisible();

    // 2. Visit Standalone Upload
    await page.goto('/ai-analysis/upload');
    await expect(page.locator('.standalone-upload, main')).toBeVisible();
  });
});
