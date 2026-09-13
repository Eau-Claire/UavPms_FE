import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { PreMissionAssessment } from '../../../../models/pre-mission.models';
import { statusLabel, statusTone } from '../../../../shared/status/status';
import { PreMissionApi } from '../../data-access/pre-mission-api';

export type WorkspaceTab = 'overview' | 'site' | 'personnel' | 'uav' | 'technical';

@Component({
  selector: 'app-assessment-workspace',
  imports: [RouterLink, DatePipe, NzIconModule],
  templateUrl: './assessment-workspace.html',
  styleUrl: './assessment-workspace.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssessmentWorkspace {
  private readonly api = inject(PreMissionApi);
  private readonly route = inject(ActivatedRoute);

  protected readonly item = signal<PreMissionAssessment | null>(null);
  protected readonly error = signal('');
  protected readonly actionMessage = signal('');
  protected readonly busy = signal(false);
  protected readonly activeTab = signal<WorkspaceTab>('overview');

  protected readonly isReady = computed(() => {
    const a = this.item();
    return a?.status === 'READY';
  });

  protected readonly isExpired = computed(() => {
    const a = this.item();
    if (!a || !a.validUntil) return false;
    return new Date(a.validUntil) < new Date();
  });

  protected readonly canProceedToMf02 = computed(() => {
    return this.isReady() && !this.isExpired();
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Không tìm thấy mã định danh đánh giá.');
      return;
    }
    this.busy.set(true);
    this.api.get(id).subscribe({
      next: (res) => {
        this.item.set(res);
      },
      error: () => {
        this.error.set('Đánh giá tiền nhiệm vụ không tồn tại hoặc bạn không có quyền truy cập.');
      },
      complete: () => {
        this.busy.set(false);
      },
    });
  }

  protected reevaluate(): void {
    const a = this.item();
    if (!a || this.busy()) return;
    this.busy.set(true);
    this.actionMessage.set('');
    this.error.set('');

    this.api.reEvaluate(a.id).subscribe({
      next: (updated) => {
        this.item.set(updated);
        this.actionMessage.set('Đã đánh giá lại tính sẵn sàng thành công.');
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Không thể thực hiện đánh giá lại. Vui lòng thử lại sau.');
      },
      complete: () => {
        this.busy.set(false);
      },
    });
  }

  protected setTab(tab: WorkspaceTab): void {
    this.activeTab.set(tab);
  }

  protected statusTone = statusTone;
  protected statusLabel = statusLabel;
}
