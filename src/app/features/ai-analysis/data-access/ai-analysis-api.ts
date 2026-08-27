import { HttpClient, HttpEvent } from '@angular/common/http';
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
  const imgUrl = stringValue(pick(source, 'imageUrl', 'thumbnailUrl', 'fileUrl'), userMediaUrl || '/images/defect-insulator-crack.png');

  return {
    id: stringValue(pick(source, 'id', 'detectionId', 'trackId'), `det-${index + 1}`),
    title: stringValue(pick(source, 'title', 'defectType', 'categoryName', 'className', 'label'), 'Bát cách điện nứt vỡ (Broken Insulator)'),
    confidence: confidence > 1 ? Math.round(confidence) : confidence > 0 ? Math.round(confidence * 100) : 92,
    categoryCode: stringValue(pick(source, 'categoryCode', 'code'), 'DEF-INS-01'),
    description: stringValue(pick(source, 'description', 'categoryDescription'), 'Phát hiện vết nứt dọc thân bát sứ cách điện pha B.'),
    mediaType,
    timestampSeconds: timestampSec,
    timestampLabel: timestampSec !== null ? formatTime(timestampSec) : `Frame ${index * 30 + 12}`,
    frameIndex: nullableNumber(pick(source, 'frameIndex', 'frameNumber')) ?? (index * 30 + 12),
    gps: stringValue(pick(source, 'gps', 'coordinates', 'location'), '20°58\'14.2"N 105°48\'22.6"E'),
    tower: stringValue(pick(source, 'tower', 'towerCode', 'poleId'), 'Cột 042 (TOW-220KV-042)'),
    missionName: stringValue(pick(source, 'missionName', 'missionCode'), 'Khảo sát độc lập (Standalone)'),
    imageUrl: imgUrl,
    sourceUrl: stringValue(pick(source, 'sourceUrl', 'fileUrl', 'mediaUrl'), userMediaUrl),
    cropImageUrl: stringValue(pick(source, 'cropImageUrl', 'cropUrl'), imgUrl),
    boundingBox: normalizeBoundingBox(pick(source, 'boundingBox', 'box', 'rawBoundingBox')) ?? {
      x: 32 + (index * 8) % 30,
      y: 24 + (index * 6) % 25,
      width: 28,
      height: 32,
    },
    severityWeight: numberValue(pick(source, 'severityWeight', 'severity')) || 4,
    isEmergency: Boolean(pick(source, 'isEmergency', 'isEmergencyClass')) || index === 0,
    status: (stringValue(pick(source, 'status', 'reviewStatus'), 'Pending')) as 'Pending' | 'Approved' | 'Rejected',
    analystNotes: stringValue(source['analystNotes']),
    detectedAt: stringValue(pick(source, 'detectedAt', 'createdAt', 'timestamp'), new Date().toISOString()),
  };
};

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export const createSimulatedDetections = (
  fileNames: readonly string[],
  isVideo: boolean,
  videoDurationSec = 60,
  userMediaUrl?: string,
  preferredModel = 'YOLOv8-PowerGrid-X',
): readonly AiDetection[] => {
  const isThermal = preferredModel.toLowerCase().includes('thermal');
  const isClassifier = preferredModel.toLowerCase().includes('transformer') || preferredModel.toLowerCase().includes('classifier');

  if (isVideo) {
    const dur = Math.max(10, videoDurationSec);
    const step1 = Math.max(4, Math.round(dur * 0.15));
    const step2 = Math.max(8, Math.round(dur * 0.4));
    const step3 = Math.max(12, Math.round(dur * 0.75));
    const timestamps = [step1, step2, step3].filter((t) => t < dur);
    if (!timestamps.length) timestamps.push(Math.round(dur / 2));

    const videoCatalog = [
      {
        title: isThermal ? 'Điểm phát nhiệt bất thường kẹp lèo (Hotspot 78°C)' : 'Bát cách điện nứt vỡ (Broken Insulator)',
        code: isThermal ? 'TH-HOT-01' : 'DEF-INS-CRACK',
        desc: isThermal ? 'Nhiệt độ mối nối vượt ngưỡng định mức 35°C so với môi trường.' : 'Vết nứt đĩa sứ cách điện chuỗi đỡ néo, nguy cơ phóng điện cao.',
        conf: 95,
        emergency: true,
        box: { x: 34, y: 25, width: 28, height: 32 },
      },
      {
        title: isThermal ? 'Quá nhiệt đầu cốt dao cách ly (Overheat 84°C)' : 'Bung lỏng bu lông thanh giằng (Missing Bolt)',
        code: isThermal ? 'TH-HOT-02' : 'DEF-BOLT-LOOSE',
        desc: isThermal ? 'Tiếp xúc ngàm dao cách ly kém gây tăng điện trở tiếp xúc.' : 'Thiếu đai ốc hãm tại liên kết thanh giằng chữ V thân cột.',
        conf: 89,
        emergency: false,
        box: { x: 50, y: 38, width: 22, height: 26 },
      },
      {
        title: 'Cây vi phạm hành lang an toàn (Corridor Tree)',
        code: 'DEF-VEG-CLEARANCE',
        desc: 'Ngọn cây cao phát triển sát dây dẫn pha dưới < 3.2m.',
        conf: 93,
        emergency: true,
        box: { x: 58, y: 50, width: 32, height: 36 },
      },
    ];

    return timestamps.map((ts, idx) => {
      const def = videoCatalog[idx % videoCatalog.length];
      return {
        id: `vid-det-${idx + 1}`,
        title: def.title,
        confidence: def.conf,
        categoryCode: def.code,
        description: def.desc,
        mediaType: 'video',
        timestampSeconds: ts,
        timestampLabel: formatTime(ts),
        frameIndex: ts * 30,
        gps: `20°58'${(14 + idx * 2).toFixed(1)}"N 105°48'${(22 + idx * 3).toFixed(1)}"E`,
        tower: `Cột 04${2 + idx} (TOW-220KV-04${2 + idx})`,
        missionName: 'AI Inspection Video Stream',
        imageUrl: userMediaUrl || '/images/defect-preview-frame.png',
        sourceUrl: userMediaUrl,
        cropImageUrl: userMediaUrl || '/images/defect-preview-frame.png',
        boundingBox: def.box,
        severityWeight: def.emergency ? 5 : 3,
        isEmergency: def.emergency,
        status: 'Pending',
        detectedAt: new Date(Date.now() - (dur - ts) * 1000).toISOString(),
      };
    });
  }

  // Image mode: Tailor defects uniquely per uploaded image file!
  const imageDefectCatalog = [
    {
      title: 'Bát cách điện nứt vỡ (Broken Insulator)',
      code: 'DEF-INS-CRACK',
      desc: 'Phát hiện vết rạn nứt cấu trúc bát sứ chuỗi néo số 2.',
      conf: 94,
      box: { x: 32, y: 22, width: 30, height: 35 },
      emergency: true,
    },
    {
      title: 'Bung lỏng bu lông xà (Missing Bolt)',
      code: 'DEF-BOLT-LOOSE',
      desc: 'Đai ốc thanh giằng góc có dấu hiệu tuột ren hoặc lỏng lỏng.',
      conf: 88,
      box: { x: 62, y: 48, width: 20, height: 24 },
      emergency: false,
    },
    {
      title: 'Bám bẩn bề mặt cách điện (Dirty Insulator)',
      code: 'DEF-INS-DIRT',
      desc: 'Màng bụi ô nhiễm bám dính dày đặc trên gờ đĩa cách điện pha giữa.',
      conf: 91,
      box: { x: 22, y: 35, width: 26, height: 30 },
      emergency: false,
    },
    {
      title: 'Xơ tước dây dẫn (Conductor Strand Damage)',
      code: 'DEF-COND-STRAND',
      desc: 'Tổn thương cơ học đứt tơ dây dẫn tại điểm kẹp treo.',
      conf: 87,
      box: { x: 45, y: 55, width: 34, height: 22 },
      emergency: true,
    },
    {
      title: 'Chống rung tuột lệch vị trí (Vibration Damper Loose)',
      code: 'DEF-DAMPER-SLIP',
      desc: 'Quả tạ chống rung bị trượt khỏi vị trí thiết kế trên dây pha B.',
      conf: 90,
      box: { x: 18, y: 60, width: 24, height: 26 },
      emergency: false,
    },
  ];

  const actualImg = userMediaUrl || '/images/defect-insulator-crack.png';

  return fileNames.flatMap((fileName, fIdx) => {
    const seed = simpleHash(fileName || `file-${fIdx}`);
    const firstDefectIdx = seed % imageDefectCatalog.length;
    const secondDefectIdx = (seed + 2) % imageDefectCatalog.length;

    const d1 = imageDefectCatalog[firstDefectIdx];
    const d2 = imageDefectCatalog[secondDefectIdx];

    // Compute dynamic bounding box offsets based on filename seed
    const b1 = {
      x: Math.max(10, Math.min(65, d1.box.x + (seed % 15) - 7)),
      y: Math.max(10, Math.min(60, d1.box.y + ((seed >> 2) % 15) - 7)),
      width: d1.box.width,
      height: d1.box.height,
    };
    const b2 = {
      x: Math.max(10, Math.min(68, d2.box.x + ((seed >> 4) % 15) - 7)),
      y: Math.max(10, Math.min(65, d2.box.y + ((seed >> 6) % 15) - 7)),
      width: d2.box.width,
      height: d2.box.height,
    };

    return [
      {
        id: `img-det-${fIdx + 1}-1`,
        title: d1.title,
        confidence: Math.min(99, Math.max(82, d1.conf + (seed % 7) - 3)),
        categoryCode: d1.code,
        description: d1.desc,
        mediaType: 'image' as const,
        timestampSeconds: null,
        timestampLabel: `Frame ${fIdx + 1}`,
        frameIndex: fIdx + 1,
        gps: `20°58'${(14 + (seed % 20) * 0.5).toFixed(1)}"N 105°48'${(22 + (seed % 15) * 0.5).toFixed(1)}"E`,
        tower: `Cột 04${(seed % 8) + 1} (TOW-220KV-04${(seed % 8) + 1})`,
        missionName: fileName || 'AI Inspection Direct Image',
        imageUrl: actualImg,
        sourceUrl: actualImg,
        cropImageUrl: actualImg,
        boundingBox: b1,
        severityWeight: d1.emergency ? 5 : 3,
        isEmergency: d1.emergency,
        status: 'Pending' as const,
        detectedAt: new Date().toISOString(),
      },
      {
        id: `img-det-${fIdx + 1}-2`,
        title: d2.title,
        confidence: Math.min(98, Math.max(80, d2.conf + ((seed >> 3) % 7) - 3)),
        categoryCode: d2.code,
        description: d2.desc,
        mediaType: 'image' as const,
        timestampSeconds: null,
        timestampLabel: `Frame ${fIdx + 1}`,
        frameIndex: fIdx + 1,
        gps: `20°58'${(14 + (seed % 20) * 0.5).toFixed(1)}"N 105°48'${(22 + (seed % 15) * 0.5).toFixed(1)}"E`,
        tower: `Cột 04${(seed % 8) + 1} (TOW-220KV-04${(seed % 8) + 1})`,
        missionName: fileName || 'AI Inspection Direct Image',
        imageUrl: actualImg,
        sourceUrl: actualImg,
        cropImageUrl: actualImg,
        boundingBox: b2,
        severityWeight: d2.emergency ? 5 : 3,
        isEmergency: d2.emergency,
        status: 'Pending' as const,
        detectedAt: new Date().toISOString(),
      },
    ];
  });
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
