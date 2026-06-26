import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, interval } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { NgOptimizedImage } from '@angular/common';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';

@Component({
  selector: 'app-otp',
  imports: [ReactiveFormsModule, RouterLink, NgOptimizedImage, NzButtonModule, NzIconModule, NzInputModule],
  templateUrl: './otp.html',
  styleUrl: './otp.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Otp {
  private readonly otpDurationSeconds = 180;
  private readonly fb = inject(FormBuilder); private readonly auth = inject(Auth); private readonly route = inject(ActivatedRoute); private readonly router = inject(Router); private readonly destroyRef = inject(DestroyRef);
  protected readonly email = this.route.snapshot.queryParamMap.get('email') ?? ''; protected readonly purpose = this.route.snapshot.queryParamMap.get('purpose') ?? 'Login'; protected readonly busy = signal(false); protected readonly resendBusy = signal(false); protected readonly error = signal('');
  protected readonly digits = signal(['', '', '', '', '', '']);
  protected readonly remainingSeconds = signal(this.otpDurationSeconds);
  protected readonly countdown = computed(() => {
    const remaining = this.remainingSeconds();
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  });
  protected readonly form = this.fb.nonNullable.group({ otp: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]] });
  constructor() {
    interval(1000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.remainingSeconds() === 0) return;
      this.remainingSeconds.update((value) => Math.max(0, value - 1));
    });
  }
  protected updateDigit(index: number, event: Event): void { const input = event.target as HTMLInputElement; const digit = input.value.replace(/\D/g, '').slice(-1); this.digits.update((current) => current.map((value, position) => position === index ? digit : value)); this.form.controls.otp.setValue(this.digits().join('')); if (digit) (input.nextElementSibling as HTMLInputElement | null)?.focus(); }
  protected submit(): void { if (this.form.invalid) { this.form.markAllAsTouched(); return; } this.busy.set(true); this.error.set(''); this.auth.verifyOtp({ email: this.email, otp: this.form.controls.otp.value, purpose: this.purpose }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({ next: (result) => { if (result.authenticated) { void this.router.navigate(['/dashboard']); return; } void this.router.navigate(this.purpose === 'ForgotPassword' ? ['/reset-password'] : ['/login'], { queryParams: result.verificationToken ? { token: result.verificationToken } : undefined }); }, error: () => this.error.set('Code is invalid or expired.') }); }
  protected resendCode(): void {
    if (this.remainingSeconds() > 0 || this.resendBusy()) return;
    this.resendBusy.set(true);
    this.error.set('');
    this.auth.sendOtp({ email: this.email, purpose: this.purpose }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.resendBusy.set(false))).subscribe({
      next: () => {
        this.remainingSeconds.set(this.otpDurationSeconds);
        this.digits.set(['', '', '', '', '', '']);
        this.form.controls.otp.setValue('');
      },
      error: () => this.error.set('Could not resend code. Try again.'),
    });
  }
}
