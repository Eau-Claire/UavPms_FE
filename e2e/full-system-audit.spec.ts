import fs from 'node:fs';
import path from 'node:path';
import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env['AUDIT_BASE_URL'] || 'http://localhost:5173';
const EMAIL = process.env['AUDIT_EMAIL'] || 'An3439201@gmail.com';
const PASSWORD = process.env['AUDIT_PASSWORD'] || '12345678';
const OTP_SHORTCUT = process.env['AUDIT_OTP'] || '123456';

const OUT_DIR = 'C:/Users/ACER/.gemini/antigravity/brain/37e8626f-7f8e-44fb-944a-67cc2022bee3/scratch/audit';
const SHOTS_DIR = path.join(OUT_DIR, 'shots');

interface ScreenAuditMetric {
  id: string;
  route: string;
  tabOrState: string;
  url: string;
  loadTimeMs: number;
  domNodes: number;
  horizontalOverflowPx: number;
  hasOpsPage: boolean;
  hasPageHeader: boolean;
  hasBreadcrumb: boolean;
  breadcrumbUppercase: boolean;
  iconsOutsideMap: number;
  nonStandardButtons: string[];
  duplicateButtonLabels: string[];
  primaryButtonCount: number;
  bannerTexts: string[];
  englishStatusLeaks: string[];
  monospaceElements: number;
  imgsWithoutLazy: number;
  apiRequests: { url: string; status: number; durationMs: number }[];
  failedApis: { url: string; status: number }[];
  duplicateApis: string[];
  consoleErrors: string[];
  screenshotPath: string;
}

async function collectDomMetrics(page: Page) {
  return page.evaluate(() => {
    const inLeaflet = (el: Element) => !!el.closest('.leaflet-container');
    const isVisible = (el: Element) => {
      const htmlEl = el as HTMLElement;
      const style = window.getComputedStyle(htmlEl);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const rect = htmlEl.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const main = document.querySelector('main') || document.body;
    const hasOpsPage = !!main.querySelector('.ops-page');
    const hasPageHeader = !!main.querySelector('.page-header');
    const bc = main.querySelector('.page-breadcrumb, .review-breadcrumb, .pre-mission-breadcrumb, .breadcrumb-row');
    const hasBreadcrumb = !!bc;
    const bcText = (bc?.textContent || '').trim();
    const breadcrumbUppercase =
      bcText.length > 4 &&
      (bcText.includes('TỔNG QUAN') ||
        bcText.includes('NHẬT KÝ') ||
        bcText.includes('CẤU HÌNH') ||
        bcText.includes('PHIẾU BẢO TRÌ') ||
        bcText.includes('NHIỆM VỤ BAY') ||
        bcText.includes('DUYỆT KẾT QUẢ'));

    // Icons outside Leaflet map (inside main content)
    const iconEls = Array.from(main.querySelectorAll('[nz-icon], .anticon, svg, .status-dot, .sample-dot')).filter(
      (el) => isVisible(el) && !inLeaflet(el),
    );

    // Buttons inside main content
    const btnEls = Array.from(main.querySelectorAll('button, a.app-btn-primary, a.app-btn-secondary, a.button, a.evn-btn')).filter(
      (el) => isVisible(el) && !inLeaflet(el),
    );
    const nonStandardButtons: string[] = [];
    const labelCounts = new Map<string, number>();
    let primaryButtonCount = 0;

    for (const b of btnEls) {
      const cls = b.className || '';
      const role = b.getAttribute('role') || '';
      const txt = (b.textContent || '').replace(/\s+/g, ' ').trim();
      if (txt && txt.length <= 40 && role !== 'tab' && !b.closest('.app-pagination, .ws-segmented')) {
        labelCounts.set(txt, (labelCounts.get(txt) || 0) + 1);
      }
      if (cls.includes('app-btn-primary') || cls.includes('button primary') || cls.includes('evn-primary-button')) {
        primaryButtonCount++;
      }
      const isAllowed =
        /app-btn-(primary|secondary|danger|action)/.test(cls) ||
        role === 'tab' ||
        !!b.closest('.ws-segmented, .app-pagination, .ws-tab-bar, .tab-bar, .category-tabs, .workflow-switcher');
      if (!isAllowed && txt) {
        nonStandardButtons.push(`${txt} (${cls.split(' ').slice(0, 2).join('.') || 'no-class'})`);
      }
    }

    const duplicateButtonLabels = Array.from(labelCounts.entries())
      .filter(([label, count]) => count > 1 && !['Chi tiết', 'Kiểm định', 'Xem', 'Sửa', 'Xóa'].includes(label))
      .map(([label, count]) => `${label} (x${count})`);

    // Banners / alerts
    const bannerEls = Array.from(
      main.querySelectorAll('[role="alert"], [role="status"], .ws-banner, .app-error-banner, .evn-alert, .stale-warning'),
    ).filter((el) => isVisible(el));
    const bannerTexts = bannerEls
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120))
      .filter(Boolean);

    // English status leaks in visible text nodes inside badges/tables/headers
    const englishRegex =
      /\b(PENDINGACCEPTANCE|PENDING_ACCEPTANCE|IN_PROGRESS|INPROGRESS|NOT_READY|NOTREADY|CONFIRMED|REJECTED|RESOLVED|ELIGIBLE|INELIGIBLE|HEALTHY|CRITICAL|AVAILABLE|UNAVAILABLE|CANCELLED|EXPIRED|PASS|FAIL|FEASIBLE)\b/;
    const englishStatusLeaks: string[] = [];
    const textEls = Array.from(main.querySelectorAll('span, strong, td, dd, .evn-status, .tower-pill, .cat-pill')).filter(
      (el) => isVisible(el) && el.children.length === 0,
    );
    for (const el of textEls) {
      const t = (el.textContent || '').trim();
      if (englishRegex.test(t) && englishStatusLeaks.length < 10) {
        englishStatusLeaks.push(t);
      }
    }

    // Monospace font elements
    let monospaceElements = 0;
    const sampleEls = Array.from(main.querySelectorAll('code, span, dd, td, div')).slice(0, 400);
    for (const el of sampleEls) {
      if (!isVisible(el)) continue;
      const ff = window.getComputedStyle(el).fontFamily.toLowerCase();
      if (ff.includes('monospace') || ff.includes('consolas') || ff.includes('jetbrains')) {
        monospaceElements++;
      }
    }

    // Images without lazy loading
    const imgs = Array.from(main.querySelectorAll('img')).filter((img) => isVisible(img) && !inLeaflet(img));
    const imgsWithoutLazy = imgs.filter((img) => img.getAttribute('loading') !== 'lazy').length;

    const horizontalOverflowPx = Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth);

    return {
      domNodes: document.querySelectorAll('*').length,
      horizontalOverflowPx,
      hasOpsPage,
      hasPageHeader,
      hasBreadcrumb,
      breadcrumbUppercase,
      iconsOutsideMap: iconEls.length,
      nonStandardButtons: nonStandardButtons.slice(0, 10),
      duplicateButtonLabels,
      primaryButtonCount,
      bannerTexts,
      englishStatusLeaks,
      monospaceElements,
      imgsWithoutLazy,
    };
  });
}

