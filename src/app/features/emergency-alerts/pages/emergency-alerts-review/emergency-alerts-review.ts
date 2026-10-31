import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzNotificationService } from 'ng-zorro-antd/notification';
import { NzTableModule } from 'ng-zorro-antd/table';

import { Auth } from '../../../../core/auth/auth';
import { NotificationsRealtime } from '../../../notifications/data-access/notifications-realtime';
import { alertErrorMessage, EmergencyAlertsApi } from '../../data-access/emergency-alerts-api';
import {
  ActiveEmergencyAlert,
  ALERT_PRIORITY_LABELS,
  ALERT_STATUS_LABELS,
  AlertBoundingBox,
  AlertStatus,
  EmergencyAlertDetail,
  EmergencyAlertHistoryPage,
  EscalationTarget,
} from '../../models/emergency-alert.models';

interface BoundingBoxStyle {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const REVIEW_ROLES = new Set(['analyst', 'manager', 'admin', 'systemadmin']);
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DISMISS_REASONS = [
  'Báo động giả (False positive - lá cây/phản xạ ánh sáng)',
  'Góc chụp/ảnh quá mờ, không đủ căn cứ xác thực',
  'Khuyết tật đã được xử lý hoặc nằm trong giới hạn cho phép',
  'Vị trí phát hiện nằm ngoài hành lang an toàn điện',
  'Lý do kỹ thuật khác',
] as const;

export const URGENCY_LEVELS = [
  'Cấp bách (Khẩn cấp cấp 1 - Nguy cơ rã lưới ngay)',
  'Nghiêm trọng (Khẩn cấp cấp 2 - Xử lý trong 2 giờ)',
  'Ưu tiên cao (Khẩn cấp cấp 3 - Xử lý trong ca)',
] as const;

@Component({
  selector: 'app-emergency-alerts-review',
  imports: [
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    NzIconModule,
    NzButtonModule,
    NzTagModule,
    NzModalModule,
    NzInputModule,
    NzSelectModule,
    NzTableModule,
  ],
  templateUrl: './emergency-alerts-review.html',
  styleUrl: './emergency-alerts-review.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmergencyAlertsReview {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(Auth);
  private readonly api = inject(EmergencyAlertsApi);
  private readonly realtime = inject(NotificationsRealtime);
  private readonly notification = inject(NzNotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly statusLabels = ALERT_STATUS_LABELS;
  protected readonly priorityLabels = ALERT_PRIORITY_LABELS;
  protected readonly dismissReasons = DISMISS_REASONS;
  protected readonly urgencyLevels = URGENCY_LEVELS;

  protected readonly selectedTab = signal<'active' | 'history'>('active');

  // --- Active alerts (GET /alerts/active) ---
  protected readonly activeAlerts = this.api.activeAlerts;
  protected readonly activeCount = this.api.activeCount;
  protected readonly activeLoading = signal(false);
  protected readonly activeError = signal('');

  protected readonly selectedAlertId = signal<string | null>(null);
  protected readonly selectedAlert = computed<ActiveEmergencyAlert | null>(() => {
    const alerts = this.activeAlerts();
    const id = this.selectedAlertId();
    return alerts.find((a) => a.id === id) ?? alerts[0] ?? null;
  });

  // --- History (GET /alerts?status&page&pageSize) ---
  protected readonly historyStatus = this.fb.nonNullable.control<AlertStatus | ''>('');
  protected readonly historyPage = signal<EmergencyAlertHistoryPage>({ totalCount: 0, page: 1, pageSize: 10, items: [] });
  protected readonly historyLoading = signal(false);
  protected readonly historyError = signal('');

  // --- Detail modal (GET /alerts/{id}) ---
  protected readonly detail = signal<EmergencyAlertDetail | null>(null);
  protected readonly detailLoading = signal(false);

  // --- Permissions ---
  protected readonly user = computed(() => this.auth.user());
  protected readonly canReview = computed(() => REVIEW_ROLES.has((this.user()?.role ?? '').toLowerCase()));

  // --- Evidence viewer ---
  protected readonly zoomLevel = signal(1);
  protected readonly showBoundingBox = signal(true);
  protected readonly imgNaturalWidth = signal(0);
  protected readonly imgNaturalHeight = signal(0);

  // --- Actions ---
  protected readonly actionBusy = signal(false);
  protected readonly isConfirmModalVisible = signal(false);
  protected readonly isDismissModalVisible = signal(false);
  protected readonly isEscalateModalVisible = signal(false);
  protected readonly escalateError = signal('');

  protected readonly confirmForm = this.fb.nonNullable.group({
    notes: ['Xác nhận sự cố đe dọa an toàn lưới điện qua ảnh bằng chứng UAV.'],
  });

  protected readonly dismissForm = this.fb.nonNullable.group({
    reason: [DISMISS_REASONS[0] as string, [Validators.required]],
    notes: [''],
  });

  protected readonly escalateForm = this.fb.nonNullable.group({
    escalatedToUserId: ['', [Validators.required, Validators.pattern(GUID_PATTERN)]],
    urgencyLevel: [URGENCY_LEVELS[0] as string],
    reason: ['', [Validators.required, Validators.minLength(10)]],
  });

  /** Manager / SystemAdmin users; null until loaded, empty when the user may not list users. */
  protected readonly escalationTargets = signal<readonly EscalationTarget[] | null>(null);
  protected readonly escalationTargetsUnavailable = signal(false);

  private audioCtx: AudioContext | null = null;

  constructor() {
    this.loadActive();
    this.loadHistory(1);

    this.historyStatus.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.loadHistory(1));

    this.initRealtimeSubscription();
  }

  protected loadActive(): void {
    this.activeLoading.set(true);
    this.activeError.set('');
    this.api
      .fetchActiveAlerts()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.activeLoading.set(false)),
      )
      .subscribe({
        error: (err: unknown) => this.activeError.set(alertErrorMessage(err, 'Không thể tải danh sách cảnh báo đang hoạt động.')),
      });
  }

