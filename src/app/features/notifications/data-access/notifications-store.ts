import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { Auth } from '../../../core/auth/auth';
import { AppNotification, NotificationFilters, NotificationReadFilter, NotificationSort } from '../../../models/notification.models';
import { NotificationsApi } from './notifications-api';
import { MissionLifecycleRealtimeEvent, NotificationsRealtime } from './notifications-realtime';

import { markAlertIdAsReadLocally } from '../../monitor/data-access/monitor-api';

const LOCAL_STORAGE_NOTIFS_KEY = 'uav_pms_notifications_v1';

function getLocalNotifications(): AppNotification[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_NOTIFS_KEY) || sessionStorage.getItem(LOCAL_STORAGE_NOTIFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as AppNotification[];
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return [];
}

function saveLocalNotifications(list: readonly AppNotification[]): void {
  try {
    const json = JSON.stringify(list);
    localStorage.setItem(LOCAL_STORAGE_NOTIFS_KEY, json);
    sessionStorage.setItem(LOCAL_STORAGE_NOTIFS_KEY, json);
  } catch {
    // Ignore storage write errors
  }
}

function convertMissionEventToNotification(
  event: MissionLifecycleRealtimeEvent,
  currentUserId?: string,
  currentUserRole?: string,
): AppNotification | null {
  const now = event.timestamp || new Date().toISOString();
  const missionId = event.missionId;
  const actor = event.actorName || (event.actorRole ? `[${event.actorRole}]` : 'Hệ thống');
  const role = (currentUserRole || '').toLowerCase();
  const isManagerOrAdmin = role.includes('manager') || role.includes('admin') || role.includes('quản lý');

  switch (event.type) {
    case 'DISPATCHED':
    case 'ASSIGNED':
    case 'CREATED':
    case 'REASSIGNED':
      if (isManagerOrAdmin) {
        return {
          id: `notif-disp-${missionId}`,
          userId: currentUserId,
          title: `Đã ban hành nhiệm vụ ${missionId}`,
          body: `Nhiệm vụ đã được gửi tới đội ngũ vận hành. Hạn chót xác nhận: ${event.confirmationDeadline ? new Date(event.confirmationDeadline).toLocaleString('vi-VN') : 'Trước giờ bay'}.`,
          type: 'MISSION_DISPATCH',
          referenceType: 'MISSION',
          referenceId: missionId,
          createdAt: now,
          isRead: true,
        };
      }
      return {
        id: `notif-disp-${missionId}`,
        userId: currentUserId,
        title: `Yêu cầu xác nhận nhiệm vụ ${missionId}`,
        body: `Bạn được phân công tham gia nhiệm vụ. Hạn chót xác nhận: ${event.confirmationDeadline ? new Date(event.confirmationDeadline).toLocaleString('vi-VN') : 'Trước giờ bay'}.${event.managerInstructions ? ` Chỉ thị: "${event.managerInstructions}"` : ''}`,
        type: 'MISSION_DISPATCH',
        referenceType: 'MISSION',
        referenceId: missionId,
        createdAt: now,
        isRead: false,
      };
    case 'CONFIRMED':
      return {
        id: `notif-conf-${missionId}-${event.actorRole || 'MEMBER'}-${Date.now()}`,
        userId: currentUserId,
        title: `${actor} đã xác nhận nhiệm vụ ${missionId}`,
        body: `Tiến độ: ${event.confirmedCount ?? 1}/${event.totalRequiredCount ?? 3}. ${event.allConfirmed ? 'Tất cả vai trò đã sẵn sàng.' : 'Đang chờ các vai trò còn lại.'}`,
        type: 'MISSION_CONFIRMED',
        referenceType: 'MISSION',
        referenceId: missionId,
        createdAt: now,
        isRead: false,
      };
    case 'POSTPONED':
      return {
        id: `notif-post-${missionId}`,
        userId: currentUserId,
        title: `${actor} đề xuất hoãn nhiệm vụ ${missionId}`,
        body: `Lý do hoãn: "${event.reason || 'Bận việc đột xuất'}".`,
        type: 'MISSION_POSTPONED',
        referenceType: 'MISSION',
        referenceId: missionId,
        createdAt: now,
        isRead: false,
      };
    case 'SUSPENDED':
      return {
        id: `notif-susp-${missionId}`,
        userId: currentUserId,
        title: `Nhiệm vụ ${missionId} bị tạm dừng`,
        body: event.reason || 'Quản lý đã ra lệnh tạm dừng chuyến bay.',
        type: 'MISSION_SUSPENDED',
        referenceType: 'MISSION',
        referenceId: missionId,
        createdAt: now,
        isRead: false,
      };
    case 'REMINDER':
      return {
        id: `notif-rem-${missionId}-${Date.now()}`,
        userId: currentUserId,
        title: `Nhắc nhở tiếp nhận nhiệm vụ ${missionId}`,
        body: event.reason || 'Vui lòng xác nhận tiếp nhận trước hạn chót.',
        type: 'MISSION_REMINDER',
        referenceType: 'MISSION',
        referenceId: missionId,
        createdAt: now,
        isRead: false,
      };
    case 'STARTED':
      return {
        id: `notif-start-${missionId}`,
        userId: currentUserId,
        title: `Nhiệm vụ ${missionId} bắt đầu bay`,
        body: 'UAV đã cất cánh và đang thực hiện hành trình bay kiểm tra.',
        type: 'MISSION_STARTED',
        referenceType: 'MISSION',
        referenceId: missionId,
        createdAt: now,
        isRead: false,
      };
    case 'COMPLETED':
      return {
        id: `notif-comp-${missionId}`,
        userId: currentUserId,
        title: `Nhiệm vụ ${missionId} đã hoàn tất khảo sát`,
        body: 'UAV đã hạ cánh an toàn. Đã mở khóa cổng nạp dữ liệu ảnh/video.',
        type: 'MISSION_COMPLETED',
        referenceType: 'MISSION',
        referenceId: missionId,
        createdAt: now,
        isRead: false,
      };
    default:
      return null;
  }
}

