import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, output, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Auth } from '../../auth/auth';
import { roleFamily, RoleFamily } from '../../auth/roles';
import { EmergencyAlertsApi } from '../../../features/emergency-alerts/data-access/emergency-alerts-api';

export interface NavLinkItem {
  readonly path: string;
  readonly icon: string;
  readonly label: string;
  readonly exact?: boolean;
  readonly badgeCount?: number;
}

const EMERGENCY_ALERTS_PATH = '/emergency-alerts';

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
    { path: '/ai-review', icon: 'audit', label: 'Duyệt khuyết tật' },
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
    { path: '/ai-review', icon: 'audit', label: 'Duyệt khuyết tật' },
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
    { path: EMERGENCY_ALERTS_PATH, icon: 'exclamation-circle', label: 'Cảnh báo khẩn cấp' },
    { path: '/ai-review', icon: 'audit', label: 'Duyệt khuyết tật' },
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
  admin: [{ path: '/system/audit-logs', icon: 'history', label: 'Nhật ký hệ thống' }],
  manager: [{ path: '/system/audit-logs', icon: 'history', label: 'Nhật ký hệ thống' }],
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
  private readonly alertsApi = inject(EmergencyAlertsApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly open = input(false);
  readonly closed = output<void>();

  protected readonly family = computed(() => roleFamily(this.auth.user()?.role));
  protected readonly activeAlertCount = computed(() => this.alertsApi.activeCount());
  private readonly showsAlerts = computed(() => PRIMARY_LINKS[this.family()].some((item) => item.path === EMERGENCY_ALERTS_PATH));

  protected readonly primaryLinks = computed<readonly NavLinkItem[]>(() => {
    const links = PRIMARY_LINKS[this.family()];
    const alertCount = this.activeAlertCount();
    return links.map((item) => (item.path === EMERGENCY_ALERTS_PATH ? { ...item, badgeCount: alertCount } : item));
  });

  protected readonly secondaryLinks = computed<readonly NavLinkItem[]>(() => SECONDARY_LINKS[this.family()]);

  constructor() {
    // The badge needs `GET /alerts/active` (SystemAdmin, Manager, Analyst): load it once for a role whose menu shows the link.
    let loadedFor: RoleFamily | null = null;
    effect(() => {
      const family = this.family();
      if (!this.showsAlerts() || loadedFor === family) return;
      loadedFor = family;
      untracked(() =>
        this.alertsApi
          .fetchActiveAlerts()
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({ error: () => undefined }),
      );
    });
  }
}
