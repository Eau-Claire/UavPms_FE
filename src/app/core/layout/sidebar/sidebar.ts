import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Auth } from '../../auth/auth';
import { roleFamily, RoleFamily } from '../../auth/roles';

export interface NavLinkItem {
  readonly path: string;
  readonly icon: string;
  readonly label: string;
  readonly exact?: boolean;
}

const AI_REVIEW_PATH = '/ai-review';

/**
 * Main menu per role family. Field roles only get pages whose route guard and backend API accept them,
 * so every link opens a working page (no 403).
 */
export const PRIMARY_LINKS: Record<RoleFamily, readonly NavLinkItem[]> = {
  admin: [
    { path: '/dashboard', icon: 'dashboard', label: 'Trang chủ' },
    { path: '/gis', icon: 'environment', label: 'Bản đồ GIS' },
    { path: '/towers', icon: 'thunderbolt', label: 'Cột điện' },
    { path: '/missions', icon: 'appstore', label: 'Nhiệm vụ bay' },
    { path: '/pre-mission', icon: 'file-protect', label: 'Đánh giá tiền bay' },
    { path: '/drones', icon: 'rocket', label: 'Phương tiện UAV' },
    { path: AI_REVIEW_PATH, icon: 'audit', label: 'Duyệt khuyết tật' },
    { path: '/ai-analysis/upload', icon: 'cloud-upload', label: 'Kiểm tra dữ liệu AI' },
    { path: '/maintenance', icon: 'tool', label: 'Phiếu bảo trì' },
    { path: '/inspections', icon: 'file-text', label: 'Lịch sử kiểm tra' },
    { path: '/reports', icon: 'file-text', label: 'Báo cáo' },
    { path: '/admin/users', icon: 'team', label: 'Người dùng' },
  ],
  manager: [
    { path: '/dashboard', icon: 'dashboard', label: 'Trang chủ' },
    { path: '/gis', icon: 'environment', label: 'Bản đồ GIS' },
    { path: '/towers', icon: 'thunderbolt', label: 'Cột điện' },
    { path: '/missions', icon: 'appstore', label: 'Nhiệm vụ bay' },
    { path: '/pre-mission', icon: 'file-protect', label: 'Đánh giá tiền bay' },
    { path: '/drones', icon: 'rocket', label: 'Phương tiện UAV' },
    { path: AI_REVIEW_PATH, icon: 'audit', label: 'Duyệt khuyết tật' },
    { path: '/maintenance', icon: 'tool', label: 'Phiếu bảo trì' },
    { path: '/inspections', icon: 'file-text', label: 'Lịch sử kiểm tra' },
    { path: '/reports', icon: 'file-text', label: 'Báo cáo' },
    { path: '/admin/users', icon: 'team', label: 'Phân quyền khu vực' },
  ],
  inspector: [
    { path: '/dashboard', icon: 'dashboard', label: 'Trang chủ' },
    { path: '/missions', icon: 'appstore', label: 'Nhiệm vụ của tôi' },
    { path: '/gis', icon: 'environment', label: 'Bản đồ GIS' },
    { path: '/towers', icon: 'thunderbolt', label: 'Cột điện' },
    { path: '/inspections', icon: 'history', label: 'Lịch sử kiểm tra' },
    { path: '/reports', icon: 'file-text', label: 'Báo cáo' },
  ],
  analyst: [
    { path: '/dashboard', icon: 'dashboard', label: 'Trang chủ' },
    { path: AI_REVIEW_PATH, icon: 'audit', label: 'Duyệt khuyết tật' },
    { path: '/ai-analysis/upload', icon: 'cloud-upload', label: 'Kiểm tra dữ liệu độc lập' },
    { path: '/missions', icon: 'appstore', label: 'Nhiệm vụ của tôi' },
    { path: '/gis', icon: 'environment', label: 'Bản đồ GIS' },
    { path: '/towers', icon: 'thunderbolt', label: 'Cột điện' },
    { path: '/inspections', icon: 'history', label: 'Lịch sử kiểm tra' },
    { path: '/reports', icon: 'file-text', label: 'Báo cáo' },
  ],
  technician: [
    { path: '/dashboard', icon: 'dashboard', label: 'Trang chủ' },
    { path: '/maintenance', icon: 'tool', label: 'Phiếu bảo trì của tôi' },
    { path: '/drones', icon: 'rocket', label: 'Phương tiện UAV' },
    { path: '/pre-mission', icon: 'file-protect', label: 'Đánh giá tiền bay' },
    { path: '/missions', icon: 'appstore', label: 'Nhiệm vụ của tôi' },
    { path: '/gis', icon: 'environment', label: 'Bản đồ GIS' },
    { path: '/towers', icon: 'thunderbolt', label: 'Cột điện' },
    { path: '/reports', icon: 'file-text', label: 'Báo cáo' },
  ],
  other: [
    { path: '/dashboard', icon: 'dashboard', label: 'Trang chủ' },
    { path: '/towers', icon: 'thunderbolt', label: 'Cột điện' },
    { path: '/missions', icon: 'appstore', label: 'Nhiệm vụ bay' },
    { path: '/inspections', icon: 'history', label: 'Lịch sử kiểm tra' },
    { path: '/reports', icon: 'file-text', label: 'Báo cáo' },
  ],
};

/** Extra links shown in the mobile drawer: only pages that exist and that the role may open. */
export const SECONDARY_LINKS: Record<RoleFamily, readonly NavLinkItem[]> = {
  admin: [
    { path: '/system/audit-logs', icon: 'history', label: 'Nhật ký hệ thống' },
    { path: '/system/settings', icon: 'setting', label: 'Cấu hình hệ thống' },
  ],
  manager: [
    { path: '/system/audit-logs', icon: 'history', label: 'Nhật ký hệ thống' },
  ],
  inspector: [],
  analyst: [],
  technician: [],
  other: [],
};

@Component({
  selector: 'app-sidebar',
  host: { style: 'display: contents' },
  imports: [RouterLink, RouterLinkActive, NzIconModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {
  private readonly auth = inject(Auth);

  readonly open = input(false);
  readonly closed = output<void>();

  protected readonly family = computed(() => roleFamily(this.auth.user()?.role));

  protected readonly primaryLinks = computed<readonly NavLinkItem[]>(() => PRIMARY_LINKS[this.family()]);

  protected readonly secondaryLinks = computed<readonly NavLinkItem[]>(() => SECONDARY_LINKS[this.family()]);
}
