import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { UserRole } from '../../../../core/auth/auth.models';
import { UsersApi } from '../../data-access/users-api';
import { UserRecord, UserStatus } from '../../data-access/users.models';

@Component({
  selector: 'app-user-management',
  imports: [ReactiveFormsModule],
  templateUrl: './user-management.html',
  styleUrl: './user-management.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserManagement {
  private readonly api = inject(UsersApi); private readonly fb = inject(FormBuilder); private readonly destroyRef = inject(DestroyRef);
  protected readonly users = signal<readonly UserRecord[]>([]); protected readonly loading = signal(true); protected readonly busy = signal(false); protected readonly error = signal(''); protected readonly search = signal(''); protected readonly modalOpen = signal(false); protected readonly credential = signal<{ username: string; temporaryPassword: string } | null>(null);
  protected readonly roles: readonly UserRole[] = ['Admin', 'Manager', 'Inspector', 'Technician', 'Analyst', 'Viewer'];
  protected readonly filteredUsers = computed(() => { const term = this.search().trim().toLowerCase(); return term ? this.users().filter((user) => `${user.fullName} ${user.email} ${user.username}`.toLowerCase().includes(term)) : this.users(); });
  protected readonly form = this.fb.nonNullable.group({ fullName: ['', Validators.required], email: ['', [Validators.required, Validators.email]], phone: '', role: ['Viewer' as UserRole, Validators.required] });
  constructor() { this.load(); }
  protected load(): void { this.loading.set(true); this.api.getAll().pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({ next: (users) => this.users.set(users), error: () => this.error.set('Users could not be loaded.') }); }
  protected create(): void { if (this.form.invalid) { this.form.markAllAsTouched(); return; } this.busy.set(true); this.api.create(this.form.getRawValue()).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({ next: (user) => { this.users.update((users) => [user, ...users]); this.form.reset({ fullName: '', email: '', phone: '', role: 'Viewer' }); this.modalOpen.set(false); }, error: () => this.error.set('User could not be created.') }); }
  protected changeStatus(user: UserRecord, status: UserStatus): void { this.api.update(user.id, { status }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (updated) => this.users.update((users) => users.map((item) => item.id === updated.id ? updated : item)), error: () => this.error.set('User status could not be updated.') }); }
  protected resetPassword(user: UserRecord): void { this.api.resetPassword(user.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (value) => this.credential.set(value), error: () => this.error.set('Password could not be reset.') }); }
  protected remove(user: UserRecord): void { if (!confirm(`Delete ${user.fullName}?`)) return; this.api.delete(user.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: () => this.users.update((users) => users.filter((item) => item.id !== user.id)), error: () => this.error.set('User could not be deleted.') }); }
}
