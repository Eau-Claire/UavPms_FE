import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { catchError, map, of, Subject, switchMap, tap } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { AnomalyValidationStatus, TowerAnomaly, TowerHistory, TowerHistoryFilters, TowerHistoryStats } from '../../../../models/assets.models';
import { AnomalyHistoryService } from '../../../analyst-review/data-access/anomaly-history.service';
import { EmergencyAlertsApi } from '../../../emergency-alerts/data-access/emergency-alerts-api';
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
  private readonly anomalyHistory = inject(AnomalyHistoryService);
  private readonly alertsApi = inject(EmergencyAlertsApi);
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

  protected formatAiSource(source?: string): string {
    if (!source) return '—';
    const s = source.toLowerCase();
    if (s.includes('yolo') || s.includes('curated') || s.includes('ai') || s.includes('model') || s.includes('detect')) {
      return 'Mô hình AI';
    }
    return source;
  }

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
  protected readonly maintenance = computed(() => this.history()?.maintenanceHistory ?? []);

  protected readonly anomalies = computed<readonly TowerAnomaly[]>(() => {
    const serverAnomalies = this.history()?.anomalies ?? [];
    const tower = this.tower();
    const towerId = this.id();
    const towerCode = tower?.towerCode;

    const norm = (s?: string | null) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const targetNormCode = norm(towerCode);
    const targetNormId = norm(towerId);

    // Thu thập anomalies đã thẩm định từ AnomalyHistoryService
    const reviewedItems = this.anomalyHistory.getReviewedItems();
    const matchingReviewed = reviewedItems.filter((item) => {
      if (item.towerId && (item.towerId === towerId || norm(item.towerId) === targetNormId)) return true;
      if (item.towerCode && targetNormCode && norm(item.towerCode) === targetNormCode) return true;
      return false;
    });

    // Thu thập active emergency alerts từ EmergencyAlertsApi
    const activeAlerts = this.alertsApi.activeAlerts();
    const matchingAlerts = activeAlerts.filter((alert) => {
      if (alert.towerId && (alert.towerId === towerId || norm(alert.towerId) === targetNormId)) return true;
      if (alert.towerCode && targetNormCode && norm(alert.towerCode) === targetNormCode) return true;
      return false;
    });

    const map = new Map<string, TowerAnomaly>();

    // 1. Anomalies từ backend API
    for (const anom of serverAnomalies) {
      map.set(anom.id, anom);
    }

    // 2. Bổ sung từ AnomalyHistoryService nếu chưa có
    for (const it of matchingReviewed) {
      if (!map.has(it.id)) {
        map.set(it.id, {
          id: it.id,
          mediaId: '',
          missionId: it.missionCode ?? '',
          categoryCode: it.categoryCode ?? undefined,
          categoryName: it.categoryName,
          confidenceScore: it.confidenceScore,
          validationStatus: it.validationStatus,
          aiSource: it.aiSource,
          imageUrl: it.mediaUrl,
          detectedAt: it.createdAt,
          validatedAt: it.validationStatus !== 'Pending' && it.validationStatus !== 'InReview' ? it.createdAt : undefined,
        });
      }
    }

    // 3. Bổ sung từ EmergencyAlertsApi nếu chưa có
    for (const alert of matchingAlerts) {
      const alertId = alert.anomalyId || alert.id;
      if (!map.has(alertId)) {
        map.set(alertId, {
          id: alertId,
          mediaId: '',
          missionId: '',
          categoryCode: alert.alertType,
          categoryName: alert.categoryName || alert.alertType || 'Sự cố khẩn cấp',
          confidenceScore: alert.evidence?.confidenceScore ?? 85,
          validationStatus: 'InReview',
          aiSource: 'Cloud (Server)',
          imageUrl: alert.evidence?.mediaUrl || '/images/defect-preview-frame.png',
          detectedAt: alert.triggeredAt || new Date().toISOString(),
        });
      }
    }

    // Áp dụng bộ lọc trạng thái và khoảng thời gian
    const statusVal = this.filters.controls.validationStatus.value;
    const dateFrom = this.filters.controls.from.value;
    const dateTo = this.filters.controls.to.value;

    let result = Array.from(map.values());
    if (statusVal) {
      result = result.filter((a) => a.validationStatus.toLowerCase() === statusVal.toLowerCase());
    }
    if (dateFrom) {
      result = result.filter((a) => a.detectedAt >= dateFrom);
    }
    if (dateTo) {
      const toEnd = dateTo + 'T23:59:59.999Z';
      result = result.filter((a) => a.detectedAt <= toEnd);
    }

    return result.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
  });

  protected readonly stats = computed<TowerHistoryStats | null>(() => {
    const base = this.history()?.stats;
    const anomalyList = this.anomalies();
    if (!base && !anomalyList.length) return null;

    const openCount = anomalyList.filter(
      (a) => a.validationStatus === 'Pending' || a.validationStatus === 'InReview' || a.validationStatus === 'Confirmed',
    ).length;
    const pendingCount = anomalyList.filter(
      (a) => a.validationStatus === 'Pending' || a.validationStatus === 'InReview',
    ).length;
    const confirmedCount = anomalyList.filter((a) => a.validationStatus === 'Confirmed').length;

    return {
      totalAnomalies: Math.max(base?.totalAnomalies ?? 0, anomalyList.length),
      openAnomalies: Math.max(base?.openAnomalies ?? 0, openCount),
      pendingAnomalies: Math.max(base?.pendingAnomalies ?? 0, pendingCount),
      confirmedAnomalies: Math.max(base?.confirmedAnomalies ?? 0, confirmedCount),
      totalTickets: base?.totalTickets ?? 0,
      openTickets: base?.openTickets ?? 0,
      inProgressTickets: base?.inProgressTickets ?? 0,
      activeTickets: base?.activeTickets ?? 0,
      lastInspectedAt: base?.lastInspectedAt ?? (anomalyList[0]?.detectedAt || undefined),
    };
  });

  protected readonly anomalyTotalCount = computed(() => this.anomalies().length);

  protected readonly anomalyTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.anomalyTotalCount() / this.pageSize())),
  );

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

  protected readonly pagedAnomalies = computed(() => {
    const list = this.filteredAnomalies();
    const page = this.anomalyPage();
    const size = this.pageSize();
    return list.slice((page - 1) * size, page * size);
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

    this.filters.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyFilters());

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
