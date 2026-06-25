import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Pagination } from '../../../../shared/components/pagination/pagination';
import { PagedResponse, RecentDefect } from '../../../../models/monitor.models';

@Component({
  selector: 'app-recent-defects-table',
  imports: [DatePipe, Pagination],
  templateUrl: './recent-defects-table.html',
  styleUrl: './recent-defects-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecentDefectsTable {
  readonly data = input.required<PagedResponse<RecentDefect>>(); readonly pageChanged = output<number>();
}

