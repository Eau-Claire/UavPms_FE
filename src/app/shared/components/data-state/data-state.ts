import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-data-state',
  imports: [],
  templateUrl: './data-state.html',
  styleUrl: './data-state.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataState {
  readonly kind = input.required<'loading' | 'error' | 'empty'>();
  readonly title = input(''); readonly message = input(''); readonly retry = output<void>();
}
