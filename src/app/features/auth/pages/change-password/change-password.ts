import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';

@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule],
  templateUrl: './change-password.html',
  styleUrl: './change-password.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangePassword {
  private readonly fb = inject(FormBuilder); private readonly auth = inject(Auth); private readonly router = inject(Router); private readonly destroyRef = inject(DestroyRef);
  protected readonly busy = signal(false); protected readonly error = signal(''); protected readonly form = this.fb.nonNullable.group({ password: ['', [Validators.required, Validators.minLength(8)]], confirm: ['', Validators.required] });
  protected submit(): void { const value = this.form.getRawValue(); if (this.form.invalid || value.password !== value.confirm) { this.error.set('Passwords must match and contain at least 8 characters.'); return; } this.busy.set(true); this.auth.changePassword(value.password).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({ next: () => void this.router.navigate(['/dashboard']), error: () => this.error.set('Password could not be changed.') }); }
}
