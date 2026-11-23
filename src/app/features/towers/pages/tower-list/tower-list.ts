import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnDestroy, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { finalize, Subscription } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { ToastService } from '../../../../core/toast/toast.service';
import { RegionLookup, TowerPage, TowerSummary, TowerUpsertRequest } from '../../../../models/assets.models';
import { Pagination } from '../../../../shared/components/pagination/pagination';
import { ConfirmDialog } from '../../components/confirm-dialog/confirm-dialog';
import { TowerFormDialog } from '../../components/tower-form-dialog/tower-form-dialog';
import { RegionsApi } from '../../data-access/regions-api';
import { canManageInfrastructure } from '../../data-access/tower-labels';
import { apiErrorMessage, apiErrorStatus, TowersApi } from '../../data-access/towers-api';

const EMPTY_PAGE: TowerPage = { items: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 } };
const CACHE_TTL_MS = 60_000;
const SEARCH_DEBOUNCE_MS = 300;

interface CachedTowerPage {
  readonly data: TowerPage;
  readonly cachedAt: number;
}

@Component({
  selector: 'app-tower-list',
  imports: [DecimalPipe, RouterLink, Pagination, TowerFormDialog, ConfirmDialog],
  templateUrl: './tower-list.html',
  styleUrl: './tower-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TowerList implements OnDestroy {
  private readonly api = inject(TowersApi);
  private readonly regionsApi = inject(RegionsApi);
  private readonly auth = inject(Auth);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toast = inject(ToastService);

  private activeLoadSub: Subscription | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pageCache = new Map<string, CachedTowerPage>();

  protected readonly canManage = computed(() => canManageInfrastructure(this.auth.user()?.role));
  protected readonly skeletonRows = readonlyRange(10);

  protected readonly regions = signal<readonly RegionLookup[]>([]);
  protected readonly result = signal<TowerPage>(EMPTY_PAGE);
  protected readonly initialLoading = signal(true);
  protected readonly fetching = signal(false);
  protected readonly loadError = signal('');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);

  protected readonly search = signal('');
  protected readonly regionId = signal('');

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<TowerSummary | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');

  protected readonly deleting = signal<TowerSummary | null>(null);
  protected readonly deleteBusy = signal(false);
  protected readonly deleteError = signal('');
  protected readonly importing = signal(false);

  protected readonly hasActiveFilters = computed(() =>
    Boolean(this.search().trim() || this.regionId()),
  );

  private readonly regionNames = computed(() => new Map(this.regions().map((region) => [region.id, region.name])));

  constructor() {
    this.regionsApi.getAll().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (regions) => this.regions.set(regions),
      error: () => this.regions.set([]),
    });

    this.load(1);
  }

  ngOnDestroy(): void {
    this.activeLoadSub?.unsubscribe();
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
  }

  private getCacheKey(targetPage: number): string {
    return `${this.regionId()}|${this.search().trim().toLowerCase()}|${targetPage}|${this.pageSize()}`;
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
    if (lower.includes('bu-lông') || lower.includes('bu lông')) return 'Thép bu-lông';
    if (lower.includes('đơn thân')) return 'Thép đơn thân';
    return type;
  }

  protected displayAddress(address?: string | null): string {
    if (!address) return '—';
    return address.replace(/,\s*(TP\.\s*Hồ Chí Minh|TP\.HCM|Thành phố Hồ Chí Minh)$/i, '');
  }

  protected refresh(): void {
    this.pageCache.clear();
    this.load(this.page(), { forceRefresh: true });
  }

  protected load(targetPage = this.page(), options: { forceRefresh?: boolean } = {}): void {
    const cacheKey = this.getCacheKey(targetPage);
    if (!options.forceRefresh) {
      const cached = this.pageCache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        this.activeLoadSub?.unsubscribe();
        this.fetching.set(false);
        this.loadError.set('');
        this.page.set(cached.data.pagination.page);
        this.result.set(cached.data);
        return;
      }
    }

    this.activeLoadSub?.unsubscribe();
    this.fetching.set(true);
    this.loadError.set('');

    this.activeLoadSub = this.api
      .list({
        page: targetPage,
        pageSize: this.pageSize(),
        regionId: this.regionId() || undefined,
        search: this.search().trim() || undefined,
      })
      .subscribe({
        next: (data) => {
          this.pageCache.set(cacheKey, { data, cachedAt: Date.now() });
          this.page.set(data.pagination.page);
          this.result.set(data);
          this.initialLoading.set(false);
          this.fetching.set(false);
        },
        error: (error: unknown) => {
          this.initialLoading.set(false);
          this.fetching.set(false);
          this.loadError.set(
            apiErrorStatus(error) === 403
              ? 'Bạn không có quyền xem danh sách cột điện.'
              : apiErrorMessage(error, 'Không thể tải danh sách cột điện.'),
          );
        },
      });
  }

  protected onSearchEvent(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.search.set(target?.value ?? '');
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => {
      this.load(1);
    }, SEARCH_DEBOUNCE_MS);
  }

  protected onRegionEvent(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.regionId.set(target?.value ?? '');
    this.load(1);
  }

  protected goToPage(targetPage: number): void {
    const clamped = Math.max(1, targetPage);
    if (clamped === this.page()) return;
    this.load(clamped);
  }

  protected resetFilters(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.search.set('');
    this.regionId.set('');
    this.load(1);
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
        const msg = current
          ? `Đã cập nhật cột ${tower.towerCode || request.towerCode}.`
          : `Đã thêm cột ${tower.towerCode || request.towerCode}.`;
        this.toast.success(msg);
        this.pageCache.clear();
        this.load(this.page(), { forceRefresh: true });
      },
      error: (error: unknown) =>
        this.formError.set(apiErrorMessage(error, current ? 'Không thể cập nhật cột điện.' : 'Không thể tạo cột điện.')),
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
        this.toast.success(`Đã xóa cột ${tower.towerCode}.`);
        this.pageCache.clear();
        const onlyRowOnPage = this.result().items.length === 1 && this.page() > 1;
        this.load(onlyRowOnPage ? this.page() - 1 : this.page(), { forceRefresh: true });
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
      this.toast.error('Vui lòng chọn tệp Excel định dạng .xlsx.');
      return;
    }
    this.importing.set(true);
    this.api.import(file).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.importing.set(false))).subscribe({
      next: (result) => {
        this.toast.success(
          `Đã nhập ${result.importedCount} cột điện, bỏ qua ${result.skippedCount} dòng không hợp lệ hoặc trùng mã.`,
        );
        this.pageCache.clear();
        this.load(1, { forceRefresh: true });
      },
      error: (error: unknown) => {
        this.toast.error(apiErrorMessage(error, 'Không thể nhập tệp Excel.'));
      },
    });
  }
}

function readonlyRange(count: number): readonly number[] {
  return Array.from({ length: count }, (_, i) => i + 1);
}
