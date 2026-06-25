import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { UserRecord, UserStatus } from '../../../../models/users.models';
import { UserRole } from '../../../../models/auth.models';
import { UsersApi } from '../../data-access/users-api';

@Component({ selector: 'app-user-management', imports: [ReactiveFormsModule, NzIconModule], templateUrl: './user-management.html', styleUrl: './user-management.scss', encapsulation: ViewEncapsulation.None, changeDetection: ChangeDetectionStrategy.OnPush })
export class UserManagement {
  private readonly api = inject(UsersApi); private readonly fb = inject(FormBuilder); private readonly destroyRef = inject(DestroyRef);
  protected readonly users = signal<readonly UserRecord[]>([]); protected readonly loading = signal(true); protected readonly busy = signal(false); protected readonly error = signal(''); protected readonly search = signal(''); protected readonly roleFilter = signal<UserRole | ''>(''); protected readonly statusFilter = signal<UserStatus | ''>(''); protected readonly modalOpen = signal(false); protected readonly editing = signal<UserRecord | null>(null); protected readonly credential = signal<{ username: string; temporaryPassword: string } | null>(null);
  protected readonly roles: readonly UserRole[] = ['Admin', 'Manager', 'Inspector', 'Technician', 'Analyst', 'Viewer']; protected readonly statuses: readonly UserStatus[] = ['Active', 'Inactive', 'Locked'];
  protected readonly filteredUsers = computed(() => { const term = this.search().trim().toLowerCase(); return this.users().filter((user) => (!term || `${user.fullName} ${user.email} ${user.username}`.toLowerCase().includes(term)) && (!this.roleFilter() || user.role === this.roleFilter()) && (!this.statusFilter() || user.status === this.statusFilter())); });
  protected readonly form = this.fb.nonNullable.group({ fullName: ['', Validators.required], email: ['', [Validators.required, Validators.email]], phone: '', role: ['Viewer' as UserRole, Validators.required] });
  constructor() { this.load(); }
  protected load(): void { this.loading.set(true); this.api.getAll().pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({ next: (users) => this.users.set(users), error: () => this.error.set('Users could not be loaded.') }); }
  protected openCreate(): void { this.editing.set(null); this.form.reset({ fullName: '', email: '', phone: '', role: 'Viewer' }); this.modalOpen.set(true); }
  protected openEdit(user: UserRecord): void { this.editing.set(user); this.form.reset({ fullName: user.fullName, email: user.email, phone: user.phone ?? '', role: user.role }); this.modalOpen.set(true); }
  protected closeModal(): void { this.modalOpen.set(false); this.editing.set(null); }
  protected save(): void { const current = this.editing(); if (current) { this.changeRole(current); } else { this.create(); } }
  private create(): void { if (this.form.invalid) { this.form.markAllAsTouched(); return; } this.busy.set(true); this.api.create(this.form.getRawValue()).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({ next: (user) => { this.users.update((users) => [user, ...users]); this.closeModal(); }, error: () => this.error.set('User could not be created.') }); }
  private changeRole(user: UserRecord): void { this.busy.set(true); this.api.update(user.id, { role: this.form.controls.role.value }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({ next: (updated) => { this.users.update((users) => users.map((item) => item.id === updated.id ? updated : item)); this.closeModal(); }, error: () => this.error.set('User could not be updated.') }); }
  protected changeStatus(user: UserRecord, status: UserStatus): void { this.api.update(user.id, { status }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (updated) => this.users.update((users) => users.map((item) => item.id === updated.id ? updated : item)), error: () => this.error.set('User status could not be updated.') }); }
  protected resetPassword(user: UserRecord): void { this.api.resetPassword(user.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (value) => this.credential.set(value), error: () => this.error.set('Password could not be reset.') }); }
  protected roleClass(role: UserRole): string { return `role-${role.toLowerCase()}`; } protected statusClass(status: UserStatus): string { return `status-${status.toLowerCase()}`; }
  protected roleLabel(role: UserRole): string { return ({ Admin: 'Quáº£n trá»‹ viÃªn', Manager: 'Quáº£n lÃ½', Inspector: 'Thanh tra', Technician: 'Ká»¹ thuáº­t viÃªn', Analyst: 'PhÃ¢n tÃ­ch viÃªn', Viewer: 'NgÆ°á»i xem' } as const)[role]; }
  protected statusLabel(status: UserStatus): string { return ({ Active: 'Hoáº¡t Ä‘á»™ng', Inactive: 'KhÃ´ng hoáº¡t Ä‘á»™ng', Locked: 'ÄÃ£ khÃ³a' } as const)[status]; }
}

