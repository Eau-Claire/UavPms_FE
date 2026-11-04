import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MaintenanceTicket } from '../../../../models/maintenance.models';
import { isClosedStatus } from '../../data-access/maintenance-labels';

export type TimelineState = 'done' | 'current' | 'pending';

export interface TimelineStep {
  readonly key: string;
  readonly label: string;
  readonly at?: string;
  readonly detail?: string;
  readonly state: TimelineState;
}

const STATUS_ORDER: Record<string, number> = { Open: 0, InProgress: 1, PendingVerification: 2, Resolved: 3, Closed: 3 };

/** Builds the five MF04 steps of a ticket: created → assigned → repairing → awaiting verification → closed. */
export const buildTimeline = (ticket: MaintenanceTicket): readonly TimelineStep[] => {
  const stage = STATUS_ORDER[ticket.status] ?? 0;
  const assigned = Boolean(ticket.technicianId);
  const technicianName = ticket.technician?.fullName || ticket.technician?.email;
  const doneFlags = [true, assigned, stage >= 1, stage >= 2, isClosedStatus(ticket.status)];
  const firstOpen = doneFlags.indexOf(false);
  const steps: Omit<TimelineStep, 'state'>[] = [
    { key: 'created', label: 'Tạo phiếu', at: ticket.createdAt },
    { key: 'assigned', label: 'Giao kỹ thuật viên', at: ticket.assignedAt, detail: technicianName },
    { key: 'started', label: 'Bắt đầu sửa chữa', at: ticket.startedAt },
    { key: 'submitted', label: 'Gửi nghiệm thu', detail: ticket.proofs.length ? `${ticket.proofs.length} ảnh minh chứng` : undefined },
    { key: 'closed', label: 'Nghiệm thu & đóng phiếu', at: ticket.resolvedAt },
  ];
  return steps.map((step, index) => ({
    ...step,
    state: doneFlags[index] ? 'done' : index === firstOpen ? 'current' : 'pending',
  }));
};

@Component({
  selector: 'app-ticket-timeline',
  imports: [DatePipe],
  template: `
    <ol class="timeline">
      @for (step of steps(); track step.key) {
        <li class="timeline-step is-{{ step.state }}" [attr.aria-current]="step.state === 'current' ? 'step' : null">
          <span class="timeline-dot" aria-hidden="true"></span>
          <div class="timeline-body">
            <strong>{{ step.label }}</strong>
            <span class="sr-only">{{ step.state === 'done' ? '(đã xong)' : step.state === 'current' ? '(bước hiện tại)' : '(chưa tới)' }}</span>
            @if (step.at && step.state === 'done') { <span class="timeline-time">{{ step.at | date: 'dd/MM/yyyy HH:mm' }}</span> }
            @if (step.detail) { <span class="timeline-detail">{{ step.detail }}</span> }
          </div>
        </li>
      }
    </ol>
  `,
  styles: `
    :host { display: block; }
    .timeline { margin: 0; padding: 0; list-style: none; }
    .timeline-step { position: relative; display: flex; gap: 10px; padding: 0 0 14px; }
    .timeline-step:not(:last-child)::before { content: ''; position: absolute; top: 14px; bottom: 0; left: 6px; width: 2px; background: #e2e8f0; }
    .timeline-step.is-done:not(:last-child)::before { background: #16a34a; }
    .timeline-dot { flex: 0 0 auto; width: 14px; height: 14px; margin-top: 2px; border: 2px solid #94a3b8; border-radius: 50%; background: #ffffff; }
    .is-done .timeline-dot { border-color: #16a34a; background: #16a34a; }
    .is-current .timeline-dot { border-color: #1d4f91; box-shadow: 0 0 0 3px rgba(29, 79, 145, 0.18); }
    .timeline-body { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
    .timeline-body strong { color: #17324d; }
    .is-pending .timeline-body strong { color: #526b82; font-weight: 600; }
    .is-current .timeline-body strong { color: #10387d; }
    .timeline-time, .timeline-detail { color: #526b82; font-size: 12px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketTimeline {
  readonly ticket = input.required<MaintenanceTicket>();
  protected readonly steps = computed(() => buildTimeline(this.ticket()));
}
