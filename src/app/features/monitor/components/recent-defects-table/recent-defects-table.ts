import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Pagination } from '../../../../shared/components/pagination/pagination';
import { PagedResponse, RecentDefect } from '../../../../models/monitor.models';

@Component({
  selector: 'app-recent-defects-table',
  imports: [DatePipe, RouterLink, Pagination],
  templateUrl: './recent-defects-table.html',
  styleUrl: './recent-defects-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecentDefectsTable {
  readonly data = input.required<PagedResponse<RecentDefect>>();
  readonly pageChanged = output<number>();

  onImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.style.display = 'none';
      const parent = target.parentElement;
      if (parent && !parent.querySelector('.no-image')) {
        const fallback = document.createElement('span');
        fallback.className = 'no-image';
        fallback.textContent = 'Không ảnh';
        parent.appendChild(fallback);
      }
    }
  }
}
