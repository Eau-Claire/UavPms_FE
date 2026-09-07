import { DatePipe, SlicePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs';
import {
  AUDIT_ACTION_OPTIONS,
  AUDIT_TABLE_OPTIONS,
  AuditFilters,
  AuditPagination,
  AuditRecord,
} from '../../../../models/audit.models';
import { DataState } from '../../../../shared/components/data-state/data-state';
import { Pagination } from '../../../../shared/components/pagination/pagination';
import { AuditApi } from '../../data-access/audit-api';

export interface FieldDiff {
  readonly key: string;
  readonly oldValue: string;
  readonly newValue: string;
  readonly status: 'added' | 'modified' | 'deleted' | 'unchanged';
}

@Component({
  selector: 'app-audit-log-viewer',
  imports: [ReactiveFormsModule, DatePipe, SlicePipe, NzIconModule, DataState, Pagination],
  templateUrl: './audit-log-viewer.html',
  styleUrl: './audit-log-viewer.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscapeKey()',
  },
})
export class AuditLogViewer {
  private readonly api = inject(AuditApi);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tableOptions = AUDIT_TABLE_OPTIONS;
  protected readonly actionOptions = AUDIT_ACTION_OPTIONS;

  protected readonly records = signal<readonly AuditRecord[]>([]);
  protected readonly allRecords = signal<readonly AuditRecord[]>([]);
  protected readonly pagination = signal<AuditPagination>({
    page: 1,
    pageSize: 10,
    totalItems: 0,
    totalPages: 1,
  });
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly selectedRecord = signal<AuditRecord | null>(null);
  protected readonly copiedId = signal<string | null>(null);
  protected readonly activeDetailTab = signal<'diff' | 'raw'>('diff');

  protected readonly filterForm = this.fb.nonNullable.group({
    search: '',
    actionType: '',
    tableName: '',
  });

  protected readonly currentFilters = signal<AuditFilters>({
    page: 1,
    pageSize: 10,
    search: '',
    actionType: '',
    tableName: '',
  });

  protected readonly filteredRecords = computed<readonly AuditRecord[]>(() => {
    // If backend returns filtered records directly in `records()`, use them; otherwise filter locally from `allRecords()`
    const source = this.allRecords().length > 0 ? this.allRecords() : this.records();
    const query = this.filterForm.controls.search.value?.trim().toLowerCase();
    const action = this.filterForm.controls.actionType.value;
    const table = this.filterForm.controls.tableName.value;

    if (!query && !action && !table) {
      return this.records();
    }

    return source.filter((item) => {
      const matchQuery =
        !query ||
        item.operatorEmail.toLowerCase().includes(query) ||
        item.tableName.toLowerCase().includes(query) ||
        item.actionType.toLowerCase().includes(query) ||
        item.recordId.toLowerCase().includes(query) ||
        item.ipAddress.toLowerCase().includes(query) ||
        item.userAgent.toLowerCase().includes(query) ||
        (item.oldValues && item.oldValues.toLowerCase().includes(query)) ||
        (item.newValues && item.newValues.toLowerCase().includes(query));

      const matchAction = !action || item.actionType.toLowerCase() === action.toLowerCase();
      const matchTable = !table || item.tableName.toLowerCase() === table.toLowerCase();

      return matchQuery && matchAction && matchTable;
    });
  });

  protected readonly currentDiff = computed<readonly FieldDiff[]>(() => {
    const item = this.selectedRecord();
    if (!item) return [];
    return this.parseDiff(item.oldValues, item.newValues);
  });

  constructor() {
    this.fetchLogs();
    this.setupRealtimeFilter();
  }

