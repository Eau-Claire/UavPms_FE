import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { catchError, map, of, Subject, switchMap, tap } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { AnomalyValidationStatus, TowerHistory, TowerHistoryFilters } from '../../../../models/assets.models';
import { DataState } from '../../../../shared/components/data-state/data-state';
import { Pagination } from '../../../../shared/components/pagination/pagination';
import {
  ANOMALY_STATUSES,
  anomalyStatusLabel,
  anomalyStatusTone,
  canOpenMaintenance,
  canReviewAnomalies,
  ticketPriorityLabel,
  ticketPriorityTone,
  ticketStatusLabel,
  ticketStatusTone,
} from '../../data-access/tower-labels';
import { apiErrorMessage, apiErrorStatus, TowersApi } from '../../data-access/towers-api';

export type TowerHistoryTab = 'anomalies' | 'maintenance';

interface HistoryRequest {
  readonly id: string;
  readonly filters: TowerHistoryFilters;
}

/**
 * Tower detail driven by GET /towers/{id}/history. The backend pages anomalies and maintenance tickets with the
 * same page/pageSize, so each tab keeps its own page and the request uses the active tab's page.
 */
@Component({
  selector: 'app-tower-detail',
  imports: [DatePipe, DecimalPipe, ReactiveFormsModule, RouterLink, NzIconModule, DataState, Pagination],
  templateUrl: './tower-detail.html',
  styleUrl: './tower-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TowerDetail {
  private readonly api = inject(TowersApi);
  private readonly auth = inject(Auth);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly request$ = new Subject<HistoryRequest>();

  /** Route parameter (bound through withComponentInputBinding). */
  readonly id = input.required<string>();

  /** Optional query parameter (bound through withComponentInputBinding) indicating originating page (e.g. 'gis'). */
  readonly from = input<string>();

  protected readonly statuses = ANOMALY_STATUSES;
  protected readonly pageSizes = [10, 20, 50] as const;
  protected readonly anomalyStatusLabel = anomalyStatusLabel;
  protected readonly anomalyStatusTone = anomalyStatusTone;
  protected readonly ticketStatusLabel = ticketStatusLabel;
  protected readonly ticketStatusTone = ticketStatusTone;
  protected readonly ticketPriorityLabel = ticketPriorityLabel;
  protected readonly ticketPriorityTone = ticketPriorityTone;
  protected readonly canReview = computed(() => canReviewAnomalies(this.auth.user()?.role));
  protected readonly canOpenTicket = computed(() => canOpenMaintenance(this.auth.user()?.role));

  protected readonly history = signal<TowerHistory | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly notFound = signal(false);
  protected readonly activeTab = signal<TowerHistoryTab>('anomalies');
  protected readonly anomalyPage = signal(1);
  protected readonly maintenancePage = signal(1);
  protected readonly pageSize = signal(20);

  protected readonly filters = this.fb.nonNullable.group({
    validationStatus: '' as AnomalyValidationStatus | '',
    from: '',
    to: '',
  });

  protected readonly dateRangeInvalid = signal(false);
  protected readonly historySearch = signal('');

  protected readonly tower = computed(() => this.history()?.tower ?? null);
  protected readonly stats = computed(() => this.history()?.stats ?? null);
  protected readonly anomalies = computed(() => this.history()?.anomalies ?? []);
  protected readonly maintenance = computed(() => this.history()?.maintenanceHistory ?? []);

  protected readonly filteredAnomalies = computed(() => {
    const list = this.anomalies();
    const q = this.historySearch().trim().toLowerCase();
    if (!q) return list;
    return list.filter((a) =>
      (a.categoryName && a.categoryName.toLowerCase().includes(q)) ||
      (a.categoryCode && a.categoryCode.toLowerCase().includes(q)) ||
      (a.aiSource && a.aiSource.toLowerCase().includes(q))
    );
  });

  protected readonly filteredMaintenance = computed(() => {
    const list = this.maintenance();
    const q = this.historySearch().trim().toLowerCase();
    if (!q) return list;
    return list.filter((m) =>
      (m.ticketCode && m.ticketCode.toLowerCase().includes(q)) ||
      (m.description && m.description.toLowerCase().includes(q)) ||
      (m.status && m.status.toLowerCase().includes(q))
    );
  });

  constructor() {
    this.request$
      .pipe(
        tap(() => { this.loading.set(true); this.error.set(''); this.notFound.set(false); }),
        switchMap(({ id, filters }) =>
          this.api.history(id, filters).pipe(
            map((history) => ({ history, status: 0, error: '' })),
            catchError((error: unknown) => of({ history: null, status: apiErrorStatus(error), error: apiErrorMessage(error, 'Không thể tải lịch sử cột điện.') })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ history, status, error }) => {
        this.loading.set(false);
        if (history) {
          this.history.set(history);
          return;
        }
        this.history.set(null);
        this.notFound.set(status === 404);
        this.error.set(status === 403 ? 'Bạn không có quyền xem cột điện này (ngoài phạm vi khu vực được phân công).' : error);
      });

    // Reload whenever the route id changes.
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.anomalyPage.set(1);
        this.maintenancePage.set(1);
        this.load(id);
      });
    });
  }

  protected load(id = this.id()): void {
    const value = this.filters.getRawValue();
    const invalidRange = Boolean(value.from && value.to && value.from > value.to);
    this.dateRangeInvalid.set(invalidRange);
    if (invalidRange) return;
    const page = this.activeTab() === 'anomalies' ? this.anomalyPage() : this.maintenancePage();
    this.request$.next({
      id,
      filters: {
        page,
        pageSize: this.pageSize(),
        validationStatus: value.validationStatus || undefined,
        from: value.from || undefined,
        to: value.to || undefined,
      },
    });
  }

  protected applyFilters(): void {
    this.anomalyPage.set(1);
    this.maintenancePage.set(1);
    this.load();
  }

  protected resetFilters(): void {
    this.historySearch.set('');
    this.filters.reset({ validationStatus: '', from: '', to: '' });
    this.applyFilters();
  }

  protected changePageSize(value: string): void {
    this.pageSize.set(Number(value) || 20);
    this.applyFilters();
  }

  protected selectTab(tab: TowerHistoryTab): void {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    const loadedPage = tab === 'anomalies' ? this.history()?.anomaliesPagination.page : this.history()?.maintenancePagination.page;
    const wantedPage = tab === 'anomalies' ? this.anomalyPage() : this.maintenancePage();
    if (loadedPage !== wantedPage) this.load();
  }

  /** Arrow keys move between the two tabs (WAI-ARIA tabs pattern). */
  protected onTabKeydown(event: KeyboardEvent, anomaliesTab: HTMLElement, maintenanceTab: HTMLElement): void {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next: TowerHistoryTab = this.activeTab() === 'anomalies' ? 'maintenance' : 'anomalies';
    this.selectTab(next);
    (next === 'anomalies' ? anomaliesTab : maintenanceTab).focus();
  }

  protected goToAnomalyPage(page: number): void {
    this.anomalyPage.set(page);
    this.load();
  }

  protected goToMaintenancePage(page: number): void {
    this.maintenancePage.set(page);
    this.load();
  }
}
