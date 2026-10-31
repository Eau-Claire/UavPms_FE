import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Auth } from '../../../../core/auth/auth';
import { roleLabel } from '../../../../core/auth/roles';

/** Compact greeting header shared by the field-role dashboards ("Việc của tôi"). */
@Component({
  selector: 'app-field-home-header',
  imports: [DatePipe],
  template: `
    <header class="field-heading">
      <div class="heading-left">
        <div class="page-breadcrumb"><span>TỔNG QUAN</span><span aria-hidden="true">/</span><strong>VIỆC CỦA TÔI</strong></div>
        <h1>Xin chào, {{ displayName() }}</h1>
        <p class="subtitle">
          <span class="role-chip">{{ role() }}</span>
          <span>{{ subtitle() }}</span>
        </p>
      </div>
      <div class="heading-actions">
        <span class="updated" role="status" aria-live="polite">
          @if (loading()) {
            Đang cập nhật…
          } @else if (loadedAt(); as at) {
            Cập nhật lúc {{ at | date: 'HH:mm' }} · tự làm mới mỗi 60 giây
          }
        </span>
        <button type="button" class="refresh-btn" (click)="refresh.emit()" [disabled]="loading()">Làm mới</button>
      </div>
    </header>
  `,
  styles: `
    :host { display: block; }
    .field-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
    .heading-left { display: flex; flex-direction: column; min-width: 0; }
    .page-breadcrumb { display: flex; align-items: center; gap: 6px; margin: 0 0 2px; color: #64748b; font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
    .page-breadcrumb strong { color: #10387d; }
    h1 { margin: 0 0 4px; color: #0f2952; font-size: 19px; font-weight: 700; line-height: 1.25; letter-spacing: -0.01em; }
    .subtitle { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; color: #475569; font-size: 12px; line-height: 1.35; }
    .role-chip { padding: 2px 8px; border: 1px solid #bfdbfe; border-radius: 999px; background: #eff6ff; color: #10387d; font-size: 11px; font-weight: 700; }
    .heading-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .updated { color: #475569; font-size: 11.5px; }
    .refresh-btn { height: 30px; padding: 0 12px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff; color: #10387d; font-size: 12px; font-weight: 600; cursor: pointer; }
    .refresh-btn:hover:not(:disabled) { background: #f1f5f9; }
    .refresh-btn:disabled { cursor: progress; opacity: 0.7; }
    .refresh-btn:focus-visible { outline: 2px solid #10387d; outline-offset: 1px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldHomeHeader {
  private readonly auth = inject(Auth);

  readonly subtitle = input('');
  readonly loading = input(false);
  readonly loadedAt = input<number | null>(null);
  readonly refresh = output<void>();

  protected readonly displayName = computed(() => {
    const user = this.auth.user();
    return user?.fullName?.trim() || user?.email || 'bạn';
  });
  protected readonly role = computed(() => roleLabel(this.auth.user()?.role));
}
