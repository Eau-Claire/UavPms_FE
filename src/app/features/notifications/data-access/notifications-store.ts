import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { Auth } from '../../../core/auth/auth';
import { AppNotification, NotificationFilters, NotificationReadFilter, NotificationSort } from '../../../models/notification.models';
import { NotificationsApi } from './notifications-api';
import { NotificationsRealtime } from './notifications-realtime';

import { markAlertIdAsReadLocally, markAllAlertIdsAsReadLocally } from '../../monitor/data-access/monitor-api';

@Injectable({
  providedIn: 'root',
})
export class NotificationsStore {
  private readonly api = inject(NotificationsApi);
  private readonly realtime = inject(NotificationsRealtime);
  private readonly auth = inject(Auth);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notificationsState = signal<readonly AppNotification[]>([]);
  private readonly selectedState = signal<AppNotification | null>(null);
  private realtimeStarted = false;

  readonly loading = signal(false);
  readonly detailLoading = signal(false);
  readonly deletingId = signal('');
  readonly error = signal('');
  readonly realtimeStatus = signal<'connected' | 'disconnected' | 'reconnecting'>('disconnected');
  readonly filters = signal<NotificationFilters>({ read: 'all', type: '', sort: 'newest' });
  readonly notifications = this.notificationsState.asReadonly();
  readonly selected = this.selectedState.asReadonly();
  readonly types = computed(() => Array.from(new Set(this.notificationsState().map((item) => item.type).filter(Boolean))).sort() as string[]);

  readonly userNotifications = computed(() => {
    const list = this.notificationsState();
    const seenIds = new Set<string>();
    const deduped: AppNotification[] = [];

    for (const item of list) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      deduped.push(item);
    }
    return deduped;
  });

  readonly unreadCount = computed(() => this.userNotifications().filter((item) => !item.isRead).length);

  readonly filteredNotifications = computed(() => {
    const filters = this.filters();
    const items = this.userNotifications().filter((item) => {
      const readMatch =
        filters.read === 'all' ||
        (filters.read === 'read' && item.isRead) ||
        (filters.read === 'unread' && !item.isRead);
      const typeMatch = !filters.type || item.type === filters.type;
      return readMatch && typeMatch;
    });
    return sortNotifications(items, filters.sort);
  });
  readonly unreadNotifications = computed(() => this.userNotifications().filter((item) => !item.isRead));
  readonly readNotifications = computed(() => this.userNotifications().filter((item) => item.isRead));

  constructor() {
    this.realtime.notifications$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((notification) => this.upsert(notification));
    this.realtime.status$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((status) => this.realtimeStatus.set(status));
  }

  connect(userId?: string): void {
    this.realtimeStarted = true;
    this.load(userId, false);
    this.realtime.connect();
  }

  disconnect(): void {
    this.realtimeStarted = false;
    this.realtime.disconnect();
    this.realtimeStatus.set('disconnected');
  }

  load(userId?: string, showLoading = true): void {
    if (showLoading) this.loading.set(true);
    this.error.set('');
    this.api
      .getHistory(userId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => { if (showLoading) this.loading.set(false); }),
      )
      .subscribe({
        next: (items) => {
          const merged = sortNotifications(items, this.filters().sort);
          this.notificationsState.set(merged);
          const readIds = merged.filter((item) => item.isRead).map((item) => item.id);
          if (readIds.length > 0) {
            markAllAlertIdsAsReadLocally(readIds);
          }
        },
        error: () => {
          this.notificationsState.set([]);
          this.error.set('Không thể tải danh sách thông báo từ máy chủ.');
        },
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
          this.selectedState.set(detail);
          this.patch(detail.id, detail);
          if (!detail.isRead) {
            this.markRead(detail.id);
          }
        },
        error: () => {
          this.selectedState.set(notification);
          if (!notification.isRead) {
            this.markRead(notification.id);
          }
        },
      });
  }

  closeDetail(): void {
    this.selectedState.set(null);
  }

  clearSelection(): void {
    this.closeDetail();
  }

  setReadFilter(read: NotificationReadFilter): void {
    this.filters.update((f) => ({ ...f, read }));
  }

  setTypeFilter(type: string): void {
    this.filters.update((f) => ({ ...f, type }));
  }

  setSort(sort: NotificationSort): void {
    this.filters.update((f) => ({ ...f, sort }));
    this.notificationsState.update((items) => sortNotifications(items, sort));
  }

  setSortFilter(sort: NotificationSort): void {
    this.setSort(sort);
  }

  markRead(id: string): void {
    markAlertIdAsReadLocally(id);
    this.patch(id, { isRead: true });
    this.api
      .markRead(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {},
      });
  }

  markAllRead(): void {
    const unread = this.notificationsState().filter((item) => !item.isRead);
    const ids = unread.map((item) => item.id);
    if (ids.length > 0) {
      markAllAlertIdsAsReadLocally(ids);
      ids.forEach((id) => this.markRead(id));
    }
  }

  markAllAsRead(): void {
    this.markAllRead();
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
        error: () => this.error.set('Không thể xóa thông báo.'),
      });
  }

  private patch(id: string, patch: Partial<AppNotification>): void {
    this.notificationsState.update((items) => {
      return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
    });
    if (this.selectedState()?.id === id) this.selectedState.update((item) => (item ? { ...item, ...patch } : item));
  }

  upsert(notification: AppNotification): void {
    this.notificationsState.update((items) => {
      const existingIndex = items.findIndex((item) => item.id === notification.id);
      let nextList: AppNotification[];
      if (existingIndex >= 0) {
        nextList = [...items];
        nextList[existingIndex] = { ...items[existingIndex], ...notification };
      } else {
        nextList = [notification, ...items];
      }
      return sortNotifications(nextList, this.filters().sort);
    });
    if (this.selectedState()?.id === notification.id) this.selectedState.set(notification);
  }
}

const sortNotifications = (items: readonly AppNotification[], sort: NotificationSort) =>
  [...items].sort((a, b) => {
    const delta = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    return sort === 'newest' ? delta : -delta;
  });
