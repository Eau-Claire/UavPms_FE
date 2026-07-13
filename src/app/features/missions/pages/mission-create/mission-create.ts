import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { MissionsApi } from '../../data-access/missions-api';

const DEFAULT_ASSIGNEE_ID = '00000000-0000-0000-0000-000000000000';

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
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly priority = signal<'Thấp' | 'Trung bình' | 'Cao'>('Trung bình');
  protected readonly form = this.fb.nonNullable.group({
    title: ['', Validators.required],
    missionType: ['Khảo sát định kỳ', Validators.required],
    routeData: ['', Validators.required],
    plannedDate: ['', Validators.required],
    assignedToUserId: [DEFAULT_ASSIGNEE_ID, Validators.required],
    droneCode: [''],
    description: [''],
  });

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
      status: 'Pending',
      description: this.descriptionPayload(value),
    })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false)))
      .subscribe({
        next: (mission) => void this.router.navigate(['/missions', mission.id || '']),
        error: (error: unknown) => this.error.set(this.errorMessage(error)),
      });
  }

  private descriptionPayload(value: ReturnType<typeof this.form.getRawValue>): string {
    const lines = [
      `Loại nhiệm vụ: ${value.missionType}`,
      `Mức độ ưu tiên: ${this.priority()}`,
      `Ngày khảo sát dự kiến: ${value.plannedDate}`,
      value.description.trim(),
    ].filter(Boolean);
    return lines.join('\n');
  }

  private errorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return 'Không thể tạo nhiệm vụ.';
    const body = error.error && typeof error.error === 'object' ? error.error as Record<string, unknown> : {};
    return String(body['message'] ?? error.message ?? 'Không thể tạo nhiệm vụ.');
  }
}
