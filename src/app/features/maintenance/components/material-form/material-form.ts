import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { MaterialLog } from '../../../../models/maintenance.models';
import { MaintenanceApi, maintenanceErrorMessage } from '../../data-access/maintenance-api';

const notBlank = Validators.pattern(/\S/);

/** Logs one replaced component: POST /maintenance/tickets/{id}/materials. */
@Component({
  selector: 'app-material-form',
  imports: [ReactiveFormsModule],
  templateUrl: './material-form.html',
  styleUrl: './material-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialForm {
  private readonly api = inject(MaintenanceApi);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly ticketId = input.required<string>();
  readonly logged = output<MaterialLog>();

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly status = signal('');

  protected readonly form = this.fb.nonNullable.group({
    componentName: ['', [Validators.required, notBlank, Validators.maxLength(200)]],
    componentCode: ['', Validators.maxLength(100)],
    quantityUsed: [1, [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)]],
    unit: ['', [Validators.required, notBlank, Validators.maxLength(50)]],
    fieldObservations: ['', Validators.maxLength(1000)],
  });

  protected showError(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  protected submit(): void {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');
    this.status.set('');
    this.api
      .logMaterial(this.ticketId(), { ...value, quantityUsed: Number(value.quantityUsed) })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false)))
      .subscribe({
        next: (material) => {
          this.form.reset();
          this.status.set(`Đã ghi nhận vật tư ${material.componentName || value.componentName}.`);
          this.logged.emit(material);
        },
        error: (error: unknown) => this.error.set(maintenanceErrorMessage(error, 'Không thể ghi nhận vật tư.')),
      });
  }
}
