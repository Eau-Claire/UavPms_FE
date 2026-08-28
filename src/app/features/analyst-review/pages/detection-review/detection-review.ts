import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
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
import {
  AnomalyApi,
  AnomalyBoundingBox,
  AnomalyItem,
  REJECT_REASONS,
} from '../../data-access/anomaly-api';

interface ComputedBoxStyle {
  readonly left: string;
  readonly top: string;
  readonly width: string;
  readonly height: string;
}

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
  private readonly auth = inject(Auth);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly detectionId = signal<string>(this.route.snapshot.paramMap.get('id') ?? '');
  protected readonly detection = signal<AnomalyItem | null>(null);
  protected readonly loading = signal(true);
  protected readonly actionBusy = signal(false);
  protected readonly error = signal('');
  protected readonly feedbackMessage = signal('');
  protected readonly feedbackType = signal<'success' | 'error' | 'info'>('info');

  // Viewer controls
  protected readonly zoomLevel = signal(1);
  protected readonly showBoundingBox = signal(true);
  protected readonly imgNaturalWidth = signal(0);
  protected readonly imgNaturalHeight = signal(0);

  // Review Form state
  protected readonly generalNotes = signal('');
  protected readonly showRejectModal = signal(false);
  protected readonly selectedRejectReason = signal<string>(REJECT_REASONS[0].value);
  protected readonly rejectDetailNotes = signal('');
  protected readonly rejectReasons = REJECT_REASONS;

  // Role permissions
  protected readonly userRole = computed(() => this.auth.user()?.role?.toLowerCase() ?? '');
  protected readonly canReview = computed(() => {
    const role = this.userRole();
    return role === 'analyst' || role === 'admin' || role === 'systemadmin' || role === 'administrator';
  });

  protected readonly boundingBoxStyle = computed<ComputedBoxStyle | null>(() => {
    const item = this.detection();
    const box = item?.boundingBox;
    if (!box) return null;

    return this.calculateBoxStyle(box, this.imgNaturalWidth(), this.imgNaturalHeight());
  });

  constructor() {
    this.initData();
  }

  private initData(): void {
    const navState = history.state as { anomaly?: AnomalyItem } | undefined;
    const currentId = this.detectionId();

    if (navState?.anomaly && navState.anomaly.id === currentId) {
      this.detection.set(navState.anomaly);
      this.generalNotes.set(navState.anomaly.analystNotes || '');
      this.loading.set(false);
      return;
    }

    // Fallback: Fetch from pending list API
    this.loading.set(true);
    this.api
      .listPending({ pageIndex: 1, pageSize: 50 })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (res) => {
          const found = res.items.find((it) => it.id === currentId);
          if (found) {
            this.detection.set(found);
            this.generalNotes.set(found.analystNotes || '');
          } else {
            this.error.set(`Không tìm thấy sự cố với mã #${currentId}. Có thể sự cố đã được thẩm định.`);
          }
        },
        error: (err: unknown) => {
          this.error.set(this.getErrorMessage(err));
        },
      });
  }

  protected onImageLoaded(event: Event): void {
    const img = event.target as HTMLImageElement;
    this.imgNaturalWidth.set(img.naturalWidth || 800);
    this.imgNaturalHeight.set(img.naturalHeight || 600);
  }

  protected onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = '/images/defect-insulator-crack.png';
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

  // --- APPROVE FLOW ---
  protected approveDetection(): void {
    const item = this.detection();
    if (!item || this.actionBusy()) return;

    if (!confirm(`Xác nhận phê duyệt sự cố "${item.categoryName}" thành sự cố kỹ thuật chính thức?`)) {
      return;
    }

    this.actionBusy.set(true);
    this.feedbackMessage.set('');

    this.api
      .validate(item.id, {
        status: 'Confirmed',
        analystNotes: this.generalNotes().trim() || 'Xác nhận khuyết tật chính xác bởi Analyst.',
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.actionBusy.set(false)),
      )
      .subscribe({
        next: () => {
          this.detection.update((current) =>
            current
              ? {
                  ...current,
                  validationStatus: 'Confirmed',
                  analystNotes: this.generalNotes().trim() || 'Xác nhận khuyết tật chính xác bởi Analyst.',
                }
              : null,
          );
          this.feedbackType.set('success');
          this.feedbackMessage.set('Đã phê duyệt sự cố thành công! Kết quả đã được xác nhận vào hệ thống.');
        },
        error: (err: unknown) => {
          this.feedbackType.set('error');
          this.feedbackMessage.set(this.getErrorMessage(err));
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
      .validate(item.id, {
        status: 'Rejected',
        analystNotes: fullNotes,
      })
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
            current
              ? {
                  ...current,
                  validationStatus: 'Rejected',
                  analystNotes: fullNotes,
                }
              : null,
          );
          this.generalNotes.set(fullNotes);
          this.feedbackType.set('success');
          this.feedbackMessage.set('Đã từ chối phát hiện AI thành công.');
        },
        error: (err: unknown) => {
          this.feedbackType.set('error');
          this.feedbackMessage.set(this.getErrorMessage(err));
        },
      });
  }

  protected goBack(): void {
    void this.router.navigate(['/ai-review']);
  }

  private calculateBoxStyle(
    box: AnomalyBoundingBox,
    naturalW: number,
    naturalH: number,
  ): ComputedBoxStyle {
    // If box coordinates are in percentage (0..100) or normalized
    if (box.isNormalized || (box.x <= 100 && box.y <= 100 && box.width <= 100 && box.height <= 100)) {
      return {
        left: `${box.x}%`,
        top: `${box.y}%`,
        width: `${box.width}%`,
        height: `${box.height}%`,
      };
    }

    // If box coordinates are in absolute pixels on the original image
    if (naturalW > 0 && naturalH > 0) {
      const leftPct = (box.x / naturalW) * 100;
      const topPct = (box.y / naturalH) * 100;
      const widthPct = (box.width / naturalW) * 100;
      const heightPct = (box.height / naturalH) * 100;

      return {
        left: `${Math.max(0, Math.min(95, leftPct))}%`,
        top: `${Math.max(0, Math.min(95, topPct))}%`,
        width: `${Math.min(100, widthPct)}%`,
        height: `${Math.min(100, heightPct)}%`,
      };
    }

    // Default fallback percentage
    return {
      left: '30%',
      top: '25%',
      width: '35%',
      height: '40%',
    };
  }

  protected statusClass(status: string): string {
    const s = status.toLowerCase();
    if (s === 'confirmed' || s === 'approved') return 'status-confirmed';
    if (s === 'rejected' || s === 'dismissed') return 'status-rejected';
    return 'status-pending';
  }

  protected statusText(status: string): string {
    const s = status.toLowerCase();
    if (s === 'confirmed' || s === 'approved') return 'Đã xác nhận (Official Defect)';
    if (s === 'rejected' || s === 'dismissed') return 'Đã từ chối (Rejected)';
    return 'Chờ thẩm định (Pending)';
  }

  protected confidenceClass(score: number): string {
    if (score >= 90) return 'conf-high';
    if (score >= 75) return 'conf-med';
    return 'conf-low';
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) return 'Phiên đăng nhập đã hết hạn.';
      if (error.status === 403) return 'Bạn không có quyền thực hiện thao tác thẩm định này.';
      const body = error.error as Record<string, unknown> | null;
      return String(body?.['message'] || error.message || 'Lỗi xử lý yêu cầu thẩm định.');
    }
    return 'Đã xảy ra lỗi không xác định.';
  }
}
