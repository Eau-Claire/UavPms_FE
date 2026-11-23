import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, input, output, viewChild } from '@angular/core';

/** Small modal confirmation used before destructive tower actions (also reused by the maintenance pages). */
@Component({
  selector: 'app-tower-confirm-dialog',
  template: `
    <dialog #dialog class="tower-dialog" role="alertdialog" aria-labelledby="tower-confirm-title" aria-describedby="tower-confirm-message" (cancel)="onCancel($event)" (click)="onBackdropClick($event)">
      <header class="tower-dialog-head">
        <h2 id="tower-confirm-title">{{ title() }}</h2>
        <button type="button" class="tower-dialog-close" aria-label="Đóng" [disabled]="busy()" (click)="close()">×</button>
      </header>
      <div class="tower-dialog-body">
        @if (errorMessage()) {
          <p class="tower-dialog-error" role="alert">{{ errorMessage() }}</p>
        }
        <p id="tower-confirm-message">{{ message() }}</p>
      </div>
      <footer class="tower-dialog-actions">
        <button #cancelButton type="button" class="button secondary" [disabled]="busy()" (click)="close()">Hủy</button>
        <button type="button" class="button" [class.danger]="tone() === 'danger'" [class.primary]="tone() === 'primary'" [disabled]="busy()" (click)="confirmed.emit()">{{ busy() ? 'Đang xử lý...' : confirmLabel() }}</button>
      </footer>
    </dialog>
  `,
  styleUrl: './confirm-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialog {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly cancelButton = viewChild.required<ElementRef<HTMLButtonElement>>('cancelButton');

  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input('Xác nhận');
  /** Red for destructive actions (default), the primary colour for workflow confirmations. */
  readonly tone = input<'danger' | 'primary'>('danger');
  readonly busy = input(false);
  readonly errorMessage = input('');
  readonly confirmed = output<void>();
  readonly closed = output<void>();

  constructor() {
    afterNextRender(() => {
      const dialog = this.dialog().nativeElement;
      if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
      else dialog.setAttribute('open', '');
      // Safer default focus for a destructive confirmation.
      this.cancelButton().nativeElement.focus();
    });
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.close();
  }

  /** Clicking the modal backdrop outside the dialog box dismisses it. */
  protected onBackdropClick(event: MouseEvent): void {
    if (this.busy()) return;
    const dlg = this.dialog().nativeElement;
    const rect = dlg.getBoundingClientRect();
    const isInDialog =
      rect.top <= event.clientY &&
      event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX &&
      event.clientX <= rect.left + rect.width;
    if (!isInDialog) {
      this.close();
    }
  }

  protected close(): void {
    if (!this.busy()) {
      try {
        const dlg = this.dialog()?.nativeElement;
        if (dlg?.open) dlg.close();
      } catch {
        // no-op
      }
      this.closed.emit();
    }
  }
}