test.describe('Full System UX/UI, Performance & Real Data Audit', () => {
  test.setTimeout(360_000);

  test('Crawl 100% routes and tabs on real Backend API as SystemAdmin', async ({ page }) => {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    const results: ScreenAuditMetric[] = [];

    let currentApis: { url: string; status: number; durationMs: number }[] = [];
    let currentConsoleErrors: string[] = [];
    const reqStartTimes = new Map<string, number>();

    page.on('request', (req) => {
      if (req.url().includes('/api/')) {
        reqStartTimes.set(req.url() + '|' + req.method(), Date.now());
      }
    });

    page.on('response', (res) => {
      if (res.url().includes('/api/')) {
        const key = res.url() + '|' + res.request().method();
        const started = reqStartTimes.get(key) || Date.now();
        const shortUrl = res.url().replace(/^https?:\/\/[^/]+\/api\/v1/, '');
        currentApis.push({
          url: `${res.request().method()} ${shortUrl}`,
          status: res.status(),
          durationMs: Date.now() - started,
        });
      }
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        currentConsoleErrors.push(msg.text().slice(0, 160));
      }
    });

    async function auditCurrentScreen(id: string, route: string, tabOrState: string, navStartMs: number) {
      await page.waitForTimeout(700);
      const loadTimeMs = Date.now() - navStartMs;
      const dom = await collectDomMetrics(page);
      const shotFile = `${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
      const screenshotPath = path.join(SHOTS_DIR, shotFile).replace(/\\/g, '/');
      await page.screenshot({ path: screenshotPath, fullPage: true });

      const urlCounts = new Map<string, number>();
      for (const a of currentApis) {
        urlCounts.set(a.url, (urlCounts.get(a.url) || 0) + 1);
      }
      const duplicateApis = Array.from(urlCounts.entries())
        .filter(([, c]) => c > 1)
        .map(([u, c]) => `${u} (x${c})`);
      const failedApis = currentApis.filter((a) => a.status >= 400).map((a) => ({ url: a.url, status: a.status }));

      results.push({
        id,
        route,
        tabOrState,
        url: page.url(),
        loadTimeMs,
        ...dom,
        apiRequests: [...currentApis],
        failedApis,
        duplicateApis,
        consoleErrors: [...currentConsoleErrors],
        screenshotPath,
      });

      currentApis = [];
      currentConsoleErrors = [];
    }

    async function visitRoute(id: string, routePath: string, tabOrState = 'Default') {
      currentApis = [];
      currentConsoleErrors = [];
      const start = Date.now();
      await page.goto(`${BASE_URL}${routePath}`, { waitUntil: 'domcontentloaded' });
      try {
        await page.waitForLoadState('networkidle', { timeout: 6000 });
      } catch {
        // Long polling or SignalR hub may keep network active
      }
      await auditCurrentScreen(id, routePath, tabOrState, start);
    }

    // 1. Auth guest pages first (before login)
    for (const guest of [
      { id: 'auth_forgot_password', path: '/forgot-password' },
      { id: 'auth_reset_password', path: '/reset-password' },
      { id: 'auth_otp', path: '/otp' },
      { id: 'auth_login', path: '/login' },
    ]) {
      await visitRoute(guest.id, guest.path, 'Guest');
    }

    // 2. Perform login on /login with real credentials
    const emailInput = page.locator('input[formControlName="username"], input[type="email"]').first();
    const passInput = page.locator('input[formControlName="password"], input[type="password"]').first();
    await emailInput.fill(EMAIL);
    await passInput.fill(PASSWORD);
    await page.locator('button[type="submit"]').first().click();

    await page.waitForTimeout(2500);
    if (page.url().includes('/otp')) {
      const otpInputs = page.locator('input.otp-input');
      const count = await otpInputs.count();
      if (count >= 6) {
        for (let i = 0; i < 6; i++) {
          await otpInputs.nth(i).fill(OTP_SHORTCUT[i] || '1');
        }
      }
      const submitOtpBtn = page.locator('button.evn-primary-button, button:has-text("Xác nhận OTP")').first();
      if (await submitOtpBtn.isVisible()) {
        await submitOtpBtn.click();
      }
      await page.waitForTimeout(2500);
    }

    // Verify authenticated session & capture real IDs from Backend API using current token
    const realIds = await page.evaluate(async () => {
      const raw = localStorage.getItem('uavpms.session');
      const session = raw ? JSON.parse(raw) : null;
      const token = session?.tokens?.accessToken || '';
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const apiBase = 'https://uavpms.ddns.net/api/v1';

      async function firstId(endpoint: string): Promise<string | null> {
        try {
          const r = await fetch(`${apiBase}${endpoint}`, { headers });
          if (!r.ok) return null;
          const j = await r.json();
          const data = j?.data ?? j;
          const items = Array.isArray(data) ? data : data?.items ?? data?.records ?? [];
          return items[0]?.id ?? null;
        } catch {
          return null;
        }
      }

      const [towerId, assessmentId, missionId, anomalyId, maintenanceId] = await Promise.all([
        firstId('/towers?pageNumber=1&pageSize=5'),
        firstId('/pre-mission-assessments?pageNumber=1&pageSize=5'),
        firstId('/missions?pageNumber=1&pageSize=5'),
        firstId('/anomalies?pageNumber=1&pageSize=5'),
        firstId('/maintenance/tickets?pageIndex=0&pageSize=5'),
      ]);

      return {
        userRole: session?.user?.role || 'Unknown',
        towerId,
        assessmentId,
        missionId,
        anomalyId,
        maintenanceId,
      };
    });

    console.log('Discovered real IDs:', JSON.stringify(realIds));

    // 3. Crawl main routes
    await visitRoute('01_dashboard', '/dashboard', 'SystemAdmin Dashboard');
    await visitRoute('02_gis', '/gis', 'Map default');

    await visitRoute('03_towers_list', '/towers', 'List');
    if (realIds.towerId) {
      await visitRoute('04_tower_detail_anomalies', `/towers/${realIds.towerId}`, 'Tab Bất thường');
      const maintTab = page.locator('button[role="tab"]:has-text("Lịch sử bảo trì")');
      if (await maintTab.isVisible()) {
        const s = Date.now();
        await maintTab.click();
        await auditCurrentScreen('04b_tower_detail_maintenance', `/towers/${realIds.towerId}`, 'Tab Lịch sử bảo trì', s);
      }
    }

    await visitRoute('05_drones', '/drones', 'Fleet list');

    await visitRoute('06_pre_mission_list', '/pre-mission', 'List');
    await visitRoute('07_pre_mission_new', '/pre-mission/new', 'Create form');
    if (realIds.assessmentId) {
      await visitRoute('08a_pre_mission_ws_overview', `/pre-mission/${realIds.assessmentId}`, 'Tab 1 Tổng quan');
      const wsTabs = [
        { id: '08b_pre_mission_ws_site', text: 'Mặt bằng' },
        { id: '08c_pre_mission_ws_personnel', text: 'Nhân sự' },
        { id: '08d_pre_mission_ws_uav', text: 'Thiết bị UAV' },
        { id: '08e_pre_mission_ws_technical', text: 'Kiểm định kỹ thuật' },
      ];
      for (const t of wsTabs) {
        const btn = page.locator(`.ws-tab-bar button[role="tab"]:has-text("${t.text}")`).first();
        if (await btn.isVisible()) {
          const s = Date.now();
          await btn.click();
          await auditCurrentScreen(t.id, `/pre-mission/${realIds.assessmentId}`, `Tab ${t.text}`, s);
        }
      }
    }

    await visitRoute('09_missions_list', '/missions', 'List');
    await visitRoute('10_missions_new', '/missions/new', 'Create form');
    if (realIds.missionId) {
      await visitRoute('11a_mission_detail_overview', `/missions/${realIds.missionId}`, 'Tab Tổng quan');
      const missionTabs = [
        { id: '11b_mission_detail_upload', text: 'Tải dữ liệu' },
        { id: '11c_mission_detail_processing', text: 'Xử lý dữ liệu' },
        { id: '11d_mission_detail_detections', text: 'Kết quả giám định' },
        { id: '11e_mission_detail_towers', text: 'Cột điện' },
        { id: '11f_mission_detail_maintenance', text: 'Bảo trì' },
        { id: '11g_mission_detail_activity', text: 'Hoạt động' },
      ];
      for (const t of missionTabs) {
        const btn = page.locator(`button:has-text("${t.text}")`).first();
        if (await btn.isVisible()) {
          const s = Date.now();
          await btn.click();
          await auditCurrentScreen(t.id, `/missions/${realIds.missionId}`, `Tab ${t.text}`, s);
        }
      }
      await visitRoute('12_mission_inspector', `/missions/${realIds.missionId}/inspector`, 'Inspector acceptance view');
    }

    await visitRoute('13_ai_analysis_upload', '/ai-analysis/upload', 'Standalone upload');
    await visitRoute('14a_ai_review_pending', '/ai-review', 'Tab Chờ duyệt');
    await visitRoute('14b_ai_review_emergency', '/ai-review?priority=emergency', 'Filter Khẩn cấp');
    const reviewedTab = page.locator('button[role="tab"]:has-text("Đã duyệt")').first();
    if (await reviewedTab.isVisible()) {
      const s = Date.now();
      await reviewedTab.click();
      await auditCurrentScreen('14c_ai_review_reviewed', '/ai-review', 'Tab Đã duyệt', s);
    }
    if (realIds.anomalyId) {
      await visitRoute('15_ai_review_detail', `/ai-review/${realIds.anomalyId}`, 'Defect review detail');
    }

    await visitRoute('16_maintenance_list', '/maintenance', 'List');
    if (realIds.maintenanceId) {
      await visitRoute('17_maintenance_detail', `/maintenance/${realIds.maintenanceId}`, 'Ticket detail');
    }

    await visitRoute('18_inspections', '/inspections', 'Inspection history');
    await visitRoute('19_reports', '/reports', 'Reports');
    await visitRoute('20_admin_users', '/admin/users', 'User management');
    await visitRoute('21_system_audit_logs', '/system/audit-logs', 'Audit logs');
    await visitRoute('22_system_settings', '/system/settings', 'System settings');
    await visitRoute('23_change_password', '/change-password', 'Change password');
    await visitRoute('24_forbidden_403', '/403', '403 page');

    fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify({ realIds, results }, null, 2));
    console.log(`Audit completed: ${results.length} screens captured.`);
    expect(results.length).toBeGreaterThan(20);
  });
});

