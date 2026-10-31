import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { finalize } from 'rxjs';
import {
  RegionOption,
  REPORT_TYPE_LABELS,
  ReportCreateRequest,
  ReportFileFormat,
  ReportItem,
  ReportStatistics,
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
  imports: [ReactiveFormsModule, NzIconModule, DatePipe],
  templateUrl: './reports-page.html',
  styleUrl: './reports-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsPage implements OnInit {
  private readonly reportsApi = inject(ReportsApi);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly typeLabels = REPORT_TYPE_LABELS;
  protected readonly reportTypes = Object.keys(REPORT_TYPE_LABELS) as ReportType[];

  // State signals
  protected readonly reports = signal<readonly ReportItem[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly isDownloading = signal<string | null>(null);
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
  protected readonly createForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(255)]],
    type: ['defect' as ReportType, [Validators.required]],
    regionId: [''],
    dateFrom: [''],
    dateTo: [''],
    description: [''],
  });

  private searchDebounceTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.loadReports();
    this.loadStatistics();
    this.reportsApi
      .getRegions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (regions) => this.regions.set(regions),
        error: () => this.showToast('Không thể tải danh sách khu vực.', 'error'),
      });
  }

  protected loadReports(): void {
    this.isLoading.set(true);
    this.reportsApi
      .listReports({
        search: this.searchQuery(),
        type: this.selectedType(),
        status: this.selectedStatus(),
        regionId: this.selectedRegionId() || undefined,
        page: this.currentPage(),
        pageSize: this.pageSize(),
        sortBy: 'createdAt',
        sortOrder: 'desc',
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isLoading.set(false)),
      )
      .subscribe({
        next: (result) => {
          this.reports.set(result.items);
          this.totalItems.set(result.pagination.totalItems);
          this.totalPages.set(result.pagination.totalPages);
          this.currentPage.set(result.pagination.page);
        },
        error: () => {
          this.reports.set([]);
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

  protected onSearchInput(val: string): void {
    this.searchQuery.set(val);
    clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = setTimeout(() => {
      this.currentPage.set(1);
      this.loadReports();
    }, 350);
  }

  protected onTypeChange(type: string): void {
    this.selectedType.set(type);
    this.currentPage.set(1);
    this.loadReports();
  }

  protected onStatusChange(status: string): void {
    this.selectedStatus.set(status);
    this.currentPage.set(1);
    this.loadReports();
  }

  protected onRegionChange(regionId: string): void {
    this.selectedRegionId.set(regionId);
    this.currentPage.set(1);
    this.loadReports();
  }

  protected goToPage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.currentPage()) return;
    this.currentPage.set(page);
    this.loadReports();
  }

  protected refreshReports(): void {
    this.loadReports();
    this.loadStatistics();
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
          const denied = err instanceof HttpErrorResponse && err.status === 403;
          this.showToast(
            denied
              ? `Bạn không có quyền tải báo cáo ${report.code}.`
              : `Không thể tải tệp ${FORMAT_LABELS[format]} cho báo cáo ${report.code}.`,
            'error',
          );
        },
      });
  }

  protected openCreateModal(): void {
    this.createForm.reset({ regionId: this.selectedRegionId() });
    this.isCreateModalOpen.set(true);
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

  protected showToast(msg: string, type: 'success' | 'error' | 'info' = 'success'): void {
    this.toastMessage.set(msg);
    this.toastType.set(type);
    setTimeout(() => {
      if (this.toastMessage() === msg) this.toastMessage.set(null);
    }, 4000);
  }
}
