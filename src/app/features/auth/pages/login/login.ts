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
  imports: [ReactiveFormsModule, RouterLink, NgOptimizedImage, NzButtonModule, NzDividerModule, NzFormModule, NzIconModule, NzInputModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly fb = inject(FormBuilder); private readonly auth = inject(Auth); private readonly router = inject(Router); private readonly route = inject(ActivatedRoute); private readonly destroyRef = inject(DestroyRef);
  protected readonly busy = signal(false); protected readonly error = signal('');
  protected readonly form = this.fb.nonNullable.group({ email: ['', [Validators.required, Validators.email]], password: ['', [Validators.required, Validators.minLength(6)]] });
  protected submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true); this.error.set('');
    this.auth.login(this.form.getRawValue()).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({
      next: (result) => {
        if (result.otpRequired) { void this.router.navigate(['/otp'], { queryParams: { email: result.email, purpose: 'Login' } }); return; }
        void this.router.navigateByUrl(result.session.user.mustChangePassword ? '/change-password' : this.route.snapshot.queryParamMap.get('returnUrl') || '/dashboard');
      },
      error: (error: HttpErrorResponse) => this.error.set(error.status === 401 ? 'Email or password is incorrect.' : 'Sign in failed. Check the API connection and try again.'),
    });
  }
}
