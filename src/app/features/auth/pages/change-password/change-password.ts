import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { ToastService } from '../../../../core/toast/toast.service';
import { Auth } from '../../../../core/auth/auth';
import { NgOptimizedImage } from '@angular/common';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { checkPasswordComplexity, passwordComplexityValidator } from '../../../../shared/utils/password-validator';

@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule, NgOptimizedImage, NzButtonModule, NzFormModule, NzIconModule, NzInputModule],
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
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly newPassword = signal('');
  protected readonly complexity = computed(() => checkPasswordComplexity(this.newPassword()));

  protected readonly form = this.fb.nonNullable.group({
    oldPassword: [''],
    password: ['', [Validators.required, Validators.minLength(8), passwordComplexityValidator()]],
    confirm: ['', Validators.required],
  });

  protected onPasswordInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.newPassword.set(val);
  }

  protected submit(): void {
    const value = this.form.getRawValue();
    if (this.form.invalid || value.password !== value.confirm) {
      if (value.password !== value.confirm) {
        this.error.set('Mật khẩu xác nhận không khớp.');
      } else {
        this.error.set('Mật khẩu mới chưa đáp ứng đầy đủ yêu cầu về độ phức tạp.');
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
          this.toast.success('Đổi mật khẩu thành công!');
          void this.router.navigate(['/dashboard']);
        },
        error: () => this.error.set('Không thể đổi mật khẩu. Vui lòng kiểm tra lại mật khẩu hiện tại.'),
      });
  }
}
