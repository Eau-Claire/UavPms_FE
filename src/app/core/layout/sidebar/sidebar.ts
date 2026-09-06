import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgOptimizedImage } from '@angular/common';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Auth } from '../../auth/auth';
import { EmergencyAlertsApi } from '../../../features/emergency-alerts/data-access/emergency-alerts-api';

export interface NavLinkItem {
  readonly path: string;
  readonly icon: string;
  readonly label: string;
  readonly exact?: boolean;
  readonly badgeCount?: number;
}

@Component({
  selector: 'app-sidebar',
  host: { style: 'display: contents' },
  imports: [RouterLink, RouterLinkActive, NgOptimizedImage, NzIconModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {
  private readonly auth = inject(Auth);
  private readonly alertsApi = inject(EmergencyAlertsApi);

  readonly open = input(false);
  readonly closed = output<void>();

  protected readonly user = computed(() => this.auth.user());
  protected readonly role = computed(() => (this.user()?.role || '').toLowerCase());
  protected readonly activeAlertCount = computed(() => this.alertsApi.activeCount());

  protected readonly primaryLinks = computed<readonly NavLinkItem[]>(() => {
    const currentRole = this.role();
    const alertCount = this.activeAlertCount();

    // 1. SystemAdmin / Admin
    if (currentRole === 'admin' || currentRole === 'systemadmin' || currentRole === 'administrator') {
      return [
        { path: '/admin/users', icon: 'team', label: 'Qu?n l� ngu?i d�ng' },
        { path: '/dashboard', icon: 'dashboard', label: 'T?ng quan h? th?ng' },
        { path: '/emergency-alerts', icon: 'alert', label: 'C?nh B�o Kh?n C?p', badgeCount: alertCount },
        { path: '/gis', icon: 'environment', label: 'B?n d? GIS Lu?i di?n' },
        { path: '/assets', icon: 'safety-certificate', label: 'T�i s?n lu?i di?n' },
        { path: '/missions', icon: 'appstore', label: 'Nhi?m v? bay' },
        { path: '/ai-review', icon: 'audit', label: 'Duy?t s? c? AI' },
        { path: '/reports', icon: 'file-text', label: 'B�o c�o' },
      ];
    }

    // 2. Manager / Supervisor
    if (currentRole === 'manager' || currentRole === 'supervisor') {
      return [
        { path: '/dashboard', icon: 'dashboard', label: 'T?ng quan' },
        { path: '/emergency-alerts', icon: 'alert', label: 'C?nh B�o Kh?n C?p', badgeCount: alertCount },
        { path: '/gis', icon: 'environment', label: 'B?n d? GIS Lu?i di?n' },
        { path: '/assets', icon: 'safety-certificate', label: 'S?c kh?e & R?i ro' },
        { path: '/missions', icon: 'appstore', label: 'Qu?n l� nhi?m v?' },
        { path: '/inspections', icon: 'file-text', label: 'Gi�m s�t ki?m tra' },
        { path: '/ai-review', icon: 'audit', label: 'Duy?t s? c? AI' },
        { path: '/reports', icon: 'file-text', label: 'B�o c�o' },
      ];
    }

    // 3. Inspector (Pilot)
    if (currentRole === 'inspector' || currentRole === 'pilot') {
      return [
        { path: '/missions', icon: 'appstore', label: 'Nhi?m v? c?a t�i' },
        { path: '/missions/new', icon: 'plus', label: 'T?o nhi?m v? m?i' },
        { path: '/gis', icon: 'environment', label: 'B?n d? GIS Lu?i di?n' },
        { path: '/inspections', icon: 'file-text', label: 'Nh?t k� & Log bay' },
        { path: '/assets', icon: 'safety-certificate', label: 'Th�ng tin c?t di?n' },
      ];
    }

    // 4. Analyst (AI Specialist)
    if (currentRole === 'analyst') {
      return [
        { path: '/emergency-alerts', icon: 'alert', label: 'C?nh B�o Kh?n C?p', badgeCount: alertCount },
        { path: '/ai-review', icon: 'audit', label: 'Duy?t s? c? AI' },
        { path: '/gis', icon: 'environment', label: 'B?n d? GIS Lu?i di?n' },
        { path: '/ai-analysis/upload', icon: 'experiment', label: 'Ph�n t�ch AI' },
        { path: '/inspections', icon: 'file-text', label: '?nh ki?m tra' },
        { path: '/dashboard', icon: 'dashboard', label: 'Th?ng k� s? c?' },
        { path: '/assets', icon: 'safety-certificate', label: 'S?c kh?e thi?t b?' },
      ];
    }

    // 5. Technician / MaintenanceTechnician
    if (currentRole === 'technician' || currentRole === 'maintenancetechnician') {
      return [
        { path: '/inspections', icon: 'file-text', label: 'C�ng vi?c & S? c?' },
        { path: '/gis', icon: 'environment', label: 'B?n d? GIS' },
        { path: '/assets', icon: 'safety-certificate', label: 'Th�ng tin thi?t b?' },
        { path: '/dashboard', icon: 'dashboard', label: 'T?ng quan' },
      ];
    }

    // Default / Viewer fallback
    return [
      { path: '/dashboard', icon: 'dashboard', label: 'T?ng quan' },
      { path: '/gis', icon: 'environment', label: 'B?n d? GIS' },
      { path: '/assets', icon: 'safety-certificate', label: 'S?c kh?e & R?i ro' },
      { path: '/inspections', icon: 'file-text', label: 'L?ch s? ki?m tra' },
    ];
  });

  protected readonly secondaryLinks = computed<readonly NavLinkItem[]>(() => {
    const currentRole = this.role();
    if (currentRole === 'admin' || currentRole === 'systemadmin') {
      return [
        { path: '/system', icon: 'setting', label: 'C?u h�nh h? th?ng' },
        { path: '/inspections', icon: 'question-circle', label: 'H? tr?' },
      ];
    }
    return [
      { path: '/inspections', icon: 'question-circle', label: 'Tr? gi�p' },
    ];
  });
}
