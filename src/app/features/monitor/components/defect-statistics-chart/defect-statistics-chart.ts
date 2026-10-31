import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DefectStatistic } from '../../../../models/monitor.models';

@Component({
  selector: 'app-defect-statistics-chart',
  imports: [],
  templateUrl: './defect-statistics-chart.html',
  styleUrl: './defect-statistics-chart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DefectStatisticsChart {
  readonly data = input.required<readonly DefectStatistic[]>();
  readonly total = computed(() => this.data().reduce((sum, item) => sum + item.count, 0));
  protected readonly colors = ['#10387d', '#1d4f91', '#2862a5', '#3978bb', '#508ecd', '#64748b'];
  protected readonly gradient = computed(() => {
    const total = this.total();
    if (!total) return '#e2e8f0';
    let cursor = 0;
    return `conic-gradient(${this.data()
      .map((item, index) => {
        const start = cursor;
        cursor += (item.count / total) * 100;
        return `${this.colors[index % this.colors.length]} ${start}% ${cursor}%`;
      })
      .join(',')})`;
  });
}
