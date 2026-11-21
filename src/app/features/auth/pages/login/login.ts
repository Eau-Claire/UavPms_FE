import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal, ViewEncapsulation } from '@angular/core';
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
export class Login implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly unverifiedEmail = signal(false);
  protected readonly sendingOtp = signal(false);
  protected readonly passwordVisible = signal(false);
  protected readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(3)]],
  });
  ngOnInit(): void {
    const errorParam = this.route.snapshot.queryParamMap.get('error');
    if (errorParam === 'account_suspended') {
      this.error.set('Tài khoản của bạn đã bị khóa hoặc tạm đình chỉ. Vui lòng liên hệ Quản trị viên hệ thống.');
    } else if (errorParam === 'account_inactive') {
      this.error.set('Tài khoản của bạn đang tạm ngưng hoạt động. Vui lòng liên hệ Quản trị viên hệ thống.');
    } else if (errorParam === 'session_expired') {
      this.error.set('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }
  }

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
    this.unverifiedEmail.set(false);
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
        error: (error: unknown) => {
          if (error instanceof Error && !(error instanceof HttpErrorResponse) && error.message) {
            this.error.set(error.message);
            return;
          }
          const httpError = error as HttpErrorResponse;
          let serverMessage = '';
          if (httpError?.error) {
            if (typeof httpError.error === 'string') {
              serverMessage = httpError.error;
            } else if (httpError.error.errors && typeof httpError.error.errors === 'object') {
              const messages = Object.values(httpError.error.errors)
                .filter(Array.isArray)
                .flat()
                .join('. ');
              if (messages) serverMessage = messages;
            }
            if (!serverMessage) {
              serverMessage =
                httpError.error.message ||
                httpError.error.detail ||
                (httpError.error.title && httpError.error.title !== 'One or more validation errors occurred.'
                  ? httpError.error.title
                  : '');
            }
          }

          const msgLower = (serverMessage || '').toLowerCase();
          if (
            msgLower.includes('email') &&
            (msgLower.includes('not verified') ||
              msgLower.includes('not confirmed') ||
              msgLower.includes('chưa xác thực') ||
              msgLower.includes('chưa được xác minh') ||
              msgLower.includes('unconfirmed'))
          ) {
            this.unverifiedEmail.set(true);
            this.error.set('Tài khoản của bạn chưa xác thực email để kích hoạt đăng nhập.');
            return;
          }

          if (serverMessage) {
            this.error.set(serverMessage);
          } else if (httpError?.status === 400 || httpError?.status === 401) {
            this.error.set('Tên đăng nhập hoặc mật khẩu không chính xác.');
          } else if (httpError?.status === 0) {
            this.error.set('Không thể kết nối đến máy chủ API. Vui lòng kiểm tra mạng hoặc kết nối server.');
          } else {
            this.error.set(`Đăng nhập thất bại (Mã lỗi ${httpError?.status || 'Unknown'}). Vui lòng thử lại.`);
          }
        },
      });
  }

  protected sendActivationOtp(): void {
    const email = this.form.controls.username.value.trim();
    if (!email) return;
    this.sendingOtp.set(true);
    this.auth
      .sendOtp({ email, purpose: 'VerifyEmail' })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.sendingOtp.set(false)),
      )
      .subscribe({
        next: () => {
          void this.router.navigate(['/otp'], {
            queryParams: { email, purpose: 'VerifyEmail' },
          });
        },
        error: () => {
          void this.router.navigate(['/otp'], {
            queryParams: { email, purpose: 'VerifyEmail' },
          });
        },
      });
  }
  protected normalizeUsername(): void {
    const normalized = this.form.controls.username.value.trim();
    this.form.controls.username.setValue(normalized);
  }
}
