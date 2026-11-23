import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { NgOptimizedImage } from '@angular/common';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { passwordComplexityValidator } from '../../../../shared/utils/password-validator';

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink, NgOptimizedImage, NzButtonModule, NzFormModule, NzInputModule],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPassword {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(Auth);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly form = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8), passwordComplexityValidator()]],
    confirm: ['', Validators.required],
  });

  protected submit(): void {
    const value = this.form.getRawValue();
    if (this.form.invalid || value.password !== value.confirm) {
      if (value.password !== value.confirm) {
        this.error.set('Mật khẩu xác nhận không khớp.');
      } else {
        this.error.set('Mật khẩu phải có tối thiểu 8 ký tự, bao gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt.');
      }
      return;
    }
    const token = this.route.snapshot.queryParamMap.get('token') ?? '';
    this.busy.set(true);
    this.auth
      .resetPassword({ verificationToken: token, newPassword: value.password })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: () => void this.router.navigate(['/login']),
        error: () => this.error.set('Không thể đặt lại mật khẩu. Vui lòng yêu cầu mã xác nhận mới và thử lại.'),
      });
  }
}
