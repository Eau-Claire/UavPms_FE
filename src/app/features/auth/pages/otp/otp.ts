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
  private readonly resendCooldownSeconds = 30;
  private readonly fb = inject(FormBuilder); private readonly auth = inject(Auth); private readonly route = inject(ActivatedRoute); private readonly router = inject(Router); private readonly destroyRef = inject(DestroyRef);
  protected readonly email = this.route.snapshot.queryParamMap.get('email') ?? ''; protected readonly purpose = this.route.snapshot.queryParamMap.get('purpose') ?? 'Login'; protected readonly busy = signal(false); protected readonly resendBusy = signal(false); protected readonly error = signal('');
  protected readonly digits = signal(['', '', '', '', '', '']);
  protected readonly remainingSeconds = signal(this.otpDurationSeconds);
  protected readonly resendRemainingSeconds = signal(this.resendCooldownSeconds);
  protected readonly countdown = computed(() => {
    const remaining = this.remainingSeconds();
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  });
  protected readonly form = this.fb.nonNullable.group({ otp: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]] });
  constructor() {
    interval(1000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.remainingSeconds.update((value) => Math.max(0, value - 1));
      this.resendRemainingSeconds.update((value) => Math.max(0, value - 1));
    });
  }
  protected updateDigit(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const digit = input.value.replace(/\D/g, '').slice(-1);
    this.setDigit(index, digit);
    input.value = digit;
    if (digit) this.focusInput(input, 1);
  }
  protected handleDigitKeydown(index: number, event: KeyboardEvent): void {
    const input = event.target as HTMLInputElement;
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (this.digits()[index]) {
        this.setDigit(index, '');
        input.value = '';
      } else if (index > 0) {
        this.setDigit(index - 1, '');
        this.focusInput(input, -1);
      }
      return;
    }
    if (event.key === 'Delete') {
      event.preventDefault();
      this.setDigit(index, '');
      input.value = '';
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.focusInput(input, -1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.focusInput(input, 1);
    }
  }
  protected handlePaste(index: number, event: ClipboardEvent): void {
    const pasted = event.clipboardData?.getData('text').replace(/\D/g, '').slice(0, 6 - index) ?? '';
    if (!pasted) return;
    event.preventDefault();
    const next = [...this.digits()];
    pasted.split('').forEach((digit, offset) => next[index + offset] = digit);
    this.setDigits(next);
    const input = event.target as HTMLInputElement;
    this.focusInput(input, Math.min(pasted.length, 5 - index));
  }
  protected submit(): void { if (this.form.invalid) { this.form.markAllAsTouched(); return; } this.busy.set(true); this.error.set(''); this.auth.verifyOtp({ email: this.email, otp: this.form.controls.otp.value, purpose: this.purpose }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({ next: (result) => { if (result.authenticated) { void this.router.navigate(['/dashboard']); return; } void this.router.navigate(this.purpose === 'ForgotPassword' ? ['/reset-password'] : ['/login'], { queryParams: result.verificationToken ? { token: result.verificationToken } : undefined }); }, error: () => this.error.set('Code is invalid or expired.') }); }
  protected resendCode(): void {
    if (this.resendRemainingSeconds() > 0 || this.resendBusy()) return;
    if (!this.email) {
      this.error.set('Email is missing. Go back and request a new code.');
      return;
    }
    this.resendBusy.set(true);
    this.error.set('');
    this.auth.sendOtp({ email: this.email, purpose: this.purpose }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.resendBusy.set(false))).subscribe({
      next: () => {
        this.remainingSeconds.set(this.otpDurationSeconds);
        this.resendRemainingSeconds.set(this.resendCooldownSeconds);
        this.digits.set(['', '', '', '', '', '']);
        this.form.controls.otp.setValue('');
      },
      error: (err: unknown) => {
        const retrySeconds = this.extractRetrySeconds(err);
        if (retrySeconds) {
          this.resendRemainingSeconds.set(retrySeconds);
          return;
        }
        this.error.set('Could not resend code. Try again.');
      },
    });
  }
  private setDigit(index: number, digit: string): void {
    const next = this.digits().map((value, position) => position === index ? digit : value);
    this.setDigits(next);
  }
  private setDigits(next: string[]): void {
    this.digits.set(next);
    this.form.controls.otp.setValue(next.join(''));
  }
  private focusInput(input: HTMLInputElement, offset: number): void {
    const inputs = Array.from(input.parentElement?.querySelectorAll<HTMLInputElement>('.otp-input') ?? []);
    const index = inputs.indexOf(input);
    const next = inputs[index + offset];
    if (next) {
      next.focus();
      next.select();
    }
  }
  private formatDuration(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  private extractRetrySeconds(error: unknown): number | null {
    const source = error as { error?: { message?: unknown } | string; message?: unknown };
    const message = typeof source.error === 'string'
      ? source.error
      : String(source.error?.message ?? source.message ?? '');
    const match = message.match(/wait\s+(\d+)\s+seconds/i);
    return match ? Number(match[1]) : null;
  }
}
