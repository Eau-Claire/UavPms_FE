import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
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
  private readonly fb = inject(FormBuilder); private readonly auth = inject(Auth); private readonly route = inject(ActivatedRoute); private readonly router = inject(Router); private readonly destroyRef = inject(DestroyRef);
  protected readonly email = this.route.snapshot.queryParamMap.get('email') ?? ''; protected readonly purpose = this.route.snapshot.queryParamMap.get('purpose') ?? 'Login'; protected readonly busy = signal(false); protected readonly error = signal('');
  protected readonly digits = signal(['', '', '', '', '', '']);
  protected readonly form = this.fb.nonNullable.group({ otp: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]] });
  protected updateDigit(index: number, event: Event): void { const input = event.target as HTMLInputElement; const digit = input.value.replace(/\D/g, '').slice(-1); this.digits.update((current) => current.map((value, position) => position === index ? digit : value)); this.form.controls.otp.setValue(this.digits().join('')); if (digit) (input.nextElementSibling as HTMLInputElement | null)?.focus(); }
  protected submit(): void { if (this.form.invalid) { this.form.markAllAsTouched(); return; } this.busy.set(true); this.error.set(''); this.auth.verifyOtp({ email: this.email, otp: this.form.controls.otp.value, purpose: this.purpose }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({ next: (result) => { if (result.authenticated) { void this.router.navigate(['/dashboard']); return; } void this.router.navigate(this.purpose === 'ForgotPassword' ? ['/reset-password'] : ['/login'], { queryParams: result.verificationToken ? { token: result.verificationToken } : undefined }); }, error: () => this.error.set('Code is invalid or expired.') }); }
}
