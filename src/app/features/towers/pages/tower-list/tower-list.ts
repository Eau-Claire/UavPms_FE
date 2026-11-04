import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { catchError, debounceTime, distinctUntilChanged, finalize, map, of, Subject, switchMap, tap } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { RegionLookup, TowerFilters, TowerPage, TowerSummary, TowerUpsertRequest } from '../../../../models/assets.models';
import { DataState } from '../../../../shared/components/data-state/data-state';
import { Pagination } from '../../../../shared/components/pagination/pagination';
import { ConfirmDialog } from '../../components/confirm-dialog/confirm-dialog';
import { TowerFormDialog } from '../../components/tower-form-dialog/tower-form-dialog';
import { RegionsApi } from '../../data-access/regions-api';
import { canManageInfrastructure } from '../../data-access/tower-labels';
import { apiErrorMessage, apiErrorStatus, TowersApi } from '../../data-access/towers-api';

const EMPTY_PAGE: TowerPage = { items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 } };

@Component({
  selector: 'app-tower-list',
  imports: [DecimalPipe, ReactiveFormsModule, RouterLink, NzIconModule, DataState, Pagination, TowerFormDialog, ConfirmDialog],
  templateUrl: './tower-list.html',
  styleUrl: './tower-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TowerList {
  private readonly api = inject(TowersApi);
  private readonly regionsApi = inject(RegionsApi);
  private readonly auth = inject(Auth);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reload$ = new Subject<TowerFilters>();

  protected readonly pageSizes = [10, 20, 50, 100] as const;
  protected readonly canManage = computed(() => canManageInfrastructure(this.auth.user()?.role));

  protected readonly regions = signal<readonly RegionLookup[]>([]);
  protected readonly result = signal<TowerPage>(EMPTY_PAGE);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly notice = signal<{ readonly tone: 'success' | 'error'; readonly text: string } | null>(null);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(20);

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<TowerSummary | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');

  protected readonly deleting = signal<TowerSummary | null>(null);
  protected readonly deleteBusy = signal(false);
  protected readonly deleteError = signal('');

  protected readonly importing = signal(false);

  protected readonly filters = this.fb.nonNullable.group({ regionId: '', search: '' });

  private readonly regionNames = computed(() => new Map(this.regions().map((region) => [region.id, region.name])));

  constructor() {
    this.reload$
      .pipe(
        tap(() => { this.loading.set(true); this.loadError.set(''); }),
        switchMap((filters) =>
          this.api.list(filters).pipe(
            map((page) => ({ page, error: '' })),
            catchError((error: unknown) => of({
              page: EMPTY_PAGE,
              error: apiErrorStatus(error) === 403 ? 'Bạn không có quyền xem danh sách cột điện.' : apiErrorMessage(error, 'Không thể tải danh sách cột điện.'),
            })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ page, error }) => {
        this.result.set(page);
        this.loadError.set(error);
        this.loading.set(false);
      });

    this.filters.valueChanges
      .pipe(
        debounceTime(300),
        map((value) => `${value.regionId ?? ''}|${(value.search ?? '').trim()}`),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.goToPage(1));

    this.regionsApi.getAll().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (regions) => this.regions.set(regions),
      error: () => this.regions.set([]),
    });

    this.load();
  }

  protected regionName(tower: TowerSummary): string {
    return tower.regionName || this.regionNames().get(tower.regionId) || '—';
  }

  protected displayRegion(tower: TowerSummary): string {
    const name = this.regionName(tower);
    return name
      .replace(/^Phường\s+/i, 'P. ')
      .replace(/,\s*Quận\s+/i, ', Q. ')
      .replace(/,\s*TP\.\s*/i, ', ');
  }

  protected displayPoleType(type?: string | null): string {
    if (!type) return '—';
    const lower = type.toLowerCase();
    if (lower.includes('bu-lông') || lower.includes('bu lông')) {
      return 'Thép bu-lông';
    }
    if (lower.includes('đơn thân')) {
      return 'Thép đơn thân';
    }
    return type;
  }

  protected displayAddress(address?: string | null): string {
    if (!address) return '—';
    return address.replace(/,\s*(TP\.\s*Hồ Chí Minh|TP\.HCM|Thành phố Hồ Chí Minh)$/i, '');
  }

  protected load(): void {
    const value = this.filters.getRawValue();
    this.reload$.next({ page: this.page(), pageSize: this.pageSize(), regionId: value.regionId || undefined, search: value.search.trim() || undefined });
  }

  protected goToPage(page: number): void {
    this.page.set(Math.max(1, page));
    this.load();
  }

  protected changePageSize(value: string): void {
    this.pageSize.set(Number(value) || 20);
    this.goToPage(1);
  }

  protected resetFilters(): void {
    this.filters.reset({ regionId: '', search: '' });
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.formError.set('');
    this.formOpen.set(true);
  }

  protected openEdit(tower: TowerSummary): void {
    this.editing.set(tower);
    this.formError.set('');
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editing.set(null);
  }

  protected save(request: TowerUpsertRequest): void {
    const current = this.editing();
    this.saving.set(true);
    this.formError.set('');
    const request$ = current ? this.api.update(current.id, request) : this.api.create(request);
    request$.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.saving.set(false))).subscribe({
      next: (tower) => {
        this.closeForm();
        this.notice.set({ tone: 'success', text: current ? `Đã cập nhật cột ${tower.towerCode || request.towerCode}.` : `Đã thêm cột ${tower.towerCode || request.towerCode}.` });
        this.load();
      },
      error: (error: unknown) => this.formError.set(apiErrorMessage(error, current ? 'Không thể cập nhật cột điện.' : 'Không thể tạo cột điện.')),
    });
  }

  protected askDelete(tower: TowerSummary): void {
    this.deleteError.set('');
    this.deleting.set(tower);
  }

  protected confirmDelete(): void {
    const tower = this.deleting();
    if (!tower) return;
    this.deleteBusy.set(true);
    this.deleteError.set('');
    this.api.delete(tower.id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.deleteBusy.set(false))).subscribe({
      next: () => {
        this.deleting.set(null);
        this.notice.set({ tone: 'success', text: `Đã xóa cột ${tower.towerCode}.` });
        const onlyRowOnPage = this.result().items.length === 1 && this.page() > 1;
        this.goToPage(onlyRowOnPage ? this.page() - 1 : this.page());
      },
      error: (error: unknown) => this.deleteError.set(apiErrorMessage(error, 'Không thể xóa cột điện.')),
    });
  }

  protected importFile(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    const file = inputElement.files?.[0];
    inputElement.value = '';
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      this.notice.set({ tone: 'error', text: 'Vui lòng chọn tệp Excel định dạng .xlsx.' });
      return;
    }
    this.importing.set(true);
    this.notice.set(null);
    this.api.import(file).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.importing.set(false))).subscribe({
      next: (result) => {
        this.notice.set({ tone: 'success', text: `Đã nhập ${result.importedCount} cột điện, bỏ qua ${result.skippedCount} dòng không hợp lệ hoặc trùng mã.` });
        this.goToPage(1);
      },
      error: (error: unknown) => this.notice.set({ tone: 'error', text: apiErrorMessage(error, 'Không thể nhập tệp Excel.') }),
    });
  }
}
