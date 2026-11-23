import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnDestroy, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, Observable, of, Subscription } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { isAnalystRole, isManagerRole } from '../../../../core/auth/roles';
import { PageResult } from '../../../../models/api.models';
import { Mission } from '../../../../models/missions.models';
import { InspectionFilters as Filters, InspectionRecord } from '../../../../models/monitor.models';

type InspectionPage = PageResult<InspectionRecord>;
import { Pagination } from '../../../../shared/components/pagination/pagination';
import { describeHttpError } from '../../../../shared/errors/business-error-messages';
import { MissionsApi } from '../../../missions/data-access/missions-api';
import { MissionOption, resolveMissionInput } from '../../components/inspection-filters/inspection-filters';
import { MonitorApi } from '../../data-access/monitor-api';

interface CachedInspectionPage {
  readonly data: InspectionPage;
  readonly cachedAt: number;
}

const CACHE_TTL_MS = 60_000;
const SEARCH_DEBOUNCE_MS = 300;
const EMPTY_PAGE: InspectionPage = { items: [], totalCount: 0, page: 1, pageSize: 10, totalPages: 1 };

/** Case- and accent-insensitive text for matching mission names ("Kiểm tra" ~ "kiem tra"). */
const foldText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();

export const matchesMissionSearch = (record: InspectionRecord, search: string): boolean => {
  const needle = foldText(search);
  if (!needle) return true;
  return foldText(record.missionName).includes(needle) || record.missionId.toLowerCase().includes(needle);
};

