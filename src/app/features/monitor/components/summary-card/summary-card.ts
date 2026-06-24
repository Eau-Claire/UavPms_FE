import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-summary-card',
  imports: [],
  templateUrl: './summary-card.html',
  styleUrl: './summary-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SummaryCard {
  readonly label = input.required<string>(); readonly value = input.required<number>(); readonly icon = input('•'); readonly tone = input<'blue' | 'amber' | 'green' | 'red' | 'violet'>('blue'); readonly note = input('Live total');
}
