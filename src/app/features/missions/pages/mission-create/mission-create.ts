import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Auth } from '../../../../core/auth/auth';
import { UserRecord } from '../../../../models/users.models';
import { UsersApi } from '../../../users/data-access/users-api';
import { MissionsApi } from '../../data-access/missions-api';

@Component({
  selector: 'app-mission-create',
  imports: [ReactiveFormsModule, RouterLink, NzIconModule],
  templateUrl: './mission-create.html',
  styleUrl: './mission-create.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionCreate {
  private readonly api = inject(MissionsApi);
  private readonly auth = inject(Auth);
  private readonly usersApi = inject(UsersApi);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly busy = signal(false);
  protected readonly usersLoading = signal(false);
  protected readonly error = signal('');
  protected readonly users = signal<readonly UserRecord[]>([]);
  protected readonly currentUser = this.auth.user;
  protected readonly form = this.fb.nonNullable.group({
    title: ['', Validators.required],
    routeData: ['', Validators.required],
    assignedToUserId: ['', Validators.required],
    droneCode: [''],
    status: ['Pending', Validators.required],
    description: [''],
  });

  constructor() {
    const currentUserId = this.currentUser()?.id ?? '';
    if (currentUserId) this.form.controls.assignedToUserId.setValue(currentUserId);
    this.loadUsers();
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');
    this.api.create({
      title: value.title.trim(),
      routeData: value.routeData.trim(),
      assignedToUserId: value.assignedToUserId,
      droneCode: value.droneCode.trim(),
      status: value.status,
      description: value.description.trim(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false)))
      .subscribe({
        next: (mission) => void this.router.navigate(mission.id ? ['/missions', mission.id] : ['/missions']),
        error: (error: unknown) => this.error.set(this.errorMessage(error)),
      });
  }

  private loadUsers(): void {
    this.usersLoading.set(true);
    this.usersApi.getAssignable()
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.usersLoading.set(false)))
      .subscribe({
        next: (users) => {
          this.users.set(users);
          const selected = this.form.controls.assignedToUserId.value;
          if (!selected && users[0]) this.form.controls.assignedToUserId.setValue(users[0].id);
        },
        error: () => {
          const currentUserId = this.currentUser()?.id ?? '';
          if (!this.form.controls.assignedToUserId.value && currentUserId) this.form.controls.assignedToUserId.setValue(currentUserId);
        },
      });
  }

  private errorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return 'Không thể tạo nhiệm vụ.';
    const body = error.error && typeof error.error === 'object' ? error.error as Record<string, unknown> : {};
    const errors = body['errors'] && typeof body['errors'] === 'object' ? Object.values(body['errors'] as Record<string, unknown>).flat().find(Boolean) : '';
    return String(errors || body['message'] || error.message || 'Không thể tạo nhiệm vụ.');
  }
}
