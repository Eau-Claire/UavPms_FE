import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { PreMissionApi } from '../../data-access/pre-mission-api';

function dateWindowValidator(control: AbstractControl): ValidationErrors | null {
  const start = control.get('plannedStart')?.value;
  const end = control.get('plannedEnd')?.value;
  if (!start || !end) return null;
  if (new Date(end) <= new Date(start)) {
    return { endBeforeStart: true };
  }
  return null;
}

@Component({
  selector: 'app-assessment-create',
  imports: [ReactiveFormsModule, RouterLink, NzIconModule],
  templateUrl: './assessment-create.html',
  styleUrl: './assessment-create.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssessmentCreate {
  private readonly api = inject(PreMissionApi);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly form = this.fb.nonNullable.group(
    {
      regionId: ['', [Validators.required, Validators.minLength(2)]],
      lineName: [''],
      scopeAssetIds: ['', [Validators.required]],
      plannedStart: ['', [Validators.required]],
      plannedEnd: ['', [Validators.required]],
    },
    { validators: [dateWindowValidator] }
  );

  protected readonly parsedAssetCount = computed(() => {
    // Reactive calculation of parsed asset IDs count
    return 0; // updated via form change if needed
  });

  protected get assetCount(): number {
    const val = this.form.controls.scopeAssetIds.value;
    if (!val) return 0;
    return val.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).length;
  }

  protected submit(): void {
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set('');

    const raw = this.form.getRawValue();
    const assetIds = raw.scopeAssetIds
      .split(/[,\n]/)
      .map((x) => x.trim())
      .filter(Boolean);

    if (assetIds.length === 0) {
      this.error.set('Vui lòng nhập ít nhất một mã vị trí/thiết bị cột điện (Asset ID).');
      this.busy.set(false);
      return;
    }

    this.api
      .create({
        regionId: raw.regionId.trim(),
        plannedStart: raw.plannedStart,
        plannedEnd: raw.plannedEnd,
        scopeAssetIds: assetIds,
      })
      .subscribe({
        next: (created) => {
          this.router.navigate(['/pre-mission', created.id]);
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(
            err?.error?.message ||
              'Không thể tạo đánh giá tiền nhiệm vụ. Vui lòng kiểm tra lại thông tin phạm vi và thời gian.'
          );
        },
      });
  }
}
