import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, finalize, forkJoin, map, of, switchMap } from 'rxjs';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Auth } from '../../../../core/auth/auth';
import { isManagerRole } from '../../../../core/auth/roles';
import {
  MISSION_STATUSES,
  Mission,
  MissionPage,
  MissionStatus,
  missionStatusLabel,
  normalizeMissionStatus,
} from '../../../../models/missions.models';
import { NotificationsRealtime } from '../../../notifications/data-access/notifications-realtime';
import { MissionLink, MissionListScope, canViewAllMissions, missionRowLink } from '../../data-access/mission-access';
import { MissionsApi } from '../../data-access/missions-api';
import { PreMissionApi } from '../../../pre-mission/data-access/pre-mission-api';
import { PreMissionAssessment } from '../../../../models/pre-mission.models';
import { describeHttpError } from '../../../../shared/errors/business-error-messages';

@Component({
  selector: 'app-mission-list',
  imports: [DatePipe, RouterLink, NzIconModule],
  templateUrl: './mission-list.html',
  styleUrl: './mission-list.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionList {
  private readonly api = inject(MissionsApi);
  private readonly realtime = inject(NotificationsRealtime);
  private readonly auth = inject(Auth);
  private readonly destroyRef = inject(DestroyRef);
  private readonly preMissionApi = inject(PreMissionApi, { optional: true });
  private readonly searchInput = new Subject<string>();

  private readonly assessments = signal<readonly PreMissionAssessment[]>([]);
  private readonly regionsMap = signal<ReadonlyMap<string, string>>(new Map());

  private readonly assessmentByMissionId = computed(() => {
    const map = new Map<string, PreMissionAssessment>();
    for (const a of this.assessments()) {
      if (a.completedMissionId) {
        map.set(a.completedMissionId.toLowerCase(), a);
      }
      map.set(a.id.toLowerCase(), a);
      if (a.assessmentCode) {
        map.set(a.assessmentCode.toLowerCase(), a);
      }
    }
    return map;
  });

  protected readonly user = computed(() => this.auth.user());
  protected readonly canCreateMission = computed(() => isManagerRole(this.user()?.role));
  /** `GET /missions` (all missions) is only open to SystemAdmin, Manager and Analyst. */
  protected readonly canViewAll = computed(() => canViewAllMissions(this.user()?.role));

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(8);
  protected readonly search = signal('');
  protected readonly status = signal('');
  protected readonly priority = signal<string>('');
  protected readonly sortBy = signal<string>('priority');
  protected readonly sortDescending = signal<boolean>(true);
  protected readonly scope = signal<MissionListScope>(isManagerRole(this.auth.user()?.role) ? 'all' : 'my');
  protected readonly response = signal<MissionPage>({ items: [], page: 1, pageSize: 8, totalCount: 0, totalPages: 1 });
  protected readonly statsTotalCount = signal(0);
  protected readonly statsItems = signal<readonly Mission[]>([]);
  protected readonly statuses = MISSION_STATUSES;
  protected readonly pageButtons = computed(() => this.compactPages(this.page(), this.response().totalPages));
  protected readonly stats = computed(() => {
    const items = this.statsItems();
    return [
      { label: 'Tổng nhiệm vụ', value: this.statsTotalCount(), tone: 'total', icon: 'file-text' },
      { label: 'Đang xử lý / Chờ bay', value: items.filter((item) => this.isInProgress(item.status)).length, tone: 'warning', icon: 'reload' },
      { label: 'Đã hoàn thành', value: items.filter((item) => item.status === 'Completed').length, tone: 'success', icon: 'check-circle' },
      { label: 'Cảnh báo lỗi', value: items.filter((item) => this.isFailed(item.status)).length, tone: 'danger', icon: 'exclamation-circle' },
    ];
  });

  constructor() {
    this.searchInput
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.search.set(value);
        this.applyFilters();
      });

    this.realtime.connect();
    this.realtime.missionEvents$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event.type === 'DISPATCHED') {
          this.load();
          return;
        }

        // Live update status in the table
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

        // Live update stats cards
        this.statsItems.update((items) => {
          const index = items.findIndex(
            (m) => m.id === event.missionId || m.missionCode === event.missionId,
          );
          if (index === -1) return items;
          const newItems = [...items];
          newItems[index] = { ...newItems[index], status: liveStatus(event, newItems[index].status) };
          return newItems;
        });
      });

    if (this.preMissionApi) {
      this.preMissionApi
        .list({ page: 1, pageSize: 100 })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (res) => this.assessments.set(res.items || []),
          error: () => {},
        });
      this.preMissionApi
        .getRegions()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (regs) => this.regionsMap.set(new Map(regs.map((r) => [r.id, r.name]))),
          error: () => {},
        });
    }

    this.load();
  }

  protected setScope(scope: MissionListScope): void {
    if (this.scope() === scope) return;
    if (scope === 'all' && !this.canViewAll()) return;
    this.scope.set(scope);
    this.page.set(1);
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.response.set({ items: [], page: this.page(), pageSize: this.pageSize(), totalCount: 0, totalPages: 1 });
    const filters = {
      page: this.page(),
      pageSize: this.pageSize(),
      search: this.search(),
      status: this.status(),
      priority: this.priority(),
      sortBy: this.sortBy(),
      sortDescending: this.sortDescending(),
    };

    if (this.scope() === 'my' || !this.canViewAll()) {
      this.api.my().pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
        next: (missions) => {
          const query = filters.search.trim().toLowerCase();
          const items = missions.filter((mission) => {
            const matchesStatus = !filters.status || mission.status === filters.status;
            const matchesPriority = !filters.priority || (mission.priority || 'NORMAL').toUpperCase() === filters.priority.toUpperCase();
            const matchesSearch = !query || `${mission.title} ${mission.missionCode} ${mission.description}`.toLowerCase().includes(query);
            return matchesStatus && matchesPriority && matchesSearch;
          });

          if (this.sortBy() === 'priority') {
            const priorityWeight: Record<string, number> = { EMERGENCY: 3, HIGH: 2, NORMAL: 1 };
            items.sort((a, b) => {
              const pA = priorityWeight[(a.priority || 'NORMAL').toUpperCase()] || 1;
              const pB = priorityWeight[(b.priority || 'NORMAL').toUpperCase()] || 1;
              if (pA !== pB) return this.sortDescending() ? pB - pA : pA - pB;
              const startA = a.plannedStart || a.scheduledStartAt || '';
              const startB = b.plannedStart || b.scheduledStartAt || '';
              if (startA && startB && startA !== startB) return startA.localeCompare(startB);
              return (a.createdAt || '').localeCompare(b.createdAt || '');
            });
          }
          this.statsItems.set(items);
          this.statsTotalCount.set(items.length);
          const totalPages = Math.max(1, Math.ceil(items.length / filters.pageSize));
          const page = Math.min(filters.page, totalPages);
          this.page.set(page);
          this.response.set({
            items: items.slice((page - 1) * filters.pageSize, page * filters.pageSize),
            page,
            pageSize: filters.pageSize,
            totalCount: items.length,
            totalPages,
          });
        },
        error: (error: unknown) => {
          this.statsItems.set([]);
          this.statsTotalCount.set(0);
          this.error.set(this.errorMessage(error));
        },
      });
      return;
    }

    this.loadStats(filters);
    this.api.list(filters)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => this.response.set(response),
        error: (error: unknown) => this.error.set(this.errorMessage(error)),
      });
  }

  protected applyFilters(): void {
    this.page.set(1);
    this.load();
  }

  protected resetFilters(): void {
    this.search.set('');
    this.status.set('');
    this.priority.set('');
    this.applyFilters();
  }

  protected updateSearch(value: string): void {
    this.search.set(value);
    this.searchInput.next(value);
  }

  protected refreshList(): void {
    this.load();
  }

  protected goToPage(page: number): void {
    const nextPage = this.clampPage(page, this.response().totalPages);
    if (nextPage === this.page()) return;
    this.page.set(nextPage);
    this.load();
  }

  protected priorityLabel(priority?: string): string {
    const p = (priority || 'NORMAL').toUpperCase();
    if (p === 'EMERGENCY') return '⚡ KHẨN CẤP';
    if (p === 'HIGH') return '🔥 CAO';
    return '○ BÌNH THƯỜNG';
  }

  protected priorityClass(priority?: string): string {
    const p = (priority || 'NORMAL').toUpperCase();
    if (p === 'EMERGENCY') return 'priority-emergency';
    if (p === 'HIGH') return 'priority-high';
    return 'priority-normal';
  }

  protected priorityTone(priority?: string): string {
    const p = (priority || 'NORMAL').toUpperCase();
    if (p === 'EMERGENCY') return 'danger';
    if (p === 'HIGH') return 'warning';
    return 'neutral';
  }

  protected togglePrioritySort(): void {
    if (this.sortBy() === 'priority') {
      this.sortDescending.set(!this.sortDescending());
    } else {
      this.sortBy.set('priority');
      this.sortDescending.set(true);
    }
    this.applyFilters();
  }

  protected statusLabel(status: string): string {
    return missionStatusLabel(status);
  }

  protected statusClass(status: string): string {
    const normalized = normalizeMissionStatus(status);
    if (this.isFailed(normalized)) return 'danger';
    if (['Completed', 'Assigned', 'Ready'].includes(normalized)) return 'success';
    if (this.isInProgress(normalized) || normalized === 'Pending' || normalized === 'PendingAcceptance' || normalized === 'Postponed') return 'warning';
    return 'neutral';
  }

  /** Row target depends on the role and on whether the user still has to answer their assignment. */
  protected rowLink(mission: Mission): MissionLink {
    return missionRowLink(mission, this.user()?.role, this.user()?.id, this.scope());
  }

  protected assessmentForMission(mission: Mission): PreMissionAssessment | undefined {
    const map = this.assessmentByMissionId();
    if (mission.id && map.has(mission.id.toLowerCase())) {
      return map.get(mission.id.toLowerCase());
    }
    if (mission.sourceAssessmentId && map.has(mission.sourceAssessmentId.toLowerCase())) {
      return map.get(mission.sourceAssessmentId.toLowerCase());
    }
    const pmaMatch = (mission.title || '').match(/\[(PMA-[A-Za-z0-9_-]+)\]/i);
    if (pmaMatch && map.has(pmaMatch[1].toLowerCase())) {
      return map.get(pmaMatch[1].toLowerCase());
    }
    return undefined;
  }

  protected missionRegion(mission: Mission): string {
    if (mission.regionName && mission.regionName.trim()) {
      return mission.regionName.trim();
    }
    const a = this.assessmentForMission(mission);
    if (a?.regionName && a.regionName.trim()) {
      return a.regionName.trim();
    }
    if (mission.regionId && this.regionsMap().has(mission.regionId)) {
      return this.regionsMap().get(mission.regionId)!;
    }
    const match = (mission.title || '').match(/^Kiểm tra\s+(.+?)(?:\s*\[[A-Za-z0-9_-]+\])?$/i);
    if (match && match[1]?.trim()) {
      return match[1].trim();
    }
    return mission.routeData || mission.description || 'Chưa xác định';
  }

  protected missionTowerCount(mission: Mission): number {
    if (mission.targets && mission.targets.length > 0) {
      return mission.targets.length;
    }
    const a = this.assessmentForMission(mission);
    if (a?.towers && a.towers.length > 0) {
      return a.towers.length;
    }
    return 0;
  }

  protected routeLabel(mission: Mission): string {
    const reg = this.missionRegion(mission);
    const count = this.missionTowerCount(mission);
    if (count > 0 && reg !== 'Chưa xác định') {
      return `${reg} · ${count} cột`;
    }
    return reg;
  }

  protected startIndex(): number {
    if (!this.response().totalCount) return 0;
    return (this.response().page - 1) * this.response().pageSize + 1;
  }

  protected endIndex(): number {
    return Math.min(this.response().totalCount, this.response().page * this.response().pageSize);
  }

  private loadStats(filters: { search?: string; status?: string }): void {
    const pageSize = 100;
    this.api.list({ page: 1, pageSize, search: filters.search, status: filters.status })
      .pipe(
        switchMap((firstPage) => {
          if (firstPage.totalPages <= 1) return of({ items: firstPage.items, totalCount: firstPage.totalCount });
          const pages = Array.from({ length: firstPage.totalPages - 1 }, (_, index) => index + 2);
          return forkJoin(pages.map((page) => this.api.list({ page, pageSize, search: filters.search, status: filters.status })))
            .pipe(map((rest) => ({ items: [...firstPage.items, ...rest.flatMap((page) => page.items)], totalCount: firstPage.totalCount })));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ items, totalCount }) => {
          this.statsItems.set(items);
          this.statsTotalCount.set(totalCount);
        },
        error: () => {
          this.statsItems.set([]);
          this.statsTotalCount.set(0);
        },
      });
  }

  private isInProgress(status: string): boolean {
    return ['Ready', 'InProgress', 'Pending', 'PendingAcceptance'].includes(normalizeMissionStatus(status));
  }

  private isFailed(status: string): boolean {
    return ['Cancelled', 'Suspended'].includes(normalizeMissionStatus(status));
  }

  private compactPages(current: number, total: number): readonly number[] {
    if (total <= 0) return [1];
    if (total <= 2) return Array.from({ length: total }, (_, index) => index + 1);
    const start = Math.min(Math.max(1, current - 1), total - 2);
    return [start, start + 1, start + 2];
  }

  private clampPage(page: number, total: number): number {
    if (!Number.isFinite(page)) return this.page();
    return Math.min(Math.max(1, Math.trunc(page)), Math.max(1, total));
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
      return 'Bạn không có quyền xem danh sách nhiệm vụ này.';
    }
    return describeHttpError(error, 'Không thể tải danh sách nhiệm vụ.');
  }
}

/**
 * Status shown after a realtime mission event. The event's own status wins: a confirmation only makes the mission
 * Assigned once every required member accepted, a non-required member's postponement leaves it unchanged, and
 * resume may land in PendingAcceptance.
 */
function liveStatus(event: { type: string; status?: string | null }, current: MissionStatus): MissionStatus {
  if (event.status) return normalizeMissionStatus(event.status);
  if (event.type === 'SUSPENDED' || event.type === 'POSTPONED') return 'Postponed';
  if (event.type === 'REASSIGNED') return 'Pending';
  if (event.type === 'CANCELLED') return 'Cancelled';
  return current;
}
