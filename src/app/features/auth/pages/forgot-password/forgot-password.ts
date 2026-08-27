import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { NgOptimizedImage } from '@angular/common';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, NgOptimizedImage, NzButtonModule, NzFormModule, NzIconModule, NzInputModule],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPassword {
  private readonly fb = inject(FormBuilder); private readonly auth = inject(Auth); private readonly router = inject(Router); private readonly destroyRef = inject(DestroyRef);
  protected readonly busy = signal(false); protected readonly error = signal(''); protected readonly form = this.fb.nonNullable.group({ email: ['', [Validators.required, Validators.email]] });
  protected emailError(): string {
    const email = this.form.controls.email;
    if (!email.touched || !email.invalid) return '';
    if (email.hasError('required')) return 'Email không được để trống';
    if (email.hasError('email')) return 'Email không đúng định dạng';
    return '';
  }
  protected normalizeEmail(): void {
    const normalized = this.form.controls.email.value.trim();
    this.form.controls.email.setValue(normalized);
  }
  protected submit(): void { this.normalizeEmail(); if (this.form.invalid) { this.form.markAllAsTouched(); return; } this.busy.set(true); this.error.set(''); const email = this.form.controls.email.value; this.auth.sendOtp({ email, purpose: 'ForgotPassword' }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({ next: () => void this.router.navigate(['/otp'], { queryParams: { email, purpose: 'ForgotPassword' } }), error: () => this.error.set('OTP could not be sent. Try again.') }); }
}
