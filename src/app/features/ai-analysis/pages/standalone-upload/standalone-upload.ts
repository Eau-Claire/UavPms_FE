import { DatePipe } from '@angular/common';
import { HttpErrorResponse, HttpEvent, HttpEventType, HttpResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { canAccess, ROUTE_ROLES } from '../../../../core/auth/route-access';
import { describeHttpError } from '../../../../shared/errors/business-error-messages';
import { unwrapApiData } from '../../../../models/api.models';
import {
  AiAnalysisApi,
  AiDetection,
  AnalysisSessionResult,
  StandaloneUploadRequest,
  captureVideoFrameAtTime,
  extractCropDataUrl,
  normalizeDetectionItem,
  VideoTimelineMarker,
} from '../../data-access/ai-analysis-api';
import {
  AiAnalysisSessionStore,
  AnalysisWorkflowMode,
  StandaloneMediaPreview,
  StandaloneWorkflowStage,
} from '../../data-access/ai-analysis-session-store';
import { EmergencyAlertsApi } from '../../../emergency-alerts/data-access/emergency-alerts-api';

export type { AnalysisWorkflowMode, StandaloneMediaPreview, StandaloneWorkflowStage };

@Component({
  selector: 'app-standalone-upload',
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './standalone-upload.html',
  styleUrl: './standalone-upload.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StandaloneUpload {
  private readonly api = inject(AiAnalysisApi);
  private readonly emergencyApi = inject(EmergencyAlertsApi);
  private readonly store = inject(AiAnalysisSessionStore);
  private readonly auth = inject(Auth);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('videoPlayer') private readonly videoPlayer?: ElementRef<HTMLVideoElement>;
  @ViewChild('imageViewerContainer') private readonly imageViewerContainer?: ElementRef<HTMLDivElement>;

  protected readonly user = this.auth.user;

  // Delegated state from singleton store (persists across navigation)
  protected readonly workflowMode = this.store.workflowMode;
  protected readonly workflowStage = this.store.workflowStage;
  protected readonly selectedFiles = this.store.selectedFiles;
  protected readonly activeMediaId = this.store.activeMediaId;
  protected readonly currentMedia = this.store.currentMedia;
  protected readonly allDetections = this.store.allDetections;
  protected readonly filteredDetections = this.store.filteredDetections;
  protected readonly confidenceThreshold = this.store.confidenceThreshold;
  protected readonly selectedCategoryFilter = this.store.selectedCategoryFilter;
  protected readonly selectedDetection = this.store.selectedDetection;
  protected readonly showBoundingBoxes = this.store.showBoundingBoxes;
  protected readonly reviewNotes = this.store.reviewNotes;
  protected readonly reviewFeedback = this.store.reviewFeedback;
  protected readonly uploadSuccessResult = this.store.uploadSuccessResult;
  protected readonly lastTriggeredEmergencyAlert = this.store.lastTriggeredEmergencyAlert;
  protected readonly videoTimelineMarkers = this.store.videoTimelineMarkers;
  protected readonly availableCategories = this.store.availableCategories;

  // Video Inspection State
  protected readonly isVideoPlaying = this.store.isVideoPlaying;
  protected readonly videoCurrentTime = this.store.videoCurrentTime;
  protected readonly videoDuration = this.store.videoDuration;
  protected readonly videoHoveredMarker = this.store.videoHoveredMarker;

  // Transient upload/processing operation state
  protected readonly isDragging = signal(false);
  protected readonly uploading = signal(false);
  protected readonly uploadProgress = signal(0);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly processingStep = signal<number>(1);
  protected readonly processingMessage = signal<string>('Đang tải tệp lên máy chủ...');

  private pollingTimer: ReturnType<typeof setTimeout> | null = null;
  private pollCount = 0;

  protected readonly form = this.fb.nonNullable.group({
    notes: [this.store.formNotes()],
    analysisType: [this.store.formAnalysisType() as NonNullable<StandaloneUploadRequest['analysisType']>],
    preferredModel: [this.store.formPreferredModel()],
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe((val) => {
      if (val.notes !== undefined) this.store.formNotes.set(val.notes);
      if (val.analysisType !== undefined) this.store.formAnalysisType.set(val.analysisType);
      if (val.preferredModel !== undefined) this.store.formPreferredModel.set(val.preferredModel);
    });

    this.destroyRef.onDestroy(() => {
      if (this.pollingTimer) {
        clearTimeout(this.pollingTimer);
        this.pollingTimer = null;
      }
    });
  }

  isAuthorized(): boolean {
    return canAccess(this.user()?.role, ROUTE_ROLES.aiAnalysis);
  }

  onWorkflowModeChange(mode: AnalysisWorkflowMode): void {
    this.store.setWorkflowMode(mode);
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

  onQuickFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.clearFiles();
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
          : 'Vui lòng chọn các tệp định dạng hình ảnh (.jpg, .jpeg, .png, .webp).',
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
        status: 'Sẵn sàng kiểm tra',
        progress: 0,
      };
    });

    const combined = [...existing, ...additions];
    this.store.setFiles(combined);
    this.store.selectMedia(combined[0]?.id ?? '');
    this.store.setWorkflowStage('ready');

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
      this.store.updateMedia(item.id, {
        resolution: `${img.naturalWidth} x ${img.naturalHeight}`,
        thumbnailUrl: item.previewUrl,
      });
    };
    img.onerror = () => {
      this.store.updateMedia(item.id, { resolution: 'N/A' });
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
      this.store.videoDuration.set(durSec);

      this.store.updateMedia(item.id, {
        resolution: res,
        duration: durLabel,
        durationSeconds: durSec,
        fps: '30 FPS (H.264)',
      });

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
          this.store.updateMedia(item.id, { thumbnailUrl: thumb });
        }
      } catch {
        this.store.updateMedia(item.id, { thumbnailUrl: item.previewUrl });
      }
    };
  }

  selectMedia(id: string): void {
    this.store.selectMedia(id);
  }

  removeFile(id: string, event?: Event): void {
    event?.stopPropagation();
    this.store.removeFile(id);
  }

  clearFiles(): void {
    this.store.clearFiles();
    this.uploadError.set(null);
  }

  onSubmit(): void {
    const files = this.selectedFiles().map((item) => item.file);
    if (!files.length) {
      this.uploadError.set('Vui lòng chọn ít nhất một tệp hình ảnh hoặc video để kiểm tra.');
      return;
    }

    this.uploading.set(true);
    this.uploadProgress.set(0);
    this.processingStep.set(1);
    this.processingMessage.set('Đang tải tệp lên máy chủ...');
    this.uploadError.set(null);
    this.store.setWorkflowStage('processing');

    const formValues = this.form.getRawValue();
    const isVideo = this.workflowMode() === 'video';
    const curMedia = this.currentMedia();
    const userMediaUrl = curMedia?.previewUrl || '';

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
            this.processingStep.set(2);
            this.processingMessage.set('Máy chủ đang nhận diện khuyết tật thiết bị bằng AI...');

            const rawBody = event.body;
            const data = unwrapApiData<Record<string, unknown>>(rawBody);
            const serverId = this.extractServerId(data, rawBody) || `analysis-${Date.now()}`;

            let detections: readonly AiDetection[] = [];
            const rawDetections = this.extractRawDetections(data, rawBody);
            if (rawDetections.length) {
              detections = rawDetections.map((d, idx) => normalizeDetectionItem(d, idx, userMediaUrl));
            }

            if (detections.length > 0) {
              const result: AnalysisSessionResult = {
                id: String(serverId),
                status: 'Completed',
                analysisType: formValues.analysisType,
                notes: formValues.notes,
                createdAt: new Date().toISOString(),
                filesCount: files.length,
                detections,
                raw: rawBody,
              };
              this.store.setUploadResult(result);
              void this.applyDetectionsWithCrops(detections, isVideo, userMediaUrl);
              this.checkAndLinkActiveEmergencyAlert(detections);
            } else {
              // Asynchronous background processing: poll for analysis result and check active alerts
              this.startPollingAnalysisResult(serverId, formValues.analysisType, formValues.notes, files.length, isVideo, userMediaUrl);
            }
          }
        },
        error: (err: unknown) => {
          this.uploadError.set(describeHttpError(err, 'Không thể kết nối dịch vụ xử lý dữ liệu AI. Vui lòng thử lại sau.'));
          this.store.setWorkflowStage('ready');
        },
      });
  }

  private startPollingAnalysisResult(
    serverId: string,
    analysisType: NonNullable<StandaloneUploadRequest['analysisType']>,
    notes: string,
    filesCount: number,
    isVideo: boolean,
    userMediaUrl: string,
  ): void {
    this.pollCount = 0;
    const maxPolls = 10;
    const pollInterval = 1500;

    const runPoll = () => {
      this.pollCount++;
      this.processingStep.set(3);
      this.processingMessage.set(`Đang phân tích và xử lý mô hình AI (lần ${this.pollCount}/${maxPolls})...`);

      this.api
        .getAnalysisResult(serverId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (res) => {
            const hasDetections = res.detections && res.detections.length > 0;
            const isFinished = res.status === 'Completed' || res.status === 'Finished' || res.status === 'Success';

            if (hasDetections || (isFinished && this.pollCount >= 2)) {
              this.finishAnalysis(res, isVideo, userMediaUrl);
              return;
            }

            if (this.pollCount < maxPolls) {
              this.pollingTimer = setTimeout(runPoll, pollInterval);
            } else {
              this.handlePollingTimeout(serverId, analysisType, notes, filesCount, isVideo, userMediaUrl);
            }
          },
          error: (err: unknown) => {
            if (err instanceof HttpErrorResponse && err.status === 403) {
              this.uploading.set(false);
              this.uploadError.set(
                'Lỗi phân quyền máy chủ (HTTP 403 Forbidden): Vai trò tài khoản hiện tại chưa được cấp quyền truy cập API phân tích AI (GET /api/v1/ai-analysis/{id}). Vui lòng báo backend bổ sung vai trò Admin/SystemAdmin.',
              );
              this.store.setWorkflowStage('ready');
              return;
            }
            if (this.pollCount < maxPolls) {
              this.pollingTimer = setTimeout(runPoll, pollInterval);
            } else {
              this.handlePollingTimeout(serverId, analysisType, notes, filesCount, isVideo, userMediaUrl);
            }
          },
        });
    };

    this.pollingTimer = setTimeout(runPoll, pollInterval);
  }

  private handlePollingTimeout(
    serverId: string,
    analysisType: NonNullable<StandaloneUploadRequest['analysisType']>,
    notes: string,
    filesCount: number,
    isVideo: boolean,
    userMediaUrl: string,
  ): void {
    this.processingStep.set(4);
    this.processingMessage.set('Hoàn tất quét dữ liệu độc lập.');

    const result: AnalysisSessionResult = {
      id: String(serverId),
      status: 'Completed',
      analysisType,
      notes,
      createdAt: new Date().toISOString(),
      filesCount,
      detections: [],
    };
    this.store.setUploadResult(result);
    void this.applyDetectionsWithCrops([], isVideo, userMediaUrl);
    this.store.setLastTriggeredEmergencyAlert(null);
  }

  private finishAnalysis(res: AnalysisSessionResult, isVideo: boolean, userMediaUrl: string): void {
    this.store.setUploadResult(res);
    void this.applyDetectionsWithCrops(res.detections, isVideo, userMediaUrl);
    this.checkAndLinkActiveEmergencyAlert(res.detections);
  }

  private checkAndLinkActiveEmergencyAlert(detections: readonly AiDetection[]): void {
    if (!detections.length) {
      this.store.setLastTriggeredEmergencyAlert(null);
      return;
    }
    this.emergencyApi
      .fetchActiveAlerts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (alerts) => {
          const matchedAlert = alerts.find((a) =>
            detections.some((d) => d.id && (d.id === a.id || d.id === a.anomalyId))
          );
          this.store.setLastTriggeredEmergencyAlert(matchedAlert ?? null);
        },
        error: () => {
          // ignore
        },
      });
  }

  private async applyDetectionsWithCrops(
    rawDetections: readonly AiDetection[],
    isVideo: boolean,
    mediaUrl: string,
  ): Promise<void> {
    this.store.setWorkflowStage('inspected');
    this.store.setDetections(rawDetections);

    const updatedDetections = await Promise.all(
      rawDetections.map(async (det) => {
        try {
          if (isVideo && det.timestampSeconds !== null && mediaUrl) {
            const frameUrl = await captureVideoFrameAtTime(mediaUrl, det.timestampSeconds);
            const cropUrl = det.boundingBox ? await extractCropDataUrl(frameUrl, det.boundingBox) : frameUrl;
            return {
              ...det,
              imageUrl: frameUrl,
              sourceUrl: mediaUrl,
              cropImageUrl: cropUrl,
            };
          } else if (!isVideo && mediaUrl && det.boundingBox) {
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

    this.store.setDetections(updatedDetections);
  }

  navigateToEmergencyAlert(alertIdOrAnomalyId?: string): void {
    const alert = this.lastTriggeredEmergencyAlert();
    const targetId = alertIdOrAnomalyId || alert?.id || alert?.anomalyId;
    void this.router.navigate(['/emergency-alerts'], {
      queryParams: targetId ? { id: targetId } : undefined,
    });
  }

  // Inspection UI Actions
  selectDetection(detection: AiDetection): void {
    this.store.selectDetection(detection);

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
    this.store.videoCurrentTime.set(seconds);
  }

  toggleVideoPlay(): void {
    const video = this.videoPlayer?.nativeElement;
    if (!video) return;
    if (video.paused) {
      void video.play();
      this.store.isVideoPlaying.set(true);
    } else {
      video.pause();
      this.store.isVideoPlaying.set(false);
    }
  }

  onVideoTimeUpdate(): void {
    const video = this.videoPlayer?.nativeElement;
    if (!video) return;
    this.store.videoCurrentTime.set(video.currentTime);
    if (!this.videoDuration() && Number.isFinite(video.duration)) {
      this.store.videoDuration.set(video.duration);
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
    this.store.videoHoveredMarker.set(marker);
  }

  reviewDetection(decision: 'Approved' | 'Rejected'): void {
    const current = this.selectedDetection();
    if (!current) return;

    const updated: AiDetection = {
      ...current,
      status: decision,
      analystNotes: this.reviewNotes(),
    };

    this.store.updateDetection(updated);
    this.store.setReviewFeedback(
      decision === 'Approved'
        ? 'Đã đánh dấu tạm là khuyết tật (chỉ lưu tạm trên trình duyệt, chưa ghi vào hệ thống).'
        : 'Đã đánh dấu tạm là không phải khuyết tật (chỉ lưu tạm trên trình duyệt, chưa ghi vào hệ thống).',
    );
  }

  setConfidenceFilter(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.store.setConfidenceThreshold(value);
  }

  lowerConfidenceThreshold(targetValue = 30): void {
    this.store.setConfidenceThreshold(targetValue);
  }

  onCategoryFilterChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.store.setSelectedCategoryFilter(value);
  }

  onReviewNotesInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.store.setReviewNotes(value);
  }

  setCategoryFilter(category: string): void {
    this.store.setSelectedCategoryFilter(category);
  }

  toggleBoundingBoxes(): void {
    this.store.toggleBoundingBoxes();
  }

  onReset(): void {
    this.store.resetSession();
    this.form.reset({
      notes: '',
      analysisType: 'DefectDetection',
      preferredModel: 'DefectDetection-Standard',
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

  private extractRawDetections(data: unknown, rawBody: unknown): readonly unknown[] {
    const check = (src: unknown): readonly unknown[] | null => {
      if (!src || typeof src !== 'object') return null;
      const obj = src as Record<string, unknown>;
      const list = obj['detections'] ?? obj['items'] ?? obj['results'] ?? obj['anomalies'] ?? obj['defects'] ?? obj['predictions'];
      if (Array.isArray(list)) return list;
      return null;
    };

    return check(data) ?? check(rawBody) ?? [];
  }
}
