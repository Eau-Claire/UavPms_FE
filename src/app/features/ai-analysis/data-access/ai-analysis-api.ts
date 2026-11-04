import { HttpClient, HttpEvent, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';

export type AnalysisType =
  | 'DefectDetection'
  | 'HumanMotionDetection'
  | 'ObjectClassification'
  | 'AssetConditionAssessment'
  | 'General';

export interface StandaloneUploadRequest {
  readonly files: readonly File[];
  readonly analysisType?: AnalysisType;
  readonly notes?: string;
}

export interface DetectionBoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface AiDetection {
  readonly id: string;
  readonly title: string;
  readonly confidence: number;
  readonly categoryCode: string;
  readonly description: string;
  readonly mediaType: 'image' | 'video';
  readonly timestampSeconds: number | null;
  readonly timestampLabel: string;
  readonly frameIndex: number | null;
  readonly gps: string;
  readonly tower: string;
  readonly missionName: string;
  readonly imageUrl: string;
  readonly sourceUrl?: string;
  readonly cropImageUrl?: string;
  readonly boundingBox?: DetectionBoundingBox;
  readonly severityWeight: number;
  readonly isEmergency: boolean;
  readonly status: 'Pending' | 'Approved' | 'Rejected';
  readonly analystNotes?: string;
  readonly detectedAt: string;
}

export interface VideoTimelineMarker {
  readonly id: string;
  readonly detectionId: string;
  readonly timestampSeconds: number;
  readonly timestampLabel: string;
  readonly percent: number;
  readonly title: string;
  readonly confidence: number;
  readonly isEmergency: boolean;
}

export interface AnalysisSessionResult {
  readonly id: string;
  readonly status: string;
  readonly analysisType: AnalysisType;
  readonly notes?: string;
  readonly createdAt: string;
  readonly filesCount: number;
  readonly detections: readonly AiDetection[];
  readonly raw?: unknown;
}

@Injectable({
  providedIn: 'root',
})
export class AiAnalysisApi {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = environment.apiBaseUrl;

  uploadStandaloneAnalysis(request: StandaloneUploadRequest): Observable<HttpEvent<unknown>> {
    const formData = new FormData();
    request.files.forEach((file) => formData.append('files', file, file.name));
    formData.append('analysisType', request.analysisType ?? 'DefectDetection');
    if (request.notes?.trim()) {
      formData.append('notes', request.notes.trim());
    }

    return this.http.post<unknown>(`${this.apiBaseUrl}/ai-analysis/upload`, formData, {
      observe: 'events',
      reportProgress: true,
    });
  }

  getAnalysisResult(id: string): Observable<AnalysisSessionResult> {
    return this.http
      .get<unknown>(`${this.apiBaseUrl}/ai-analysis/${id}`)
      .pipe(map((response) => normalizeAnalysisResult(unwrapApiData(response), id)));
  }

  /**
   * Re-analyze an existing mission media on Cloud (`POST /missions/{missionId}/ai-analysis/from-media/{mediaId}`).
   */
  reanalyzeMissionMedia(
    missionId: string,
    mediaId: string,
    options?: { analysisType?: AnalysisType; preferredModel?: string; notes?: string },
  ): Observable<unknown> {
    let params = new HttpParams()
      .set('analysisType', options?.analysisType ?? 'General')
      .set('preferredModel', options?.preferredModel ?? 'SERVER');
    if (options?.notes?.trim()) {
      params = params.set('notes', options.notes.trim());
    }
    return this.http
      .post<unknown>(`${this.apiBaseUrl}/missions/${missionId}/ai-analysis/from-media/${mediaId}`, {}, { params })
      .pipe(map((response) => unwrapApiData(response)));
  }
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const pick = (source: Record<string, unknown>, ...keys: string[]) =>
  keys.map((key) => source[key]).find((value) => value !== undefined && value !== null);

const stringValue = (value: unknown, fallback = '') =>
  value === undefined || value === null ? fallback : String(value);

const numberValue = (value: unknown) => Number(value ?? 0) || 0;

const nullableNumber = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseTimestampSeconds = (value: unknown): number | null => {
  const direct = nullableNumber(value);
  if (direct !== null) return direct;
  const text = stringValue(value);
  const match = /(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/.exec(text);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
};

const formatTime = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  return `${minutes.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
};

const normalizeBoundingBox = (value: unknown): DetectionBoundingBox | undefined => {
  if (Array.isArray(value) && value.length >= 4) {
    let [x, y, width, height] = value.map(numberValue);
    if (x <= 1 && y <= 1 && width <= 1 && height <= 1) {
      x *= 100;
      y *= 100;
      width *= 100;
      height *= 100;
    }
    return { x, y, width, height };
  }
  if (!value || typeof value !== 'object') return undefined;
  const source = record(value);
  let x = numberValue(source['x'] ?? source['left']);
  let y = numberValue(source['y'] ?? source['top']);
  let width = numberValue(source['width'] ?? source['w']);
  let height = numberValue(source['height'] ?? source['h']);
  if (x <= 1 && y <= 1 && width <= 1 && height <= 1) {
    x *= 100;
    y *= 100;
    width *= 100;
    height *= 100;
  }
  return { x, y, width, height };
};

export function extractCropDataUrl(
  sourceUrl: string,
  box: { x: number; y: number; width: number; height: number },
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const imgWidth = img.naturalWidth || 800;
        const imgHeight = img.naturalHeight || 600;

        const sx = Math.max(0, (box.x / 100) * imgWidth);
        const sy = Math.max(0, (box.y / 100) * imgHeight);
        const sw = Math.min(imgWidth - sx, (box.width / 100) * imgWidth);
        const sh = Math.min(imgHeight - sy, (box.height / 100) * imgHeight);

        canvas.width = Math.max(64, sw);
        canvas.height = Math.max(64, sh);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.9));
          return;
        }
      } catch {
        // Fallback
      }
      resolve(sourceUrl);
    };
    img.onerror = () => resolve(sourceUrl);
    img.src = sourceUrl;
  });
}

export function captureVideoFrameAtTime(videoUrl: string, seconds: number): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = videoUrl;
    video.onloadedmetadata = () => {
      const dur = video.duration || 60;
      video.currentTime = Math.min(seconds, Math.max(0.1, dur - 0.5));
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(640, video.videoWidth || 640);
        canvas.height = Math.min(360, video.videoHeight || 360);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
          return;
        }
      } catch {
        // Fallback
      }
      resolve('/images/defect-preview-frame.png');
    };
    video.onerror = () => resolve('/images/defect-preview-frame.png');
  });
}

const normalizeDetectionItem = (item: unknown, index: number, userMediaUrl?: string): AiDetection => {
  const source = record(item);
  const confidence = numberValue(pick(source, 'confidence', 'score', 'confidenceScore'));
  const timestampSec = parseTimestampSeconds(pick(source, 'timestampSeconds', 'timestamp', 'timeOffset', 'videoTimestamp'));
  const rawMediaType = stringValue(pick(source, 'mediaType', 'kind', 'type'), 'image').toLowerCase();
  const mediaType: 'image' | 'video' = rawMediaType.includes('video') ? 'video' : 'image';
  const imgUrl = stringValue(pick(source, 'imageUrl', 'thumbnailUrl', 'fileUrl'), userMediaUrl || '');

  return {
    id: stringValue(pick(source, 'id', 'detectionId', 'trackId'), `det-${index + 1}`),
    title: stringValue(pick(source, 'title', 'defectType', 'categoryName', 'className', 'label'), 'Khuyết tật phát hiện'),
    confidence: confidence > 1 ? Math.round(confidence) : confidence > 0 ? Math.round(confidence * 100) : 0,
    categoryCode: stringValue(pick(source, 'categoryCode', 'code'), '-'),
    description: stringValue(pick(source, 'description', 'categoryDescription')),
    mediaType,
    timestampSeconds: timestampSec,
    timestampLabel: timestampSec !== null ? formatTime(timestampSec) : `Frame ${index + 1}`,
    frameIndex: nullableNumber(pick(source, 'frameIndex', 'frameNumber')) ?? index + 1,
    gps: stringValue(pick(source, 'gps', 'coordinates', 'location'), '-'),
    tower: stringValue(pick(source, 'tower', 'towerCode', 'poleId'), '-'),
    missionName: stringValue(pick(source, 'missionName', 'missionCode'), 'Phân tích độc lập'),
    imageUrl: imgUrl,
    sourceUrl: stringValue(pick(source, 'sourceUrl', 'fileUrl', 'mediaUrl'), userMediaUrl),
    cropImageUrl: stringValue(pick(source, 'cropImageUrl', 'cropUrl'), imgUrl),
    boundingBox: normalizeBoundingBox(pick(source, 'boundingBox', 'box', 'rawBoundingBox')),
    severityWeight: numberValue(pick(source, 'severityWeight', 'severity')) || 1,
    isEmergency: Boolean(pick(source, 'isEmergency', 'isEmergencyClass')),
    status: (stringValue(pick(source, 'status', 'reviewStatus'), 'Pending')) as 'Pending' | 'Approved' | 'Rejected',
    analystNotes: stringValue(source['analystNotes']),
    detectedAt: stringValue(pick(source, 'detectedAt', 'createdAt', 'timestamp'), new Date().toISOString()),
  };
};

const normalizeAnalysisResult = (value: unknown, fallbackId: string): AnalysisSessionResult => {
  const source = record(value);
  const detectionsRaw = pick(source, 'detections', 'items', 'results', 'anomalies');
  const rawList = Array.isArray(detectionsRaw) ? detectionsRaw : [];
  const detections = rawList.map((item, idx) => normalizeDetectionItem(item, idx));

  return {
    id: stringValue(pick(source, 'id', 'sessionId', 'analysisId'), fallbackId),
    status: stringValue(pick(source, 'status', 'state'), 'Processing'),
    analysisType: (stringValue(pick(source, 'analysisType', 'type'), 'DefectDetection')) as AnalysisType,
    notes: stringValue(pick(source, 'notes', 'description')),
    createdAt: stringValue(
      pick(source, 'createdAt', 'timestamp', 'date'),
      new Date().toISOString(),
    ),
    filesCount: Array.isArray(source['files']) ? source['files'].length : Math.max(1, detections.length),
    detections,
    raw: value,
  };
};
