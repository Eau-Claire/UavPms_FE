import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  readonly id: string;
  readonly type: ToastType;
  readonly message: string;
  readonly title?: string;
  readonly duration: number;
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  readonly toasts = signal<readonly ToastItem[]>([]);

  show(message: string, type: ToastType = 'info', title?: string, duration = 3500): string {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newToast: ToastItem = { id, type, message, title, duration };

    this.toasts.update((current) => [...current, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }

    return id;
  }

  success(message: string, title?: string, duration = 3500): string {
    return this.show(message, 'success', title, duration);
  }

  error(message: string, title?: string, duration = 5000): string {
    return this.show(message, 'error', title, duration);
  }

  info(message: string, title?: string, duration = 3500): string {
    return this.show(message, 'info', title, duration);
  }

  warning(message: string, title?: string, duration = 4000): string {
    return this.show(message, 'warning', title, duration);
  }

  dismiss(id: string): void {
    this.toasts.update((current) => current.filter((t) => t.id !== id));
  }

  clear(): void {
    this.toasts.set([]);
  }
}

