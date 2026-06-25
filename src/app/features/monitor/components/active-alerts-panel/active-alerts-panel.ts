import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MonitorAlert } from '../../../../core/api/models/monitor.models';

@Component({
  selector: 'app-active-alerts-panel',
  imports: [DatePipe],
  templateUrl: './active-alerts-panel.html',
  styleUrl: './active-alerts-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActiveAlertsPanel {
  readonly alerts = input.required<readonly MonitorAlert[]>(); readonly limit = input(5);
}
