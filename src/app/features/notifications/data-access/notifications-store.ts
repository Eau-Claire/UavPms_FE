import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { AppNotification, NotificationFilters, NotificationReadFilter } from '../../../models/notification.models';
import { NotificationsApi } from './notifications-api';

@Injectable({
  providedIn: 'root',
})
export class NotificationsStore {
  private readonly api = inject(NotificationsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notificationsState = signal<readonly AppNotification[]>([]);
  private readonly selectedState = signal<AppNotification | null>(null);

  readonly loading = signal(false);
  readonly detailLoading = signal(false);
  readonly deletingId = signal('');
  readonly error = signal('');
  readonly filters = signal<NotificationFilters>({ read: 'all', type: '', query: '' });
  readonly notifications = this.notificationsState.asReadonly();
  readonly selected = this.selectedState.asReadonly();
  readonly unreadCount = computed(() => this.notificationsState().filter((item) => !item.isRead).length);
  readonly types = computed(() => Array.from(new Set(this.notificationsState().map((item) => item.type).filter(Boolean))).sort() as string[]);
  readonly filteredNotifications = computed(() => {
    const filters = this.filters();
    const query = filters.query.trim().toLowerCase();
    return this.notificationsState().filter((item) => {
      const readMatch =
        filters.read === 'all' ||
        (filters.read === 'read' && item.isRead) ||
        (filters.read === 'unread' && !item.isRead);
      const typeMatch = !filters.type || item.type === filters.type;
      const queryMatch = !query || `${item.title} ${item.body} ${item.type ?? ''}`.toLowerCase().includes(query);
      return readMatch && typeMatch && queryMatch;
    });
  });

  load(userId?: string): void {
    this.loading.set(true);
    this.error.set('');
    this.api
      .getHistory(userId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (items) => this.notificationsState.set(sortNewest(items)),
        error: () => this.error.set('Notifications could not be loaded.'),
      });
  }

  select(notification: AppNotification): void {
    this.detailLoading.set(true);
    this.error.set('');
    this.api
      .getById(notification.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.detailLoading.set(false)),
      )
      .subscribe({
        next: (detail) => {
          const merged = { ...notification, ...detail };
          this.selectedState.set(merged);
          this.upsert(merged);
          if (!merged.isRead) this.markRead(merged.id);
        },
        error: () => {
          this.selectedState.set(notification);
          if (!notification.isRead) this.markRead(notification.id);
        },
      });
  }

  clearSelection(): void {
    this.selectedState.set(null);
  }

  setReadFilter(read: NotificationReadFilter): void {
    this.filters.update((value) => ({ ...value, read }));
  }

  setTypeFilter(type: string): void {
    this.filters.update((value) => ({ ...value, type }));
  }

  setQuery(query: string): void {
    this.filters.update((value) => ({ ...value, query }));
  }

  markRead(id: string): void {
    this.api
      .markRead(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => this.upsert({ ...updated, id, isRead: true }),
        error: () => this.patch(id, { isRead: true }),
      });
  }

  delete(id: string): void {
    this.deletingId.set(id);
    this.api
      .delete(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.deletingId.set('')),
      )
      .subscribe({
        next: () => {
          this.notificationsState.update((items) => items.filter((item) => item.id !== id));
          if (this.selectedState()?.id === id) this.selectedState.set(null);
        },
        error: () => this.error.set('Notification could not be deleted.'),
      });
  }

  private patch(id: string, patch: Partial<AppNotification>): void {
    this.notificationsState.update((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    if (this.selectedState()?.id === id) this.selectedState.update((item) => (item ? { ...item, ...patch } : item));
  }

  private upsert(notification: AppNotification): void {
    this.notificationsState.update((items) => {
      const exists = items.some((item) => item.id === notification.id);
      return sortNewest(exists ? items.map((item) => (item.id === notification.id ? notification : item)) : [notification, ...items]);
    });
    if (this.selectedState()?.id === notification.id) this.selectedState.set(notification);
  }
}

const sortNewest = (items: readonly AppNotification[]) =>
  [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
