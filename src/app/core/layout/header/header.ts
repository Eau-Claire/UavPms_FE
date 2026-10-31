import { ChangeDetectionStrategy, Component, computed, effect, inject, output, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { AppNotification, NotificationReadFilter, NotificationSort } from '../../../models/notification.models';
import { Auth } from '../../auth/auth';
import { isManagerRole, roleLabel } from '../../auth/roles';
import { NotificationsStore } from '../../../features/notifications/data-access/notifications-store';
import { FacilityItem, FacilityStore } from '../../facility/facility-store';
import { NotificationLink, notificationLink, referenceTypeLabel } from './notification-link';

@Component({
  selector: 'app-header',
  host: {
    style: 'display: contents',
    '(document:click)': 'handleDocumentClick($event)',
    '(document:keydown.escape)': 'onEscape()',
  },
  imports: [NzIconModule, RouterLink],
  templateUrl: './header.html',
  styleUrl: './header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Header {
  private readonly auth = inject(Auth);
  protected readonly notifications = inject(NotificationsStore);
  protected readonly facilityStore = inject(FacilityStore);
  private readonly router = inject(Router);
  readonly menuOpened = output<void>();
  protected readonly user = this.auth.user;
  protected readonly menuOpen = signal(false);
  protected readonly notificationOpen = signal(false);
  protected readonly notificationFiltersOpen = signal(false);
  protected readonly facilityMenuOpen = signal(false);

  protected readonly userDisplayName = computed(() => {
    const u = this.user();
    return u?.fullName || u?.email?.split('@')[0] || 'Người dùng';
  });
  protected readonly userRoleLabel = computed(() => roleLabel(this.user()?.role));
  /** The working-area picker is a manager tool; field roles work on what is assigned to them. */
  protected readonly showFacilitySelector = computed(() => isManagerRole(this.user()?.role));
  /** Link for the opened notification, or null when the role has no page for it. */
  protected readonly selectedLink = computed<NotificationLink | null>(() => {
    const selected = this.notifications.selected();
    return selected ? notificationLink(selected, this.user()?.role) : null;
  });
  protected readonly referenceTypeLabel = referenceTypeLabel;
  protected readonly groupedNotifications = computed(() => {
    const list = this.notifications.filteredNotifications();
    const groups: { dateLabel: string; items: AppNotification[] }[] = [];
    list.forEach((item) => {
      const date = new Date(item.createdAt);
      let label = 'Không rõ ngày';
      if (!Number.isNaN(date.getTime())) {
        label = new Intl.DateTimeFormat('vi', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).format(date);
      }
      let group = groups.find((g) => g.dateLabel === label);
      if (!group) {
        group = { dateLabel: label, items: [] };
        groups.push(group);
      }
      group.items.push(item);
    });
    return groups;
  });
  constructor() {
    effect(() => {
      const u = this.user();
      if (u) {
        this.notifications.connect(u.id);
        this.notifications.load(u.id, false);
      } else {
        this.notifications.disconnect();
      }
    });
  }
  protected logout(): void { this.notifications.disconnect(); this.auth.logout(); void this.router.navigate(['/login']); }
  protected toggleNotifications(): void {
    const nextOpen = !this.notificationOpen();
    this.notificationOpen.set(nextOpen);
    if (nextOpen) {
      this.menuOpen.set(false);
      this.facilityMenuOpen.set(false);
    }
  }
  protected closeNotifications(): void { this.notificationOpen.set(false); this.notificationFiltersOpen.set(false); this.notifications.clearSelection(); }

  protected toggleFacilityMenu(): void {
    const nextOpen = !this.facilityMenuOpen();
    this.facilityMenuOpen.set(nextOpen);
    if (nextOpen) {
      this.menuOpen.set(false);
      this.closeNotifications();
    }
  }

  protected closeFacilityMenu(): void {
    this.facilityMenuOpen.set(false);
  }

  protected chooseFacility(facility: FacilityItem): void {
    this.facilityStore.selectFacility(facility);
    this.facilityMenuOpen.set(false);
  }

  protected onEscape(): void {
    this.closeNotifications();
    this.closeFacilityMenu();
    this.menuOpen.set(false);
  }

  protected handleDocumentClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (this.notificationOpen() && !target.closest('.app-notification-wrap')) {
      this.closeNotifications();
    }
    if (this.facilityMenuOpen() && !target.closest('.app-facility-wrap')) {
      this.closeFacilityMenu();
    }
    if (this.menuOpen() && !target.closest('.app-profile-wrap')) {
      this.menuOpen.set(false);
    }
  }
  protected selectNotification(notification: AppNotification): void { this.notifications.select(notification); }
  protected deleteNotification(event: Event, id: string): void { event.stopPropagation(); this.notifications.delete(id); }
  protected updateReadFilter(event: Event): void { this.notifications.setReadFilter(((event.target as HTMLSelectElement | null)?.value ?? 'all') as NotificationReadFilter); }
  protected updateTypeFilter(event: Event): void { this.notifications.setTypeFilter((event.target as HTMLSelectElement | null)?.value ?? ''); }
  protected updateSortFilter(event: Event): void { this.notifications.setSortFilter(((event.target as HTMLSelectElement | null)?.value ?? 'newest') as NotificationSort); }
  protected formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Không rõ thời gian';
    return new Intl.DateTimeFormat('vi', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }
  protected markAllAsRead(): void {
    const unread = this.notifications.unreadNotifications();
    unread.forEach((item) => this.notifications.markRead(item.id));
  }
  protected resetNotifications(): void {
    this.notifications.setReadFilter('all');
    this.notifications.setTypeFilter('');
    this.notifications.setSortFilter('newest');
    const userId = this.user()?.id;
    if (userId) {
      this.notifications.load(userId);
    }
  }
}
