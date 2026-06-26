import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, output, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { AppNotification, NotificationReadFilter } from '../../../models/notification.models';
import { Auth } from '../../auth/auth';
import { NotificationsStore } from '../../../features/notifications/data-access/notifications-store';

@Component({
  selector: 'app-header',
  host: { style: 'display: contents' },
  imports: [NzIconModule],
  templateUrl: './header.html',
  styleUrl: './header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Header {
  private readonly auth = inject(Auth);
  protected readonly notifications = inject(NotificationsStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly path = signal(this.router.url);
  readonly menuOpened = output<void>();
  protected readonly user = this.auth.user;
  protected readonly menuOpen = signal(false);
  protected readonly notificationOpen = signal(false);
  protected readonly showAssetSearch = computed(() => this.path() === '/assets');
  constructor() {
    this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef)).subscribe((event) => this.path.set(event.urlAfterRedirects));
    effect(() => {
      const userId = this.user()?.id;
      if (userId) this.notifications.load(userId);
    });
  }
  protected logout(): void { this.auth.logout(); void this.router.navigate(['/login']); }
  protected toggleNotifications(): void { this.notificationOpen.update((value) => !value); this.menuOpen.set(false); }
  protected closeNotifications(): void { this.notificationOpen.set(false); this.notifications.clearSelection(); }
  protected selectNotification(notification: AppNotification): void { this.notifications.select(notification); }
  protected deleteNotification(event: Event, id: string): void { event.stopPropagation(); this.notifications.delete(id); }
  protected updateReadFilter(event: Event): void { this.notifications.setReadFilter(((event.target as HTMLSelectElement | null)?.value ?? 'all') as NotificationReadFilter); }
  protected updateTypeFilter(event: Event): void { this.notifications.setTypeFilter((event.target as HTMLSelectElement | null)?.value ?? ''); }
  protected updateQuery(event: Event): void { this.notifications.setQuery((event.target as HTMLInputElement | null)?.value ?? ''); }
  protected formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown time';
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }
}
