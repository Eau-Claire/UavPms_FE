import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, OnDestroy, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { isManagerRole } from '../../../../core/auth/roles';
import {
  MISSION_STATUSES,
  Mission,
  MissionPage,
  MissionStatus,
  normalizeMissionStatus,
} from '../../../../models/missions.models';
import { Pagination } from '../../../../shared/components/pagination/pagination';
import { describeHttpError } from '../../../../shared/errors/business-error-messages';
import {
  priorityColorClass,
  priorityLabel,
  statusColorClass,
  statusLabel,
} from '../../../../shared/status/status';
import { NotificationsRealtime } from '../../../notifications/data-access/notifications-realtime';
import { MissionLink, MissionListScope, canViewAllMissions, missionRowLink } from '../../data-access/mission-access';
import { MissionsApi } from '../../data-access/missions-api';

interface CachedMissionPage {
  readonly data: MissionPage;
  readonly cachedAt: number;
}

const CACHE_TTL_MS = 60_000;
const SEARCH_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-mission-list',
  imports: [DatePipe, RouterLink, Pagination],
  templateUrl: './mission-list.html',
  styleUrl: './mission-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionList implements OnDestroy {
  private readonly api = inject(MissionsApi);
  private readonly realtime = inject(NotificationsRealtime);
  private readonly auth = inject(Auth);
  private readonly destroyRef = inject(DestroyRef);

  private activeLoadSub: Subscription | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pageCache = new Map<string, CachedMissionPage>();

  protected readonly user = computed(() => this.auth.user());
  protected readonly canCreateMission = computed(() => isManagerRole(this.user()?.role));
  /** `GET /missions` (all missions) is only open to SystemAdmin, Manager and Analyst. */
  protected readonly canViewAll = computed(() => canViewAllMissions(this.user()?.role));

  protected readonly initialLoading = signal(true);
  protected readonly fetching = signal(false);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);
  protected readonly search = signal('');
  protected readonly status = signal('');
  protected readonly priority = signal<string>('');
  protected readonly sortBy = signal<string>('createdAt');
  protected readonly sortDescending = signal<boolean>(true);
  protected readonly sortOption = signal<string>('createdAt_desc');
  protected readonly scope = signal<MissionListScope>(isManagerRole(this.auth.user()?.role) ? 'all' : 'my');
  protected readonly response = signal<MissionPage>({ items: [], page: 1, pageSize: 10, totalCount: 0, totalPages: 1 });

  protected readonly skeletonRows = readonlyRange(10);
  protected readonly statuses = MISSION_STATUSES;
  protected readonly priorityOptions: readonly { value: string; label: string }[] = [
    { value: '', label: 'Tất cả ưu tiên' },
    { value: 'EMERGENCY', label: 'Khẩn cấp' },
    { value: 'HIGH', label: 'Cao' },
    { value: 'NORMAL', label: 'Bình thường' },
  ];

  protected readonly hasActiveFilters = computed(() =>
    Boolean(
      this.search().trim() ||
        this.status() ||
        this.priority() ||
        this.sortOption() !== 'createdAt_desc',
    ),
  );

  constructor() {
    this.realtime.connect();
    this.realtime.missionEvents$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        this.pageCache.clear();
        if (event.type === 'DISPATCHED') {
          this.load(this.page(), { forceRefresh: true });
          return;
        }

        this.response.update((curr) => {
          const index = curr.items.findIndex(
            (m) => m.id === event.missionId || m.missionCode === event.missionId,
          );
          if (index === -1) return curr;
          const newItems = [...curr.items];
          const target = newItems[index];
          newItems[index] = { ...target, status: liveStatus(event, target.status) };
          return { ...curr, items: newItems };
        });
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
    return [
      this.scope(),
      this.status(),
      this.priority(),
      this.search().trim().toLowerCase(),
      this.sortOption(),
      targetPage,
      this.pageSize(),
    ].join('|');
  }

  protected setScope(scope: MissionListScope): void {
    if (this.scope() === scope) return;
    if (scope === 'all' && !this.canViewAll()) return;
    this.scope.set(scope);
    this.load(1);
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
        this.error.set('');
        this.page.set(cached.data.page);
        this.response.set(cached.data);
        return;
      }
    }

    this.activeLoadSub?.unsubscribe();
    this.fetching.set(true);
    this.error.set('');

    const filters = {
      page: targetPage,
      pageSize: this.pageSize(),
      search: this.search().trim(),
      status: this.status(),
      priority: this.priority(),
      sortBy: this.sortBy(),
      sortDescending: this.sortDescending(),
    };

    if (this.scope() === 'my' || !this.canViewAll()) {
      this.activeLoadSub = this.api.my().subscribe({
        next: (missions) => {
          const query = filters.search.toLowerCase();
          const items = missions.filter((mission) => {
            const matchesStatus = !filters.status || mission.status === filters.status;
            const matchesPriority =
              !filters.priority ||
              (mission.priority || 'NORMAL').toUpperCase() === filters.priority.toUpperCase();
            const matchesSearch =
              !query ||
              `${mission.title} ${mission.missionCode} ${mission.description}`.toLowerCase().includes(query);
            return matchesStatus && matchesPriority && matchesSearch;
          });

          if (this.sortBy() === 'priority') {
            const priorityWeight: Record<string, number> = { EMERGENCY: 3, HIGH: 2, NORMAL: 1 };
            items.sort((a, b) => {
              const pA = priorityWeight[(a.priority || 'NORMAL').toUpperCase()] || 1;
              const pB = priorityWeight[(b.priority || 'NORMAL').toUpperCase()] || 1;
              if (pA !== pB) return this.sortDescending() ? pB - pA : pA - pB;
              return (b.createdAt || '').localeCompare(a.createdAt || '');
            });
          } else {
            items.sort((a, b) =>
              this.sortDescending()
                ? (b.createdAt || '').localeCompare(a.createdAt || '')
                : (a.createdAt || '').localeCompare(b.createdAt || ''),
            );
          }

          const totalPages = Math.max(1, Math.ceil(items.length / filters.pageSize));
          const resolvedPage = Math.min(targetPage, totalPages);
          const pageData: MissionPage = {
            items: items.slice((resolvedPage - 1) * filters.pageSize, resolvedPage * filters.pageSize),
            page: resolvedPage,
            pageSize: filters.pageSize,
            totalCount: items.length,
            totalPages,
          };
          this.pageCache.set(cacheKey, { data: pageData, cachedAt: Date.now() });
          this.page.set(resolvedPage);
          this.response.set(pageData);
          this.initialLoading.set(false);
          this.fetching.set(false);
        },
        error: (error: unknown) => {
          this.initialLoading.set(false);
          this.fetching.set(false);
          this.error.set(this.errorMessage(error));
        },
      });
      return;
    }

    this.activeLoadSub = this.api.list(filters).subscribe({
      next: (res) => {
        this.pageCache.set(cacheKey, { data: res, cachedAt: Date.now() });
        this.page.set(res.page);
        this.response.set(res);
        this.initialLoading.set(false);
        this.fetching.set(false);
      },
      error: (error: unknown) => {
        this.initialLoading.set(false);
        this.fetching.set(false);
        this.error.set(this.errorMessage(error));
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

  protected onStatusEvent(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.status.set(target?.value ?? '');
    this.load(1);
  }

  protected onPriorityEvent(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.priority.set(target?.value ?? '');
    this.load(1);
  }

  protected onSortEvent(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    const value = target?.value ?? 'createdAt_desc';
    this.sortOption.set(value);
    switch (value) {
      case 'createdAt_asc':
        this.sortBy.set('createdAt');
        this.sortDescending.set(false);
        break;
      case 'priority_desc':
        this.sortBy.set('priority');
        this.sortDescending.set(true);
        break;
      case 'priority_asc':
        this.sortBy.set('priority');
        this.sortDescending.set(false);
        break;
      default:
        this.sortBy.set('createdAt');
        this.sortDescending.set(true);
        break;
    }
    this.load(1);
  }

  protected resetFilters(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.search.set('');
    this.status.set('');
    this.priority.set('');
    this.sortOption.set('createdAt_desc');
    this.sortBy.set('createdAt');
    this.sortDescending.set(true);
    this.load(1);
  }

  protected goToPage(targetPage: number): void {
    const nextPage = Math.min(Math.max(1, Math.trunc(targetPage)), Math.max(1, this.response().totalPages));
    if (nextPage === this.page()) return;
    this.load(nextPage);
  }

  protected rowLink(mission: Mission): MissionLink {
    return missionRowLink(mission, this.user()?.role, this.user()?.id, this.scope());
  }

  protected routeLabel(mission: Mission): string {
    return mission.routeData || mission.description || 'Chưa có tuyến';
  }

  protected assigneeLabel(mission: Mission): string {
    const rawName = (mission.assignedToUsername || '').trim();
    const displayName = rawName.includes('@')
      ? rawName.split('@')[0].split('+')[0].trim()
      : rawName;
    const parts = [displayName, (mission.droneCode || '').trim()].filter(Boolean);
    return parts.length ? parts.join(' · ') : '—';
  }

  protected statusLabel(status: string): string {
    const normalized = normalizeMissionStatus(status);
    if (normalized === 'Completed') return 'Hoàn thành';
    return statusLabel(normalized);
  }

  protected statusColorClass(status: string): string {
    const normalized = normalizeMissionStatus(status);
    if (normalized === 'Completed') return 'text-emerald-600 font-medium';
    return statusColorClass(normalized);
  }

  protected readonly priorityLabel = priorityLabel;
  protected readonly priorityColorClass = priorityColorClass;

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
      return 'Bạn không có quyền xem danh sách nhiệm vụ này.';
    }
    return describeHttpError(error, 'Không thể tải danh sách nhiệm vụ.');
  }
}

function readonlyRange(count: number): readonly number[] {
  return Array.from({ length: count }, (_, i) => i + 1);
}

function liveStatus(event: { type: string; status?: string | null }, current: MissionStatus): MissionStatus {
  if (event.status) return normalizeMissionStatus(event.status);
  if (event.type === 'SUSPENDED') return 'Suspended';
  if (event.type === 'CANCELLED') return 'Cancelled';
  return current;
}
