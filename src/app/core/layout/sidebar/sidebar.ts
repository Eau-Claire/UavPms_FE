import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgOptimizedImage } from '@angular/common';
import { NzIconModule } from 'ng-zorro-antd/icon';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, NgOptimizedImage, NzIconModule],
  templateUrl: './sidebar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {
  readonly open = input(false);
  readonly closed = output<void>();
  protected readonly primaryLinks = [
    { path: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { path: '/admin/users', icon: 'team', label: 'User Management' },
    { path: '/assets', icon: 'database', label: 'Asset Management' },
    { path: '/missions', icon: 'appstore', label: 'Missions' },
    { path: '/reports', icon: 'file-text', label: 'Reports' },
  ];
  protected readonly secondaryLinks = [
    { path: '/system', icon: 'setting', label: 'System' },
    { path: '/inspections', icon: 'question-circle', label: 'Support' },
  ];
}
