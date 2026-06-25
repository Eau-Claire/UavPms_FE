import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DefectStatistic } from '../../../../core/api/models/monitor.models';

@Component({
  selector: 'app-defect-statistics-chart',
  imports: [],
  templateUrl: './defect-statistics-chart.html',
  styleUrl: './defect-statistics-chart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DefectStatisticsChart {
  readonly data = input.required<readonly DefectStatistic[]>(); readonly total = computed(() => this.data().reduce((sum, item) => sum + item.count, 0));
  protected readonly colors = ['#20398b', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#64748b'];
  protected readonly gradient = computed(() => {
    const total = this.total(); if (!total) return '#e2e8f0'; let cursor = 0;
    return `conic-gradient(${this.data().map((item, index) => { const start = cursor; cursor += item.count / total * 100; return `${this.colors[index % this.colors.length]} ${start}% ${cursor}%`; }).join(',')})`;
  });
}