  protected loadHistory(page: number): void {
    this.historyLoading.set(true);
    this.historyError.set('');
    this.api
      .fetchAlertHistory({ status: this.historyStatus.value, page, pageSize: this.historyPage().pageSize })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.historyLoading.set(false)),
      )
      .subscribe({
        next: (result) => this.historyPage.set(result),
        error: (err: unknown) => this.historyError.set(alertErrorMessage(err, 'Không thể tải lịch sử cảnh báo.')),
      });
  }

  protected refresh(): void {
    this.loadActive();
    this.loadHistory(this.historyPage().page);
  }

  private initRealtimeSubscription(): void {
    this.realtime.connect();
    this.realtime.notifications$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((notif) => {
      const isEmergency = notif.type === 'EmergencyAlert' || notif.referenceType === 'EmergencyAlert';
      if (!isEmergency) return;
      this.playWarningBeep();
      this.notification.error('Cảnh báo khẩn cấp mới', `${notif.title}: ${notif.body}`, {
        nzDuration: 8000,
        nzPauseOnHover: true,
      });
      this.loadActive();
    });
  }

  private playWarningBeep(): void {
    try {
      const ctx = this.audioCtx ?? new AudioContext();
      this.audioCtx = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch {
      // Audio is blocked until the user interacts with the page; the toast is enough.
    }
  }

  // --- Selection & evidence viewer ---
  protected selectAlert(alert: ActiveEmergencyAlert): void {
    this.selectedAlertId.set(alert.id);
    this.zoomLevel.set(1);
    this.imgNaturalWidth.set(0);
    this.imgNaturalHeight.set(0);
  }

  protected onImageLoaded(event: Event): void {
    const img = event.target as HTMLImageElement;
    this.imgNaturalWidth.set(img.naturalWidth);
    this.imgNaturalHeight.set(img.naturalHeight);
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

  protected boundingBoxStyle(box: AlertBoundingBox | null): BoundingBoxStyle | null {
    if (!box) return null;
    if (box.isNormalized) return { left: box.x, top: box.y, width: box.width, height: box.height };
    const w = this.imgNaturalWidth();
    const h = this.imgNaturalHeight();
    if (!w || !h) return null;
    return {
      left: (box.x / w) * 100,
      top: (box.y / h) * 100,
      width: (box.width / w) * 100,
      height: (box.height / h) * 100,
    };
  }

  protected statusColor(status: AlertStatus): string {
    if (status === 'Confirmed') return 'success';
    if (status === 'Escalated') return 'error';
    if (status === 'Active') return 'processing';
    return 'default';
  }

  // --- Confirm ---
  protected openConfirmModal(): void {
    if (!this.canReview()) return;
    this.confirmForm.reset();
    this.isConfirmModalVisible.set(true);
  }

  protected closeConfirmModal(): void {
    if (!this.actionBusy()) this.isConfirmModalVisible.set(false);
  }

  protected executeConfirm(): void {
    const alert = this.selectedAlert();
    if (!alert || this.actionBusy()) return;
    this.review(alert, 'Confirmed', this.confirmForm.getRawValue().notes.trim() || 'Xác nhận sự cố.', () =>
      this.isConfirmModalVisible.set(false),
    );
  }

  // --- Dismiss ---
  protected openDismissModal(): void {
    if (!this.canReview()) return;
    this.dismissForm.reset();
    this.isDismissModalVisible.set(true);
  }

  protected closeDismissModal(): void {
    if (!this.actionBusy()) this.isDismissModalVisible.set(false);
  }

  protected executeDismiss(): void {
    const alert = this.selectedAlert();
    if (!alert || this.actionBusy()) return;
    const { reason, notes } = this.dismissForm.getRawValue();
    this.review(alert, 'Dismissed', `[${reason}] ${notes.trim() || 'Bác bỏ cảnh báo.'}`, () =>
      this.isDismissModalVisible.set(false),
    );
  }

  private review(alert: ActiveEmergencyAlert, status: 'Confirmed' | 'Dismissed', notes: string, done: () => void): void {
    this.actionBusy.set(true);
    this.api
      .reviewAlert(alert.id, { status, notes })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.actionBusy.set(false)),
      )
      .subscribe({
        next: () => {
          done();
          this.selectedAlertId.set(null);
          this.loadHistory(1);
          if (status === 'Confirmed') {
            this.notification.success('Đã xác nhận cảnh báo', `Cảnh báo tại ${alert.towerCode || 'cột chưa xác định'} đã được xác nhận.`);
          } else {
            this.notification.info('Đã bác bỏ cảnh báo', `Cảnh báo tại ${alert.towerCode || 'cột chưa xác định'} đã được bác bỏ.`);
          }
        },
        error: (err: unknown) => this.notification.error('Lỗi thẩm định', alertErrorMessage(err, 'Không thể xử lý yêu cầu thẩm định.')),
      });
  }

  // --- Escalate ---
  protected openEscalateModal(): void {
    if (!this.canReview()) return;
    this.escalateError.set('');
    this.escalateForm.reset();
    this.isEscalateModalVisible.set(true);
    if (this.escalationTargets() === null) this.loadEscalationTargets();
  }

  private loadEscalationTargets(): void {
    const selfId = this.user()?.id;
    this.api
      .getEscalationTargets()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (targets) => {
          const others = targets.filter((t) => t.id !== selfId);
          this.escalationTargets.set(others);
          this.escalationTargetsUnavailable.set(others.length === 0);
        },
        error: () => {
          this.escalationTargets.set([]);
          this.escalationTargetsUnavailable.set(true);
        },
      });
  }

  protected closeEscalateModal(): void {
    if (!this.actionBusy()) this.isEscalateModalVisible.set(false);
  }

  protected executeEscalate(): void {
    const alert = this.selectedAlert();
    if (!alert || this.actionBusy()) return;
    if (this.escalateForm.invalid) {
      this.escalateForm.markAllAsTouched();
      return;
    }
    const { escalatedToUserId, urgencyLevel, reason } = this.escalateForm.getRawValue();
    if (escalatedToUserId.toLowerCase() === (this.user()?.id ?? '').toLowerCase()) {
      this.escalateError.set('Không thể chuyển cấp cảnh báo cho chính bạn. Vui lòng chọn người nhận khác.');
      return;
    }

    this.escalateError.set('');
    this.actionBusy.set(true);
    this.api
      .escalateAlert(alert.id, { escalatedToUserId: escalatedToUserId.trim(), reason: `[${urgencyLevel}] ${reason.trim()}` })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.actionBusy.set(false)),
      )
      .subscribe({
        next: (escalation) => {
          this.isEscalateModalVisible.set(false);
          this.selectedAlertId.set(null);
          this.loadHistory(1);
          this.notification.warning(
            'Đã chuyển cấp cảnh báo',
            `Cảnh báo đã được chuyển tới ${escalation.escalatedToName || 'người nhận'}.`,
            { nzDuration: 7000 },
          );
        },
        error: (err: unknown) => this.escalateError.set(alertErrorMessage(err, 'Không thể chuyển cấp cảnh báo.')),
      });
  }

  // --- Detail modal ---
  protected viewDetail(id: string): void {
    this.detailLoading.set(true);
    this.api
      .getAlert(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.detailLoading.set(false)),
      )
      .subscribe({
        next: (detail) => this.detail.set(detail),
        error: (err: unknown) => this.notification.error('Lỗi tải chi tiết', alertErrorMessage(err, 'Không thể tải chi tiết cảnh báo.')),
      });
  }

  protected closeDetail(): void {
    this.detail.set(null);
  }
}
