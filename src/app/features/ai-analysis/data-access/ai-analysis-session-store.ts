import { Injectable, computed, signal } from '@angular/core';
import {
  AiDetection,
  AnalysisSessionResult,
  VideoTimelineMarker,
} from './ai-analysis-api';
import { ActiveEmergencyAlert } from '../../emergency-alerts/models/emergency-alert.models';

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

@Injectable({
  providedIn: 'root',
})
export class AiAnalysisSessionStore {
  // Workflow state
  readonly workflowMode = signal<AnalysisWorkflowMode>('image');
  readonly workflowStage = signal<StandaloneWorkflowStage>('idle');

  // Media
  readonly selectedFiles = signal<readonly StandaloneMediaPreview[]>([]);
  readonly activeMediaId = signal<string>('');

  readonly currentMedia = computed<StandaloneMediaPreview | null>(() => {
    const list = this.selectedFiles();
    if (!list.length) return null;
    return list.find((item) => item.id === this.activeMediaId()) ?? list[0];
  });

  // Detections & Inspection
  readonly allDetections = signal<readonly AiDetection[]>([]);
  readonly confidenceThreshold = signal<number>(60);
  readonly selectedCategoryFilter = signal<string>('ALL');
  readonly selectedDetection = signal<AiDetection | null>(null);
  readonly showBoundingBoxes = signal<boolean>(true);
  readonly reviewNotes = signal<string>('');
  readonly reviewFeedback = signal<string>('');

  // Results & Emergency alerts
  readonly uploadSuccessResult = signal<AnalysisSessionResult | null>(null);
  readonly lastTriggeredEmergencyAlert = signal<ActiveEmergencyAlert | null>(null);

  // Form persistence
  readonly formNotes = signal<string>('');
  readonly formAnalysisType = signal<string>('DefectDetection');
  readonly formPreferredModel = signal<string>('DefectDetection-Standard');

  // Video Inspection State
  readonly isVideoPlaying = signal<boolean>(false);
  readonly videoCurrentTime = signal<number>(0);
  readonly videoDuration = signal<number>(0);
  readonly videoHoveredMarker = signal<VideoTimelineMarker | null>(null);

  // Filtered Detections
  readonly filteredDetections = computed<readonly AiDetection[]>(() => {
    const thresh = this.confidenceThreshold();
    const cat = this.selectedCategoryFilter();
    return this.allDetections().filter((det) => {
      if (det.confidence < thresh) return false;
      if (cat !== 'ALL' && det.categoryCode !== cat && det.title !== cat) return false;
      return true;
    });
  });

  // Timeline Markers for Video
  readonly videoTimelineMarkers = computed<readonly VideoTimelineMarker[]>(() => {
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
  readonly availableCategories = computed<readonly string[]>(() => {
    const set = new Set<string>();
    this.allDetections().forEach((d) => set.add(d.title));
    return Array.from(set);
  });

  setWorkflowMode(mode: AnalysisWorkflowMode): void {
    if (this.workflowMode() === mode) return;
    this.workflowMode.set(mode);
    if (this.workflowStage() === 'ready' || this.workflowStage() === 'inspected') {
      this.clearFiles();
    }
  }

  setWorkflowStage(stage: StandaloneWorkflowStage): void {
    this.workflowStage.set(stage);
  }

  setFiles(files: readonly StandaloneMediaPreview[]): void {
    this.selectedFiles.set(files);
    if (!this.activeMediaId() && files.length > 0) {
      this.activeMediaId.set(files[0].id);
    }
  }

  updateMedia(id: string, patch: Partial<StandaloneMediaPreview>): void {
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

  removeFile(id: string): void {
    const removed = this.selectedFiles().find((m) => m.id === id);
    if (removed) {
      try {
        URL.revokeObjectURL(removed.previewUrl);
      } catch {
        // ignore
      }
    }
    const remaining = this.selectedFiles().filter((m) => m.id !== id);
    this.selectedFiles.set(remaining);
    if (this.activeMediaId() === id) {
      this.activeMediaId.set(remaining[0]?.id ?? '');
    }
    if (!remaining.length) {
      this.workflowStage.set('idle');
    }
  }

  clearFiles(): void {
    this.selectedFiles().forEach((m) => {
      try {
        URL.revokeObjectURL(m.previewUrl);
      } catch {
        // ignore
      }
    });
    this.selectedFiles.set([]);
    this.activeMediaId.set('');
    this.workflowStage.set('idle');
    this.uploadSuccessResult.set(null);
    this.allDetections.set([]);
    this.selectedDetection.set(null);
    this.lastTriggeredEmergencyAlert.set(null);
    this.reviewNotes.set('');
    this.reviewFeedback.set('');
  }

  setDetections(detections: readonly AiDetection[]): void {
    this.allDetections.set(detections);
    if (detections.length > 0) {
      this.selectedDetection.set(detections[0]);
    } else {
      this.selectedDetection.set(null);
    }
  }

  selectDetection(detection: AiDetection | null): void {
    this.selectedDetection.set(detection);
    if (detection) {
      this.reviewNotes.set(detection.analystNotes ?? '');
      this.reviewFeedback.set('');
    }
  }

  updateDetection(updated: AiDetection): void {
    this.selectedDetection.set(updated);
    this.allDetections.update((list) =>
      list.map((item) => (item.id === updated.id ? updated : item)),
    );
  }

  setConfidenceThreshold(val: number): void {
    this.confidenceThreshold.set(val);
  }

  setSelectedCategoryFilter(cat: string): void {
    this.selectedCategoryFilter.set(cat);
  }

  toggleBoundingBoxes(): void {
    this.showBoundingBoxes.update((v) => !v);
  }

  setReviewNotes(notes: string): void {
    this.reviewNotes.set(notes);
  }

  setReviewFeedback(feedback: string): void {
    this.reviewFeedback.set(feedback);
  }

  setUploadResult(result: AnalysisSessionResult | null): void {
    this.uploadSuccessResult.set(result);
  }

  setLastTriggeredEmergencyAlert(alert: ActiveEmergencyAlert | null): void {
    this.lastTriggeredEmergencyAlert.set(alert);
  }

  resetSession(): void {
    this.clearFiles();
    this.formNotes.set('');
    this.formAnalysisType.set('DefectDetection');
    this.formPreferredModel.set('DefectDetection-Standard');
  }
}

