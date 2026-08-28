import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgOptimizedImage } from '@angular/common';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Auth } from '../../auth/auth';

export interface NavLinkItem {
  readonly path: string;
  readonly icon: string;
  readonly label: string;
  readonly exact?: boolean;
}

@Component({
  selector: 'app-sidebar',
  host: { style: 'display: contents' },
  imports: [RouterLink, RouterLinkActive, NgOptimizedImage, NzIconModule],
  templateUrl: './sidebar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {
  private readonly auth = inject(Auth);

  readonly open = input(false);
  readonly closed = output<void>();

  protected readonly user = computed(() => this.auth.user());
  protected readonly role = computed(() => (this.user()?.role || '').toLowerCase());

  protected readonly primaryLinks = computed<readonly NavLinkItem[]>(() => {
    const currentRole = this.role();

    // 1. SystemAdmin / Admin
    if (currentRole === 'admin' || currentRole === 'systemadmin' || currentRole === 'administrator') {
      return [
        { path: '/admin/users', icon: 'team', label: 'Quản lý người dùng' },
        { path: '/dashboard', icon: 'dashboard', label: 'Tổng quan hệ thống' },
        { path: '/assets', icon: 'safety-certificate', label: 'Tài sản lưới điện' },
        { path: '/missions', icon: 'appstore', label: 'Nhiệm vụ bay' },
        { path: '/ai-review', icon: 'audit', label: 'Duyệt sự cố AI' },
        { path: '/reports', icon: 'file-text', label: 'Báo cáo' },
      ];
    }

    // 2. Manager / Supervisor
    if (currentRole === 'manager' || currentRole === 'supervisor') {
      return [
        { path: '/dashboard', icon: 'dashboard', label: 'Tổng quan' },
        { path: '/assets', icon: 'safety-certificate', label: 'Sức khỏe & Rủi ro' },
        { path: '/missions', icon: 'appstore', label: 'Quản lý nhiệm vụ' },
        { path: '/inspections', icon: 'file-text', label: 'Giám sát kiểm tra' },
        { path: '/ai-review', icon: 'audit', label: 'Duyệt sự cố AI' },
        { path: '/reports', icon: 'file-text', label: 'Báo cáo' },
      ];
    }

    // 3. Inspector (Pilot)
    if (currentRole === 'inspector' || currentRole === 'pilot') {
      return [
        { path: '/missions', icon: 'appstore', label: 'Nhiệm vụ của tôi' },
        { path: '/missions/new', icon: 'plus', label: 'Tạo nhiệm vụ mới' },
        { path: '/inspections', icon: 'file-text', label: 'Nhật ký & Log bay' },
        { path: '/assets', icon: 'safety-certificate', label: 'Thông tin cột điện' },
      ];
    }

    // 4. Analyst (AI Specialist)
    if (currentRole === 'analyst') {
      return [
        { path: '/ai-review', icon: 'audit', label: 'Duyệt sự cố AI' },
        { path: '/ai-analysis/upload', icon: 'experiment', label: 'Phân tích AI' },
        { path: '/inspections', icon: 'file-text', label: 'Ảnh kiểm tra' },
        { path: '/dashboard', icon: 'dashboard', label: 'Thống kê sự cố' },
        { path: '/assets', icon: 'safety-certificate', label: 'Sức khỏe thiết bị' },
      ];
    }

    // 5. Technician / MaintenanceTechnician
    if (currentRole === 'technician' || currentRole === 'maintenancetechnician') {
      return [
        { path: '/inspections', icon: 'file-text', label: 'Công việc & Sự cố' },
        { path: '/assets', icon: 'safety-certificate', label: 'Thông tin thiết bị' },
        { path: '/dashboard', icon: 'dashboard', label: 'Tổng quan' },
      ];
    }

    // Default / Viewer fallback
    return [
      { path: '/dashboard', icon: 'dashboard', label: 'Tổng quan' },
      { path: '/assets', icon: 'safety-certificate', label: 'Sức khỏe & Rủi ro' },
      { path: '/inspections', icon: 'file-text', label: 'Lịch sử kiểm tra' },
    ];
  });

  protected readonly secondaryLinks = computed<readonly NavLinkItem[]>(() => {
    const currentRole = this.role();
    if (currentRole === 'admin' || currentRole === 'systemadmin') {
      return [
        { path: '/system', icon: 'setting', label: 'Cấu hình hệ thống' },
        { path: '/inspections', icon: 'question-circle', label: 'Hỗ trợ' },
      ];
    }
    return [
      { path: '/inspections', icon: 'question-circle', label: 'Trợ giúp' },
    ];
  });
}
