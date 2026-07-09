import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MissionStatus } from '../../../../models/monitor.models';

@Component({
  selector: 'app-mission-status-overview',
  imports: [],
  templateUrl: './mission-status-overview.html',
  styleUrl: './mission-status-overview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionStatusOverview {
  readonly data = input.required<readonly MissionStatus[]>(); readonly total = computed(() => this.data().reduce((sum, item) => sum + item.count, 0));
  protected percent(count: number): number { return this.total() ? Math.round(count / this.total() * 100) : 0; }
  protected label(status: string): string { return status.replace(/([a-z])([A-Z])/g, '$1 $2'); }
}

