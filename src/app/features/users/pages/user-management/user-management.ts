import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Auth } from '../../../../core/auth/auth';
import { UserGeographicScopes, UserRecord, UserStatus } from '../../../../models/users.models';
import { UserRole } from '../../../../models/auth.models';
import { UserScopeDialog } from '../../components/user-scope-dialog/user-scope-dialog';
import { UsersApi } from '../../data-access/users-api';

const ADMIN_ROLES = ['admin', 'systemadmin', 'administrator'];
const MANAGER_ROLES = ['manager', 'supervisor'];

@Component({
  selector: 'app-user-management',
  imports: [ReactiveFormsModule, NzIconModule, UserScopeDialog],
  templateUrl: './user-management.html',
  styleUrl: './user-management.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserManagement {
  private readonly api = inject(UsersApi);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly users = signal<readonly UserRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly search = signal('');
  protected readonly roleFilter = signal<UserRole | ''>('');
  protected readonly statusFilter = signal<UserStatus | ''>('');
  protected readonly modalOpen = signal(false);
  protected readonly editing = signal<UserRecord | null>(null);
  protected readonly credential = signal<{ username: string; temporaryPassword: string } | null>(null);
  protected readonly scopeUser = signal<UserRecord | null>(null);

  protected readonly roles: readonly UserRole[] = ['Admin', 'Manager', 'Inspector', 'Technician', 'Analyst', 'Viewer'];
  protected readonly statuses: readonly UserStatus[] = ['Active', 'Inactive', 'Locked'];

  /** GET/POST/PATCH /users are SystemAdmin-only in IdentityService. */
  readonly isAdmin = computed(() => ADMIN_ROLES.includes((this.auth.user()?.role ?? '').toLowerCase()));

  /** PUT /users/{id}/geographic-scopes is allowed for SystemAdmin and Manager (UserRoles.AdminAndManager). */
  readonly canManageScopes = computed(() => this.isAdmin() || MANAGER_ROLES.includes((this.auth.user()?.role ?? '').toLowerCase()));

  readonly stats = computed(() => {
    const all = this.users();
    return {
      total: all.length,
      active: all.filter((u) => u.status === 'Active').length,
      inactive: all.filter((u) => u.status === 'Inactive').length,
      locked: all.filter((u) => u.status === 'Locked').length,
    };
  });

  protected readonly filteredUsers = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.users().filter((user) => {
      const matchSearch = !term || `${user.fullName} ${user.email} ${user.username} ${user.phone ?? ''}`.toLowerCase().includes(term);
      const matchRole = !this.roleFilter() || user.role === this.roleFilter();
      const matchStatus = !this.statusFilter() || user.status === this.statusFilter();
      return matchSearch && matchRole && matchStatus;
    });
  });

  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: '',
    role: ['Viewer' as UserRole, Validators.required],
    status: ['Active' as UserStatus, Validators.required],
  });

  constructor() {
    this.load();
  }

  /** Admins see every user; Managers only get the active Inspectors from /users/assignable (the full list is admin-only). */
  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    const request$ = this.isAdmin() ? this.api.getAll() : this.api.getAssignable();
    request$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (users) => this.users.set(users),
        error: () => this.error.set('Không thể tải danh sách người dùng.'),
      });
  }

  protected clearFilters(): void {
    this.search.set('');
    this.roleFilter.set('');
    this.statusFilter.set('');
  }

  protected getInitials(name: string): string {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.form.reset({ fullName: '', email: '', phone: '', role: 'Viewer', status: 'Active' });
    this.modalOpen.set(true);
  }

  protected openEdit(user: UserRecord): void {
    this.editing.set(user);
    this.form.reset({
      fullName: user.fullName,
      email: user.email,
      phone: user.phone ?? '',
      role: user.role,
      status: user.status,
    });
    this.modalOpen.set(true);
  }

  protected closeModal(): void {
    this.modalOpen.set(false);
    this.editing.set(null);
  }

  protected save(): void {
    const current = this.editing();
    if (current) {
      this.changeUser(current);
    } else {
      this.create();
    }
  }

  private create(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    const raw = this.form.getRawValue();
    this.api
      .create({
        fullName: raw.fullName,
        email: raw.email,
        phone: raw.phone,
        role: raw.role,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (user) => {
          this.users.update((users) => [user, ...users]);
          this.closeModal();
          this.notice.set(`Đã tạo thành công tài khoản ${user.fullName || user.email}. Mật khẩu mặc định là: Pms@2026!`);
        },
        error: () => this.error.set('Không thể tạo người dùng.'),
      });
  }

  private changeUser(user: UserRecord): void {
    const raw = this.form.getRawValue();
    this.busy.set(true);
    const newStatus = raw.status;
    this.api
      .update(user.id, {
        fullName: raw.fullName,
        phone: raw.phone,
        role: raw.role,
        status: newStatus,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (updated) => {
          this.users.update((users) => users.map((item) => (item.id === updated.id ? updated : item)));
          this.closeModal();
          this.notice.set(`Đã cập nhật thông tin người dùng ${updated.fullName || updated.email}.`);

          if (newStatus === 'Locked' || newStatus === 'Inactive') {
            this.auth.broadcastUserSuspended(user.id, newStatus === 'Locked' ? 'suspended' : 'inactive');
            if (user.id === this.auth.user()?.id) {
              this.auth.logout();
              void this.router.navigate(['/login'], {
                queryParams: { error: newStatus === 'Locked' ? 'account_suspended' : 'account_inactive' },
              });
            }
          }
        },
        error: () => this.error.set('Không thể cập nhật người dùng.'),
      });
  }

  protected changeStatus(user: UserRecord, status: UserStatus): void {
    if (!this.isAdmin()) return;
    const isSuspending = status === 'Locked';
    const request$ = isSuspending ? this.api.suspend(user.id) : this.api.update(user.id, { status });

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        const updatedUser: UserRecord =
          response && typeof response === 'object' && 'id' in response
            ? (response as UserRecord)
            : { ...user, status };

        this.users.update((users) => users.map((item) => (item.id === user.id ? updatedUser : item)));
        this.notice.set(
          status === 'Active'
            ? `Đã kích hoạt tài khoản ${user.fullName || user.email}.`
            : status === 'Locked'
            ? `Đã khóa (đình chỉ) tài khoản ${user.fullName || user.email}.`
            : `Đã vô hiệu hóa tài khoản ${user.fullName || user.email}.`,
        );

        if (status === 'Locked' || status === 'Inactive') {
          this.auth.broadcastUserSuspended(user.id, status === 'Locked' ? 'suspended' : 'inactive');
          if (user.id === this.auth.user()?.id) {
            this.auth.logout();
            void this.router.navigate(['/login'], {
              queryParams: { error: status === 'Locked' ? 'account_suspended' : 'account_inactive' },
            });
          }
        }
      },
      error: () => this.error.set('Không thể cập nhật trạng thái người dùng.'),
    });
  }

  protected resetPassword(user: UserRecord): void {
    if (!this.isAdmin()) return;
    this.api
      .resetPassword(user.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => this.credential.set(value),
        error: () => this.error.set('Không thể đặt lại mật khẩu.'),
      });
  }

  protected openScopes(user: UserRecord): void {
    this.notice.set('');
    this.scopeUser.set(user);
  }

  protected closeScopes(): void {
    this.scopeUser.set(null);
  }

  protected onScopesSaved(scopes: UserGeographicScopes): void {
    const user = this.scopeUser();
    this.scopeUser.set(null);
    this.notice.set(
      `Đã cập nhật phạm vi ${scopes.regions.length} khu vực cho ${user?.fullName || user?.email || 'người dùng'}.`,
    );
  }

  protected roleClass(role: UserRole): string {
    return `role-${role.toLowerCase()}`;
  }

  protected statusClass(status: UserStatus): string {
    return `status-${status.toLowerCase()}`;
  }

  protected roleLabel(role: UserRole): string {
    const labels: Record<string, string> = {
      Admin: 'Quản trị viên',
      SystemAdmin: 'Quản trị viên',
      Manager: 'Quản lý',
      Supervisor: 'Quản lý',
      Inspector: 'Thanh tra',
      Technician: 'Kỹ thuật viên',
      Analyst: 'Phân tích viên',
      Viewer: 'Người xem',
    };
    return labels[role] ?? String(role);
  }

  protected statusLabel(status: UserStatus): string {
    return ({ Active: 'Hoạt động', Inactive: 'Tạm ngưng', Locked: 'Đã khóa' } as const)[status];
  }
}
