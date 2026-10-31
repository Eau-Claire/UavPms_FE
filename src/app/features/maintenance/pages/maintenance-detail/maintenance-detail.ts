import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { catchError, finalize, map, Observable, of, Subject, switchMap, tap } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { MaintenanceProof, MaintenanceTicket, MaterialLog } from '../../../../models/maintenance.models';
import { DataState } from '../../../../shared/components/data-state/data-state';
import { ConfirmDialog } from '../../../towers/components/confirm-dialog/confirm-dialog';
import { AssignTechnician } from '../../components/assign-technician/assign-technician';
import { DefectImage } from '../../components/defect-image/defect-image';
import { MaterialForm } from '../../components/material-form/material-form';
import { ProofUpload } from '../../components/proof-upload/proof-upload';
import { TicketTimeline } from '../../components/ticket-timeline/ticket-timeline';
import { MaintenanceApi, maintenanceErrorMessage, maintenanceErrorStatus } from '../../data-access/maintenance-api';
import {
  isClosedStatus,
  isMaintenanceManager,
  isMaintenanceTechnician,
  maintenancePriorityLabel,
  maintenancePriorityTone,
  maintenanceStatusLabel,
  maintenanceStatusTone,
} from '../../data-access/maintenance-labels';

export type TicketAction = 'start' | 'submit' | 'close';

interface ActionConfig {
  readonly title: string;
  readonly message: string;
  readonly label: string;
  readonly success: string;
}

const ACTIONS: Record<TicketAction, ActionConfig> = {
  start: {
    title: 'Bắt đầu sửa chữa',
    message: 'Chuyển phiếu sang trạng thái "Đang sửa chữa"? Sau khi bắt đầu không thể đổi kỹ thuật viên.',
    label: 'Bắt đầu sửa chữa',
    success: 'Đã chuyển phiếu sang "Đang sửa chữa".',
  },
  submit: {
    title: 'Gửi nghiệm thu',
    message: 'Gửi phiếu cho quản lý nghiệm thu? Hãy chắc chắn đã tải đủ ảnh minh chứng và ghi nhận vật tư.',
    label: 'Gửi nghiệm thu',
    success: 'Đã gửi phiếu chờ nghiệm thu.',
  },
  close: {
    title: 'Nghiệm thu & đóng phiếu',
    message: 'Xác nhận công việc đạt yêu cầu và đóng phiếu? Khuyết tật liên quan sẽ được đánh dấu "Đã khắc phục".',
    label: 'Nghiệm thu & đóng phiếu',
    success: 'Đã nghiệm thu và đóng phiếu. Khuyết tật được đánh dấu đã khắc phục.',
  },
};

