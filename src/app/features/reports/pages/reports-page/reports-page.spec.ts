import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from '../../../../core/toast/toast.service';
import { ReportItem, ReportListResult } from '../../../../models/reports.models';
import { ReportsApi } from '../../data-access/reports-api';
import { ReportsPage } from './reports-page';

const SAMPLE_REPORTS: readonly ReportItem[] = [
  {
    id: 'rp-001',
    code: 'BC-2026-001',
    title: 'Báo cáo khuyết tật tuyến 110kV mẫu A',
    type: 'DefectReport',
    typeName: 'Báo cáo khuyết tật',
    status: 'approved',
    statusName: 'Đã duyệt',
    createdAt: '2026-11-10T08:00:00Z',
    region: { id: 'reg-1', name: 'Khu vực Mẫu 1' },
    creator: { id: 'usr-1', fullName: 'Nguyễn Văn A' },
    defectCount: 3,
    hasSnapshot: true,
  },
  {
    id: 'rp-002',
    code: 'BC-2026-002',
    title: 'Báo cáo kiểm tra nhiệt mẫu B',
    type: 'ThermalInspection',
    typeName: 'Kiểm tra nhiệt',
    status: 'pending',
    statusName: 'Chờ duyệt',
    createdAt: '2026-11-12T09:30:00Z',
    region: null,
    creator: { id: 'usr-2', fullName: 'Trần Thị B' },
    defectCount: 0,
    hasSnapshot: false,
  },
];

const buildListResult = (items: readonly ReportItem[] = SAMPLE_REPORTS): ReportListResult => ({
  items,
  pagination: { page: 1, pageSize: 10, totalItems: items.length, totalPages: 1 },
});