  private setupRealtimeFilter(): void {
    this.filterForm.valueChanges
      .pipe(
        debounceTime(250),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.applyFilters();
      });
  }

  protected fetchLogs(): void {
    this.loading.set(true);
    this.error.set('');

    this.api
      .list(this.currentFilters())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (result) => {
          if (!this.allRecords().length || (!this.currentFilters().search && !this.currentFilters().actionType && !this.currentFilters().tableName)) {
            this.allRecords.set(result.items);
          }
          this.records.set(result.items);
          this.pagination.set(result.pagination);
        },
        error: (err: unknown) => {
          const status = (err as { status?: number })?.status;
          if (status === 404 || status === 400) {
            this.records.set([]);
            this.pagination.set({
              page: 1,
              pageSize: this.currentFilters().pageSize,
              totalItems: 0,
              totalPages: 1,
            });
            return;
          }
          // If searching and we already have records cached locally, fallback to client-side filtering without error
          if (this.currentFilters().search?.trim() && this.allRecords().length > 0) {
            return;
          }
          this.error.set('Không thể tải nhật ký hệ thống. Vui lòng kiểm tra kết nối và thử lại.');
        },
      });
  }

  protected clearSearch(): void {
    this.filterForm.controls.search.setValue('', { emitEvent: true });
    this.applyFilters();
  }

  protected onSearchEnter(event: Event): void {
    event.preventDefault();
    this.applyFilters();
  }

  protected applyFilters(): void {
    const formVal = this.filterForm.getRawValue();
    this.currentFilters.update((prev) => ({
      ...prev,
      page: 1,
      search: formVal.search.trim(),
      actionType: formVal.actionType,
      tableName: formVal.tableName,
    }));
    this.fetchLogs();
  }

  protected resetFilters(): void {
    this.filterForm.reset({
      search: '',
      actionType: '',
      tableName: '',
    });
    this.currentFilters.set({
      page: 1,
      pageSize: this.currentFilters().pageSize,
      search: '',
      actionType: '',
      tableName: '',
    });
    this.fetchLogs();
  }

  protected onPageChange(page: number): void {
    if (page === this.currentFilters().page) return;
    this.currentFilters.update((prev) => ({ ...prev, page }));
    this.fetchLogs();
  }

  protected openDetail(record: AuditRecord): void {
    this.selectedRecord.set(record);
    this.activeDetailTab.set('diff');
  }

  protected closeDetail(): void {
    this.selectedRecord.set(null);
  }

  protected onEscapeKey(): void {
    if (this.selectedRecord()) {
      this.closeDetail();
    }
  }

  protected copyText(text: string, id: string): void {
    if (!text || text === '-') return;
    void navigator.clipboard.writeText(text);
    this.copiedId.set(id);
    setTimeout(() => {
      if (this.copiedId() === id) {
        this.copiedId.set(null);
      }
    }, 2000);
  }

  protected actionBadgeClass(action: string): string {
    const lower = action.toLowerCase();
    if (lower.includes('add') || lower.includes('create')) return 'audit-badge-added';
    if (lower.includes('delete') || lower.includes('remove')) return 'audit-badge-deleted';
    return 'audit-badge-modified';
  }

  protected actionLabel(action: string): string {
    const match = this.actionOptions.find((opt) => opt.value.toLowerCase() === action.toLowerCase());
    return match ? match.label : action;
  }

  protected tableLabel(tableName: string): string {
    const match = this.tableOptions.find((opt) => opt.value.toLowerCase() === tableName.toLowerCase());
    return match ? match.label : tableName;
  }

  protected exportCsv(): void {
    const items = this.records();
    if (items.length === 0) return;

    const headers = [
      'ID',
      'Thời gian (UTC)',
      'Người thực hiện',
      'Hành động',
      'Đối tượng / Bảng',
      'ID bản ghi',
      'IP Address',
      'User Agent',
      'Giá trị cũ (JSON)',
      'Giá trị mới (JSON)',
    ];

    const rows = items.map((r) => [
      r.id,
      r.createdAt,
      r.operatorEmail,
      r.actionType,
      r.tableName,
      r.recordId,
      r.ipAddress,
      r.userAgent,
      r.oldValues ? `"${r.oldValues.replace(/"/g, '""')}"` : '',
      r.newValues ? `"${r.newValues.replace(/"/g, '""')}"` : '',
    ]);

    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private parseDiff(oldVal: string | null, newVal: string | null): FieldDiff[] {
    const oldObj = this.safeParseJson(oldVal);
    const newObj = this.safeParseJson(newVal);

    const allKeys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)])).sort();

    if (allKeys.length === 0) {
      if (!oldVal && !newVal) return [];
      return [
        {
          key: 'Dữ liệu thô',
          oldValue: oldVal ?? '-',
          newValue: newVal ?? '-',
          status: !oldVal ? 'added' : !newVal ? 'deleted' : 'modified',
        },
      ];
    }

    return allKeys.map((key) => {
      const hasOld = Object.prototype.hasOwnProperty.call(oldObj, key);
      const hasNew = Object.prototype.hasOwnProperty.call(newObj, key);
      const vOld = hasOld ? this.formatValue(oldObj[key]) : '-';
      const vNew = hasNew ? this.formatValue(newObj[key]) : '-';

      let status: FieldDiff['status'] = 'unchanged';
      if (!hasOld && hasNew) status = 'added';
      else if (hasOld && !hasNew) status = 'deleted';
      else if (vOld !== vNew) status = 'modified';

      return { key, oldValue: vOld, newValue: vNew, status };
    });
  }

  private safeParseJson(content: string | null): Record<string, unknown> {
    if (!content || !content.trim()) return {};
    try {
      const parsed = JSON.parse(content);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return { raw: content };
    }
  }

  private formatValue(val: unknown): string {
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  }
}
