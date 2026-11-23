import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { isManagerRole } from '../../../../core/auth/roles';
import { ToastService } from '../../../../core/toast/toast.service';
import { AssessmentPage, PreMissionAssessment } from '../../../../models/pre-mission.models';
import { Pagination } from '../../../../shared/components/pagination/pagination';
import { describeHttpError } from '../../../../shared/errors/business-error-messages';
import { statusColorClass, statusLabel } from '../../../../shared/status/status';
import { NotificationsRealtime } from '../../../notifications/data-access/notifications-realtime';
import { PreMissionApi } from '../../data-access/pre-mission-api';

interface CachedPageEntry {
  readonly data: AssessmentPage;
  readonly cachedAt: number;
}

interface FilterTotalMeta {
  readonly totalCount: number;
  readonly totalPages: number;
  readonly totalKnown: boolean;
}

const PAGE_CACHE_TTL_MS = 60_000;
const SEARCH_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-assessment-list',
  imports: [RouterLink, DatePipe, Pagination],
  templateUrl: './assessment-list.html',
  styleUrl: './assessment-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssessmentList implements OnDestroy {
  private readonly api = inject(PreMissionApi);
  private readonly realtime = inject(NotificationsRealtime);
  private readonly auth = inject(Auth);
  private readonly toast = inject(ToastService);

  private realtimeSub: Subscription | null = null;
  private activeLoadSub: Subscription | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  /** Local page cache keyed by `status|search|page|pageSize` with 60s TTL (TanStack Query style). */
  private readonly pageCache = new Map<string, CachedPageEntry>();
  /** Shared total metadata per filter group (`status|search|pageSize`) so all pages stay consistent. */
  private readonly filterTotals = new Map<string, FilterTotalMeta>();

  /** Create, re-evaluate and cancel are manager actions; technicians and inspectors read the list. */
  protected readonly canManage = computed(() => isManagerRole(this.auth.user()?.role));

  /** True ONLY on very first fetch before any data is loaded (renders Skeleton). */
  protected readonly initialLoading = signal(true);
  /** True during background / next-page fetches (Keep-Previous-Data, no Skeleton flash). */
  protected readonly fetching = signal(false);
  protected readonly actionBusyId = signal<string | null>(null);
  protected readonly error = signal('');
  protected readonly successMessage = signal('');
  protected readonly items = signal<readonly PreMissionAssessment[]>([]);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);
  protected readonly totalCount = signal(0);
  protected readonly totalPages = signal(1);
  protected readonly totalKnown = signal(true);

  /** Fixed 10 skeleton rows matching pageSize to prevent layout shift (CLS = 0). */
  protected readonly skeletonRows = readonlyRange(10);

  // Filters
  protected readonly statusFilter = signal('');
  protected readonly regionFilter = signal('');
  protected readonly dateInput = signal('');
  protected readonly dateFilter = computed(() => parseVietnameseDateToIso(this.dateInput()));
  protected readonly searchQuery = signal('');

  protected readonly regions = signal<readonly { id: string; name: string }[]>([]);

  /** Standardized Vietnamese status filter options matching Global Status Dictionary. */
  protected readonly statuses: readonly { value: string; label: string }[] = [
    { value: '', label: 'Tất cả trạng thái' },
    { value: 'Evaluating', label: 'Đang đánh giá' },
    { value: 'Ready', label: 'Sẵn sàng' },
    { value: 'NotReady', label: 'Chưa sẵn sàng' },
    { value: 'Completed', label: 'Đã tạo nhiệm vụ' },
    { value: 'Expired', label: 'Hết hạn' },
    { value: 'Cancelled', label: 'Đã hủy' },
  ];

  protected readonly hasActiveFilters = computed(
    () =>
      Boolean(
        this.searchQuery().trim() ||
          this.regionFilter() ||
          this.statusFilter() ||
          this.dateInput().trim(),
      ),
  );

  protected readonly filteredItems = computed(() => {
    const region = this.regionFilter();
    const date = this.dateFilter();
    let list = this.items();

    if (region) {
      list = list.filter(
        (item) =>
          item.regionId === region || item.regionName.toLowerCase() === region.toLowerCase(),
      );
    }

    if (date) {
      list = list.filter((item) => item.plannedStart.startsWith(date));
    }

    return list;
  });

  protected readonly itemToCancel = signal<PreMissionAssessment | null>(null);
  protected readonly cancelReason = signal<string>('');

  constructor() {
    this.loadRegions();
    this.realtime.connect();
    this.realtime.joinAssessmentsList();
    this.initRealtimeSubscription();
    this.load(1, { forceRefresh: false });
  }

  ngOnDestroy(): void {
    this.realtime.leaveAssessmentsList();
    this.realtimeSub?.unsubscribe();
    this.activeLoadSub?.unsubscribe();
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
  }

  private getFilterKey(status: string, search: string, pageSize: number): string {
    return `${status.trim().toLowerCase()}|${search.trim().toLowerCase()}|${pageSize}`;
  }

  private getPageCacheKey(status: string, search: string, page: number, pageSize: number): string {
    return `${this.getFilterKey(status, search, pageSize)}|${page}`;
  }

  private invalidateCache(): void {
    this.pageCache.clear();
    this.filterTotals.clear();
  }

  private initRealtimeSubscription(): void {
    this.realtimeSub = this.realtime.assessmentEvents$.subscribe((evt) => {
      switch (evt.type) {
        case 'AssessmentStatusChanged': {
          if (evt.assessmentId) {
            this.invalidateCache();
            this.items.update((list) =>
              list.map((item) => {
                if (item.id === evt.assessmentId) {
                  return {
                    ...item,
                    status: (evt.status as PreMissionAssessment['status']) || item.status,
                    technical: evt.technicalHealth
                      ? { ...item.technical, status: evt.technicalHealth }
                      : item.technical,
                  };
                }
                return item;
              }),
            );
          }
          break;
        }

        case 'DroneInspectionCompleted': {
          const isPass = (evt.status || '').toUpperCase() === 'PASS';
          this.invalidateCache();
          this.items.update((list) =>
            list.map((item) => {
              const matchesDrone =
                evt.droneId && item.uavCandidates?.some((u) => u.id === evt.droneId);
              const matchesAssessment = evt.assessmentId && item.id === evt.assessmentId;
              if (matchesDrone || matchesAssessment) {
                return {
                  ...item,
                  technical: {
                    ...item.technical,
                    status: isPass ? 'PASS' : 'FAIL',
                    reason: isPass
                      ? 'Kiểm định kỹ thuật UAV đạt tiêu chuẩn.'
                      : 'Kiểm định kỹ thuật UAV không đạt tiêu chuẩn.',
                  },
                };
              }
              return item;
            }),
          );
          break;
        }

        case 'AssessmentCompleted': {
          if (evt.assessmentId) {
            this.invalidateCache();
            this.items.update((list) =>
              list.map((item) => {
                if (item.id === evt.assessmentId) {
                  const mid =
                    evt.completedMissionId || evt.consumedMissionId || item.completedMissionId;
                  return { ...item, status: 'COMPLETED', completedMissionId: mid };
                }
                return item;
              }),
            );
          }
          break;
        }
      }
    });
  }

  private loadRegions(): void {
    this.api.getRegions().subscribe({
      next: (data) => this.regions.set(data),
      error: (err) => console.warn('Failed to load regions', err),
    });
  }

  protected refresh(): void {
    this.invalidateCache();
    this.load(this.page(), { forceRefresh: true });
  }

  protected load(targetPage = this.page(), options: { forceRefresh?: boolean } = {}): void {
    const status = this.statusFilter();
    const search = this.searchQuery().trim();
    const size = this.pageSize();
    const filterKey = this.getFilterKey(status, search, size);
    const cacheKey = this.getPageCacheKey(status, search, targetPage, size);

    // 1. Check fresh Local Page Cache (0ms instant navigation, 0 extra HTTP calls)
    if (!options.forceRefresh) {
      const cached = this.pageCache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt < PAGE_CACHE_TTL_MS) {
        this.activeLoadSub?.unsubscribe();
        this.fetching.set(false);
        this.error.set('');
        this.applyPageResponse(cached.data, filterKey);
        return;
      }
    }

    // 2. Cancel any in-flight request to prevent race conditions
    this.activeLoadSub?.unsubscribe();
    this.fetching.set(true);
    this.error.set('');

    this.activeLoadSub = this.api
      .list({
        page: targetPage,
        pageSize: size,
        status,
        search,
      })
      .subscribe({
        next: (res) => {
          // Edge-case protection: DB has an exact multiple of pageSize (e.g. 10 or 20)
          // and backend omits totalCount -> next page returns empty [].
          // Keep user on previous page, lock exact totalCount/totalPages, never show blank page.
          if (targetPage > 1 && res.items.length === 0) {
            const lastValidPage = targetPage - 1;
            const exactTotal = lastValidPage * size;
            this.filterTotals.set(filterKey, {
              totalCount: exactTotal,
              totalPages: lastValidPage,
              totalKnown: true,
            });
            this.page.set(lastValidPage);
            this.totalCount.set(exactTotal);
            this.totalPages.set(lastValidPage);
            this.totalKnown.set(true);
            this.initialLoading.set(false);
            this.fetching.set(false);
            return;
          }

          this.pageCache.set(cacheKey, { data: res, cachedAt: Date.now() });

          // Update shared filter-group total metadata so returning to Page 1 stays consistent
          const existingMeta = this.filterTotals.get(filterKey);
          const responseKnown = res.totalKnown !== false;
          if (responseKnown) {
            this.filterTotals.set(filterKey, {
              totalCount: res.totalCount,
              totalPages: res.totalPages,
              totalKnown: true,
            });
          } else if (!existingMeta || !existingMeta.totalKnown) {
            const nextTotalPages = Math.max(existingMeta?.totalPages ?? 1, res.totalPages);
            this.filterTotals.set(filterKey, {
              totalCount: Math.max(existingMeta?.totalCount ?? 0, res.totalCount),
              totalPages: nextTotalPages,
              totalKnown: false,
            });
          }

          this.applyPageResponse(res, filterKey);
          this.initialLoading.set(false);
          this.fetching.set(false);
        },
        error: (err: unknown) => {
          this.initialLoading.set(false);
          this.fetching.set(false);
          this.error.set(
            describeHttpError(
              err,
              'Không tải được danh sách đánh giá tiền nhiệm vụ. Vui lòng thử lại.',
            ),
          );
        },
      });
  }

  private applyPageResponse(res: AssessmentPage, filterKey: string): void {
    const sharedMeta = this.filterTotals.get(filterKey);
    this.items.set(res.items);
    this.page.set(res.page);
    this.pageSize.set(res.pageSize);
    if (sharedMeta) {
      this.totalCount.set(sharedMeta.totalCount);
      this.totalPages.set(sharedMeta.totalPages);
      this.totalKnown.set(sharedMeta.totalKnown);
    } else {
      this.totalCount.set(res.totalCount);
      this.totalPages.set(res.totalPages);
      this.totalKnown.set(res.totalKnown !== false);
    }
  }

  protected onSearchEvent(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.searchQuery.set(target?.value ?? '');
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => {
      this.load(1);
    }, SEARCH_DEBOUNCE_MS);
  }

  protected onRegionEvent(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.regionFilter.set(target?.value ?? '');
  }

  protected onStatusEvent(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.statusFilter.set(target?.value ?? '');
    this.load(1);
  }

  protected onDateEvent(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const raw = target?.value ?? '';
    const formatted = formatVietnameseDateInput(raw);
    this.dateInput.set(formatted);
    if (target && target.value !== formatted) {
      target.value = formatted;
    }
  }

  protected onCancelReasonEvent(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;
    this.cancelReason.set(target?.value ?? '');
  }

  protected resetFilters(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.statusFilter.set('');
    this.regionFilter.set('');
    this.dateInput.set('');
    this.searchQuery.set('');
    this.load(1);
  }

  protected reevaluateItem(item: PreMissionAssessment, event: Event): void {
    event.stopPropagation();
    if (this.actionBusyId()) return;
    if (item.status === 'COMPLETED') {
      this.toast.error(
        'Đánh giá tiền nhiệm vụ đã hoàn thành tạo nhiệm vụ bay, không thể đánh giá lại.',
      );
      return;
    }
    if (item.status === 'EXPIRED') {
      this.toast.error(
        'Bản đánh giá đã hết hạn hiệu lực / khung giờ bay đã qua, không thể đánh giá lại.',
      );
      return;
    }
    if (item.status === 'CANCELLED') {
      this.toast.error('Bản đánh giá đã bị hủy, không thể đánh giá lại.');
      return;
    }
    this.actionBusyId.set(item.id);
    this.error.set('');
    this.successMessage.set('');

    this.api.reEvaluate(item.id).subscribe({
      next: (updated) => {
        this.invalidateCache();
        this.items.update((list) => list.map((x) => (x.id === updated.id ? updated : x)));
        const msg = `Đã đánh giá lại thành công cho mã ${item.assessmentCode}.`;
        this.successMessage.set(msg);
        this.toast.success(msg);
        this.realtime.broadcastAssessmentEvent({
          assessmentId: updated.id,
          type: 'AssessmentStatusChanged',
          status: updated.status,
          technicalHealth: updated.technical?.status,
          message: `Đã đánh giá lại thành công cho mã ${item.assessmentCode}: ${statusLabel(updated.status)}`,
          timestamp: new Date().toISOString(),
        });
        this.actionBusyId.set(null);
      },
      error: (err: unknown) => {
        this.actionBusyId.set(null);
        const errMsg = `${item.assessmentCode}: ${describeHttpError(err, 'Không thể đánh giá lại hồ sơ.')}`;
        this.error.set(errMsg);
        this.toast.error(errMsg);
      },
      complete: () => {
        this.actionBusyId.set(null);
      },
    });
  }

  protected cancelItem(item: PreMissionAssessment, event: Event): void {
    event.stopPropagation();
    if (this.actionBusyId()) return;
    if (item.status === 'COMPLETED') {
      this.error.set('Không thể hủy đánh giá đã hoàn thành / tạo nhiệm vụ.');
      return;
    }
    if (item.status === 'EXPIRED') {
      this.error.set('Bản đánh giá đã hết hạn, không thể thao tác.');
      return;
    }
    if (item.status === 'CANCELLED') {
      this.error.set('Bản đánh giá đã được hủy trước đó.');
      return;
    }

    this.cancelReason.set('');
    this.itemToCancel.set(item);
  }

  protected closeCancelModal(): void {
    if (this.actionBusyId()) return;
    this.itemToCancel.set(null);
  }

  protected executeCancel(): void {
    const item = this.itemToCancel();
    if (!item) return;

    this.actionBusyId.set(item.id);
    this.error.set('');
    this.successMessage.set('');
    const reason = this.cancelReason().trim() || 'Người dùng hủy từ danh sách';

    this.api.cancel(item.id, reason).subscribe({
      next: (cancelled) => {
        this.invalidateCache();
        this.items.update((list) => list.map((x) => (x.id === cancelled.id ? cancelled : x)));
        this.itemToCancel.set(null);
        this.successMessage.set(`Đã hủy bản đánh giá ${item.assessmentCode}.`);
      },
      error: (err: unknown) => {
        this.error.set(
          `${item.assessmentCode}: ${describeHttpError(err, 'Không thể hủy hồ sơ.')}`,
        );
        this.itemToCancel.set(null);
        this.actionBusyId.set(null);
      },
      complete: () => {
        this.actionBusyId.set(null);
      },
    });
  }

  protected goToPage(targetPage: number): void {
    if (targetPage < 1 || targetPage > this.totalPages() || targetPage === this.page()) return;
    this.load(targetPage);
  }

  protected isSiteReady(item: PreMissionAssessment): boolean {
    const s = (item.site?.status || '').toUpperCase();
    return (
      s === 'READY' ||
      s === 'PASS' ||
      s === 'FEASIBLE' ||
      item.status === 'READY' ||
      item.status === 'COMPLETED'
    );
  }

  protected isPersonnelReady(item: PreMissionAssessment): boolean {
    const s = (item.personnel?.status || '').toUpperCase();
    return s === 'READY' || s === 'PASS' || item.status === 'READY' || item.status === 'COMPLETED';
  }

  protected isUavReady(item: PreMissionAssessment): boolean {
    const s = (item.uav?.status || '').toUpperCase();
    return s === 'READY' || s === 'PASS' || item.status === 'READY' || item.status === 'COMPLETED';
  }

  protected isTechnicalReady(item: PreMissionAssessment): boolean {
    const s = (item.technical?.status || '').toUpperCase();
    return (
      s === 'READY' ||
      s === 'PASS' ||
      s === 'HEALTHY' ||
      item.status === 'READY' ||
      item.status === 'COMPLETED'
    );
  }

  protected isExpiredTime(item: PreMissionAssessment): boolean {
    return (item.status || '').toUpperCase() === 'EXPIRED';
  }

  protected readinessLabel(passed: boolean): string {
    return statusLabel(passed ? 'PASS' : 'FAIL');
  }

  protected readinessColorClass(passed: boolean): string {
    return statusColorClass(passed ? 'PASS' : 'FAIL');
  }

  protected readonly statusLabel = statusLabel;
  protected readonly statusColorClass = statusColorClass;
}

function readonlyRange(count: number): readonly number[] {
  return Array.from({ length: count }, (_, i) => i + 1);
}

/** Auto-formats numeric input into `dd/MM/yyyy` without native browser date icon/locale bugs. */
function formatVietnameseDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Converts valid `dd/MM/yyyy` to `yyyy-MM-dd` for filtering ISO timestamps. */
function parseVietnameseDateToIso(display: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display.trim());
  if (!match) return '';
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${year}-${match[2]}-${match[1]}`;
}
