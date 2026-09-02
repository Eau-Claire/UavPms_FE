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
import { MissionTargetSelection } from '../../data-access/mission-target-selection';

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
  protected readonly targetSelection = inject(MissionTargetSelection);

  protected readonly busy = signal(false);
  protected readonly usersLoading = signal(false);
  protected readonly error = signal('');
  protected readonly users = signal<readonly UserRecord[]>([]);
  protected readonly currentUser = this.auth.user;
  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    scheduledAt: ['', Validators.required],
    inspectorId: ['', Validators.required],
    droneId: ['', Validators.required],
    description: [''],
  });

  constructor() {
    const currentUserId = this.currentUser()?.id ?? '';
    if (currentUserId) this.form.controls.inspectorId.setValue(currentUserId);
    this.loadUsers();
  }

  protected save(): void {
    if (this.form.invalid || !this.targetSelection.count()) {
      this.form.markAllAsTouched();
      if (!this.targetSelection.count()) this.error.set('Vui lòng chọn ít nhất một tài sản mục tiêu trên bản đồ GIS.');
      return;
    }
    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');
    this.api.create({
      name: value.name.trim(),
      scheduledAt: new Date(value.scheduledAt).toISOString(),
      inspectorId: value.inspectorId,
      droneId: value.droneId.trim(),
      description: value.description.trim(),
      targetAssetIds: this.targetSelection.selected().map((asset) => asset.assetId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false)))
      .subscribe({
        next: (mission) => { this.targetSelection.clear(); void this.router.navigate(mission.id ? ['/missions', mission.id] : ['/missions']); },
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
          const selected = this.form.controls.inspectorId.value;
          if (!selected && users[0]) this.form.controls.inspectorId.setValue(users[0].id);
        },
        error: () => {
          const currentUserId = this.currentUser()?.id ?? '';
          if (!this.form.controls.inspectorId.value && currentUserId) this.form.controls.inspectorId.setValue(currentUserId);
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
