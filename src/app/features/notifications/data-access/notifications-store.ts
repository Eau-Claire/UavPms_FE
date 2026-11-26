import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, finalize } from 'rxjs';
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
  private readonly router = inject(Router, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private readonly notificationsState = signal<readonly AppNotification[]>([]);
  private readonly selectedState = signal<AppNotification | null>(null);
  private realtimeStarted = false;
  private lastConnectedUserId: string | null = null;
  private lastConnectedAt = 0;
  private loadingInFlight = false;

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
    const seenFingerprints = new Set<string>();
    const deduped: AppNotification[] = [];

    for (const item of list) {
      if (item.id && seenIds.has(item.id)) continue;
      const minuteBucket = item.createdAt ? item.createdAt.slice(0, 16) : '';
      const fingerprint = `${(item.title ?? '').trim().toLowerCase()}|${(item.body ?? '').trim().toLowerCase()}|${minuteBucket}`;
      if (seenFingerprints.has(fingerprint)) continue;
      if (item.id) seenIds.add(item.id);
      seenFingerprints.add(fingerprint);
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
      .subscribe((notification) => {
        this.upsert(notification);
        if (this.router && typeof this.router.url === 'string') {
          this.handleAutoReadOnNavigation(this.router.url);
        }
      });
    this.realtime.status$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((status) => this.realtimeStatus.set(status));

    if (this.router && this.router.events) {
      this.router.events
        .pipe(
          filter((event): event is NavigationEnd => event instanceof NavigationEnd),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe((event) => {
          this.handleAutoReadOnNavigation(event.urlAfterRedirects || event.url);
        });
    }
  }

  connect(userId?: string): void {
    const now = Date.now();
    if (this.realtimeStarted && this.lastConnectedUserId === (userId ?? null) && now - this.lastConnectedAt < 2000) {
      return;
    }
    this.realtimeStarted = true;
    this.lastConnectedUserId = userId ?? null;
    this.lastConnectedAt = now;
    this.load(userId, false);
    this.realtime.connect();
  }

  disconnect(): void {
    this.realtimeStarted = false;
    this.lastConnectedUserId = null;
    this.lastConnectedAt = 0;
    this.realtime.disconnect();
    this.realtimeStatus.set('disconnected');
  }

  load(userId?: string, showLoading = true): void {
    if (this.loadingInFlight) return;
    this.loadingInFlight = true;
    if (showLoading) this.loading.set(true);
    this.error.set('');
    this.api
      .getHistory(userId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.loadingInFlight = false;
          if (showLoading) this.loading.set(false);
        }),
      )
      .subscribe({
        next: (items) => {
          const merged = sortNotifications(items, this.filters().sort);
          this.notificationsState.set(merged);
          const readIds = merged.filter((item) => item.isRead).map((item) => item.id);
          if (readIds.length > 0) {
            markAllAlertIdsAsReadLocally(readIds);
          }
          if (this.router && typeof this.router.url === 'string') {
            this.handleAutoReadOnNavigation(this.router.url);
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
        error: () => undefined,
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

  markReadByReference(referenceType: string, referenceId?: string): void {
    const normType = referenceType.toLowerCase().trim();
    const unreadMatches = this.notificationsState().filter((item) => {
      if (item.isRead) return false;
      const itemRefType = (item.referenceType ?? '').toLowerCase().trim();
      const itemType = (item.type ?? '').toLowerCase().trim();

      const typeMatches =
        !normType ||
        itemRefType === normType ||
        itemType === normType ||
        (normType === 'emergencyalert' &&
          (itemRefType.includes('alert') ||
            itemType.includes('alert') ||
            itemRefType.includes('emergency') ||
            itemType.includes('emergency'))) ||
        (normType === 'detectedanomaly' &&
          (itemRefType.includes('anomal') ||
            itemType.includes('anomal') ||
            itemRefType.includes('defect') ||
            itemType.includes('defect'))) ||
        (normType === 'mission' && (itemRefType.includes('mission') || itemType.includes('mission'))) ||
        (normType === 'maintenanceticket' &&
          (itemRefType.includes('maint') || itemType.includes('maint') || itemRefType.includes('ticket')));

      if (!typeMatches) return false;
      if (referenceId) {
        const targetId = referenceId.trim();
        const notifRefId = (item.referenceId ?? '').trim();
        return (
          notifRefId === targetId ||
          (item.body && item.body.includes(targetId)) ||
          (item.title && item.title.includes(targetId))
        );
      }
      return true;
    });

    unreadMatches.forEach((n) => this.markRead(n.id));
  }

  markReadForEmergencyAlert(alertId?: string, anomalyId?: string, towerCode?: string): void {
    const unreadMatches = this.notificationsState().filter((item) => {
      if (item.isRead) return false;
      const itemRefType = (item.referenceType ?? '').toLowerCase().trim();
      const itemType = (item.type ?? '').toLowerCase().trim();
      const title = (item.title ?? '').toLowerCase();
      const body = (item.body ?? '').toLowerCase();

      const isAlertNotif =
        itemRefType.includes('alert') ||
        itemType.includes('alert') ||
        itemRefType.includes('emergency') ||
        itemType.includes('emergency') ||
        title.includes('nghiêm trọng') ||
        title.includes('khẩn cấp') ||
        title.includes('báo động') ||
        body.includes('nghiêm trọng') ||
        body.includes('khẩn cấp') ||
        body.includes('báo động');

      if (!isAlertNotif) return false;

      if (alertId || anomalyId || towerCode) {
        const refId = (item.referenceId ?? '').trim();
        if (alertId && (refId === alertId.trim() || body.includes(alertId.trim()) || title.includes(alertId.trim()))) return true;
        if (anomalyId && (refId === anomalyId.trim() || body.includes(anomalyId.trim()) || title.includes(anomalyId.trim()))) return true;
        if (towerCode && (body.includes(towerCode.trim().toLowerCase()) || title.includes(towerCode.trim().toLowerCase()))) return true;
        if (!refId) return true;
        return false;
      }
      return true;
    });

    unreadMatches.forEach((n) => this.markRead(n.id));
  }

  private handleAutoReadOnNavigation(url: string): void {
    if (!url) return;
    const cleanUrl = url.split('?')[0];

    if (cleanUrl.startsWith('/missions/')) {
      const parts = cleanUrl.split('/').filter(Boolean);
      if (parts.length >= 2 && parts[1] !== 'new') {
        this.markReadByReference('mission', parts[1]);
      }
    } else if (cleanUrl.startsWith('/maintenance/')) {
      const parts = cleanUrl.split('/').filter(Boolean);
      if (parts.length >= 2 && parts[1] !== 'new') {
        this.markReadByReference('maintenanceticket', parts[1]);
      }
    } else if (cleanUrl.startsWith('/ai-review/')) {
      const parts = cleanUrl.split('/').filter(Boolean);
      if (parts.length >= 2) {
        this.markReadByReference('detectedanomaly', parts[1]);
      }
    }
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
