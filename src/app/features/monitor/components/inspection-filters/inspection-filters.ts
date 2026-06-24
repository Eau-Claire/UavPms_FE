import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { InspectionFilters as Filters } from '../../data-access/monitor.models';

@Component({
  selector: 'app-inspection-filters',
  imports: [ReactiveFormsModule],
  templateUrl: './inspection-filters.html',
  styleUrl: './inspection-filters.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InspectionFilters {
  private readonly fb = inject(FormBuilder); readonly filtersChanged = output<Filters>();
  protected readonly form = this.fb.nonNullable.group({ missionId: '', defectStatus: 'all', fromDate: '', toDate: '' });
  protected apply(): void { const value = this.form.getRawValue(); this.filtersChanged.emit({ missionId: value.missionId.trim(), isDefect: value.defectStatus === 'all' ? null : value.defectStatus === 'defect', fromDate: value.fromDate, toDate: value.toDate, page: 1, pageSize: 10 }); }
  protected clear(): void { this.form.reset(); this.apply(); }
}
