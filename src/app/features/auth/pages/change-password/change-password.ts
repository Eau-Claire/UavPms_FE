import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, finalize, of } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { isAdminRole, roleLabel } from '../../../../core/auth/roles';
import { ALL_REGIONS, FacilityItem, FacilityStore } from '../../../../core/facility/facility-store';
import { ToastService } from '../../../../core/toast/toast.service';
import { checkPasswordComplexity, passwordComplexityValidator } from '../../../../shared/utils/password-validator';
import { UsersApi } from '../../../users/data-access/users-api';

type AccountSettingsTab = 'profile' | 'regions' | 'password';

@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './change-password.html',
  styleUrl: './change-password.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangePassword {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toast = inject(ToastService);
  private readonly usersApi = inject(UsersApi, { optional: true });
  protected readonly facilityStore = inject(FacilityStore);

  protected readonly activeTab = signal<AccountSettingsTab>('profile');
  protected readonly user = this.auth.user;
  protected readonly userRoleLabel = computed(() => roleLabel(this.user()?.role));
  protected readonly isFullSystemAccess = computed(() => isAdminRole(this.user()?.role));

  protected readonly scopesLoading = signal(false);
  protected readonly assignedRegions = signal<readonly FacilityItem[]>([]);
  protected readonly displayRegions = computed<readonly FacilityItem[]>(() => {
    const explicit = this.assignedRegions();
    if (explicit.length > 0) return explicit;
    return this.facilityStore.facilities().filter((item) => item.id !== ALL_REGIONS.id);
  });

  protected readonly busy = signal(false);
  protected readonly newPassword = signal('');
  protected readonly complexity = computed(() => checkPasswordComplexity(this.newPassword()));

  protected readonly form = this.fb.nonNullable.group({
    oldPassword: [''],
    password: ['', [Validators.required, Validators.minLength(8), passwordComplexityValidator()]],
    confirm: ['', Validators.required],
  });

  constructor() {
    this.loadAssignedScopes();
  }

  protected setTab(tab: AccountSettingsTab): void {
    this.activeTab.set(tab);
  }

  private loadAssignedScopes(): void {
    const current = this.user();
    if (!current || !this.usersApi || this.isFullSystemAccess()) return;
    this.scopesLoading.set(true);
    this.usersApi
      .getGeographicScopes(current.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => of({ userId: current.id, regions: [] })),
        finalize(() => this.scopesLoading.set(false)),
      )
      .subscribe((scopes) => {
        const mapped = (scopes.regions ?? []).map(
          (r: { regionId?: string; id?: string; name?: string; code?: string }): FacilityItem => ({
            id: String(r.regionId ?? r.id ?? ''),
            name: String(r.name ?? 'Khu vực được phân quyền'),
            code: r.code,
          }),
        );
        this.assignedRegions.set(mapped.filter((item) => item.id));
      });
  }

  protected onPasswordInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.newPassword.set(val);
  }

  protected submit(): void {
    const value = this.form.getRawValue();
    if (this.form.invalid || value.password !== value.confirm) {
      if (value.password !== value.confirm) {
        this.toast.error('Mật khẩu xác nhận không khớp.');
      } else {
        this.toast.error('Mật khẩu mới chưa đáp ứng đầy đủ yêu cầu về độ phức tạp.');
      }
      return;
    }
    this.busy.set(true);
    this.auth
      .changePassword(value.password, value.oldPassword.trim() || undefined)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: () => {
          this.toast.success('Đổi mật khẩu thành công.');
          this.form.reset();
          this.newPassword.set('');
          void this.router.navigate(['/dashboard']);
        },
        error: () => this.toast.error('Không thể đổi mật khẩu. Vui lòng kiểm tra lại mật khẩu hiện tại.'),
      });
  }
}
