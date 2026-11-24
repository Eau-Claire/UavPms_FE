import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { map, Observable, of, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { AnomalyItem } from '../data-access/anomaly-api';
import { ACTIVE_LEARNING_CONFIG } from './active-learning.config';
import {
  AiLabelClass,
  EditableBox,
  ImageLabelContext,
  inferAiLabelClass,
  LabelStatus,
  LearningAcceptanceStatus,
  LearningSubmissionResult,
  SaveImageLabelsPayload,
  SaveImageLabelsResult,
} from './active-learning.models';
import {
  cloneBoxes,
  isVideoUrl,
  normalizeFromAnomalyBox,
  sanitizeNormalizedBox,
} from './box-geometry';

interface LocalStoredLabelRecord {
  readonly mediaKey: string;
  readonly anomalyIds: readonly string[];
  readonly labelStatus: LabelStatus;
  readonly boxes: readonly EditableBox[];
  readonly updatedAt: string;
  readonly learningStatus?: LearningAcceptanceStatus;
}

type LocalLabelStore = Record<string, LocalStoredLabelRecord>;

export interface LoadContextOptions {
  readonly naturalWidth?: number | null;
  readonly naturalHeight?: number | null;
  readonly siblingDetections?: readonly AnomalyItem[];
}

const VALID_CLASSES = new Set<AiLabelClass>([
  'insulator',
  'insulator_broken',
  'insulator_flashover',
  'bird_nest',
  'foreign_object',
  'broken_strand',
]);

@Injectable({ providedIn: 'root' })
export class ActiveLearningGateway {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ACTIVE_LEARNING_CONFIG);
  private readonly apiBase = `${environment.apiBaseUrl}/anomalies`;

  readonly enabled = this.config.enabled;
  readonly isLocalMode = this.config.mode === 'local';

  private readonly statusMapState = signal<Readonly<Record<string, LabelStatus>>>(
    this.config.mode === 'local' ? this.readStatusMapFromStorage() : {},
  );

  private readonly learningStatusMapState = signal<Readonly<Record<string, LearningAcceptanceStatus>>>(
    this.config.mode === 'local' ? this.readLearningStatusMapFromStorage() : {},
  );

  readonly statusMap = this.statusMapState.asReadonly();
  readonly learningStatusMap = this.learningStatusMapState.asReadonly();

  mediaKeyFor(
    item: Pick<AnomalyItem, 'id' | 'mediaUrl'> & {
      readonly mediaId?: string | null;
      readonly frameIndex?: number | null;
    },
  ): string {
    const frameSuffix =
      item.frameIndex !== undefined && item.frameIndex !== null ? `#frame:${item.frameIndex}` : '';
    if (item.mediaId?.trim()) {
      return `media:${item.mediaId.trim()}${frameSuffix}`;
    }
    const cleanUrl = (item.mediaUrl ?? '').split('?')[0].trim();
    if (cleanUrl) {
      return `url:${cleanUrl}${frameSuffix}`;
    }
    return `anomaly:${item.id}`;
  }

  statusFor(
    item: Pick<AnomalyItem, 'id' | 'mediaUrl'> & {
      readonly mediaId?: string | null;
      readonly frameIndex?: number | null;
      readonly labelStatus?: LabelStatus | null;
    },
  ): LabelStatus | null {
    if (!this.enabled) return null;
    if (item.labelStatus) return item.labelStatus;
    const mapState = this.statusMapState();
    const key = this.mediaKeyFor(item);
    return mapState[key] ?? mapState[`anomaly:${item.id}`] ?? null;
  }

  learningStatusFor(
    item: Pick<AnomalyItem, 'id' | 'mediaUrl'> & {
      readonly mediaId?: string | null;
      readonly frameIndex?: number | null;
    },
  ): LearningAcceptanceStatus | null {
    if (!this.enabled) return null;
    const mapState = this.learningStatusMapState();
    const key = this.mediaKeyFor(item);
    return mapState[key] ?? mapState[`anomaly:${item.id}`] ?? null;
  }

  /**
   * Submits a fully-reviewed rejected image to check whether the AI service accepts it
   * into the active-learning training pool.
   */
  submitForLearning(item: AnomalyItem): Observable<LearningSubmissionResult> {
    const mediaKey = this.mediaKeyFor(item);

    if (this.config.mode === 'api') {
      return this.http
        .post<unknown>(`${this.apiBase}/${encodeURIComponent(item.id)}/labels/submit-training`, {
          mediaKey,
          frameIndex: item.frameIndex ?? null,
        })
        .pipe(
          map((res) => {
            const raw = unwrapApiData<Record<string, unknown>>(res) ?? {};
            const accepted = raw['accepted'] === true || raw['status'] === 'Accepted';
            const status: LearningAcceptanceStatus = accepted ? 'Accepted' : 'Rejected';
            const message =
              typeof raw['message'] === 'string' && raw['message'].trim()
                ? raw['message'].trim()
                : accepted
                  ? 'AI đã tiếp nhận ảnh vào tập dữ liệu huấn luyện.'
                  : 'AI từ chối tiếp nhận ảnh này.';
            return {
              mediaKey,
              status,
              message,
              submittedAt: new Date().toISOString(),
            };
          }),
          tap((result) => this.rememberLearningStatus(result.mediaKey, item.id, result.status)),
        );
    }

    const store = this.readStore();
    const record =
      store[mediaKey] ??
      Object.values(store).find((entry) => entry.anomalyIds.includes(item.id));
    const submittedAt = new Date().toISOString();

    if (!record || record.labelStatus !== 'FullyReviewed') {
      return of({
        mediaKey,
        status: 'Rejected',
        message: 'Cần mở "Sửa nhãn" và xác nhận đã kiểm tra toàn bộ ảnh trước khi gửi AI học.',
        submittedAt,
      });
    }

    const validBoxes = record.boxes.every(
      (b) =>
        b.x >= 0 &&
        b.y >= 0 &&
        b.width > 0 &&
        b.height > 0 &&
        b.x + b.width <= 1.0001 &&
        b.y + b.height <= 1.0001,
    );
    const status: LearningAcceptanceStatus = validBoxes ? 'Accepted' : 'Rejected';

    store[record.mediaKey] = {
      ...record,
      learningStatus: status,
    };
    this.writeStore(store);
    this.rememberLearningStatus(record.mediaKey, item.id, status);

    return of({
      mediaKey: record.mediaKey,
      status,
      message: validBoxes
        ? 'AI chấp nhận ảnh hợp lệ để đưa vào tập học (chế độ lưu cục bộ · chờ API).'
        : 'Tọa độ nhãn chưa hợp lệ, vui lòng kiểm tra lại.',
      submittedAt,
    });
  }

  loadContext(item: AnomalyItem, options: LoadContextOptions = {}): Observable<ImageLabelContext> {
    if (this.config.mode === 'api') {
      return this.http
        .get<unknown>(`${this.apiBase}/${encodeURIComponent(item.id)}/label-context`)
        .pipe(
          map((res) => this.normalizeApiContext(unwrapApiData<unknown>(res), item)),
          tap((ctx) => {
            if (ctx.labelStatus) {
              this.rememberStatus(ctx.mediaKey, item.id, ctx.labelStatus);
            }
          }),
        );
    }

    return of(this.buildLocalContext(item, options));
  }

  saveLabels(payload: SaveImageLabelsPayload): Observable<SaveImageLabelsResult> {
    const sanitizedBoxes = payload.boxes.map((box) => {
      const norm = sanitizeNormalizedBox({
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      });
      return {
        className: box.className,
        x: norm.x,
        y: norm.y,
        width: norm.width,
        height: norm.height,
        source: box.source,
        confidence: box.confidence,
      };
    });

    if (this.config.mode === 'api') {
      return this.http
        .put<unknown>(`${this.apiBase}/${encodeURIComponent(payload.anomalyId)}/labels`, {
          isFullyReviewed: payload.isFullyReviewed,
          frameIndex: payload.frameIndex ?? null,
          boxes: sanitizedBoxes,
        })
        .pipe(
          map((res) => {
            const raw = unwrapApiData<Record<string, unknown>>(res) ?? {};
            const status: LabelStatus =
              raw['labelStatus'] === 'FullyReviewed' || payload.isFullyReviewed
                ? 'FullyReviewed'
                : 'Draft';
            const updatedAt =
              typeof raw['updatedAt'] === 'string' ? raw['updatedAt'] : new Date().toISOString();
            const boxes: EditableBox[] = sanitizedBoxes.map((b, idx) => ({
              ...b,
              id: `saved-${idx + 1}`,
            }));
            return {
              mediaKey: payload.mediaKey,
              labelStatus: status,
              boxes,
              updatedAt,
            };
          }),
          tap((result) => this.rememberStatus(result.mediaKey, payload.anomalyId, result.labelStatus)),
        );
    }

    const labelStatus: LabelStatus = payload.isFullyReviewed ? 'FullyReviewed' : 'Draft';
    const updatedAt = new Date().toISOString();
    const editableBoxes: EditableBox[] = sanitizedBoxes.map((b, idx) => ({
      ...b,
      id: `box-${Date.now()}-${idx + 1}`,
    }));

    const store = this.readStore();
    const existing = store[payload.mediaKey];
    const anomalyIds = Array.from(
      new Set([...(existing?.anomalyIds ?? []), payload.anomalyId]),
    );

    store[payload.mediaKey] = {
      mediaKey: payload.mediaKey,
      anomalyIds,
      labelStatus,
      boxes: editableBoxes,
      updatedAt,
    };
    this.writeStore(store);
    this.rememberStatus(payload.mediaKey, payload.anomalyId, labelStatus);

    return of({
      mediaKey: payload.mediaKey,
      labelStatus,
      boxes: cloneBoxes(editableBoxes),
      updatedAt,
    });
  }

  private buildLocalContext(item: AnomalyItem, options: LoadContextOptions): ImageLabelContext {
    const mediaKey = this.mediaKeyFor(item);
    const related = [
      item,
      ...(options.siblingDetections ?? []).filter(
        (other) => other.id !== item.id && this.mediaKeyFor(other) === mediaKey,
      ),
    ];

    const aiBoxes: EditableBox[] = [];
    for (const det of related) {
      const norm = normalizeFromAnomalyBox(
        det.boundingBox,
        options.naturalWidth,
        options.naturalHeight,
      );
      if (!norm) continue;
      aiBoxes.push({
        id: `ai-${det.id}`,
        className: inferAiLabelClass(det.categoryCode, det.categoryName),
        x: norm.x,
        y: norm.y,
        width: norm.width,
        height: norm.height,
        source: 'ai',
        confidence: det.confidenceScore,
      });
    }

    const store = this.readStore();
    const saved =
      store[mediaKey] ??
      Object.values(store).find((entry) => entry.anomalyIds.includes(item.id));

    const imageUrl = item.frameImageUrl || item.mediaUrl || '';
    return {
      anomalyId: item.id,
      mediaKey,
      imageUrl,
      isVideoSource: !item.frameImageUrl && isVideoUrl(imageUrl),
      frameIndex: item.frameIndex ?? null,
      timestampSeconds: item.timestampSeconds ?? null,
      imageWidth: options.naturalWidth ?? null,
      imageHeight: options.naturalHeight ?? null,
      aiBoxes: cloneBoxes(aiBoxes),
      boxes: saved ? cloneBoxes(saved.boxes) : cloneBoxes(aiBoxes),
      labelStatus: saved?.labelStatus ?? item.labelStatus ?? null,
      updatedAt: saved?.updatedAt ?? null,
    };
  }

  private normalizeApiContext(raw: unknown, fallbackItem: AnomalyItem): ImageLabelContext {
    const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const mediaKey =
      typeof obj['mediaKey'] === 'string' && obj['mediaKey'].trim()
        ? obj['mediaKey'].trim()
        : this.mediaKeyFor(fallbackItem);
    const imageUrl =
      typeof obj['imageUrl'] === 'string' && obj['imageUrl'].trim()
        ? obj['imageUrl'].trim()
        : fallbackItem.frameImageUrl || fallbackItem.mediaUrl;
    const aiBoxes = this.parseApiBoxList(obj['aiBoxes'], 'ai');
    const hasSaved = Array.isArray(obj['savedBoxes']);
    const boxes = hasSaved ? this.parseApiBoxList(obj['savedBoxes'], 'manual') : cloneBoxes(aiBoxes);
    const rawStatus = obj['labelStatus'];
    const labelStatus: LabelStatus | null =
      rawStatus === 'FullyReviewed' || rawStatus === 'Draft' ? rawStatus : null;

    return {
      anomalyId: fallbackItem.id,
      mediaKey,
      imageUrl,
      isVideoSource: isVideoUrl(imageUrl),
      frameIndex: typeof obj['frameIndex'] === 'number' ? obj['frameIndex'] : fallbackItem.frameIndex ?? null,
      timestampSeconds:
        typeof obj['timestampSeconds'] === 'number'
          ? obj['timestampSeconds']
          : fallbackItem.timestampSeconds ?? null,
      imageWidth: typeof obj['imageWidth'] === 'number' ? obj['imageWidth'] : null,
      imageHeight: typeof obj['imageHeight'] === 'number' ? obj['imageHeight'] : null,
      aiBoxes,
      boxes,
      labelStatus,
      updatedAt: typeof obj['updatedAt'] === 'string' ? obj['updatedAt'] : null,
    };
  }

  private parseApiBoxList(value: unknown, fallbackSource: 'ai' | 'manual'): EditableBox[] {
    if (!Array.isArray(value)) return [];
    const out: EditableBox[] = [];
    value.forEach((entry, idx) => {
      if (!entry || typeof entry !== 'object') return;
      const r = entry as Record<string, unknown>;
      const rawClass = String(r['className'] ?? r['label'] ?? '').trim() as AiLabelClass;
      const className = VALID_CLASSES.has(rawClass)
        ? rawClass
        : inferAiLabelClass(rawClass, String(r['categoryName'] ?? ''));
      const norm = sanitizeNormalizedBox({
        x: Number(r['x'] ?? 0),
        y: Number(r['y'] ?? 0),
        width: Number(r['width'] ?? r['w'] ?? 0),
        height: Number(r['height'] ?? r['h'] ?? 0),
      });
      const rawConf = r['confidence'] ?? r['confidenceScore'];
      const confNum = rawConf === null || rawConf === undefined ? null : Number(rawConf);
      const confidence =
        confNum !== null && Number.isFinite(confNum)
          ? confNum > 1
            ? Math.round(confNum)
            : Math.round(confNum * 100)
          : null;
      const source = r['source'] === 'ai' || r['source'] === 'manual' ? r['source'] : fallbackSource;
      out.push({
        id: typeof r['id'] === 'string' && r['id'] ? r['id'] : `${source}-${idx + 1}`,
        className,
        x: norm.x,
        y: norm.y,
        width: norm.width,
        height: norm.height,
        source,
        confidence,
      });
    });
    return out;
  }

  private rememberStatus(mediaKey: string, anomalyId: string, status: LabelStatus): void {
    this.statusMapState.update((current) => ({
      ...current,
      [mediaKey]: status,
      [`anomaly:${anomalyId}`]: status,
    }));
  }

  private rememberLearningStatus(
    mediaKey: string,
    anomalyId: string,
    status: LearningAcceptanceStatus,
  ): void {
    this.learningStatusMapState.update((current) => ({
      ...current,
      [mediaKey]: status,
      [`anomaly:${anomalyId}`]: status,
    }));
  }

  private readStore(): LocalLabelStore {
    try {
      const raw = globalThis.localStorage?.getItem(this.config.storageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as LocalLabelStore) : {};
    } catch {
      return {};
    }
  }

  private writeStore(store: LocalLabelStore): void {
    try {
      globalThis.localStorage?.setItem(this.config.storageKey, JSON.stringify(store));
    } catch {
      // Ignore quota / privacy mode errors cleanly.
    }
  }

  private readStatusMapFromStorage(): Readonly<Record<string, LabelStatus>> {
    const store = this.readStore();
    const mapState: Record<string, LabelStatus> = {};
    for (const [key, entry] of Object.entries(store)) {
      if (entry?.labelStatus !== 'FullyReviewed' && entry?.labelStatus !== 'Draft') continue;
      mapState[key] = entry.labelStatus;
      for (const id of entry.anomalyIds ?? []) {
        mapState[`anomaly:${id}`] = entry.labelStatus;
      }
    }
    return mapState;
  }

  private readLearningStatusMapFromStorage(): Readonly<Record<string, LearningAcceptanceStatus>> {
    const store = this.readStore();
    const mapState: Record<string, LearningAcceptanceStatus> = {};
    for (const [key, entry] of Object.entries(store)) {
      if (entry?.learningStatus !== 'Accepted' && entry?.learningStatus !== 'Rejected') continue;
      mapState[key] = entry.learningStatus;
      for (const id of entry.anomalyIds ?? []) {
        mapState[`anomaly:${id}`] = entry.learningStatus;
      }
    }
    return mapState;
  }
}
