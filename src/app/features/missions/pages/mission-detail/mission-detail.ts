import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Mission } from '../../../../models/missions.models';
import { MissionsApi } from '../../data-access/missions-api';

@Component({
  selector: 'app-mission-detail',
  imports: [DatePipe, RouterLink, NzIconModule],
  templateUrl: './mission-detail.html',
  styleUrl: './mission-detail.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionDetail {
  private readonly api = inject(MissionsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly mission = signal<Mission | null>(null);

  constructor() {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.api.get(id)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false)))
      .subscribe({
        next: (mission) => this.mission.set(mission),
        error: (error: unknown) => this.error.set(this.errorMessage(error)),
      });
  }

  protected statusLabel(status: string): string {
    return ({
      Pending: 'Chờ xử lý',
      Executing: 'Đang xử lý AI',
      InProgress: 'Đang bay',
      Completed: 'Hoàn thành',
      Failed: 'Lỗi bay',
      Cancelled: 'Đã hủy',
    } as Record<string, string>)[status] ?? status;
  }

  protected statusClass(status: string): string {
    if (['Failed', 'Error', 'Cancelled'].includes(status)) return 'danger';
    if (status === 'Completed') return 'success';
    if (['Executing', 'InProgress', 'Processing'].includes(status)) return 'warning';
    return 'neutral';
  }

  private errorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return 'Không thể tải chi tiết nhiệm vụ.';
    const body = error.error && typeof error.error === 'object' ? error.error as Record<string, unknown> : {};
    return String(body['message'] ?? error.message ?? 'Không thể tải chi tiết nhiệm vụ.');
  }
}
