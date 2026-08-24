import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgOptimizedImage } from '@angular/common';
import { NzIconModule } from 'ng-zorro-antd/icon';

@Component({
  selector: 'app-sidebar',
  host: { style: 'display: contents' },
  imports: [RouterLink, RouterLinkActive, NgOptimizedImage, NzIconModule],
  templateUrl: './sidebar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {
  readonly open = input(false);
  readonly closed = output<void>();
  protected readonly primaryLinks = [
    { path: '/dashboard', icon: 'dashboard', label: 'Tổng quan' },
    { path: '/admin/users', icon: 'team', label: 'Quản lý người dùng' },
    { path: '/missions', icon: 'appstore', label: 'Nhiệm vụ' },
    { path: '/reports', icon: 'file-text', label: 'Báo cáo' },
  ];
  protected readonly secondaryLinks = [
    { path: '/system', icon: 'setting', label: 'Hệ thống' },
    { path: '/inspections', icon: 'question-circle', label: 'Hỗ trợ' },
  ];
}
