import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Mission, MissionPage } from '../../../../models/missions.models';
import { MissionsApi } from '../../data-access/missions-api';

@Component({
  selector: 'app-mission-list',
  imports: [DatePipe, RouterLink, NzIconModule],
  templateUrl: './mission-list.html',
  styleUrl: './mission-list.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionList {
  private readonly api = inject(MissionsApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(8);
  protected readonly search = signal('');
  protected readonly status = signal('');
  protected readonly response = signal<MissionPage>({ items: [], page: 1, pageSize: 8, totalCount: 0, totalPages: 1 });
  protected readonly statuses = ['Pending', 'Executing', 'Completed', 'Failed', 'Cancelled'];
  protected readonly stats = computed(() => {
    const items = this.response().items;
    return [
      { label: 'Tổng nhiệm vụ', value: this.response().totalCount, tone: 'total', icon: 'profile' },
      { label: 'Đang xử lý AI', value: items.filter((item) => this.isInProgress(item.status)).length, tone: 'warning', icon: 'sync' },
      { label: 'Đã hoàn thành', value: items.filter((item) => item.status === 'Completed').length, tone: 'success', icon: 'check-circle' },
      { label: 'Cảnh báo lỗi', value: items.filter((item) => this.isFailed(item.status)).length, tone: 'danger', icon: 'warning' },
    ];
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api.list({ page: this.page(), pageSize: this.pageSize(), search: this.search(), status: this.status() })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => this.response.set(response),
        error: (error: unknown) => this.error.set(this.errorMessage(error)),
      });
  }

  protected applyFilters(): void {
    this.page.set(1);
    this.load();
  }

  protected goToPage(page: number): void {
    if (page < 1 || page > this.response().totalPages || page === this.page()) return;
    this.page.set(page);
    this.load();
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
    if (this.isFailed(status)) return 'danger';
    if (status === 'Completed') return 'success';
    if (this.isInProgress(status)) return 'warning';
    return 'neutral';
  }

  protected routeLabel(mission: Mission): string {
    return mission.routeData || mission.description || 'Chưa có tuyến';
  }

  protected startIndex(): number {
    if (!this.response().totalCount) return 0;
    return (this.response().page - 1) * this.response().pageSize + 1;
  }

  protected endIndex(): number {
    return Math.min(this.response().totalCount, this.response().page * this.response().pageSize);
  }

  private isInProgress(status: string): boolean {
    return ['Executing', 'InProgress', 'Processing', 'AIProcessing'].includes(status);
  }

  private isFailed(status: string): boolean {
    return ['Failed', 'Error', 'Cancelled'].includes(status);
  }

  private errorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return 'Không thể tải danh sách nhiệm vụ.';
    const body = error.error && typeof error.error === 'object' ? error.error as Record<string, unknown> : {};
    return String(body['message'] ?? error.message ?? 'Không thể tải danh sách nhiệm vụ.');
  }
}
