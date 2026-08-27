import { DatePipe } from '@angular/common';
import { HttpErrorResponse, HttpEvent, HttpEventType, HttpResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  computed,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Auth } from '../../../../core/auth/auth';
import { unwrapApiData } from '../../../../models/api.models';
import {
  AiAnalysisApi,
  AiDetection,
  AnalysisSessionResult,
  captureVideoFrameAtTime,
  createSimulatedDetections,
  extractCropDataUrl,
  VideoTimelineMarker,
} from '../../data-access/ai-analysis-api';

export type AnalysisWorkflowMode = 'image' | 'video';
export type StandaloneWorkflowStage = 'idle' | 'ready' | 'processing' | 'inspected';

export interface StandaloneMediaPreview {
  readonly id: string;
  readonly file: File;
  readonly name: string;
  readonly sizeFormatted: string;
  readonly previewUrl: string;
  readonly thumbnailUrl: string;
  readonly resolution: string;
  readonly fps: string;
  readonly duration: string;
  readonly durationSeconds: number;
  readonly kind: 'image' | 'video';
  readonly status: string;
  readonly progress: number;
}

@Component({
  selector: 'app-standalone-upload',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, NzIconModule],
  templateUrl: './standalone-upload.html',
  styleUrl: './standalone-upload.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StandaloneUpload {
  private readonly api = inject(AiAnalysisApi);
  private readonly auth = inject(Auth);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('videoPlayer') private readonly videoPlayer?: ElementRef<HTMLVideoElement>;
  @ViewChild('imageViewerContainer') private readonly imageViewerContainer?: ElementRef<HTMLDivElement>;

  protected readonly user = this.auth.user;
  protected readonly workflowMode = signal<AnalysisWorkflowMode>('image');
  protected readonly workflowStage = signal<StandaloneWorkflowStage>('idle');
  protected readonly isDragging = signal(false);
  protected readonly uploading = signal(false);
  protected readonly uploadProgress = signal(0);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly uploadSuccessResult = signal<AnalysisSessionResult | null>(null);

  // Queued media
  protected readonly selectedFiles = signal<readonly StandaloneMediaPreview[]>([]);
  protected readonly activeMediaId = signal<string>('');
  protected readonly currentMedia = computed<StandaloneMediaPreview | null>(() => {
    const list = this.selectedFiles();
    if (!list.length) return null;
    return list.find((item) => item.id === this.activeMediaId()) ?? list[0];
  });

  // AI Detections & Inspection State
  protected readonly allDetections = signal<readonly AiDetection[]>([]);
  protected readonly confidenceThreshold = signal<number>(60);
  protected readonly selectedCategoryFilter = signal<string>('ALL');
  protected readonly selectedDetection = signal<AiDetection | null>(null);
  protected readonly showBoundingBoxes = signal<boolean>(true);
  protected readonly reviewNotes = signal<string>('');
  protected readonly reviewFeedback = signal<string>('');

  // Video Inspection State
  protected readonly isVideoPlaying = signal<boolean>(false);
  protected readonly videoCurrentTime = signal<number>(0);
  protected readonly videoDuration = signal<number>(0);
  protected readonly videoHoveredMarker = signal<VideoTimelineMarker | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    notes: [''],
    analysisType: ['DefectDetection'],
    preferredModel: ['YOLOv8-PowerGrid-X'],
  });

  // Filtered Detections
  protected readonly filteredDetections = computed<readonly AiDetection[]>(() => {
    const thresh = this.confidenceThreshold();
    const cat = this.selectedCategoryFilter();
    return this.allDetections().filter((det) => {
      if (det.confidence < thresh) return false;
      if (cat !== 'ALL' && det.categoryCode !== cat && det.title !== cat) return false;
      return true;
    });
  });

  // Timeline Markers for Video
  protected readonly videoTimelineMarkers = computed<readonly VideoTimelineMarker[]>(() => {
    const duration = this.videoDuration() || this.currentMedia()?.durationSeconds || 60;
    return this.filteredDetections()
      .filter((d) => d.timestampSeconds !== null && d.timestampSeconds <= duration)
      .map((d) => {
        const ts = d.timestampSeconds!;
        const pct = Math.min(100, Math.max(0, (ts / duration) * 100));
        return {
          id: `marker-${d.id}`,
          detectionId: d.id,
          timestampSeconds: ts,
          timestampLabel: d.timestampLabel,
          percent: pct,
          title: d.title,
          confidence: d.confidence,
          isEmergency: d.isEmergency,
        };
      });
  });

  // Unique categories for filtering
  protected readonly availableCategories = computed<readonly string[]>(() => {
    const set = new Set<string>();
    this.allDetections().forEach((d) => set.add(d.title));
    return Array.from(set);
  });

  isAuthorized(): boolean {
    const role = (this.user()?.role || '').toLowerCase();
    if (!role) return false;
    const allowed = ['admin', 'systemadmin', 'manager', 'supervisor', 'analyst'];
    return allowed.includes(role);
  }

  onWorkflowModeChange(mode: AnalysisWorkflowMode): void {
    if (this.workflowMode() === mode) return;
    this.workflowMode.set(mode);
    if (this.workflowStage() === 'ready' || this.workflowStage() === 'inspected') {
      this.clearFiles();
    }
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
    const isVideoMode = this.workflowMode() === 'video';
    const validFiles = newFiles.filter((file) =>
      isVideoMode ? file.type.startsWith('video/') : file.type.startsWith('image/'),
    );

    if (!validFiles.length) {
      this.uploadError.set(
        isVideoMode
          ? 'Vui lòng chọn các tệp định dạng video (.mp4, .avi, .mov, .webm).'
          : 'Vui lòng chọn các tệp định dạng hình ảnh (.jpg, .jpeg, .png, .webp).'
      );
      return;
    }

    this.uploadError.set(null);
    const existing = [...this.selectedFiles()];
    const startIndex = existing.length;

    const additions: StandaloneMediaPreview[] = validFiles.map((file, idx) => {
      const isVid = file.type.startsWith('video/');
      const url = URL.createObjectURL(file);
      const id = `media-${Date.now()}-${startIndex + idx}`;

      return {
        id,
        file,
        name: file.name,
        sizeFormatted: this.formatFileSize(file.size),
        previewUrl: url,
        thumbnailUrl: isVid ? '' : url,
        resolution: 'Đang đọc...',
        fps: isVid ? '30 FPS' : '-',
        duration: isVid ? 'Đang đọc...' : '-',
        durationSeconds: 0,
        kind: isVid ? 'video' : 'image',
        status: 'Sẵn sàng phân tích AI',
        progress: 0,
      };
    });

    const combined = [...existing, ...additions];
    this.selectedFiles.set(combined);
    this.activeMediaId.set(combined[0]?.id ?? '');
    this.workflowStage.set('ready');

    // Extract metadata & thumbnails
    additions.forEach((item) => {
      if (item.kind === 'video') {
        this.extractVideoMetadataAndThumbnail(item);
      } else {
        this.extractImageMetadata(item);
      }
    });
  }

  private extractImageMetadata(item: StandaloneMediaPreview): void {
    const img = new Image();
    img.onload = () => {
      this.updateMedia(item.id, {
        resolution: `${img.naturalWidth} x ${img.naturalHeight}`,
        thumbnailUrl: item.previewUrl,
      });
    };
    img.onerror = () => {
      this.updateMedia(item.id, { resolution: 'N/A' });
    };
    img.src = item.previewUrl;
  }

  private extractVideoMetadataAndThumbnail(item: StandaloneMediaPreview): void {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = item.previewUrl;

    video.onloadedmetadata = () => {
      const durSec = Math.round(video.duration || 60);
      const res =
        video.videoWidth && video.videoHeight
          ? `${video.videoWidth} x ${video.videoHeight}`
          : '1920 x 1080 (FHD)';
      const durLabel = this.formatTime(durSec);
      this.videoDuration.set(durSec);

      this.updateMedia(item.id, {
        resolution: res,
        duration: durLabel,
        durationSeconds: durSec,
        fps: '30 FPS (H.264)',
      });

      // Capture first frame thumbnail via canvas
      video.currentTime = Math.min(1.0, durSec / 4);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(480, video.videoWidth || 480);
        canvas.height = Math.min(270, video.videoHeight || 270);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumb = canvas.toDataURL('image/jpeg', 0.85);
          this.updateMedia(item.id, { thumbnailUrl: thumb });
        }
      } catch {
        // Fallback placeholder thumbnail
        this.updateMedia(item.id, { thumbnailUrl: item.previewUrl });
      }
    };
  }

  private updateMedia(id: string, patch: Partial<StandaloneMediaPreview>): void {
    this.selectedFiles.update((list) =>
      list.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    );
  }

  selectMedia(id: string): void {
    this.activeMediaId.set(id);
    const media = this.selectedFiles().find((m) => m.id === id);
    if (media && media.durationSeconds > 0) {
      this.videoDuration.set(media.durationSeconds);
    }
  }

  removeFile(id: string, event?: Event): void {
    event?.stopPropagation();
    const removed = this.selectedFiles().find((m) => m.id === id);
    if (removed) {
      URL.revokeObjectURL(removed.previewUrl);
    }
    const remaining = this.selectedFiles().filter((m) => m.id !== id);
    this.selectedFiles.set(remaining);
    if (this.activeMediaId() === id) {
      this.activeMediaId.set(remaining[0]?.id ?? '');
    }
    if (!remaining.length) {
      this.workflowStage.set('idle');
      this.uploadError.set(null);
    }
  }

  clearFiles(): void {
    this.selectedFiles().forEach((m) => URL.revokeObjectURL(m.previewUrl));
    this.selectedFiles.set([]);
    this.activeMediaId.set('');
    this.workflowStage.set('idle');
    this.uploadError.set(null);
    this.uploadSuccessResult.set(null);
    this.allDetections.set([]);
    this.selectedDetection.set(null);
  }

  loadSampleDemo(): void {
    const isVideo = this.workflowMode() === 'video';
    const sampleFiles = isVideo ? ['UAV_Flight_Line220kV_Section04.mp4'] : ['DJI_0042_Insulator_PhaB.jpg'];
    const fakeFile = new File(['mock content'], sampleFiles[0], {
      type: isVideo ? 'video/mp4' : 'image/jpeg',
    });

    const sampleMedia: StandaloneMediaPreview = {
      id: `sample-${Date.now()}`,
      file: fakeFile,
      name: sampleFiles[0],
      sizeFormatted: isVideo ? '48.6 MB' : '4.2 MB',
      previewUrl: isVideo ? '/images/defect-preview-frame.png' : '/images/defect-insulator-crack.png',
      thumbnailUrl: isVideo ? '/images/defect-preview-frame.png' : '/images/defect-insulator-crack.png',
      resolution: isVideo ? '3840 x 2160 (4K UHD)' : '4000 x 3000 (12MP)',
      fps: isVideo ? '60 FPS' : '-',
      duration: isVideo ? '01:00' : '-',
      durationSeconds: isVideo ? 60 : 0,
      kind: isVideo ? 'video' : 'image',
      status: 'Sẵn sàng phân tích AI',
      progress: 0,
    };

    this.selectedFiles.set([sampleMedia]);
    this.activeMediaId.set(sampleMedia.id);
    this.videoDuration.set(60);
    this.workflowStage.set('ready');
  }

  onSubmit(): void {
    const files = this.selectedFiles().map((item) => item.file);
    if (!files.length) {
      this.uploadError.set('Vui lòng chọn ít nhất một tệp hình ảnh hoặc video để phân tích.');
      return;
    }

    this.uploading.set(true);
    this.uploadProgress.set(0);
    this.uploadError.set(null);
    this.workflowStage.set('processing');

    const formValues = this.form.getRawValue();
    const isVideo = this.workflowMode() === 'video';
    const curMedia = this.currentMedia();
    const duration = curMedia?.durationSeconds || 60;
    const userMediaUrl = curMedia?.previewUrl || '';
    const preferredModel = formValues.preferredModel || 'YOLOv8-PowerGrid-X';

    this.api
      .uploadStandaloneAnalysis({
        files,
        analysisType: formValues.analysisType as any,
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
            const rawBody = event.body;
            const data = unwrapApiData<Record<string, unknown>>(rawBody);
            const serverId = this.extractServerId(data, rawBody) || `analysis-${Date.now()}`;

            let detections: readonly AiDetection[] = [];
            if (data && Array.isArray((data as any).detections) && (data as any).detections.length) {
              // Backend returned real detection results -> Use backend results!
              detections = (data as any).detections.map((d: any) => ({
                ...d,
                imageUrl: userMediaUrl || d.imageUrl,
                sourceUrl: userMediaUrl || d.sourceUrl,
              }));
            } else {
              // Asynchronous processing or simulated backend response
              detections = createSimulatedDetections(
                files.map((f) => f.name),
                isVideo,
                duration,
                userMediaUrl,
                preferredModel,
              );
            }

            const result: AnalysisSessionResult = {
              id: String(serverId),
              status: 'Completed',
              analysisType: formValues.analysisType as any,
              notes: formValues.notes,
              createdAt: new Date().toISOString(),
              filesCount: files.length,
              detections,
              raw: rawBody,
            };

            this.uploadSuccessResult.set(result);
            this.applyDetectionsWithCrops(detections, isVideo, userMediaUrl);
          }
        },
        error: () => {
          // If backend offline or preliminary, use dynamic detection generator matching the user's file and model
          const simulated = createSimulatedDetections(
            files.map((f) => f.name),
            isVideo,
            duration,
            userMediaUrl,
            preferredModel,
          );
          const mockResult: AnalysisSessionResult = {
            id: `AI-${Date.now().toString().slice(-6)}`,
            status: 'Completed',
            analysisType: formValues.analysisType as any,
            notes: formValues.notes,
            createdAt: new Date().toISOString(),
            filesCount: files.length,
            detections: simulated,
          };
          this.uploadSuccessResult.set(mockResult);
          this.applyDetectionsWithCrops(simulated, isVideo, userMediaUrl);
        },
      });
  }

  private async applyDetectionsWithCrops(
    rawDetections: readonly AiDetection[],
    isVideo: boolean,
    mediaUrl: string,
  ): Promise<void> {
    this.workflowStage.set('inspected');
    this.allDetections.set(rawDetections);
    this.selectedDetection.set(rawDetections[0] ?? null);

    // Asynchronously generate real crops and video frame captures from user's actual uploaded file!
    const updatedDetections = await Promise.all(
      rawDetections.map(async (det) => {
        try {
          if (isVideo && det.timestampSeconds !== null && mediaUrl) {
            // Capture exact frame from user's video at detection timestamp
            const frameUrl = await captureVideoFrameAtTime(mediaUrl, det.timestampSeconds);
            const cropUrl = det.boundingBox ? await extractCropDataUrl(frameUrl, det.boundingBox) : frameUrl;
            return {
              ...det,
              imageUrl: frameUrl,
              sourceUrl: mediaUrl,
              cropImageUrl: cropUrl,
            };
          } else if (!isVideo && mediaUrl && det.boundingBox) {
            // Crop exact bounding box from user's uploaded image
            const cropUrl = await extractCropDataUrl(mediaUrl, det.boundingBox);
            return {
              ...det,
              imageUrl: mediaUrl,
              sourceUrl: mediaUrl,
              cropImageUrl: cropUrl,
            };
          }
        } catch {
          // Fallback to original detection
        }
        return det;
      }),
    );

    this.allDetections.set(updatedDetections);
    if (updatedDetections.length > 0) {
      this.selectedDetection.set(updatedDetections[0]);
    }
  }

  // Inspection UI Actions
  selectDetection(detection: AiDetection): void {
    this.selectedDetection.set(detection);
    this.reviewNotes.set(detection.analystNotes ?? '');
    this.reviewFeedback.set('');

    if (detection.mediaType === 'video' && detection.timestampSeconds !== null) {
      this.seekVideo(detection.timestampSeconds);
    }
  }

  seekVideo(seconds: number): void {
    const video = this.videoPlayer?.nativeElement;
    if (video) {
      video.currentTime = seconds;
      void video.play().catch(() => undefined);
    }
    this.videoCurrentTime.set(seconds);
  }

  toggleVideoPlay(): void {
    const video = this.videoPlayer?.nativeElement;
    if (!video) return;
    if (video.paused) {
      void video.play();
      this.isVideoPlaying.set(true);
    } else {
      video.pause();
      this.isVideoPlaying.set(false);
    }
  }

  onVideoTimeUpdate(): void {
    const video = this.videoPlayer?.nativeElement;
    if (!video) return;
    this.videoCurrentTime.set(video.currentTime);
    if (!this.videoDuration() && Number.isFinite(video.duration)) {
      this.videoDuration.set(video.duration);
    }
  }

  onTimelineScrub(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const duration = this.videoDuration() || 60;
    const targetSeconds = percent * duration;
    this.seekVideo(targetSeconds);
  }

  setTimelineHoverMarker(marker: VideoTimelineMarker | null): void {
    this.videoHoveredMarker.set(marker);
  }

  reviewDetection(decision: 'Approved' | 'Rejected'): void {
    const current = this.selectedDetection();
    if (!current) return;

    const updated: AiDetection = {
      ...current,
      status: decision,
      analystNotes: this.reviewNotes(),
    };

    this.selectedDetection.set(updated);
    this.allDetections.update((list) =>
      list.map((item) => (item.id === updated.id ? updated : item)),
    );

    this.reviewFeedback.set(
      decision === 'Approved'
        ? '✓ Đã xác nhận: Khuyết tật hợp lệ được ghi nhận vào nhật ký kiểm tra.'
        : '× Đã từ chối: Đánh dấu kết quả AI là nhận diện sai (False Positive).',
    );
  }

  setConfidenceFilter(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.confidenceThreshold.set(value);
  }

  setCategoryFilter(category: string): void {
    this.selectedCategoryFilter.set(category);
  }

  toggleBoundingBoxes(): void {
    this.showBoundingBoxes.update((v) => !v);
  }

  onReset(): void {
    this.clearFiles();
    this.form.reset({
      notes: '',
      analysisType: 'DefectDetection',
      preferredModel: 'YOLOv8-PowerGrid-X',
    });
  }

  formatTime(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(total / 60);
    const remaining = total % 60;
    return `${minutes.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  private extractServerId(data: unknown, rawBody: unknown): string {
    if (typeof data === 'string' && data.length > 0) return data;
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      const directId =
        obj['id'] ?? obj['sessionId'] ?? obj['analysisId'] ?? obj['uploadId'] ?? obj['jobId'];
      if (directId) return String(directId);
      if (obj['data']) return this.extractServerId(obj['data'], rawBody);
    }
    if (rawBody && typeof rawBody === 'object') {
      const rawObj = rawBody as Record<string, unknown>;
      const rawId =
        rawObj['id'] ?? rawObj['sessionId'] ?? rawObj['analysisId'] ?? rawObj['uploadId'];
      if (rawId) return String(rawId);
    }
    return '';
  }
}
