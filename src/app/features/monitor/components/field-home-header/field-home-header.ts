import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Auth } from '../../../../core/auth/auth';
import { roleLabel } from '../../../../core/auth/roles';

/** Quiet Chrome header shared by the field-role dashboards ("Việc của tôi"), aligned with Admin/Manager dashboard. */
@Component({
  selector: 'app-field-home-header',
  imports: [DatePipe],
  template: `
    <header class="page-header field-page-header">
      <div>
        <nav class="page-breadcrumb" aria-label="Đường dẫn">
          <span>Tổng quan</span>
          <span class="separator">/</span>
          <strong>Việc của tôi</strong>
        </nav>
        <h1>Xin chào, {{ displayName() }}</h1>
        <p>
          <span class="role-label">{{ role() }}</span>
          <span class="role-sep" aria-hidden="true">·</span>
          <span>{{ subtitle() }}</span>
        </p>
      </div>
      <div class="head-actions">
        @if (loading()) {
          <span class="dash-updated" role="status" aria-live="polite">Đang cập nhật…</span>
        } @else if (loadedAt(); as at) {
          <span class="dash-updated tabular-nums" role="status" aria-live="polite">
            Cập nhật {{ at | date: 'HH:mm' }} · tự làm mới 60 giây
          </span>
        }
        <button
          type="button"
          class="app-btn-secondary"
          (click)="refresh.emit()"
          [disabled]="loading()"
        >
          {{ loading() ? 'Đang tải...' : 'Làm mới' }}
        </button>
      </div>
    </header>
  `,
  styles: `
    :host {
      display: block;
    }
    .field-page-header {
      margin-bottom: 14px;
    }
    .role-label {
      color: #1d4f91;
      font-weight: 600;
    }
    .role-sep {
      margin: 0 6px;
      color: #cbd5e1;
    }
    .dash-updated {
      font-size: 12.5px;
      color: #64748b;
    }
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
