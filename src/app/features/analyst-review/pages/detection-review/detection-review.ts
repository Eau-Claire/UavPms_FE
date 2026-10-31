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
import { AnomalyTowerAssignmentPanel } from '../../components/anomaly-tower-assignment/anomaly-tower-assignment';
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
  imports: [DatePipe, RouterLink, FormsModule, NzIconModule, AnomalyTowerAssignmentPanel],
  templateUrl: './detection-review.html',
  styleUrl: './detection-review.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetectionReview {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(AnomalyApi);
  private readonly alertsApi = inject(EmergencyAlertsApi);
  private readonly auth = inject(Auth);
  private readonly destroyRef = inject(DestroyRef);

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
  protected readonly executionLabels = EXECUTION_LOCATION_LABELS;

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
    // The page is reused when navigating between an edge result and its cloud replacement.
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.detectionId.set(params.get('id') ?? '');
      this.detection.set(null);
      this.supersededItems.set([]);
      this.analysisRun.set(null);
      this.towerRequired.set(false);
      this.error.set('');
      this.feedbackMessage.set('');
      this.zoomLevel.set(1);
      this.initData();
    });
  }

  private initData(): void {
    const navState = history.state as ReviewNavigationState | undefined;
    const currentId = this.detectionId();

    if (navState?.anomaly && navState.anomaly.id === currentId) {
      this.setDetection(navState.anomaly, navState.superseded ?? []);
      this.loading.set(false);
      return;
    }

    // No GET /anomalies/{id} exists: look the anomaly up in the pending queue.
    this.loading.set(true);
    this.api
      .listPending({ pageIndex: 1, pageSize: 100 })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (res) => {
          const found = res.items.find((it) => it.id === currentId);
          if (found) {
            this.setDetection(found, groupSuperseded(res.items).supersededByReplacement.get(found.id) ?? []);
          } else {
            this.error.set(`Không tìm thấy sự cố #${currentId} trong hàng đợi. Có thể sự cố đã được thẩm định.`);
          }
        },
        error: (err: unknown) => this.error.set(anomalyErrorMessage(err, 'Không thể tải dữ liệu sự cố.')),
      });
  }

  private setDetection(item: AnomalyItem, superseded: readonly AnomalyItem[]): void {
    this.detection.set(item);
    this.supersededItems.set(superseded);
    this.generalNotes.set(item.analystNotes);
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
    this.feedbackMessage.set(`Đã gán cột ${result.towerCode} cho bất thường. Bạn có thể phê duyệt ngay bây giờ.`);
  }

  // --- APPROVE FLOW ---
  protected approveDetection(): void {
    const item = this.detection();
    if (!item || this.actionBusy() || item.supersededById) return;

    if (!confirm(`Xác nhận phê duyệt sự cố "${item.categoryName}" thành sự cố kỹ thuật chính thức?`)) {
      return;
    }

    const notes = this.generalNotes().trim() || 'Xác nhận khuyết tật chính xác bởi Analyst.';
    this.actionBusy.set(true);
    this.feedbackMessage.set('');

    this.api
      .validate(item.id, { status: 'Confirmed', analystNotes: notes })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.actionBusy.set(false)),
      )
      .subscribe({
        next: () => {
          this.detection.update((current) => (current ? { ...current, validationStatus: 'Confirmed', analystNotes: notes } : null));
          this.towerRequired.set(false);
          this.feedbackType.set('success');
          this.feedbackMessage.set('Đã phê duyệt sự cố thành công! Kết quả đã được xác nhận vào hệ thống.');
        },
        error: (err: unknown) => {
          if (apiErrorCode(err) === 'TOWER_REQUIRED') this.towerRequired.set(true);
          this.feedbackType.set('error');
          this.feedbackMessage.set(anomalyErrorMessage(err, 'Không thể phê duyệt sự cố.'));
        },
      });
  }

  // --- REJECT FLOW ---
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
          this.detection.update((current) =>
            current ? { ...current, validationStatus: 'Rejected', analystNotes: fullNotes } : null,
          );
          this.generalNotes.set(fullNotes);
          this.feedbackType.set('success');
          this.feedbackMessage.set('Đã từ chối phát hiện AI thành công.');
        },
        error: (err: unknown) => {
          this.feedbackType.set('error');
          this.feedbackMessage.set(anomalyErrorMessage(err, 'Không thể từ chối phát hiện.'));
        },
      });
  }

  // --- EMERGENCY ALERT ---
  protected triggerEmergencyAlert(): void {
    const item = this.detection();
    if (!item || this.actionBusy() || item.supersededById) return;

    this.actionBusy.set(true);
    this.feedbackMessage.set('');
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
        },
        error: (err: unknown) => {
          this.feedbackType.set('error');
          this.feedbackMessage.set(alertErrorMessage(err, 'Không thể kích hoạt cảnh báo khẩn cấp.'));
        },
      });
  }

  protected goBack(): void {
    void this.router.navigate(['/ai-review']);
  }

  private calculateBoxStyle(box: AnomalyBoundingBox, naturalW: number, naturalH: number): ComputedBoxStyle | null {
    // Percentages of the image (normalized boxes are converted to 0..100 by the API layer).
    if (box.isNormalized || (box.x <= 100 && box.y <= 100 && box.width <= 100 && box.height <= 100)) {
      return { left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%` };
    }

    // Absolute pixels on the original image: wait for the image size.
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
    if (item.validationStatus === 'Confirmed') return 'Đã xác nhận (Official Defect)';
    if (item.validationStatus === 'Resolved') return 'Đã xử lý xong';
    if (item.validationStatus === 'Rejected') return 'Đã từ chối (Rejected)';
    return 'Chờ thẩm định (Pending)';
  }

  protected confidenceClass(score: number): string {
    if (score >= 90) return 'conf-high';
    if (score >= 75) return 'conf-med';
    return 'conf-low';
  }
}
