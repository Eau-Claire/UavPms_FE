import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../../../core/auth/auth';
import { Mission, missionStatusLabel, normalizeMissionStatus } from '../../../../models/missions.models';
import { DataState } from '../../../../shared/components/data-state/data-state';
import { MissionsApi } from '../../../missions/data-access/missions-api';
import { InspectorGroupKey, groupInspectorMissions, inspectorMissionLink, myResponseStatus } from '../../data-access/field-dashboard';
import { pollResource } from '../../data-access/polled-resource';
import { FieldHomeHeader } from '../field-home-header/field-home-header';
import { PersonalAlertsCard } from '../personal-alerts-card/personal-alerts-card';

interface MissionGroupView {
  readonly key: InspectorGroupKey;
  readonly title: string;
  readonly empty: string;
  readonly action: string;
  readonly items: readonly Mission[];
  readonly total: number;
}

type Tone = 'info' | 'warning' | 'danger' | 'success' | 'neutral';

const STATUS_TONES: Record<string, Tone> = {
  PendingAcceptance: 'warning',
  Assigned: 'info',
  Preparing: 'info',
  Ready: 'success',
  InProgress: 'danger',
  Suspended: 'warning',
  Postponed: 'warning',
  Completed: 'success',
};

/** "Việc của tôi" for Inspector / Pilot: my missions grouped by what I have to do next (`GET /missions/my`). */
@Component({
  selector: 'app-inspector-home',
  imports: [DatePipe, RouterLink, DataState, FieldHomeHeader, PersonalAlertsCard],
  templateUrl: './inspector-home.html',
  styleUrl: './inspector-home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InspectorHome {
  private readonly missionsApi = inject(MissionsApi);
  private readonly auth = inject(Auth);
  private readonly alertsCard = viewChild(PersonalAlertsCard);

  protected readonly missions = pollResource(() => this.missionsApi.my(), {
    errorMessage: 'Không thể tải danh sách nhiệm vụ của bạn.',
  });

  private readonly userId = computed(() => this.auth.user()?.id ?? null);
  protected readonly groups = computed(() => groupInspectorMissions(this.missions.value() ?? [], this.userId()));

  protected readonly sections = computed((): readonly MissionGroupView[] => {
    const g = this.groups();
    const sections: MissionGroupView[] = [
      { key: 'awaiting', title: 'Chờ tôi xác nhận', empty: 'Không có nhiệm vụ nào chờ bạn xác nhận.', action: 'Xem và xác nhận', items: g.awaiting, total: g.awaiting.length },
      { key: 'upcoming', title: 'Sắp bay', empty: 'Chưa có chuyến bay sắp tới.', action: 'Chuẩn bị bay', items: g.upcoming, total: g.upcoming.length },
      { key: 'flying', title: 'Đang bay', empty: 'Không có nhiệm vụ đang bay.', action: 'Tiếp tục nhiệm vụ', items: g.flying, total: g.flying.length },
    ];
    if (g.paused.length) {
      sections.push({ key: 'paused', title: 'Tạm hoãn / đình chỉ', empty: '', action: 'Xem chi tiết', items: g.paused, total: g.paused.length });
    }
    sections.push({ key: 'completed', title: 'Hoàn thành gần đây', empty: 'Chưa có nhiệm vụ hoàn thành.', action: 'Xem kết quả', items: g.completed, total: g.completedTotal });
    return sections;
  });

  protected readonly statusLabel = missionStatusLabel;
  protected readonly link = inspectorMissionLink;

  protected statusTone(status: string): Tone {
    return STATUS_TONES[normalizeMissionStatus(status)] ?? 'neutral';
  }

  protected plannedStart(mission: Mission): string | null {
    return mission.plannedStart ?? mission.scheduledStartAt ?? null;
  }

  protected iPostponed(mission: Mission): boolean {
    return myResponseStatus(mission, this.userId()) === 'POSTPONED';
  }

  protected refresh(): void {
    this.missions.refresh();
    this.alertsCard()?.refresh();
  }
}
