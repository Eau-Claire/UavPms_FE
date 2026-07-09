export type NotificationReadFilter = 'all' | 'unread' | 'read';
export type NotificationSort = 'newest' | 'oldest';

export interface AppNotification {
  readonly id: string;
  readonly userId?: string;
  readonly type?: string;
  readonly referenceType?: string;
  readonly referenceId?: string;
  readonly title: string;
  readonly body: string;
  readonly createdAt: string;
  readonly isRead: boolean;
}

export interface NotificationFilters {
  readonly read: NotificationReadFilter;
  readonly type: string;
  readonly sort: NotificationSort;
}