describe('ReportsPage (REQ-001 Gate 5)', () => {
  let fixture: ComponentFixture<ReportsPage>;
  let api: {
    listReports: ReturnType<typeof vi.fn>;
    getRegions: ReturnType<typeof vi.fn>;
    createReport: ReturnType<typeof vi.fn>;
    downloadReportFile: ReturnType<typeof vi.fn>;
    getStatistics: ReturnType<typeof vi.fn>;
  };
  let toast: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };

  const setup = () => {
    TestBed.configureTestingModule({
      imports: [ReportsPage],
      providers: [
        provideRouter([]),
        { provide: ReportsApi, useValue: api },
        { provide: ToastService, useValue: toast },
      ],
    });
    fixture = TestBed.createComponent(ReportsPage);
    fixture.detectChanges();
  };

  const queryButtonByText = (label: string): HTMLButtonElement => {
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    );
    const match = buttons.find((btn) => btn.textContent?.trim() === label);
    if (!match) throw new Error(`Button "${label}" not found`);
    return match;
  };

  beforeEach(() => {
    toast = {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    };
    api = {
      listReports: vi.fn().mockReturnValue(of(buildListResult())),
      getRegions: vi.fn().mockReturnValue(of([{ id: 'reg-1', name: 'Khu vực Mẫu 1' }])),
      createReport: vi.fn().mockReturnValue(of(SAMPLE_REPORTS[0])),
      downloadReportFile: vi.fn().mockReturnValue(
        of({ blob: new Blob(['pdf-content']), fileName: 'BC-2026-001.pdf' }),
      ),
      getStatistics: vi.fn().mockReturnValue(
        of({
          total: 2,
          byType: { defect: 1, periodic: 0, thermal: 1, corridor: 0 },
          byStatus: { approved: 1, pending: 1, draft: 0 },
        }),
      ),
    };
  });

  it('loads reports on init, disables download buttons until a row is selected, and downloads PDF', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    setup();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Báo cáo khuyết tật tuyến 110kV mẫu A');
    expect(host.textContent).toContain('Báo cáo kiểm tra nhiệt mẫu B');

    const pdfBtn = queryButtonByText('Tải PDF');
    const excelBtn = queryButtonByText('Tải Excel');
    expect(pdfBtn.disabled).toBe(true);
    expect(excelBtn.disabled).toBe(true);

    const firstRow = host.querySelector<HTMLTableRowElement>('tbody tr');
    expect(firstRow).not.toBeNull();
    firstRow?.click();
    fixture.detectChanges();

    expect(pdfBtn.disabled).toBe(false);
    expect(excelBtn.disabled).toBe(false);
    expect(firstRow?.getAttribute('aria-selected')).toBe('true');

    pdfBtn.click();
    fixture.detectChanges();

    expect(api.downloadReportFile).toHaveBeenCalledWith('rp-001', 'pdf');
    expect(toast.success).toHaveBeenCalledWith('Đã tải tệp PDF (BC-2026-001.pdf).');

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it('supports keyboard selection (Enter and Space) with tabindex and aria-selected (WCAG 2.2 AA)', () => {
    setup();

    const host = fixture.nativeElement as HTMLElement;
    const rows = host.querySelectorAll<HTMLTableRowElement>('tbody tr');
    const firstRow = rows[0];

    expect(firstRow.getAttribute('tabindex')).toBe('0');
    expect(firstRow.getAttribute('aria-selected')).toBe('false');

    firstRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(firstRow.getAttribute('aria-selected')).toBe('true');

    firstRow.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    fixture.detectChanges();
    expect(firstRow.getAttribute('aria-selected')).toBe('false');
  });

  it('applies type/status filters and resets them cleanly', () => {
    setup();

    const host = fixture.nativeElement as HTMLElement;
    const typeSelect = host.querySelector<HTMLSelectElement>('#report-type')!;
    const statusSelect = host.querySelector<HTMLSelectElement>('#report-status')!;

    typeSelect.value = 'ThermalInspection';
    typeSelect.dispatchEvent(new Event('change'));
    statusSelect.value = 'approved';
    statusSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(api.listReports).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'ThermalInspection',
        status: 'approved',
        page: 1,
      }),
    );

    const resetBtn = queryButtonByText('Xóa lọc');
    expect(resetBtn.disabled).toBe(false);
    resetBtn.click();
    fixture.detectChanges();

    expect(typeSelect.value).toBe('all');
    expect(statusSelect.value).toBe('all');
    expect(resetBtn.disabled).toBe(true);
  });

  it('renders empty state when API returns no reports', () => {
    api.listReports.mockReturnValue(of(buildListResult([])));
    setup();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Không tìm thấy báo cáo nào phù hợp điều kiện lọc.');
  });

  it('clears stale rows, cache, and selection on 403 Forbidden so resetFilters cannot leak cached data', () => {
    setup();

    const host = fixture.nativeElement as HTMLElement;
    const firstRow = host.querySelector<HTMLTableRowElement>('tbody tr');
    firstRow?.click();
    fixture.detectChanges();
    expect(queryButtonByText('Tải PDF').disabled).toBe(false);

    // Subsequent 403 on refresh must clear rows, selection, and pageCache
    api.listReports.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    queryButtonByText('Làm mới').click();
    fixture.detectChanges();

    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Bạn không có quyền xem danh sách báo cáo.');
    expect(host.textContent).toContain('Không tìm thấy báo cáo nào phù hợp điều kiện lọc.');
    expect(queryButtonByText('Tải PDF').disabled).toBe(true);
    expect(toast.error).toHaveBeenCalledWith('Bạn không có quyền xem danh sách báo cáo.');
  });

  it('renders safe retryable alert on 500 error without exposing raw error internals', () => {
    api.listReports.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Internal Server Error' })),
    );
    setup();

    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Không thể tải danh sách báo cáo. Vui lòng thử lại.');
    expect(alert?.textContent).not.toContain('Internal Server Error');
  });

  it('shows 403 toast and re-enables download buttons when downloadReportFile is forbidden', () => {
    api.downloadReportFile.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    setup();

    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLTableRowElement>('tbody tr')?.click();
    fixture.detectChanges();

    const pdfBtn = queryButtonByText('Tải PDF');
    pdfBtn.click();
    fixture.detectChanges();

    expect(toast.error).toHaveBeenCalledWith('Bạn không có quyền tải báo cáo BC-2026-001.');
    expect(pdfBtn.disabled).toBe(false);
    expect(queryButtonByText('Tải Excel').disabled).toBe(false);
  });

  it('rejects impossible calendar dates (31/02/2026) and inverted date ranges on create', () => {
    setup();

    queryButtonByText('Lập báo cáo mới').click();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const titleInput = host.querySelector<HTMLInputElement>('#new-title')!;
    const fromInput = host.querySelector<HTMLInputElement>('#new-date-from')!;
    const toInput = host.querySelector<HTMLInputElement>('#new-date-to')!;
    const form = host.querySelector<HTMLFormElement>('form')!;

    // 1. Blank / whitespace-only title rejected and validation alert displayed
    titleInput.value = '   ';
    titleInput.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(api.createReport).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Vui lòng nhập tiêu đề báo cáo.');
    expect(host.querySelector('small[role="alert"]')?.textContent).toContain('Tiêu đề bắt buộc');

    // 2. Impossible calendar date (31/02/2026) rejected
    titleInput.value = '  Báo cáo tuần 48  ';
    titleInput.dispatchEvent(new Event('input'));
    fromInput.value = '31/02/2026';
    fromInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(api.createReport).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      'Định dạng ngày không hợp lệ. Vui lòng nhập theo dạng dd/MM/yyyy.',
    );

    // 3. dateFrom > dateTo rejected
    fromInput.value = '20/11/2026';
    fromInput.dispatchEvent(new Event('input'));
    toInput.value = '10/11/2026';
    toInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(api.createReport).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Ngày bắt đầu phải trước ngày kết thúc.');

    // 4. Valid date range succeeds with trimmed title, ISO boundaries, closes modal, and refreshes list
    const listCallsBeforeCreate = api.listReports.mock.calls.length;
    fromInput.value = '01/11/2026';
    fromInput.dispatchEvent(new Event('input'));
    toInput.value = '15/11/2026';
    toInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(api.createReport).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Báo cáo tuần 48',
        type: 'DefectReport',
        dateFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        dateTo: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      }),
    );
    expect(api.listReports.mock.calls.length).toBe(listCallsBeforeCreate + 1);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('Đã lập báo cáo BC-2026-001.');
  });
});
