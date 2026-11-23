import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MaintenanceTicket } from '../../../../models/maintenance.models';
import { DataState } from '../../../../shared/components/data-state/data-state';
import { DroneManagementApi } from '../../../drones/data-access/drone-management-api';
import { MaintenanceApi } from '../../../maintenance/data-access/maintenance-api';
import { maintenancePriorityLabel, maintenancePriorityTone } from '../../../maintenance/data-access/maintenance-labels';
import {
  DRONE_ATTENTION_LABELS,
  DroneAttentionItem,
  TechnicianTicketGroupKey,
  dronesNeedingAttention,
  groupTechnicianTickets,
  isTicketOverdue,
} from '../../data-access/field-dashboard';
import { pollResource } from '../../data-access/polled-resource';
import { FieldHomeHeader } from '../field-home-header/field-home-header';
import { PersonalAlertsCard } from '../personal-alerts-card/personal-alerts-card';

interface TicketGroupView {
  readonly key: TechnicianTicketGroupKey;
  readonly title: string;
  readonly empty: string;
  readonly action: string;
  readonly items: readonly MaintenanceTicket[];
}

const DRONE_PREVIEW = 8;

/** "Việc của tôi" for Technician / MaintenanceTechnician: my maintenance tickets and drones needing a technical check. */
@Component({
  selector: 'app-technician-home',
  imports: [DatePipe, RouterLink, DataState, FieldHomeHeader, PersonalAlertsCard],
  templateUrl: './technician-home.html',
  styleUrl: './technician-home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TechnicianHome {
  private readonly maintenanceApi = inject(MaintenanceApi);
  private readonly droneApi = inject(DroneManagementApi);
  private readonly alertsCard = viewChild(PersonalAlertsCard);

  protected readonly tickets = pollResource(() => this.maintenanceApi.mine(), {
    errorMessage: 'Không thể tải phiếu bảo trì của bạn.',
  });
  protected readonly drones = pollResource(() => this.droneApi.getDrones(), {
    errorMessage: 'Không thể tải danh sách UAV.',
  });

  protected readonly loading = computed(() => this.tickets.loading() || this.drones.loading());
  protected readonly loadedAt = computed(() => {
    const times = [this.tickets.loadedAt(), this.drones.loadedAt()].filter((t): t is number => t !== null);
    return times.length ? Math.max(...times) : null;
  });

  /** Reference time for "overdue", taken when the tickets were last loaded. */
  private readonly now = computed(() => this.tickets.loadedAt() ?? Date.now());
  protected readonly groups = computed(() => groupTechnicianTickets(this.tickets.value() ?? [], this.now()));

  protected readonly sections = computed((): readonly TicketGroupView[] => {
    const g = this.groups();
    return [
      { key: 'Open', title: 'Chờ xử lý', empty: 'Không có phiếu nào chờ xử lý.', action: 'Bắt đầu xử lý', items: g.Open },
      { key: 'InProgress', title: 'Đang sửa chữa', empty: 'Không có phiếu đang sửa chữa.', action: 'Cập nhật tiến độ', items: g.InProgress },
      { key: 'PendingVerification', title: 'Chờ nghiệm thu', empty: 'Không có phiếu chờ nghiệm thu.', action: 'Xem phiếu', items: g.PendingVerification },
    ];
  });

  protected readonly attention = computed(() => dronesNeedingAttention(this.drones.value() ?? []));
  protected readonly attentionPreview = computed(() => this.attention().slice(0, DRONE_PREVIEW));

  protected readonly priorityLabel = maintenancePriorityLabel;
  protected readonly priorityTone = maintenancePriorityTone;

  protected isOverdue(ticket: MaintenanceTicket): boolean {
    return isTicketOverdue(ticket, this.now());
  }

  protected attentionLabel(item: DroneAttentionItem): string {
    return DRONE_ATTENTION_LABELS[item.reason];
  }

  protected attentionTone(item: DroneAttentionItem): string {
    return item.reason === 'Critical' ? 'danger' : item.reason === 'Warning' ? 'warning' : 'neutral';
  }

  protected refresh(): void {
    this.tickets.refresh();
    this.drones.refresh();
    this.alertsCard()?.refresh();
  }
}
