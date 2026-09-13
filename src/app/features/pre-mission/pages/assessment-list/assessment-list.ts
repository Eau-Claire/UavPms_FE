import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { PreMissionApi } from '../../data-access/pre-mission-api';
import { PreMissionAssessment } from '../../../../models/pre-mission.models';
import { statusLabel, statusTone } from '../../../../shared/status/status';

@Component({ selector: 'app-assessment-list', imports: [RouterLink, DatePipe], templateUrl: './assessment-list.html', styleUrl: './assessment-list.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class AssessmentList {
  private readonly api = inject(PreMissionApi); protected readonly loading = signal(true); protected readonly error = signal(''); protected readonly items = signal<readonly PreMissionAssessment[]>([]); protected readonly statusTone = statusTone; protected readonly statusLabel = statusLabel;
  constructor() { this.load(); }
  protected load(): void { this.loading.set(true); this.api.list().subscribe({ next: (page) => this.items.set(page.items), error: () => this.error.set('Không tải được danh sách đánh giá tiền nhiệm vụ.'), complete: () => this.loading.set(false) }); }
}
