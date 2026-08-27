import { HttpErrorResponse, HttpEvent, HttpEventType, HttpResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Auth } from '../../../../core/auth/auth';
import { unwrapApiData } from '../../../../models/api.models';
import { AiAnalysisApi, AnalysisSessionResult, AnalysisType } from '../../data-access/ai-analysis-api';

interface FilePreviewItem {
  readonly file: File;
  readonly name: string;
  readonly sizeFormatted: string;
  readonly previewUrl: string;
}

@Component({
  selector: 'app-standalone-upload',
  imports: [ReactiveFormsModule, RouterLink, NzIconModule],
  templateUrl: './standalone-upload.html',
  styleUrl: './standalone-upload.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StandaloneUpload {
  private readonly api = inject(AiAnalysisApi);
  private readonly auth = inject(Auth);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly user = this.auth.user;
  protected readonly selectedFiles = signal<readonly FilePreviewItem[]>([]);
  protected readonly isDragging = signal(false);
  protected readonly uploading = signal(false);
  protected readonly uploadProgress = signal(0);
  protected readonly uploadSuccessResult = signal<AnalysisSessionResult | null>(null);
  protected readonly uploadError = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    analysisType: ['DefectDetection' as AnalysisType, [Validators.required]],
    notes: [''],
  });

  readonly analysisTypes: readonly { readonly value: AnalysisType; readonly label: string; readonly desc: string }[] = [
    {
      value: 'DefectDetection',
      label: 'Phát hiện khuyết tật (Defect Detection)',
      desc: 'Nhận diện nứt vỡ sứ cách điện, ăn mòn xà thép, đứt sợi cáp và sự cố vật lý.',
    },
    {
      value: 'AssetConditionAssessment',
      label: 'Đánh giá tình trạng thiết bị (Asset Condition)',
      desc: 'Tính toán chỉ số suy hao phẩm chất và phân loại cấp độ rủi ro vận hành.',
    },
    {
      value: 'ObjectClassification',
      label: 'Phân loại đối tượng lưới điện (Object Classification)',
      desc: 'Nhận diện phân vùng chuỗi sứ, dây dẫn, tạ chống rung, thân cột.',
    },
    {
      value: 'HumanMotionDetection',
      label: 'Phát hiện chuyển động con người (Human Motion)',
      desc: 'Giám sát an ninh hành lang tuyến và cảnh báo xâm phạm trái phép.',
    },
    {
      value: 'General',
      label: 'Phân tích tổng hợp (General)',
      desc: 'Chạy toàn bộ pipeline AI tổng quát trên hình ảnh nạp vào.',
    },
  ];

  isAuthorized(): boolean {
    const role = this.user()?.role;
    if (!role) return false;
    const allowed = ['Admin', 'Manager', 'Analyst'];
    return allowed.some((r) => r.toLowerCase() === role.toLowerCase());
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);

    if (event.dataTransfer?.files?.length) {
      this.addFiles(Array.from(event.dataTransfer.files));
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.addFiles(Array.from(input.files));
      input.value = '';
    }
  }

  private addFiles(newFiles: readonly File[]): void {
    const validImages = newFiles.filter((file) => file.type.startsWith('image/'));
    if (!validImages.length) {
      this.uploadError.set('Vui lòng chọn các tệp định dạng hình ảnh (.jpg, .jpeg, .png, .webp).');
      return;
    }

    this.uploadError.set(null);
    const existing = [...this.selectedFiles()];
    const additions: FilePreviewItem[] = validImages.map((file) => ({
      file,
      name: file.name,
      sizeFormatted: this.formatFileSize(file.size),
      previewUrl: URL.createObjectURL(file),
    }));

    this.selectedFiles.set([...existing, ...additions]);
  }

  removeFile(index: number): void {
    const current = [...this.selectedFiles()];
    const removed = current.splice(index, 1);
    if (removed[0]?.previewUrl) {
      URL.revokeObjectURL(removed[0].previewUrl);
    }
    this.selectedFiles.set(current);
  }

  clearFiles(): void {
    this.selectedFiles().forEach((item) => URL.revokeObjectURL(item.previewUrl));
    this.selectedFiles.set([]);
    this.uploadError.set(null);
  }

  onSubmit(): void {
    const files = this.selectedFiles().map((item) => item.file);
    if (!files.length) {
      this.uploadError.set('Vui lòng tải lên ít nhất một hình ảnh để phân tích.');
      return;
    }

    this.uploading.set(true);
    this.uploadProgress.set(0);
    this.uploadError.set(null);
    this.uploadSuccessResult.set(null);

    const formValues = this.form.getRawValue();

    this.api
      .uploadStandaloneAnalysis({
        files,
        analysisType: formValues.analysisType,
        notes: formValues.notes,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.uploading.set(false)),
      )
      .subscribe({
        next: (event: HttpEvent<unknown>) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            const percent = Math.round((100 * event.loaded) / event.total);
            this.uploadProgress.set(percent);
          } else if (event instanceof HttpResponse) {
            this.uploadProgress.set(100);
            const data = unwrapApiData<Record<string, unknown>>(event.body);
            const id = String(data['id'] || data['sessionId'] || `analysis-${Date.now()}`);
            const result: AnalysisSessionResult = {
              id,
              status: String(data['status'] || 'Processing'),
              analysisType: formValues.analysisType,
              notes: formValues.notes,
              createdAt: new Date().toISOString(),
              filesCount: files.length,
              raw: data,
            };
            this.uploadSuccessResult.set(result);
            this.clearFiles();
          }
        },
        error: (err: HttpErrorResponse) => {
          const message =
            err.error?.message ||
            err.error?.title ||
            (typeof err.error === 'string' ? err.error : '') ||
            'Tải lên thất bại. Vui lòng kiểm tra lại kết nối đến máy chủ AI.';
          this.uploadError.set(message);
        },
      });
  }

  onReset(): void {
    this.clearFiles();
    this.form.reset({
      analysisType: 'DefectDetection',
      notes: '',
    });
    this.uploadSuccessResult.set(null);
    this.uploadError.set(null);
    this.uploadProgress.set(0);
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}
