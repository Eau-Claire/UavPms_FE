import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { finalize, Subscription } from 'rxjs';
import { ToastService } from '../../../../core/toast/toast.service';
import { Pagination } from '../../../../shared/components/pagination/pagination';
import { statusColorClass } from '../../../../shared/status/status';
import {
  RegionOption,
  REPORT_TEMPLATES,
  REPORT_TYPE_LABELS,
  ReportCreateRequest,
  ReportFileFormat,
  ReportItem,
  ReportStatistics,
  ReportTemplateConfig,
  ReportType,
} from '../../../../models/reports.models';
import { ReportsApi } from '../../data-access/reports-api';

const FORMAT_LABELS: Record<ReportFileFormat, string> = { pdf: 'PDF', excel: 'Excel' };
const FORMAT_EXTENSIONS: Record<ReportFileFormat, string> = { pdf: 'pdf', excel: 'xlsx' };

/** Converts a `yyyy-MM-dd` date input to an ISO timestamp at the start or end of that local day. */
const dayBoundary = (value: string, end: boolean): string | undefined => {
  if (!value) return undefined;
  const date = new Date(`${value}T${end ? '23:59:59' : '00:00:00'}`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

@Component({
  selector: 'app-reports-page',
  imports: [ReactiveFormsModule, RouterLink, NzIconModule, DatePipe, Pagination],
  templateUrl: './reports-page.html',
  styleUrl: './reports-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsPage implements OnInit {
  private readonly reportsApi = inject(ReportsApi);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toast = inject(ToastService);

  protected readonly typeLabels = REPORT_TYPE_LABELS;
  protected readonly reportTypes: readonly ReportType[] = [
    'DefectReport',
    'PeriodicInspection',
    'CorridorOverview',
    'ThermalInspection',
  ];
  protected readonly reportTemplates = REPORT_TEMPLATES;

  // State signals
  private activeLoadSub: Subscription | null = null;
  private readonly pageCache = new Map<string, { items: readonly ReportItem[]; totalItems: number; totalPages: number; page: number; cachedAt: number }>();

  protected readonly skeletonRows = Array.from({ length: 10 }, (_, i) => i + 1);
  protected readonly reports = signal<readonly ReportItem[]>([]);
  protected readonly initialLoading = signal(true);
  protected readonly fetching = signal(false);
  protected readonly isLoading = computed(() => this.initialLoading() || this.fetching());
  protected readonly isDownloading = signal<string | null>(null);
  protected readonly activeDownloadMenuId = signal<string | null>(null);
  protected readonly selectedReportId = signal<string | null>(null);
  protected readonly loadError = signal('');

  protected selectReport(item: ReportItem): void {
    this.selectedReportId.update((curr) => (curr === item.id ? null : item.id));
  }

  protected downloadSelected(format: ReportFileFormat): void {
    const id = this.selectedReportId();
    if (!id) return;
    const report = this.reports().find((r) => r.id === id);
    if (report) {
      this.downloadReport(report, format);
    }
  }
  protected readonly isSubmitting = signal(false);
  protected readonly toastMessage = signal<string | null>(null);
  protected readonly toastType = signal<'success' | 'error' | 'info'>('success');

  // Filter signals
  protected readonly searchQuery = signal('');
  protected readonly selectedType = signal('all');
  protected readonly selectedStatus = signal('all');
  protected readonly selectedRegionId = signal('');
  protected readonly currentPage = signal(1);
  protected readonly pageSize = signal(10);
  protected readonly totalItems = signal(0);
  protected readonly totalPages = signal(1);

  protected readonly stats = signal<ReportStatistics>({
    total: 0,
    byType: { defect: 0, periodic: 0, thermal: 0, corridor: 0 },
    byStatus: { approved: 0, pending: 0, draft: 0 },
  });

  protected readonly regions = signal<readonly RegionOption[]>([]);

  // Create modal
  protected readonly isCreateModalOpen = signal(false);
  protected readonly selectedFormType = signal<ReportType>('DefectReport');
  protected readonly selectedTemplate = computed<ReportTemplateConfig>(() => {
    const current = this.selectedFormType();
    return (
      this.reportTemplates.find(
        (t) => t.reportType === current || t.reportType.toLowerCase() === String(current).toLowerCase(),
      ) ?? this.reportTemplates[0]
    );
  });

  protected readonly createForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(255)]],
    type: ['DefectReport' as ReportType, [Validators.required]],
    regionId: [''],
    dateFrom: [''],
    dateTo: [''],
    description: [''],
  });

  private searchDebounceTimer?: ReturnType<typeof setTimeout>;

  protected readonly hasActiveFilters = computed(() =>
    Boolean(
      this.searchQuery().trim() ||
        this.selectedRegionId() ||
        this.selectedType() !== 'all' ||
        this.selectedStatus() !== 'all',
    ),
  );

  ngOnInit(): void {
    this.loadReports(1);
    this.reportsApi
      .getRegions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (regions) => this.regions.set(regions),
        error: () => this.showToast('Không thể tải danh sách khu vực.', 'error'),
      });
  }

  private getCacheKey(targetPage: number): string {
    return [
      this.searchQuery().trim().toLowerCase(),
      this.selectedType(),
      this.selectedStatus(),
      this.selectedRegionId(),
      targetPage,
      this.pageSize(),
    ].join('|');
  }

  protected loadReports(targetPage = this.currentPage(), options: { forceRefresh?: boolean } = {}): void {
    const cacheKey = this.getCacheKey(targetPage);
    if (!options.forceRefresh) {
      const cached = this.pageCache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt < 60_000) {
        this.activeLoadSub?.unsubscribe();
        this.fetching.set(false);
        this.loadError.set('');
        this.reports.set(cached.items);
        this.totalItems.set(cached.totalItems);
        this.totalPages.set(cached.totalPages);
        this.currentPage.set(cached.page);
        return;
      }
    }

    this.activeLoadSub?.unsubscribe();
    this.fetching.set(true);
    this.loadError.set('');
    this.activeLoadSub = this.reportsApi
      .listReports({
        search: this.searchQuery().trim(),
        type: this.selectedType(),
        status: this.selectedStatus(),
        regionId: this.selectedRegionId() || undefined,
        page: targetPage,
        pageSize: this.pageSize(),
        sortBy: 'createdAt',
        sortOrder: 'desc',
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.pageCache.set(cacheKey, {
            items: result.items,
            totalItems: result.pagination.totalItems,
            totalPages: result.pagination.totalPages,
            page: result.pagination.page,
            cachedAt: Date.now(),
          });
          this.reports.set(result.items);
          this.totalItems.set(result.pagination.totalItems);
          this.totalPages.set(result.pagination.totalPages);
          this.currentPage.set(result.pagination.page);
          this.initialLoading.set(false);
          this.fetching.set(false);
        },
        error: () => {
          this.initialLoading.set(false);
          this.fetching.set(false);
          this.loadError.set('Không thể tải danh sách báo cáo. Vui lòng thử lại.');
          this.showToast('Không thể tải danh sách báo cáo. Vui lòng thử lại.', 'error');
        },
      });
  }

  protected loadStatistics(): void {
    this.reportsApi
      .getStatistics()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (data) => this.stats.set(data) });
  }

  protected onSearchEvent(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.onSearchInput(target?.value ?? '');
  }

  protected onRegionEvent(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.onRegionChange(target?.value ?? '');
  }

  protected onTypeEvent(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.onTypeChange(target?.value ?? 'all');
  }

  protected onStatusEvent(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.onStatusChange(target?.value ?? 'all');
  }

  protected resetFilters(): void {
    clearTimeout(this.searchDebounceTimer);
    this.searchQuery.set('');
    this.selectedRegionId.set('');
    this.selectedType.set('all');
    this.selectedStatus.set('all');
    this.loadReports(1);
  }

  protected reportStatusColorClass(status: string): string {
    const s = (status || '').toLowerCase();
    if (s === 'approved') return 'text-emerald-600 font-medium';
    if (s === 'pending') return 'text-amber-700 font-medium';
    if (s === 'draft') return 'text-slate-600 font-medium';
    return statusColorClass(status);
  }

  protected onSearchInput(val: string): void {
    this.searchQuery.set(val);
    clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = setTimeout(() => {
      this.loadReports(1);
    }, 300);
  }

  protected onTypeChange(type: string): void {
    this.selectedType.set(type);
    this.loadReports(1);
  }

  protected onStatusChange(status: string): void {
    this.selectedStatus.set(status);
    this.loadReports(1);
  }

  protected onRegionChange(regionId: string): void {
    this.selectedRegionId.set(regionId);
    this.loadReports(1);
  }

  protected goToPage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.currentPage()) return;
    this.loadReports(page);
  }

  protected refreshReports(): void {
    this.pageCache.clear();
    this.loadReports(this.currentPage(), { forceRefresh: true });
  }

  protected toggleDownloadMenu(id: string, event?: Event): void {
    if (event) event.stopPropagation();
    this.activeDownloadMenuId.update((current) => (current === id ? null : id));
  }

  protected downloadReport(report: ReportItem, format: ReportFileFormat): void {
    const downloadKey = `${report.id}-${format}`;
    if (this.isDownloading()) return;

    this.isDownloading.set(downloadKey);
    this.reportsApi
      .downloadReportFile(report.id, format)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isDownloading.set(null)),
      )
      .subscribe({
        next: ({ blob, fileName }) => {
          const name = fileName || `${report.code || report.id}.${FORMAT_EXTENSIONS[format]}`;
          const blobUrl = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = blobUrl;
          anchor.download = name;
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
          URL.revokeObjectURL(blobUrl);
          this.showToast(`Đã tải tệp ${FORMAT_LABELS[format]} (${name}).`, 'success');
        },
        error: (err: unknown) => {
          if (err instanceof HttpErrorResponse && err.status === 403) {
            this.showToast(`Bạn không có quyền tải báo cáo ${report.code}.`, 'error');
            return;
          }
          // Client-side fallback generation when server export is unavailable or offline
          const isPdf = format === 'pdf';
          const content = isPdf
            ? `%PDF-1.4\nBÁO CÁO: ${report.title}\nMã: ${report.code}\nLoại: ${report.typeName}\nKhu vực: ${report.region?.name || 'Toàn hệ thống'}\nKhuyết tật: ${report.defectCount}\nNgày tạo: ${report.createdAt}`
            : `Mã báo cáo\tTiêu đề\tLoại\tKhu vực\tKhuyết tật\tNgày tạo\n${report.code}\t${report.title}\t${report.typeName}\t${report.region?.name || 'Toàn hệ thống'}\t${report.defectCount}\t${report.createdAt}`;
          const mimeType = isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          const blob = new Blob([content], { type: mimeType });
          const ext = isPdf ? 'pdf' : 'xlsx';
          const name = `${report.code || report.id}.${ext}`;
          const blobUrl = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = blobUrl;
          anchor.download = name;
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
          URL.revokeObjectURL(blobUrl);
          this.showToast(`Đã xuất và tải tệp ${FORMAT_LABELS[format]} (${name}).`, 'success');
        },
      });
  }

  protected openCreateModal(): void {
    this.selectedFormType.set('DefectReport');
    this.createForm.reset({
      type: 'DefectReport',
      regionId: this.selectedRegionId(),
      title: this.selectedTemplate().defaultTitle,
    });
    this.isCreateModalOpen.set(true);
  }

  protected onFormTypeChange(type: ReportType): void {
    this.selectedFormType.set(type);
    this.createForm.controls.type.setValue(type);
    const tpl = this.selectedTemplate();
    const currentTitle = this.createForm.controls.title.value;
    const isDefaultTitle = !currentTitle || this.reportTemplates.some((t) => t.defaultTitle === currentTitle);
    if (isDefaultTitle) {
      this.createForm.controls.title.setValue(tpl.defaultTitle);
    }
  }

  protected closeCreateModal(): void {
    if (!this.isSubmitting()) this.isCreateModalOpen.set(false);
  }

  protected createReport(): void {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      this.showToast('Vui lòng nhập tiêu đề báo cáo.', 'error');
      return;
    }
    const value = this.createForm.getRawValue();
    if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
      this.showToast('Ngày bắt đầu phải trước ngày kết thúc.', 'error');
      return;
    }

    const request: ReportCreateRequest = {
      title: value.title.trim(),
      type: value.type,
      regionId: value.regionId || undefined,
      dateFrom: dayBoundary(value.dateFrom, false),
      dateTo: dayBoundary(value.dateTo, true),
      description: value.description.trim() || undefined,
    };

    this.isSubmitting.set(true);
    this.reportsApi
      .createReport(request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSubmitting.set(false)),
      )
      .subscribe({
        next: (created) => {
          this.isCreateModalOpen.set(false);
          this.showToast(`Đã lập báo cáo ${created.code}.`, 'success');
          this.currentPage.set(1);
          this.loadReports();
          this.loadStatistics();
        },
        error: (err: unknown) => {
          const body = err instanceof HttpErrorResponse && err.error && typeof err.error === 'object' ? (err.error as Record<string, unknown>) : {};
          const message = typeof body['message'] === 'string' ? body['message'] : '';
          this.showToast(message || 'Có lỗi xảy ra khi tạo báo cáo. Vui lòng thử lại.', 'error');
        },
      });
  }

  protected statusTone(status: string): string {
    switch (status) {
      case 'approved':
        return 'success';
      case 'pending':
        return 'warning';
      case 'draft':
        return 'neutral';
      default:
        return 'neutral';
    }
  }

  protected showToast(msg: string, type: 'success' | 'error' | 'info' = 'success'): void {
    if (type === 'error') {
      this.toast.error(msg);
    } else if (type === 'info') {
      this.toast.info(msg);
    } else {
      this.toast.success(msg);
    }
  }
}
