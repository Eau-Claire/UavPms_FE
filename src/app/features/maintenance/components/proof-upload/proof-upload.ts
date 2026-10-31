import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { concatMap, finalize, from, tap } from 'rxjs';
import { MaintenanceProof } from '../../../../models/maintenance.models';
import { MaintenanceApi, maintenanceErrorMessage } from '../../data-access/maintenance-api';

export const MAX_PROOF_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'];

/** Backend UploadProofAsync accepts these extensions only, up to 50MB. */
export const proofFileProblem = (file: File): string | null => {
  const name = file.name.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((extension) => name.endsWith(extension))) return `${file.name}: chỉ hỗ trợ ảnh JPG, PNG, WEBP, TIFF.`;
  if (file.size === 0) return `${file.name}: tệp rỗng.`;
  if (file.size > MAX_PROOF_BYTES) return `${file.name}: vượt quá 50MB.`;
  return null;
};

interface PendingProof {
  readonly key: number;
  readonly file: File;
  readonly previewUrl: string;
}

/** Select after-repair photos, preview them, then POST each to /maintenance/tickets/{id}/proof with the notes. */
@Component({
  selector: 'app-proof-upload',
  imports: [ReactiveFormsModule],
  templateUrl: './proof-upload.html',
  styleUrl: './proof-upload.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProofUpload {
  private readonly api = inject(MaintenanceApi);
  private readonly destroyRef = inject(DestroyRef);
  private nextKey = 0;

  readonly ticketId = input.required<string>();
  readonly uploaded = output<MaintenanceProof>();

  protected readonly accept = 'image/jpeg,image/png,image/webp,image/tiff,.jpg,.jpeg,.png,.webp,.tif,.tiff';
  protected readonly pending = signal<readonly PendingProof[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly status = signal('');
  protected readonly notes = new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] });

  constructor() {
    this.destroyRef.onDestroy(() => this.pending().forEach((item) => revoke(item.previewUrl)));
  }

  protected onFilesSelected(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    const files = Array.from(inputElement.files ?? []);
    inputElement.value = '';
    if (!files.length) return;
    const problems = files.map(proofFileProblem).filter((problem): problem is string => Boolean(problem));
    const accepted = files.filter((file) => !proofFileProblem(file));
    this.error.set(problems.join(' '));
    this.status.set('');
    this.pending.update((items) => [
      ...items,
      ...accepted.map((file) => ({ key: this.nextKey++, file, previewUrl: createPreview(file) })),
    ]);
  }

  protected remove(item: PendingProof): void {
    revoke(item.previewUrl);
    this.pending.update((items) => items.filter((candidate) => candidate.key !== item.key));
  }

  protected formatSize(bytes: number): string {
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  protected upload(): void {
    const items = this.pending();
    if (!items.length || this.busy() || this.notes.invalid) return;
    const notes = this.notes.value;
    let done = 0;
    this.busy.set(true);
    this.error.set('');
    this.status.set('');
    from(items)
      .pipe(
        concatMap((item) =>
          this.api.uploadProof(this.ticketId(), item.file, notes).pipe(
            tap((proof) => {
              done++;
              this.remove(item);
              this.uploaded.emit(proof);
            }),
          ),
        ),
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        complete: () => {
          this.notes.reset('');
          this.status.set(`Đã tải lên ${done} ảnh minh chứng.`);
        },
        error: (error: unknown) => {
          const prefix = done ? `Đã tải lên ${done} ảnh. ` : '';
          this.error.set(prefix + maintenanceErrorMessage(error, 'Không thể tải ảnh minh chứng lên.'));
        },
      });
  }
}

const createPreview = (file: File): string => (typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '');

const revoke = (url: string): void => {
  if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
};
