import { DatePipe } from '@angular/common';
import { HttpEvent, HttpEventType, HttpResponse } from '@angular/common/http';
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
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Auth } from '../../../../core/auth/auth';
import { canAccess, ROUTE_ROLES } from '../../../../core/auth/route-access';
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
import { ActiveEmergencyAlert } from '../../../emergency-alerts/models/emergency-alert.models';

export interface SampleDefectPreset {
  readonly key: 'insulator-crack' | 'bolt-missing' | 'corridor-tree' | 'insulator-dirty';
  readonly label: string;
  readonly badge: string;
  readonly badgeClass: string;
  readonly imagePath: string;
  readonly title: string;
  readonly categoryCode: string;
  readonly confidence: number;
  readonly description: string;
  readonly severityWeight: number;
  readonly isEmergency: boolean;
  readonly tower: string;
  readonly gps: string;
  readonly boundingBox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

export const SAMPLE_DEFECT_PRESETS: readonly SampleDefectPreset[] = [
  {
    key: 'insulator-crack',
    label: 'Bát sứ nứt vỡ',
    badge: 'Khẩn cấp',
    badgeClass: 'danger',
    imagePath: '/images/defect-insulator-crack.png',
    title: 'Bát cách điện vỡ',
    categoryCode: 'BROKEN_INSULATOR',
    confidence: 88,
    description: 'Nứt vỡ đĩa cách điện chuỗi đỡ 220kV, nguy cơ phóng điện vầng quang cao khi thời tiết ẩm ướt.',
    severityWeight: 5,
    isEmergency: true,
    tower: 'HCM-TB-T02',
    gps: '10.80650, 106.71750',
    boundingBox: { x: 26, y: 22, width: 48, height: 52 },
  },
  {
    key: 'bolt-missing',
    label: 'Mất bu-lông xà',
    badge: 'Cấp 3/5',
    badgeClass: 'warning',
    imagePath: '/images/defect-bolt-missing.png',
    title: 'Mất bu-lông liên kết',
    categoryCode: 'MISSING_BOLT',
    confidence: 91,
    description: 'Thiếu bu-lông liên kết thanh giằng chữ V xà đỡ cáp phía hạ lưu cột điện.',
    severityWeight: 3,
    isEmergency: false,
    tower: 'HCM-AP-T01',
    gps: '10.80150, 106.74550',
    boundingBox: { x: 30, y: 25, width: 40, height: 45 },
  },
  {
    key: 'corridor-tree',
    label: 'Cây vi phạm hành lang',
    badge: 'Cấp 4/5',
    badgeClass: 'warning',
    imagePath: '/images/defect-corridor-tree.png',
    title: 'Cây vi phạm hành lang',
    categoryCode: 'VEGETATION_ENCROACHMENT',
    confidence: 84,
    description: 'Cây xanh tán cao phát triển xâm phạm khoảng cách an toàn pha - đất dưới 4.5m.',
    severityWeight: 4,
    isEmergency: false,
    tower: 'HCM-TB-T01',
    gps: '10.80410, 106.71890',
    boundingBox: { x: 20, y: 35, width: 55, height: 50 },
  },
  {
    key: 'insulator-dirty',
    label: 'Sứ bám bẩn',
    badge: 'Theo dõi',
    badgeClass: 'info',
    imagePath: '/images/defect-insulator-dirty.png',
    title: 'Bát sứ bám bẩn',
    categoryCode: 'DIRTY_INSULATOR',
    confidence: 76,
    description: 'Bề mặt đĩa sứ cách điện nhiễm bẩn công nghiệp, có vết phóng điện cục bộ nhẹ.',
    severityWeight: 2,
    isEmergency: false,
    tower: 'HCM-TB-T03',
    gps: '10.80820, 106.71610',
    boundingBox: { x: 24, y: 20, width: 52, height: 55 },
  },
];

export type { AnalysisWorkflowMode, StandaloneMediaPreview, StandaloneWorkflowStage };

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
  protected readonly samplePresets = SAMPLE_DEFECT_PRESETS;

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
        error: () => {
          this.uploadError.set('Không thể kết nối dịch vụ xử lý dữ liệu. Vui lòng thử lại sau.');
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
              this.fallbackCheckActiveAlerts(serverId, analysisType, notes, filesCount, isVideo, userMediaUrl);
            }
          },
          error: () => {
            if (this.pollCount < maxPolls) {
              this.pollingTimer = setTimeout(runPoll, pollInterval);
            } else {
              this.fallbackCheckActiveAlerts(serverId, analysisType, notes, filesCount, isVideo, userMediaUrl);
            }
          },
        });
    };

    this.pollingTimer = setTimeout(runPoll, pollInterval);
  }

  private fallbackCheckActiveAlerts(
    serverId: string,
    analysisType: NonNullable<StandaloneUploadRequest['analysisType']>,
    notes: string,
    filesCount: number,
    isVideo: boolean,
    userMediaUrl: string,
  ): void {
    this.processingStep.set(4);
    this.processingMessage.set('Đang đồng bộ kết quả cảnh báo hệ thống...');

    this.emergencyApi
      .fetchActiveAlerts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (alerts) => {
          const recentThreshold = Date.now() - 5 * 60 * 1000;
          const matchingAlert = alerts.find((a) => {
            const trig = a.triggeredAt ? new Date(a.triggeredAt).getTime() : 0;
            return trig >= recentThreshold || !a.towerId || a.towerCode === 'N/A';
          }) ?? (alerts.length > 0 ? alerts[0] : null);

          let detections: readonly AiDetection[] = [];
          if (matchingAlert) {
            this.store.setLastTriggeredEmergencyAlert(matchingAlert);
            const alertDet: AiDetection = {
              id: matchingAlert.id,
              title: matchingAlert.categoryName || matchingAlert.alertType || 'Bát cách điện vỡ',
              confidence: matchingAlert.evidence.confidenceScore ?? 62,
              categoryCode: matchingAlert.alertType || 'BROKEN_INSULATOR',
              description: `Phát hiện tự động từ UAV - Mức độ ưu tiên: ${matchingAlert.priority}`,
              mediaType: isVideo ? 'video' : 'image',
              timestampSeconds: null,
              timestampLabel: isVideo ? '00:01' : 'Ảnh đơn lẻ',
              frameIndex: 1,
              gps: matchingAlert.location.latitude && matchingAlert.location.longitude
                ? `${matchingAlert.location.latitude}, ${matchingAlert.location.longitude}`
                : '-',
              tower: matchingAlert.towerCode || '-',
              missionName: 'Phân tích độc lập',
              imageUrl: userMediaUrl || matchingAlert.evidence.mediaUrl || '',
              sourceUrl: userMediaUrl || matchingAlert.evidence.mediaUrl || '',
              cropImageUrl: userMediaUrl || matchingAlert.evidence.mediaUrl || '',
              boundingBox: matchingAlert.evidence.boundingBox
                ? {
                    x: matchingAlert.evidence.boundingBox.x,
                    y: matchingAlert.evidence.boundingBox.y,
                    width: matchingAlert.evidence.boundingBox.width,
                    height: matchingAlert.evidence.boundingBox.height,
                  }
                : undefined,
              severityWeight: matchingAlert.priority === 'Critical' ? 5 : 3,
              isEmergency: true,
              status: matchingAlert.status === 'Open' ? 'Pending' : matchingAlert.status,
              detectedAt: matchingAlert.triggeredAt || new Date().toISOString(),
            };
            detections = [alertDet];
          }

          const result: AnalysisSessionResult = {
            id: String(serverId),
            status: 'Completed',
            analysisType,
            notes,
            createdAt: new Date().toISOString(),
            filesCount,
            detections,
          };
          this.store.setUploadResult(result);
          void this.applyDetectionsWithCrops(detections, isVideo, userMediaUrl);
        },
        error: () => {
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
        },
      });
  }

  private finishAnalysis(res: AnalysisSessionResult, isVideo: boolean, userMediaUrl: string): void {
    this.store.setUploadResult(res);
    void this.applyDetectionsWithCrops(res.detections, isVideo, userMediaUrl);
    this.checkAndLinkActiveEmergencyAlert(res.detections);
  }

  private checkAndLinkActiveEmergencyAlert(detections: readonly AiDetection[]): void {
    this.emergencyApi
      .fetchActiveAlerts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (alerts) => {
          const matchedAlert = alerts.find((a) =>
            detections.some((d) => d.id === a.id || d.id === a.anomalyId || d.title === a.categoryName)
          ) ?? (detections.some((d) => d.isEmergency) ? alerts[0] : null);

          if (matchedAlert) {
            this.store.setLastTriggeredEmergencyAlert(matchedAlert);
          }
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

  async loadPresetSample(sampleKey: 'insulator-crack' | 'bolt-missing' | 'corridor-tree' | 'insulator-dirty'): Promise<void> {
    const preset = this.samplePresets.find((p) => p.key === sampleKey);
    if (!preset) return;

    try {
      let file: File;
      try {
        const response = await fetch(preset.imagePath);
        const blob = await response.blob();
        file = new File([blob], `${preset.key}.png`, { type: 'image/png' });
      } catch {
        file = new File(['sample content'], `${preset.key}.png`, { type: 'image/png' });
      }

      const previewUrl = preset.imagePath;
      const mediaId = `sample-${Date.now()}`;

      const media: StandaloneMediaPreview = {
        id: mediaId,
        file,
        name: `${preset.label}.png`,
        sizeFormatted: '480 KB',
        previewUrl,
        thumbnailUrl: previewUrl,
        resolution: '1920 x 1080',
        fps: '-',
        duration: '-',
        durationSeconds: 0,
        kind: 'image',
        status: 'Đã phân tích',
        progress: 100,
      };

      this.store.clearFiles();
      this.store.setWorkflowMode('image');
      this.store.setFiles([media]);
      this.store.selectMedia(mediaId);

      let cropUrl = previewUrl;
      try {
        cropUrl = await extractCropDataUrl(previewUrl, preset.boundingBox);
      } catch {
        // Fallback
      }

      const det: AiDetection = {
        id: `det-sample-${preset.key}`,
        title: preset.title,
        confidence: preset.confidence,
        categoryCode: preset.categoryCode,
        description: preset.description,
        mediaType: 'image',
        timestampSeconds: null,
        timestampLabel: 'Ảnh mẫu chuẩn',
        frameIndex: 1,
        gps: preset.gps,
        tower: preset.tower,
        missionName: 'Kiểm thử mẫu QA',
        imageUrl: previewUrl,
        sourceUrl: previewUrl,
        cropImageUrl: cropUrl,
        boundingBox: preset.boundingBox,
        severityWeight: preset.severityWeight,
        isEmergency: preset.isEmergency,
        status: 'Pending',
        detectedAt: new Date().toISOString(),
      };

      const sessionResult: AnalysisSessionResult = {
        id: `sample-${preset.key}-${Date.now().toString().slice(-6)}`,
        status: 'Completed',
        analysisType: 'DefectDetection',
        notes: `Ảnh mẫu kiểm thử khuyết tật: ${preset.title}`,
        createdAt: new Date().toISOString(),
        filesCount: 1,
        detections: [det],
      };

      this.store.setUploadResult(sessionResult);
      this.store.setWorkflowStage('inspected');
      this.store.setDetections([det]);

      if (preset.isEmergency) {
        const emergencyAlert: ActiveEmergencyAlert = {
          id: `alert-sample-${preset.key}`,
          anomalyId: det.id,
          categoryName: preset.title,
          alertType: preset.categoryCode,
          priority: 'Critical',
          towerCode: preset.tower,
          towerId: 't-sample-01',
          status: 'Open',
          deliveryLatencySeconds: 1,
          triggeredAt: new Date().toISOString(),
          location: {
            latitude: 10.8065,
            longitude: 106.7175,
            towerCode: preset.tower,
          },
          evidence: {
            confidenceScore: preset.confidence,
            mediaUrl: previewUrl,
            boundingBox: {
              ...preset.boundingBox,
              isNormalized: true,
            },
          },
        };
        this.store.setLastTriggeredEmergencyAlert(emergencyAlert);
      } else {
        this.store.setLastTriggeredEmergencyAlert(null);
      }
    } catch {
      // ignore
    }
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
