import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { ToastService, ToastType } from './toast.service';

@Component({
  selector: 'app-toast-container',
  imports: [NzIconModule],
  templateUrl: './toast-container.html',
  styleUrl: './toast-container.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastContainer {
  protected readonly toastService = inject(ToastService);
  protected readonly toasts = this.toastService.toasts;

  protected iconFor(type: ToastType): string {
    switch (type) {
      case 'success':
        return 'check-circle';
      case 'error':
        return 'close-circle';
      case 'warning':
        return 'exclamation-circle';
      case 'info':
      default:
        return 'info-circle';
    }
  }

  protected dismiss(id: string): void {
    this.toastService.dismiss(id);
  }
}