/** `/maintenance/:id`: ticket detail with the MF04 workflow actions allowed for the current role. */
@Component({
  selector: 'app-maintenance-detail',
  imports: [DatePipe, DecimalPipe, RouterLink, NzIconModule, DataState, ConfirmDialog, AssignTechnician, DefectImage, MaterialForm, ProofUpload, TicketTimeline],
  templateUrl: './maintenance-detail.html',
  styleUrl: './maintenance-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaintenanceDetail {
  private readonly api = inject(MaintenanceApi);
  private readonly auth = inject(Auth);
  private readonly destroyRef = inject(DestroyRef);
  private readonly request$ = new Subject<string>();

  /** Route parameter (bound through withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly statusLabel = maintenanceStatusLabel;
  protected readonly statusTone = maintenanceStatusTone;
  protected readonly priorityLabel = maintenancePriorityLabel;
  protected readonly priorityTone = maintenancePriorityTone;

  protected readonly ticket = signal<MaintenanceTicket | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly notFound = signal(false);
  protected readonly notice = signal<{ readonly tone: 'success' | 'error'; readonly text: string } | null>(null);
  protected readonly pendingAction = signal<TicketAction | null>(null);
  protected readonly actionBusy = signal(false);
  protected readonly actionError = signal('');
  /** Captured on load: templates must not read the clock. */
  protected readonly loadedAt = signal(Date.now());

  private readonly role = computed(() => this.auth.user()?.role);
  protected readonly isManager = computed(() => isMaintenanceManager(this.role()));
  protected readonly isTechnician = computed(() => isMaintenanceTechnician(this.role()));
  protected readonly isAssignedTechnician = computed(() => {
    const ticket = this.ticket();
    const userId = this.auth.user()?.id;
    return this.isTechnician() && Boolean(ticket?.technicianId && userId) && ticket?.technicianId === userId;
  });

  private readonly status = computed(() => this.ticket()?.status ?? '');
  protected readonly isClosed = computed(() => isClosedStatus(this.status()));
  protected readonly hasProof = computed(() => (this.ticket()?.proofs.length ?? 0) > 0);
  /** Backend EnsureTechnicianOrAdminAccess: Manager/Admin, or the technician the ticket is assigned to. */
  protected readonly canWork = computed(() => this.isManager() || this.isAssignedTechnician());
  protected readonly canAssign = computed(() => this.isManager() && this.status() === 'Open');
  protected readonly canStart = computed(() => this.canWork() && this.status() === 'Open');
  protected readonly canSubmit = computed(() => this.canWork() && this.status() === 'InProgress');
  protected readonly canClose = computed(() => this.isManager() && this.status() === 'PendingVerification');
  protected readonly canAddEvidence = computed(() => this.canWork() && (this.status() === 'InProgress' || this.status() === 'PendingVerification'));
  protected readonly hasActions = computed(() => this.canAssign() || this.canStart() || this.canSubmit() || this.canClose());

  protected readonly missionId = computed(() => this.ticket()?.anomaly?.missionId);
  protected readonly towerId = computed(() => this.ticket()?.tower?.id ?? this.ticket()?.towerId);
  protected readonly isOverdue = computed(() => {
    const ticket = this.ticket();
    return Boolean(ticket?.dueDate) && !this.isClosed() && new Date(ticket?.dueDate as string).getTime() < this.loadedAt();
  });
  protected readonly actionConfig = computed(() => {
    const action = this.pendingAction();
    return action ? ACTIONS[action] : null;
  });

  constructor() {
    this.request$
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.error.set('');
          this.notFound.set(false);
          this.loadedAt.set(Date.now());
        }),
        switchMap((id) =>
          this.api.get(id).pipe(
            map((ticket) => ({ ticket, status: 0, error: '' })),
            catchError((error: unknown) => of({ ticket: null, status: maintenanceErrorStatus(error), error: maintenanceErrorMessage(error, 'Không thể tải phiếu bảo trì.') })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ ticket, status, error }) => {
        this.loading.set(false);
        if (ticket) {
          this.ticket.set(ticket);
          return;
        }
        this.notFound.set(status === 404);
        this.error.set(error);
      });

    effect(() => {
      const id = this.id();
      untracked(() => {
        this.ticket.set(null);
        this.notice.set(null);
        this.load(id);
      });
    });
  }

  protected load(id = this.id()): void {
    this.request$.next(id);
  }

  protected ask(action: TicketAction): void {
    this.actionError.set('');
    this.pendingAction.set(action);
  }

  protected cancelAction(): void {
    if (!this.actionBusy()) this.pendingAction.set(null);
  }

  protected runAction(): void {
    const action = this.pendingAction();
    const ticket = this.ticket();
    if (!action || !ticket || this.actionBusy()) return;
    const request$: Observable<MaintenanceTicket> =
      action === 'close' ? this.api.close(ticket.id) : this.api.updateStatus(ticket.id, action === 'start' ? 'InProgress' : 'PendingVerification');
    this.actionBusy.set(true);
    this.actionError.set('');
    request$.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.actionBusy.set(false))).subscribe({
      next: () => {
        this.pendingAction.set(null);
        this.notice.set({ tone: 'success', text: ACTIONS[action].success });
        this.load();
      },
      error: (error: unknown) => this.actionError.set(maintenanceErrorMessage(error, `Không thể thực hiện "${ACTIONS[action].label}".`)),
    });
  }

  protected onAssigned(): void {
    this.notice.set({ tone: 'success', text: 'Đã giao kỹ thuật viên cho phiếu. Kỹ thuật viên sẽ nhận được thông báo.' });
    this.load();
  }

  protected onProofUploaded(proof: MaintenanceProof): void {
    this.ticket.update((ticket) => (ticket ? { ...ticket, proofs: [...ticket.proofs, proof] } : ticket));
  }

  protected onMaterialLogged(material: MaterialLog): void {
    this.ticket.update((ticket) => (ticket ? { ...ticket, materials: [...ticket.materials, material] } : ticket));
  }

  protected personName(person: { readonly fullName: string; readonly email: string } | undefined): string {
    return person ? person.fullName || person.email : '';
  }
}