@Injectable({
  providedIn: 'root',
})
export class NotificationsStore {
  private readonly api = inject(NotificationsApi);
  private readonly realtime = inject(NotificationsRealtime);
  private readonly auth = inject(Auth);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notificationsState = signal<readonly AppNotification[]>(getLocalNotifications());
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
  readonly unreadCount = computed(() => this.filteredNotifications().filter((item) => !item.isRead).length);
  readonly types = computed(() => Array.from(new Set(this.notificationsState().map((item) => item.type).filter(Boolean))).sort() as string[]);
  readonly filteredNotifications = computed(() => {
    const filters = this.filters();
    const currentUser = this.auth.user();
    const currentUserId = currentUser?.id?.toLowerCase();
    const currentUserEmail = currentUser?.email?.toLowerCase();
    const currentRole = (currentUser?.role || '').toLowerCase();
    const isManagerOrAdmin = currentRole.includes('manager') || currentRole.includes('admin') || currentRole.includes('quản lý');

    const items = this.notificationsState().filter((item) => {
      if (isManagerOrAdmin && item.type === 'MISSION_DISPATCH' && (item.body?.includes('Bạn được phân công') || item.title?.includes('Yêu cầu xác nhận'))) {
        return false;
      }

      if (!isManagerOrAdmin && item.type === 'MISSION_DISPATCH' && item.title?.includes('Đã ban hành nhiệm vụ')) {
        return false;
      }

      if (item.userId && currentUserId) {
        const target = item.userId.toLowerCase();
        const matches =
          target === currentUserId ||
          (currentUserEmail && target === currentUserEmail);
        if (!matches) return false;
      }
      const readMatch =
        filters.read === 'all' ||
        (filters.read === 'read' && item.isRead) ||
        (filters.read === 'unread' && !item.isRead);
      const typeMatch = !filters.type || item.type === filters.type;
      return readMatch && typeMatch;
    });
    return sortNotifications(items, filters.sort);
  });
  readonly unreadNotifications = computed(() => this.filteredNotifications().filter((item) => !item.isRead));
  readonly readNotifications = computed(() => this.filteredNotifications().filter((item) => item.isRead));

  constructor() {
    this.realtime.notifications$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((notification) => this.upsert(notification));
    this.realtime.missionEvents$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        const u = this.auth.user();
        const notif = convertMissionEventToNotification(event, u?.id, u?.role);
        if (notif) this.upsert(notif);
      });
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
          saveLocalNotifications(merged);
        },
        error: () => {
          const local = getLocalNotifications();
          this.notificationsState.set(sortNotifications(local, this.filters().sort));
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

  setSortFilter(sort: NotificationSort): void {
    this.filters.update((value) => ({ ...value, sort }));
  }

  markRead(id: string): void {
    markAlertIdAsReadLocally(id);
    this.api
      .markRead(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.patch(id, { isRead: true }),
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
        error: () => this.error.set('Không thể xóa thông báo.'),
      });
  }

  private patch(id: string, patch: Partial<AppNotification>): void {
    this.notificationsState.update((items) => {
      const updated = items.map((item) => (item.id === id ? { ...item, ...patch } : item));
      saveLocalNotifications(updated);
      return updated;
    });
    if (this.selectedState()?.id === id) this.selectedState.update((item) => (item ? { ...item, ...patch } : item));
  }

  upsert(notification: AppNotification): void {
    this.notificationsState.update((items) => {
      const exists = items.some((item) => item.id === notification.id);
      const updated = sortNotifications(exists ? items.map((item) => (item.id === notification.id ? notification : item)) : [notification, ...items], this.filters().sort);
      saveLocalNotifications(updated);
      return updated;
    });
    if (this.selectedState()?.id === notification.id) this.selectedState.set(notification);
  }
}

const sortNotifications = (items: readonly AppNotification[], sort: NotificationSort) =>
  [...items].sort((a, b) => {
    const delta = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    return sort === 'newest' ? delta : -delta;
  });
