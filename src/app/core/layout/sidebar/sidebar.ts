import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {
  readonly open = input(false);
  readonly closed = output<void>();
  protected readonly primaryLinks = [
    { path: '/dashboard', icon: '▦', label: 'Dashboard' },
    { path: '/inspections', icon: '⌁', label: 'Inspection history' },
    { path: '/assets', icon: '◇', label: 'Asset management' },
    { path: '/missions', icon: '◫', label: 'Missions' },
    { path: '/reports', icon: '▥', label: 'Reports' },
  ];
}
