import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { catchError, map, of, startWith, Subject, switchMap, tap } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import {
  MaintenanceTicket,
  MaintenanceTicketFilters,
  MaintenanceTicketPage,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TicketPriority,
  TicketStatus,
} from '../../../../models/maintenance.models';
import { DataState } from '../../../../shared/components/data-state/data-state';
import { Pagination } from '../../../../shared/components/pagination/pagination';
import { MaintenanceApi, maintenanceErrorMessage } from '../../data-access/maintenance-api';
import {
  isClosedStatus,
  isMaintenanceManager,
  maintenancePriorityLabel,
  maintenancePriorityTone,
  maintenanceStatusLabel,
  maintenanceStatusTone,
} from '../../data-access/maintenance-labels';

const EMPTY_PAGE: MaintenanceTicketPage = { items: [], totalCount: 0, pageIndex: 0, pageSize: 20 };

/**
 * `/maintenance`: Admin/Manager page through every ticket (GET /maintenance/tickets, server-side filters);
 * Technicians see their own tickets (GET /maintenance/tickets/my, filtered in the browser).
 */
@Component({
  selector: 'app-maintenance-list',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, NzIconModule, DataState, Pagination],
  templateUrl: './maintenance-list.html',
  styleUrl: './maintenance-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaintenanceList {
  private readonly api = inject(MaintenanceApi);
  private readonly auth = inject(Auth);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reload$ = new Subject<MaintenanceTicketFilters | null>();

  protected readonly statuses = TICKET_STATUSES;
  protected readonly priorities = TICKET_PRIORITIES;
  protected readonly pageSizes = [10, 20, 50] as const;
  protected readonly statusLabel = maintenanceStatusLabel;
  protected readonly statusTone = maintenanceStatusTone;
  protected readonly priorityLabel = maintenancePriorityLabel;
  protected readonly priorityTone = maintenancePriorityTone;

  protected readonly isManager = computed(() => isMaintenanceManager(this.auth.user()?.role));

  protected readonly page = signal<MaintenanceTicketPage>(EMPTY_PAGE);
  protected readonly myTickets = signal<readonly MaintenanceTicket[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(20);
  protected readonly technicianNames = signal<ReadonlyMap<string, string>>(new Map());
  /** Captured once per load: templates must not read the clock. */
  protected readonly loadedAt = signal(Date.now());

  protected readonly filters = this.fb.nonNullable.group({
    status: '' as TicketStatus | '',
    priority: '' as TicketPriority | '',
  });
  private readonly filterValue = toSignal(this.filters.valueChanges.pipe(startWith(this.filters.getRawValue())), {
    initialValue: this.filters.getRawValue(),
  });

  /** Rows on screen: the server page for managers, the filtered "my tickets" list for technicians. */
  protected readonly rows = computed<readonly MaintenanceTicket[]>(() => {
    if (this.isManager()) return this.page().items;
    const { status, priority } = this.filterValue();
    return this.myTickets().filter(
      (ticket) =>
        (!status || ticket.status === status || (status === 'Closed' && isClosedStatus(ticket.status))) &&
        (!priority || ticket.priority === priority),
    );
  });

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.page().totalCount / this.pageSize())));
  protected readonly unassignedCount = computed(() => (this.isManager() ? this.rows().filter((ticket) => this.isUnassigned(ticket)).length : 0));
  protected readonly hasFilters = computed(() => Boolean(this.filterValue().status || this.filterValue().priority));

  constructor() {
    this.reload$
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.loadError.set('');
          this.loadedAt.set(Date.now());
        }),
        switchMap((filters) => {
          const request$ = filters
            ? this.api.list(filters).pipe(map((page) => ({ page, mine: [] as readonly MaintenanceTicket[] })))
            : this.api.mine().pipe(map((mine) => ({ page: EMPTY_PAGE, mine })));
          return request$.pipe(
            map((result) => ({ ...result, error: '' })),
            catchError((error: unknown) => of({ page: EMPTY_PAGE, mine: [] as readonly MaintenanceTicket[], error: maintenanceErrorMessage(error, 'Không thể tải danh sách phiếu bảo trì.') })),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ page, mine, error }) => {
        this.page.set(page);
        this.myTickets.set(mine);
        this.loadError.set(error);
        this.loading.set(false);
      });

    if (this.isManager()) {
      this.filters.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.goToPage(0));
      // Names for the technician column (the list endpoint returns only technicianId).
      this.api.technicians().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (technicians) => this.technicianNames.set(new Map(technicians.map((technician) => [technician.id, technician.fullName || technician.email]))),
        error: () => this.technicianNames.set(new Map()),
      });
    }

    this.load();
  }

  protected load(): void {
    if (!this.isManager()) {
      this.reload$.next(null);
      return;
    }
    const { status, priority } = this.filters.getRawValue();
    this.reload$.next({ pageIndex: this.pageIndex(), pageSize: this.pageSize(), status, priority });
  }

  /** `index` is 0-based. */
  protected goToPage(index: number): void {
    this.pageIndex.set(Math.max(0, index));
    this.load();
  }

  protected changePageSize(value: string): void {
    this.pageSize.set(Number(value) || 20);
    this.goToPage(0);
  }

  protected resetFilters(): void {
    this.filters.reset({ status: '', priority: '' });
  }

  protected isUnassigned(ticket: MaintenanceTicket): boolean {
    return ticket.status === 'Open' && !ticket.technicianId;
  }

  protected isOverdue(ticket: MaintenanceTicket): boolean {
    return Boolean(ticket.dueDate) && !isClosedStatus(ticket.status) && new Date(ticket.dueDate as string).getTime() < this.loadedAt();
  }

  protected technicianName(ticket: MaintenanceTicket): string {
    if (!ticket.technicianId) return '';
    return ticket.technician?.fullName || this.technicianNames().get(ticket.technicianId) || 'Đã giao';
  }
}
