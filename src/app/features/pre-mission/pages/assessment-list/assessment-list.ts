import { NotificationsRealtime } from '../../../notifications/data-access/notifications-realtime';
import { Subscription } from 'rxjs';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { PreMissionAssessment } from '../../../../models/pre-mission.models';
import { statusLabel, statusTone } from '../../../../shared/status/status';
import { GisApi } from '../../../gis/data-access/gis-api';
import { PreMissionApi } from '../../data-access/pre-mission-api';

@Component({
  selector: 'app-assessment-list',
  imports: [RouterLink, DatePipe, NzIconModule],
  templateUrl: './assessment-list.html',
  styleUrl: './assessment-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssessmentList implements OnDestroy {
  private readonly api = inject(PreMissionApi);
  private readonly gisApi = inject(GisApi);
  private readonly realtime = inject(NotificationsRealtime);
  private realtimeSub: Subscription | null = null;

  protected readonly loading = signal(true);
  protected readonly actionBusyId = signal<string | null>(null);
  protected readonly error = signal('');
  protected readonly successMessage = signal('');
  protected readonly items = signal<readonly PreMissionAssessment[]>([]);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);
  protected readonly totalCount = signal(0);
  protected readonly totalPages = signal(1);

  // Filters
  protected readonly statusFilter = signal('');
  protected readonly regionFilter = signal('');
  protected readonly lineFilter = signal('');
  protected readonly dateFilter = signal('');
  protected readonly searchQuery = signal('');

  protected readonly regions = signal<readonly { id: string; name: string }[]>([]);
  protected readonly availableLines = signal<readonly { id: string; lineName: string }[]>([]);

  protected readonly statuses = [
    { value: '', label: 'Tất cả trạng thái' },
    { value: 'READY', label: 'Sẵn sàng (READY)' },
    { value: 'NOT_READY', label: 'Chưa sẵn sàng (NOT_READY)' },
    { value: 'EVALUATING', label: 'Đang đánh giá (EVALUATING)' },
    { value: 'DRAFT', label: 'Bản nháp (DRAFT)' },
    { value: 'EXPIRED', label: 'Hết hạn (EXPIRED)' },
    { value: 'COMPLETED', label: 'Đã hoàn thành (COMPLETED)' },
    { value: 'CANCELLED', label: 'Đã hủy (CANCELLED)' },
  ];

  protected readonly filteredItems = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const region = this.regionFilter();
    const line = this.lineFilter();
    const date = this.dateFilter();
    let list = this.items();

    if (region) {
      list = list.filter(
        (item) => item.regionId === region || item.regionName.toLowerCase() === region.toLowerCase()
      );
    }

    if (line) {
      list = list.filter(
        (item) => item.lineName?.toLowerCase() === line.toLowerCase() || item.lineId === line
      );
    }

    if (date) {
      list = list.filter((item) => item.plannedStart.startsWith(date));
    }

    if (q) {
      list = list.filter(
        (item) =>
          item.assessmentCode.toLowerCase().includes(q) ||
          item.regionName.toLowerCase().includes(q) ||
          (item.lineName && item.lineName.toLowerCase().includes(q)) ||
          (item.createdBy && item.createdBy.toLowerCase().includes(q))
      );
    }

    return list;
  });

  protected readonly stats = computed(() => {
    const list = this.items();
    return [
      { label: 'Tổng số đánh giá', value: this.totalCount() || list.length },
      { label: 'Sẵn sàng (READY)', value: list.filter((x) => x.status === 'READY').length },
      { label: 'Chưa sẵn sàng (NOT_READY)', value: list.filter((x) => x.status === 'NOT_READY').length },
      {
        label: 'Hết hạn / Hoàn thành / Hủy',
        value: list.filter((x) => x.status === 'EXPIRED' || x.status === 'COMPLETED' || (x.status as string) === 'CONSUMED' || x.status === 'CANCELLED').length,
      },
    ];
  });

  protected readonly startIndex = computed(() => {
    if (!this.totalCount()) return 0;
    return (this.page() - 1) * this.pageSize() + 1;
  });

  protected readonly endIndex = computed(() => {
    return Math.min(this.page() * this.pageSize(), this.totalCount() || this.items().length);
  });

  protected readonly pageButtons = computed(() => {
    const total = this.totalPages();
    const current = this.page();
    const buttons: number[] = [];
    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - 2 && i <= current + 2)) {
        buttons.push(i);
      }
    }
    return buttons;
  });

  constructor() {
    this.loadRegions();
    this.loadLines('');
    this.realtime.connect();
    this.realtime.joinAssessmentsList();
    this.initRealtimeSubscription();
    this.load();
  }

  ngOnDestroy(): void {
    this.realtime.leaveAssessmentsList();
    this.realtimeSub?.unsubscribe();
  }

  private initRealtimeSubscription(): void {
    this.realtimeSub = this.realtime.assessmentEvents$.subscribe((evt) => {
      switch (evt.type) {
        case 'AssessmentStatusChanged': {
          if (evt.assessmentId) {
            this.items.update((list) =>
              list.map((item) => {
                if (item.id === evt.assessmentId) {
                  return {
                    ...item,
                    status: (evt.status as any) || item.status,
                    technical: evt.technicalHealth ? { ...item.technical, status: evt.technicalHealth } : item.technical,
                  };
                }
                return item;
              })
            );
          }
          break;
        }

        case 'DroneInspectionCompleted': {
          const isPass = (evt.status || '').toUpperCase() === 'PASS';
          this.items.update((list) =>
            list.map((item) => {
              const matchesDrone = evt.droneId && item.uavCandidates?.some((u) => u.id === evt.droneId);
              const matchesAssessment = evt.assessmentId && item.id === evt.assessmentId;
              if (matchesDrone || matchesAssessment) {
                return {
                  ...item,
                  technical: {
                    ...item.technical,
                    status: isPass ? 'PASS' : 'FAIL',
                    reason: isPass ? 'Kiểm định kỹ thuật UAV đạt tiêu chuẩn.' : 'Kiểm định kỹ thuật UAV không đạt tiêu chuẩn.',
                  },
                };
              }
              return item;
            })
          );
          break;
        }

        case 'AssessmentCompleted': {
          if (evt.assessmentId) {
            this.items.update((list) =>
              list.map((item) => {
                if (item.id === evt.assessmentId) {
                  return {
                    ...item,
                    status: 'COMPLETED',
                    consumedMissionId: evt.consumedMissionId || item.consumedMissionId,
                    consumedMissionCode: evt.consumedMissionCode || item.consumedMissionCode,
                  };
                }
                return item;
              })
            );
          }
          break;
        }

        case 'MeteoAlertTriggered': {
          if (evt.assessmentId) {
            this.items.update((list) =>
              list.map((item) => {
                if (item.id === evt.assessmentId) {
                  return {
                    ...item,
                    status: 'NOT_READY',
                    site: {
                      ...item.site,
                      status: 'FAIL',
                      reason: evt.message || 'Cảnh báo khí tượng: Sức gió vượt ngưỡng an toàn.',
                    },
                  };
                }
                return item;
              })
            );
          }
          break;
        }
      }
    });
  }

  private loadRegions(): void {
    this.gisApi.getRegions().subscribe({
      next: (data) => this.regions.set(data),
      error: (err) => console.warn('Failed to load regions', err),
    });
  }

  private loadLines(regionId: string): void {
    const filter = regionId ? { administrativeAreaId: regionId } : undefined;
    this.gisApi.getAllGisData(filter).subscribe({
      next: (data) => this.availableLines.set(data.lines),
      error: (err: unknown) => console.warn('Failed to load lines', err),
    });
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api
      .list({
        page: this.page(),
        pageSize: this.pageSize(),
        status: this.statusFilter(),
        regionId: this.regionFilter(),
        lineName: this.lineFilter(),
        plannedDate: this.dateFilter(),
        search: this.searchQuery(),
      })
      .subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.page.set(res.page);
          this.pageSize.set(res.pageSize);
          this.totalCount.set(res.totalCount);
          this.totalPages.set(res.totalPages);
        },
        error: () => {
          this.error.set('Không tải được danh sách đánh giá tiền nhiệm vụ. Vui lòng thử lại.');
        },
        complete: () => {
          this.loading.set(false);
        },
      });
  }

  protected onStatusChange(status: string): void {
    this.statusFilter.set(status);
    this.page.set(1);
    this.load();
  }

  protected onRegionChange(regionId: string): void {
    this.regionFilter.set(regionId);
    this.lineFilter.set('');
    this.loadLines(regionId);
    this.page.set(1);
    this.load();
  }

  protected onLineChange(lineName: string): void {
    this.lineFilter.set(lineName);
    this.page.set(1);
    this.load();
  }

  protected onDateChange(date: string): void {
    this.dateFilter.set(date);
    this.page.set(1);
    this.load();
  }

  protected onSearch(value: string): void {
    this.searchQuery.set(value);
  }

  protected resetFilters(): void {
    this.statusFilter.set('');
    this.regionFilter.set('');
    this.lineFilter.set('');
    this.dateFilter.set('');
    this.searchQuery.set('');
    this.page.set(1);
    this.load();
  }

  protected reevaluateItem(item: PreMissionAssessment, event: Event): void {
    event.stopPropagation();
    if (this.actionBusyId()) return;
    if (item.status === 'COMPLETED' || (item.status as string) === 'CONSUMED') {
      this.error.set('Đánh giá tiền nhiệm vụ đã hoàn thành tạo nhiệm vụ bay, không thể đánh giá lại.');
      return;
    }
    if (item.status === 'EXPIRED') {
      this.error.set('Bản đánh giá đã hết hạn hiệu lực / khung giờ bay đã qua, không thể đánh giá lại.');
      return;
    }
    if (item.status === 'CANCELLED') {
      this.error.set('Bản đánh giá đã bị hủy, không thể đánh giá lại.');
      return;
    }
    this.actionBusyId.set(item.id);
    this.error.set('');
    this.successMessage.set('');

    this.api.reEvaluate(item.id).subscribe({
      next: (updated) => {
        this.items.update((list) => list.map((x) => (x.id === updated.id ? updated : x)));
        this.successMessage.set(`Đã đánh giá lại thành công cho mã ${item.assessmentCode}.`);
        this.realtime.broadcastAssessmentEvent({
          assessmentId: updated.id,
          type: 'AssessmentStatusChanged',
          status: updated.status,
          technicalHealth: updated.technical?.status,
          message: `Đã đánh giá lại thành công cho mã ${item.assessmentCode}: ${updated.status}`,
          timestamp: new Date().toISOString(),
        });
        this.actionBusyId.set(null);
      },
      error: (err) => {
        this.actionBusyId.set(null);
        const msg = err?.error?.message;
        if (msg === 'ASSESSMENT_ALREADY_COMPLETED' || msg === 'ASSESSMENT_ALREADY_CONSUMED') {
          this.error.set('Đánh giá tiền nhiệm vụ đã hoàn thành tạo nhiệm vụ bay, không thể đánh giá lại.');
        } else {
          this.error.set(msg || `Không thể đánh giá lại mã ${item.assessmentCode}.`);
        }
      },
      complete: () => {
        this.actionBusyId.set(null);
      },
    });
  }

  protected readonly itemToCancel = signal<PreMissionAssessment | null>(null);
  protected readonly cancelReason = signal<string>('');

  protected cancelItem(item: PreMissionAssessment, event: Event): void {
    event.stopPropagation();
    if (this.actionBusyId()) return;
    if (item.status === 'COMPLETED' || (item.status as string) === 'CONSUMED') {
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
        this.items.update((list) => list.map((x) => (x.id === cancelled.id ? cancelled : x)));
        this.itemToCancel.set(null);
        this.successMessage.set(`Đã hủy bản đánh giá ${item.assessmentCode}.`);
      },
      error: (err) => {
        this.error.set(err?.error?.message || `Không thể hủy mã ${item.assessmentCode}.`);
        this.actionBusyId.set(null);
      },
      complete: () => {
        this.actionBusyId.set(null);
      },
    });
  }

  protected goToPage(targetPage: number): void {
    if (targetPage < 1 || targetPage > this.totalPages() || targetPage === this.page()) return;
    this.page.set(targetPage);
    this.load();
  }

  protected statusTone = statusTone;
  protected statusLabel = statusLabel;
}