@Component({
  selector: 'app-inspection-history',
  imports: [DatePipe, RouterLink, Pagination],
  templateUrl: './inspection-history.html',
  styleUrl: './inspection-history.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InspectionHistory implements OnDestroy {
  private readonly monitorApi = inject(MonitorApi);
  private readonly missionsApi = inject(MissionsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly role = inject(Auth).user()?.role;

  private activeLoadSub: Subscription | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pageCache = new Map<string, CachedInspectionPage>();

  protected readonly skeletonRows = readonlyRange(10);
  protected readonly missionOptions = signal<readonly MissionOption[]>([]);

  protected readonly initialLoading = signal(true);
  protected readonly fetching = signal(false);
  protected readonly error = signal('');
  protected readonly pageData = signal<InspectionPage>(EMPTY_PAGE);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);

  // Filters
  protected readonly missionInput = signal('');
  protected readonly defectStatus = signal<'all' | 'defect' | 'clear'>('all');
  protected readonly fromDateInput = signal('');
  protected readonly toDateInput = signal('');
  protected readonly fromDateIso = computed(() => parseVietnameseDateToIso(this.fromDateInput()));
  protected readonly toDateIso = computed(() => parseVietnameseDateToIso(this.toDateInput()));

  /** Quick-view image modal state */
  protected readonly previewItem = signal<InspectionRecord | null>(null);
  protected readonly brokenImageIds = signal<ReadonlySet<string>>(new Set());

  protected readonly resolvedMission = computed(() =>
    resolveMissionInput(this.missionInput(), this.missionOptions()),
  );
  protected readonly missionSearch = computed(() =>
    this.resolvedMission() ? '' : this.missionInput().trim(),
  );

  protected readonly hasActiveFilters = computed(() =>
    Boolean(
      this.missionInput().trim() ||
        this.defectStatus() !== 'all' ||
        this.fromDateInput().trim() ||
        this.toDateInput().trim(),
    ),
  );

  protected readonly visibleItems = computed(() => {
    const items = this.pageData().items;
    const search = this.missionSearch();
    return search ? items.filter((item) => matchesMissionSearch(item, search)) : items;
  });

  constructor() {
    this.loadMissionOptions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((options) => this.missionOptions.set(options));

    this.load(1);
  }

  ngOnDestroy(): void {
    this.activeLoadSub?.unsubscribe();
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
  }

  private getCacheKey(filters: Filters): string {
    return [
      filters.missionId,
      String(filters.isDefect),
      filters.fromDate,
      filters.toDate,
      filters.page,
      filters.pageSize,
    ].join('|');
  }

  private buildFilters(targetPage: number): Filters {
    const status = this.defectStatus();
    return {
      missionId: this.resolvedMission()?.id ?? '',
      isDefect: status === 'all' ? null : status === 'defect',
      fromDate: this.fromDateIso(),
      toDate: this.toDateIso(),
      page: targetPage,
      pageSize: this.pageSize(),
    };
  }

  protected refresh(): void {
    this.pageCache.clear();
    this.load(this.page(), { forceRefresh: true });
  }

  protected load(targetPage = this.page(), options: { forceRefresh?: boolean } = {}): void {
    const filters = this.buildFilters(targetPage);
    const cacheKey = this.getCacheKey(filters);

    if (!options.forceRefresh) {
      const cached = this.pageCache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        this.activeLoadSub?.unsubscribe();
        this.fetching.set(false);
        this.error.set('');
        this.page.set(cached.data.page);
        this.pageData.set(cached.data);
        return;
      }
    }

    this.activeLoadSub?.unsubscribe();
    this.fetching.set(true);
    this.error.set('');

    this.activeLoadSub = this.monitorApi.getInspections(filters).subscribe({
      next: (res) => {
        this.pageCache.set(cacheKey, { data: res, cachedAt: Date.now() });
        this.page.set(res.page);
        this.pageData.set(res);
        this.initialLoading.set(false);
        this.fetching.set(false);
      },
      error: (err: unknown) => {
        this.initialLoading.set(false);
        this.fetching.set(false);
        this.error.set(describeHttpError(err, 'Không thể tải dữ liệu lịch sử kiểm tra.'));
      },
    });
  }

  protected onMissionInputEvent(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.missionInput.set(target?.value ?? '');
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => {
      this.load(1);
    }, SEARCH_DEBOUNCE_MS);
  }

  protected onDefectStatusEvent(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.defectStatus.set((target?.value ?? 'all') as 'all' | 'defect' | 'clear');
    this.load(1);
  }

  protected onFromDateEvent(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const formatted = formatVietnameseDateInput(target?.value ?? '');
    this.fromDateInput.set(formatted);
    if (target && target.value !== formatted) {
      target.value = formatted;
    }
    if (!formatted || formatted.length === 10) {
      this.load(1);
    }
  }

  protected onToDateEvent(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const formatted = formatVietnameseDateInput(target?.value ?? '');
    this.toDateInput.set(formatted);
    if (target && target.value !== formatted) {
      target.value = formatted;
    }
    if (!formatted || formatted.length === 10) {
      this.load(1);
    }
  }

  protected resetFilters(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.missionInput.set('');
    this.defectStatus.set('all');
    this.fromDateInput.set('');
    this.toDateInput.set('');
    this.load(1);
  }

  protected changePage(targetPage: number): void {
    const clamped = Math.max(1, targetPage);
    if (clamped === this.page()) return;
    this.load(clamped);
  }

  protected openPreview(item: InspectionRecord): void {
    if (!item.imageUrl || this.isImageBroken(item.id)) return;
    this.previewItem.set(item);
  }

  protected closePreview(): void {
    this.previewItem.set(null);
  }

  protected isImageBroken(id: string): boolean {
    return this.brokenImageIds().has(id);
  }

  protected onImageError(id: string): void {
    this.brokenImageIds.update((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  private loadMissionOptions(): Observable<readonly MissionOption[]> {
    const source: Observable<readonly Mission[]> =
      isManagerRole(this.role) || isAnalystRole(this.role)
        ? this.missionsApi
            .list({ page: 1, pageSize: 100, sortBy: 'createdAt', sortDescending: true })
            .pipe(map((p) => p.items))
        : this.missionsApi.my();
    return source.pipe(
      map((missions) =>
        missions
          .filter((m) => m.id)
          .map((m): MissionOption => {
            const code = m.missionCode || m.id;
            return { id: m.id, code, title: m.title, label: m.title ? `${code} — ${m.title}` : code };
          }),
      ),
      catchError(() => of<readonly MissionOption[]>([])),
    );
  }
}

function readonlyRange(count: number): readonly number[] {
  return Array.from({ length: count }, (_, i) => i + 1);
}

function formatVietnameseDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseVietnameseDateToIso(display: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display.trim());
  if (!match) return '';
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${year}-${match[2]}-${match[1]}`;
}
