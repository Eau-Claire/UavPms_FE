import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnDestroy, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import {
  MaintenanceTicket,
  MaintenanceTicketPage,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TicketPriority,
  TicketStatus,
} from '../../../../models/maintenance.models';
import { Pagination } from '../../../../shared/components/pagination/pagination';
import {
  priorityColorClass,
  priorityLabel,
  statusColorClass,
  statusLabel,
} from '../../../../shared/status/status';
import { MaintenanceApi, maintenanceErrorMessage } from '../../data-access/maintenance-api';
import { isClosedStatus, isMaintenanceManager } from '../../data-access/maintenance-labels';

const EMPTY_PAGE: MaintenanceTicketPage = { items: [], totalCount: 0, pageIndex: 0, pageSize: 10 };
const CACHE_TTL_MS = 60_000;

interface CachedMaintenancePage {
  readonly data: MaintenanceTicketPage;
  readonly cachedAt: number;
}

@Component({
  selector: 'app-maintenance-list',
  imports: [DatePipe, RouterLink, Pagination],
  templateUrl: './maintenance-list.html',
  styleUrl: './maintenance-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaintenanceList implements OnDestroy {
  private readonly api = inject(MaintenanceApi);
  private readonly auth = inject(Auth);
  private readonly destroyRef = inject(DestroyRef);

  private activeLoadSub: Subscription | null = null;
  private readonly pageCache = new Map<string, CachedMaintenancePage>();

  protected readonly statuses = TICKET_STATUSES;
  protected readonly priorities = TICKET_PRIORITIES;
  protected readonly skeletonRows = readonlyRange(10);

  protected readonly isManager = computed(() => isMaintenanceManager(this.auth.user()?.role));

  protected readonly page = signal<MaintenanceTicketPage>(EMPTY_PAGE);
  protected readonly myTickets = signal<readonly MaintenanceTicket[]>([]);
  protected readonly initialLoading = signal(true);
  protected readonly fetching = signal(false);
  protected readonly loadError = signal('');
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(10);
  protected readonly technicianNames = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly loadedAt = signal(Date.now());

  protected readonly statusFilter = signal<TicketStatus | ''>('');
  protected readonly priorityFilter = signal<TicketPriority | ''>('');
  protected readonly sortBy = signal<'priority_desc' | 'priority_asc' | 'date_desc' | 'date_asc'>('priority_desc');

  private static readonly PRIORITY_WEIGHT: Record<string, number> = {
    Emergency: 4,
    High: 3,
    Medium: 2,
    Low: 1,
  };

  protected readonly hasFilters = computed(() =>
    Boolean(this.statusFilter() || this.priorityFilter() || this.sortBy() !== 'priority_desc'),
  );

  protected readonly rows = computed<readonly MaintenanceTicket[]>(() => {
    let list: readonly MaintenanceTicket[];
    if (this.isManager()) {
      list = this.page().items;
    } else {
      const status = this.statusFilter();
      const priority = this.priorityFilter();
      list = this.myTickets().filter(
        (ticket) =>
          (!status || ticket.status === status || (status === 'Closed' && isClosedStatus(ticket.status))) &&
          (!priority || ticket.priority === priority),
      );
    }

    const sort = this.sortBy();
    return [...list].sort((a, b) => {
      if (sort === 'priority_desc' || sort === 'priority_asc') {
        const weightA = MaintenanceList.PRIORITY_WEIGHT[a.priority] ?? 0;
        const weightB = MaintenanceList.PRIORITY_WEIGHT[b.priority] ?? 0;
        const diff = sort === 'priority_desc' ? weightB - weightA : weightA - weightB;
        if (diff !== 0) return diff;
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      }
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return sort === 'date_asc' ? timeA - timeB : timeB - timeA;
    });
  });

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.page().totalCount / this.pageSize())),
  );

  constructor() {
    if (this.isManager()) {
      this.api.technicians().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (technicians) =>
          this.technicianNames.set(
            new Map(technicians.map((technician) => [technician.id, technician.fullName || technician.email])),
          ),
        error: () => this.technicianNames.set(new Map()),
      });
    }

    this.load(0);
  }

  ngOnDestroy(): void {
    this.activeLoadSub?.unsubscribe();
  }

  private getCacheKey(targetIndex: number): string {
    return `${this.statusFilter()}|${this.priorityFilter()}|${targetIndex}|${this.pageSize()}`;
  }

  protected refresh(): void {
    this.pageCache.clear();
    this.load(this.pageIndex(), { forceRefresh: true });
  }

  protected load(targetIndex = this.pageIndex(), options: { forceRefresh?: boolean } = {}): void {
    if (!this.isManager()) {
      this.activeLoadSub?.unsubscribe();
      this.fetching.set(true);
      this.loadError.set('');
      this.loadedAt.set(Date.now());
      this.activeLoadSub = this.api.mine().subscribe({
        next: (mine) => {
          this.myTickets.set(mine);
          this.initialLoading.set(false);
          this.fetching.set(false);
        },
        error: (error: unknown) => {
          this.initialLoading.set(false);
          this.fetching.set(false);
          this.loadError.set(maintenanceErrorMessage(error, 'Không thể tải danh sách phiếu bảo trì.'));
        },
      });
      return;
    }

    const cacheKey = this.getCacheKey(targetIndex);
    if (!options.forceRefresh) {
      const cached = this.pageCache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        this.activeLoadSub?.unsubscribe();
        this.fetching.set(false);
        this.loadError.set('');
        this.pageIndex.set(targetIndex);
        this.page.set(cached.data);
        return;
      }
    }

    this.activeLoadSub?.unsubscribe();
    this.fetching.set(true);
    this.loadError.set('');
    this.loadedAt.set(Date.now());

    this.activeLoadSub = this.api
      .list({
        pageIndex: targetIndex,
        pageSize: this.pageSize(),
        status: this.statusFilter(),
        priority: this.priorityFilter(),
      })
      .subscribe({
        next: (data) => {
          this.pageCache.set(cacheKey, { data, cachedAt: Date.now() });
          this.pageIndex.set(targetIndex);
          this.page.set(data);
          this.initialLoading.set(false);
          this.fetching.set(false);
        },
        error: (error: unknown) => {
          this.initialLoading.set(false);
          this.fetching.set(false);
          this.loadError.set(maintenanceErrorMessage(error, 'Không thể tải danh sách phiếu bảo trì.'));
        },
      });
  }

  protected onStatusEvent(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.statusFilter.set((target?.value ?? '') as TicketStatus | '');
    if (this.isManager()) {
      this.load(0);
    }
  }

  protected onPriorityEvent(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.priorityFilter.set((target?.value ?? '') as TicketPriority | '');
    if (this.isManager()) {
      this.load(0);
    }
  }

  protected onSortEvent(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.sortBy.set(
      (target?.value ?? 'priority_desc') as 'priority_desc' | 'priority_asc' | 'date_desc' | 'date_asc',
    );
  }

  protected goToPage(index: number): void {
    const clamped = Math.max(0, index);
    if (clamped === this.pageIndex()) return;
    this.load(clamped);
  }

  protected resetFilters(): void {
    this.statusFilter.set('');
    this.priorityFilter.set('');
    this.sortBy.set('priority_desc');
    if (this.isManager()) {
      this.load(0);
    }
  }

  protected isOverdue(ticket: MaintenanceTicket): boolean {
    return (
      Boolean(ticket.dueDate) &&
      !isClosedStatus(ticket.status) &&
      new Date(ticket.dueDate as string).getTime() < this.loadedAt()
    );
  }

  protected technicianName(ticket: MaintenanceTicket): string {
    if (!ticket.technicianId) return '';
    const raw = ticket.technician?.fullName || this.technicianNames().get(ticket.technicianId) || 'Đã giao';
    return raw.replace(/\s*\((?:Technician|MaintenanceTechnician|Kỹ thuật viên)\)/gi, '').trim();
  }

  protected readonly statusLabel = statusLabel;
  protected readonly statusColorClass = statusColorClass;
  protected readonly priorityLabel = priorityLabel;
  protected readonly priorityColorClass = priorityColorClass;
}

function readonlyRange(count: number): readonly number[] {
  return Array.from({ length: count }, (_, i) => i + 1);
}
