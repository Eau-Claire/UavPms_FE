import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { finalize } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { alertErrorMessage, EmergencyAlertsApi } from '../../../emergency-alerts/data-access/emergency-alerts-api';
import { isMaintenanceManager } from '../../../maintenance/data-access/maintenance-labels';
import { ToastService } from '../../../../core/toast/toast.service';
import { AnomalyHistoryService } from '../../data-access/anomaly-history.service';
import {
  AnalysisRunInfo,
  AnomalyApi,
  AnomalyBoundingBox,
  anomalyErrorMessage,
  AnomalyItem,
  AnomalyTowerAssignment,
  apiErrorCode,
  EXECUTION_LOCATION_LABELS,
  groupSuperseded,
  REJECT_REASONS,
} from '../../data-access/anomaly-api';

interface ComputedBoxStyle {
  readonly left: string;
  readonly top: string;
  readonly width: string;
  readonly height: string;
}

interface ReviewNavigationState {
  readonly anomaly?: AnomalyItem;
  readonly superseded?: readonly AnomalyItem[];
}

const REVIEW_ROLES = new Set(['analyst', 'manager', 'admin', 'systemadmin', 'administrator']);

@Component({
  selector: 'app-detection-review',
  imports: [DatePipe, RouterLink, FormsModule, NzIconModule],
  templateUrl: './detection-review.html',
  styleUrl: './detection-review.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetectionReview {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(AnomalyApi);
  private readonly history = inject(AnomalyHistoryService);
  private readonly alertsApi = inject(EmergencyAlertsApi);
  private readonly auth = inject(Auth);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toast = inject(ToastService);

  protected readonly detectionId = signal('');
  protected readonly detection = signal<AnomalyItem | null>(null);
  /** Edge results that this (cloud) anomaly replaced. */
  protected readonly supersededItems = signal<readonly AnomalyItem[]>([]);
  protected readonly analysisRun = signal<AnalysisRunInfo | null>(null);
  protected readonly loading = signal(true);
  protected readonly actionBusy = signal(false);
  protected readonly error = signal('');
  protected readonly feedbackMessage = signal('');
  protected readonly feedbackType = signal<'success' | 'error' | 'info'>('info');
  /** Set when confirming failed with `TOWER_REQUIRED`. */
  protected readonly towerRequired = signal(false);
  /** After a confirmation the backend opens a maintenance ticket (MF04): managers get a link to it. */
  protected readonly maintenanceLinkVisible = signal(false);
  protected readonly canOpenMaintenance = computed(() => isMaintenanceManager(this.auth.user()?.role));
  protected readonly executionLabels = EXECUTION_LOCATION_LABELS;

  // Queue controls
  protected readonly queueIds = signal<string[]>([]);
  protected readonly queueIndex = computed(() => {
    const list = this.queueIds();
    const current = this.detectionId();
    return list.indexOf(current);
  });
  protected readonly nextPendingId = computed(() => {
    const list = this.queueIds().filter((id) => id && id !== '00000000-0000-0000-0000-000000000000');
    const current = this.detectionId();
    const idx = list.indexOf(current);
    if (idx !== -1 && idx + 1 < list.length) {
      return list[idx + 1];
    }
    return list.find((id) => id !== current) ?? null;
  });

  // Viewer controls
  protected readonly zoomLevel = signal(1);
  protected readonly showBoundingBox = signal(true);
  protected readonly imgNaturalWidth = signal(0);
  protected readonly imgNaturalHeight = signal(0);

  // Review form state
  protected readonly generalNotes = signal('');
  protected readonly showRejectModal = signal(false);
  protected readonly selectedRejectReason = signal<string>(REJECT_REASONS[0].value);
  protected readonly rejectDetailNotes = signal('');
  protected readonly rejectReasons = REJECT_REASONS;

  protected readonly canReview = computed(() => REVIEW_ROLES.has(this.auth.user()?.role?.toLowerCase() ?? ''));

  protected readonly executionLocation = computed(
    () => this.analysisRun()?.executionLocation ?? this.detection()?.executionLocation ?? null,
  );

  protected readonly boundingBoxStyle = computed<ComputedBoxStyle | null>(() => {
    const box = this.detection()?.boundingBox;
    if (!box) return null;
    return this.calculateBoxStyle(box, this.imgNaturalWidth(), this.imgNaturalHeight());
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = (params.get('id') ?? '').trim();
      if (!id || id === '00000000-0000-0000-0000-000000000000') {
        void this.router.navigate(['/ai-review'], { replaceUrl: true });
        return;
      }
      this.detectionId.set(id);
      this.detection.set(null);
      this.supersededItems.set([]);
      this.analysisRun.set(null);
      this.towerRequired.set(false);
      this.error.set('');
      this.feedbackMessage.set('');
      this.maintenanceLinkVisible.set(false);
      this.zoomLevel.set(1);
      this.initData();
    });
  }

  private initData(): void {
    const navState = history.state as ReviewNavigationState | undefined;
    const currentId = this.detectionId();
    if (!currentId || currentId === '00000000-0000-0000-0000-000000000000') {
      void this.router.navigate(['/ai-review'], { replaceUrl: true });
      return;
    }

    // Tải hàng đợi pending để lấy danh sách sự cố tiếp theo
    this.api
      .listPending({ pageIndex: 1, pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.queueIds.set(
            res.items.map((it) => it.id).filter((id) => id && id !== '00000000-0000-0000-0000-000000000000'),
          );
        },
      });

    if (navState?.anomaly && navState.anomaly.id === currentId) {
      this.setDetection(navState.anomaly, navState.superseded ?? []);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.api
      .getAnomalyById(currentId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (item) => {
          if (item) {
            this.setDetection(item, []);
          } else {
            this.error.set(`Không tìm thấy sự cố #${currentId} trong hệ thống.`);
          }
        },
        error: (err: unknown) => {
          this.error.set(anomalyErrorMessage(err, 'Không thể tải dữ liệu sự cố.'));
        },
      });
  }

  private setDetection(item: AnomalyItem, superseded: readonly AnomalyItem[]): void {
    this.detection.set(item);
    this.supersededItems.set(superseded);
    const rawNotes = item.analystNotes || '';
    const isAiSlop = /^ai\s/i.test(rawNotes) || /severity=/i.test(rawNotes) || /evaluation:/i.test(rawNotes);
    this.generalNotes.set(isAiSlop ? '' : rawNotes);
    if (item.analysisRunId) {
      this.api
        .getAnalysisRun(item.analysisRunId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((run) => this.analysisRun.set(run));
    }
  }

  protected onImageLoaded(event: Event): void {
    const img = event.target as HTMLImageElement;
    this.imgNaturalWidth.set(img.naturalWidth || 800);
    this.imgNaturalHeight.set(img.naturalHeight || 600);
  }

  protected onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = '/images/defect-preview-frame.png';
  }

  protected zoomIn(): void {
    this.zoomLevel.update((z) => Math.min(2.5, +(z + 0.25).toFixed(2)));
  }

  protected zoomOut(): void {
    this.zoomLevel.update((z) => Math.max(0.75, +(z - 0.25).toFixed(2)));
  }

  protected resetZoom(): void {
    this.zoomLevel.set(1);
  }

  protected toggleBoundingBox(): void {
    this.showBoundingBox.update((v) => !v);
  }

  protected onTowerAssigned(result: AnomalyTowerAssignment): void {
    this.detection.update((current) =>
      current ? { ...current, towerId: result.towerId, towerCode: result.towerCode || current.towerCode } : null,
    );
    this.towerRequired.set(false);
    this.feedbackType.set('success');
    this.feedbackMessage.set(`Đã gán cột ${result.towerCode} cho bất thường. Bạn có thể chấp nhận ngay bây giờ.`);
  }

  // --- APPROVE FLOW (CHẤP NHẬN) ---
  protected approveDetection(): void {
    const item = this.detection();
    if (!item || this.actionBusy() || item.supersededById) return;

    const notes = this.generalNotes().trim() || 'Xác nhận kết quả phát hiện khuyết tật chính xác.';
    this.actionBusy.set(true);
    this.feedbackMessage.set('');
    this.maintenanceLinkVisible.set(false);

    this.api
      .validate(item.id, { status: 'Confirmed', analystNotes: notes })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.actionBusy.set(false)),
      )
      .subscribe({
        next: () => {
          this.history.saveReview(item, 'Confirmed', notes);
          this.detection.update((current) =>
            current ? { ...current, validationStatus: 'Confirmed', analystNotes: notes } : null,
          );
          this.towerRequired.set(false);

          const next = this.nextPendingId();
          if (next && next !== item.id && next !== '00000000-0000-0000-0000-000000000000') {
            this.toast.success(`Đã chấp nhận phát hiện #${item.id}. Đang chuyển sang sự cố tiếp theo...`);
            void this.router.navigate(['/ai-review', next]);
          } else {
            this.toast.success(`Đã chấp nhận phát hiện #${item.id}. Hoàn tất toàn bộ hàng đợi thẩm định!`);
            void this.router.navigate(['/ai-review']);
          }
        },
        error: (err: unknown) => {
          if (apiErrorCode(err) === 'TOWER_REQUIRED') this.towerRequired.set(true);
          const msg = anomalyErrorMessage(err, 'Không thể phê duyệt sự cố.');
          this.feedbackType.set('error');
          this.feedbackMessage.set(msg);
          this.toast.error(msg);
        },
      });
  }

  // --- REJECT FLOW (TỪ CHỐI) ---
  protected openRejectModal(): void {
    this.selectedRejectReason.set(REJECT_REASONS[0].value);
    this.rejectDetailNotes.set('');
    this.showRejectModal.set(true);
  }

  protected closeRejectModal(): void {
    if (this.actionBusy()) return;
    this.showRejectModal.set(false);
  }

  protected confirmReject(): void {
    const item = this.detection();
    if (!item || this.actionBusy()) return;

    const reason = this.selectedRejectReason();
    const detail = this.rejectDetailNotes().trim();
    const fullNotes = detail ? `[${reason}] ${detail}` : `[${reason}] Bác bỏ nhận diện AI.`;

    this.actionBusy.set(true);
    this.feedbackMessage.set('');
    this.maintenanceLinkVisible.set(false);

    this.api
      .validate(item.id, { status: 'Rejected', analystNotes: fullNotes })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.actionBusy.set(false);
          this.showRejectModal.set(false);
        }),
      )
      .subscribe({
        next: () => {
          this.history.saveReview(item, 'Rejected', fullNotes);
          this.detection.update((current) =>
            current ? { ...current, validationStatus: 'Rejected', analystNotes: fullNotes } : null,
          );

          const next = this.nextPendingId();
          if (next && next !== item.id && next !== '00000000-0000-0000-0000-000000000000') {
            this.toast.warning(`Đã từ chối phát hiện #${item.id}. Đang chuyển sang sự cố tiếp theo...`);
            void this.router.navigate(['/ai-review', next]);
          } else {
            this.toast.warning(`Đã từ chối phát hiện #${item.id}. Hoàn tất toàn bộ hàng đợi thẩm định!`);
            void this.router.navigate(['/ai-review']);
          }
        },
        error: (err: unknown) => {
          const msg = anomalyErrorMessage(err, 'Không thể từ chối phát hiện.');
          this.feedbackType.set('error');
          this.feedbackMessage.set(msg);
          this.toast.error(msg);
        },
      });
  }

  // --- EMERGENCY ALERT ---
  protected triggerEmergencyAlert(): void {
    const item = this.detection();
    if (!item || this.actionBusy() || item.supersededById) return;

    this.actionBusy.set(true);
    this.feedbackMessage.set('');
    this.maintenanceLinkVisible.set(false);
    this.alertsApi
      .triggerAlert({ anomalyId: item.id, towerId: item.towerId ?? undefined, priority: 'Critical' })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.actionBusy.set(false)),
      )
      .subscribe({
        next: () => {
          this.feedbackType.set('success');
          this.feedbackMessage.set('Đã kích hoạt cảnh báo khẩn cấp. Cảnh báo đã xuất hiện ở trang Cảnh báo khẩn cấp.');
          this.toast.success('Đã kích hoạt cảnh báo khẩn cấp thành công.');
        },
        error: (err: unknown) => {
          const msg = alertErrorMessage(err, 'Không thể kích hoạt cảnh báo khẩn cấp.');
          this.feedbackType.set('error');
          this.feedbackMessage.set(msg);
          this.toast.error(msg);
        },
      });
  }

  protected goBack(): void {
    void this.router.navigate(['/ai-review']);
  }

  private calculateBoxStyle(box: AnomalyBoundingBox, naturalW: number, naturalH: number): ComputedBoxStyle | null {
    if (box.isNormalized || (box.x <= 100 && box.y <= 100 && box.width <= 100 && box.height <= 100)) {
      return { left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%` };
    }

    if (naturalW > 0 && naturalH > 0) {
      return {
        left: `${Math.max(0, Math.min(95, (box.x / naturalW) * 100))}%`,
        top: `${Math.max(0, Math.min(95, (box.y / naturalH) * 100))}%`,
        width: `${Math.min(100, (box.width / naturalW) * 100)}%`,
        height: `${Math.min(100, (box.height / naturalH) * 100)}%`,
      };
    }
    return null;
  }

  protected statusClass(item: AnomalyItem): string {
    if (item.supersededById) return 'status-rejected';
    if (item.validationStatus === 'Confirmed' || item.validationStatus === 'Resolved') return 'status-confirmed';
    if (item.validationStatus === 'Rejected') return 'status-rejected';
    return 'status-pending';
  }

  protected statusText(item: AnomalyItem): string {
    if (item.supersededById) return 'Đã bị kết quả Cloud thay thế';
    if (item.validationStatus === 'Confirmed') return 'Đã xác nhận';
    if (item.validationStatus === 'Resolved') return 'Đã xử lý xong';
    if (item.validationStatus === 'Rejected') return 'Đã từ chối';
    return 'Chờ thẩm định';
  }

  protected confidenceClass(score: number): string {
    if (score >= 90) return 'conf-high';
    if (score >= 75) return 'conf-med';
    return 'conf-low';
  }
}
