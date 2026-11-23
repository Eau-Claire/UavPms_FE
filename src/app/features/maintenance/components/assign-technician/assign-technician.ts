import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { MaintenanceTicket, TechnicianSummary } from '../../../../models/maintenance.models';
import { MaintenanceApi, maintenanceErrorMessage } from '../../data-access/maintenance-api';

/** Local calendar day as yyyy-MM-dd. */
export const localDay = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const notInPast = (control: AbstractControl<string>): ValidationErrors | null =>
  control.value && control.value < localDay(new Date()) ? { past: true } : null;

/** Manager/Admin form to (re)assign a technician to an Open ticket: PUT /maintenance/tickets/{id}/assign. */
@Component({
  selector: 'app-assign-technician',
  imports: [DatePipe, ReactiveFormsModule],
  templateUrl: './assign-technician.html',
  styleUrl: './assign-technician.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssignTechnician {
  private readonly api = inject(MaintenanceApi);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly ticket = input.required<MaintenanceTicket>();
  readonly assigned = output<MaintenanceTicket>();

  protected readonly technicians = signal<readonly TechnicianSummary[]>([]);
  protected readonly loadingTechnicians = signal(true);
  protected readonly loadError = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly minDate = localDay(new Date());

  protected readonly form = this.fb.nonNullable.group({
    technicianId: ['', Validators.required],
    dueDate: ['', notInPast],
  });

  protected readonly isReassign = computed(() => Boolean(this.ticket().technicianId));

  constructor() {
    effect(() => {
      const ticket = this.ticket();
      untracked(() => {
        this.form.reset({ technicianId: ticket.technicianId ?? '', dueDate: '' });
        this.error.set('');
      });
    });
    this.loadTechnicians();
  }

  protected loadTechnicians(): void {
    this.loadingTechnicians.set(true);
    this.loadError.set('');
    this.api.technicians().pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loadingTechnicians.set(false))).subscribe({
      next: (technicians) => this.technicians.set(technicians),
      error: (error: unknown) => this.loadError.set(maintenanceErrorMessage(error, 'Không thể tải danh sách kỹ thuật viên.')),
    });
  }

  protected technicianLabel(technician: TechnicianSummary): string {
    const name = technician.fullName || technician.email;
    return `${name} — ${technician.activeTicketCount} phiếu chưa đóng`;
  }

  protected submit(): void {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    const { technicianId, dueDate } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');
    this.api
      .assign(this.ticket().id, { technicianId, dueDate: dueDate || undefined })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false)))
      .subscribe({
        next: (ticket) => this.assigned.emit(ticket),
        error: (error: unknown) => this.error.set(maintenanceErrorMessage(error, 'Không thể giao kỹ thuật viên.')),
      });
  }
}
