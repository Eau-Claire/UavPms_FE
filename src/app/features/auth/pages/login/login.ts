import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { NgOptimizedImage } from '@angular/common';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgOptimizedImage,
    NzButtonModule,
    NzDividerModule,
    NzFormModule,
    NzIconModule,
    NzInputModule,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly passwordVisible = signal(false);
  protected readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(3)]],
  });
  protected usernameError(): string {
    const username = this.form.controls.username;
    if (!username.touched || !username.invalid) return '';
    if (username.hasError('required')) return 'Tên đăng nhập không được để trống';
    if (username.hasError('email')) return 'Tên đăng nhập không đúng định dạng email';
    return '';
  }
  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((v) => !v);
  }
  protected submit(): void {
    this.normalizeUsername();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.auth
      .login(this.form.getRawValue())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (result) => {
          if (result.otpRequired) {
            void this.router.navigate(['/otp'], {
              queryParams: { email: result.email, purpose: 'Login' },
            });
            return;
          }
          void this.router.navigateByUrl(
            result.session.user.mustChangePassword
              ? '/change-password'
              : this.route.snapshot.queryParamMap.get('returnUrl') || '/dashboard',
          );
        },
        error: (error: HttpErrorResponse) => {
          let serverMessage = '';
          if (error.error) {
            if (typeof error.error === 'string') {
              serverMessage = error.error;
            } else if (error.error.errors && typeof error.error.errors === 'object') {
              const messages = Object.values(error.error.errors)
                .filter(Array.isArray)
                .flat()
                .join('. ');
              if (messages) serverMessage = messages;
            }
            if (!serverMessage) {
              serverMessage =
                error.error.message ||
                error.error.detail ||
                (error.error.title && error.error.title !== 'One or more validation errors occurred.'
                  ? error.error.title
                  : '');
            }
          }

          if (serverMessage) {
            this.error.set(serverMessage);
          } else if (error.status === 400 || error.status === 401) {
            this.error.set('Tên đăng nhập hoặc mật khẩu không chính xác.');
          } else if (error.status === 0) {
            this.error.set('Không thể kết nối đến máy chủ API. Vui lòng kiểm tra mạng hoặc kết nối server.');
          } else {
            this.error.set(`Đăng nhập thất bại (Mã lỗi ${error.status || 'Unknown'}). Vui lòng thử lại.`);
          }
        },
      });
  }
  protected normalizeUsername(): void {
    const normalized = this.form.controls.username.value.trim();
    this.form.controls.username.setValue(normalized);
  }
}
