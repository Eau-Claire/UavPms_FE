import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { AnomalyItem } from '../../data-access/anomaly-api';
import { ActiveLearningGateway } from '../active-learning-gateway';
import {
  AI_LABEL_CLASSES,
  AiLabelClass,
  classByShortcut,
  EditableBox,
  getLabelClassMeta,
  ImageLabelContext,
  NormalizedBox,
  SaveImageLabelsResult,
} from '../active-learning.models';
import {
  clientPointToNormalized,
  cloneBoxes,
  moveBox,
  rectFromDrag,
  resizeBox,
  ResizeHandle,
} from '../box-geometry';

type EditorTool = 'select' | 'draw' | 'pan';

interface ActiveDrag {
  readonly mode: 'move' | 'resize' | 'draw' | 'pan';
  readonly pointerId: number;
  readonly boxId?: string;
  readonly handle?: ResizeHandle;
  readonly startNormX: number;
  readonly startNormY: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startPanX: number;
  readonly startPanY: number;
  readonly originBox?: EditableBox;
  readonly beforeSnapshot?: EditableBox[];
  mutated: boolean;
}

const RESIZE_HANDLES: readonly ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const MAX_HISTORY = 50;

@Component({
  selector: 'app-label-editor-modal',
  host: {
    '(document:keydown)': 'onDocumentKeyDown($event)',
    '(document:keyup)': 'onDocumentKeyUp($event)',
  },
  templateUrl: './label-editor-modal.html',
  styleUrl: './label-editor-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabelEditorModal {
  private readonly gateway = inject(ActiveLearningGateway);
  private readonly destroyRef = inject(DestroyRef);

  readonly anomaly = input.required<AnomalyItem>();
  readonly naturalWidth = input<number>(0);
  readonly naturalHeight = input<number>(0);
  readonly siblingDetections = input<readonly AnomalyItem[]>([]);

  readonly saved = output<SaveImageLabelsResult>();
  readonly closed = output<void>();

  private readonly imageElRef = viewChild<ElementRef<HTMLImageElement>>('editorImage');

  protected readonly classes = AI_LABEL_CLASSES;
  protected readonly resizeHandles = RESIZE_HANDLES;
  protected readonly isLocalMode = this.gateway.isLocalMode;
  protected readonly getLabelClassMeta = getLabelClassMeta;

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly context = signal<ImageLabelContext | null>(null);
  protected readonly displayImageUrl = signal('');
  protected readonly frameExtracting = signal(false);
  protected readonly frameExtractError = signal('');

  protected readonly boxes = signal<EditableBox[]>([]);
  protected readonly selectedBoxId = signal<string | null>(null);
  protected readonly activeDrawClass = signal<AiLabelClass>('insulator_broken');
  protected readonly tool = signal<EditorTool>('select');
  protected readonly spacePressed = signal(false);

  protected readonly zoom = signal(1);
  protected readonly panX = signal(0);
  protected readonly panY = signal(0);
  protected readonly draftDrawRect = signal<NormalizedBox | null>(null);

  protected readonly fullyReviewed = signal(false);
  protected readonly undoStack = signal<EditableBox[][]>([]);
  protected readonly redoStack = signal<EditableBox[][]>([]);
  protected readonly loadedImageWidth = signal(0);
  protected readonly loadedImageHeight = signal(0);

  private activeDrag: ActiveDrag | null = null;
  private manualCounter = 0;

  protected readonly effectiveTool = computed<EditorTool>(() =>
    this.spacePressed() ? 'pan' : this.tool(),
  );

  protected readonly selectedBox = computed<EditableBox | null>(() => {
    const id = this.selectedBoxId();
    return id ? this.boxes().find((b) => b.id === id) ?? null : null;
  });

  protected readonly canUndo = computed(() => this.undoStack().length > 0);
  protected readonly canRedo = computed(() => this.redoStack().length > 0);
  protected readonly canResetToAi = computed(() => {
    const ctx = this.context();
    if (!ctx) return false;
    return JSON.stringify(this.boxes()) !== JSON.stringify(ctx.aiBoxes);
  });

  protected readonly stageTransform = computed(
    () => `translate(${this.panX()}px, ${this.panY()}px) scale(${this.zoom()})`,
  );

  protected readonly zoomPercent = computed(() => `${Math.round(this.zoom() * 100)}%`);

  constructor() {
    effect(() => {
      const item = this.anomaly();
      const nw = this.naturalWidth();
      const nh = this.naturalHeight();
      const siblings = this.siblingDetections();
      this.loadEditorContext(item, nw, nh, siblings);
    });
  }

  private loadEditorContext(
    item: AnomalyItem,
    naturalWidth: number,
    naturalHeight: number,
    siblingDetections: readonly AnomalyItem[],
  ): void {
    this.loading.set(true);
    this.error.set('');
    this.frameExtractError.set('');
    this.undoStack.set([]);
    this.redoStack.set([]);
    this.selectedBoxId.set(null);
    this.zoom.set(1);
    this.panX.set(0);
    this.panY.set(0);

    this.gateway
      .loadContext(item, {
        naturalWidth: naturalWidth || null,
        naturalHeight: naturalHeight || null,
        siblingDetections,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (ctx) => {
          this.context.set(ctx);
          const initialBoxes = cloneBoxes(ctx.boxes);
          this.boxes.set(initialBoxes);
          this.selectedBoxId.set(initialBoxes[0]?.id ?? null);
          this.fullyReviewed.set(ctx.labelStatus === 'FullyReviewed');
          this.loadedImageWidth.set(ctx.imageWidth ?? naturalWidth);
          this.loadedImageHeight.set(ctx.imageHeight ?? naturalHeight);

          if (ctx.isVideoSource && ctx.imageUrl) {
            void this.extractVideoFrame(ctx.imageUrl, ctx.timestampSeconds ?? 0);
          } else {
            this.displayImageUrl.set(ctx.imageUrl);
          }
        },
        error: () => {
          this.error.set('Không thể tải dữ liệu nhãn cho ảnh này.');
        },
      });
  }

  private async extractVideoFrame(videoUrl: string, timestampSeconds: number): Promise<void> {
    this.frameExtracting.set(true);
    this.frameExtractError.set('');
    try {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = videoUrl;

      await new Promise<void>((resolve, reject) => {
        const onLoaded = () => {
          video.removeEventListener('loadeddata', onLoaded);
          video.removeEventListener('error', onError);
          resolve();
        };
        const onError = () => {
          video.removeEventListener('loadeddata', onLoaded);
          video.removeEventListener('error', onError);
          reject(new Error('video load failed'));
        };
        video.addEventListener('loadeddata', onLoaded);
        video.addEventListener('error', onError);
      });

      const targetTime = Math.max(
        0,
        Math.min(timestampSeconds || 0, Number.isFinite(video.duration) ? video.duration : 0),
      );
      if (targetTime > 0) {
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
          };
          video.addEventListener('seeked', onSeeked);
          video.currentTime = targetTime;
        });
      }

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas unavailable');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      this.loadedImageWidth.set(canvas.width);
      this.loadedImageHeight.set(canvas.height);
      this.displayImageUrl.set(canvas.toDataURL('image/jpeg', 0.92));
    } catch {
      this.frameExtractError.set(
        'Không thể trích xuất frame từ video (CORS hoặc định dạng không hỗ trợ).',
      );
      this.displayImageUrl.set('');
    } finally {
      this.frameExtracting.set(false);
    }
  }

  protected onImageLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      this.loadedImageWidth.set(img.naturalWidth);
      this.loadedImageHeight.set(img.naturalHeight);
    }
  }

  protected setTool(nextTool: EditorTool): void {
    this.tool.set(nextTool);
    this.draftDrawRect.set(null);
  }

  protected zoomIn(): void {
    this.zoom.update((z) => Math.min(5, Math.round((z + 0.25) * 100) / 100));
  }

  protected zoomOut(): void {
    this.zoom.update((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100));
  }

  protected resetView(): void {
    this.zoom.set(1);
    this.panX.set(0);
    this.panY.set(0);
  }

  protected onStageWheel(event: WheelEvent): void {
    event.preventDefault();
    if (event.deltaY < 0) {
      this.zoomIn();
    } else {
      this.zoomOut();
    }
  }

  protected selectBox(id: string | null): void {
    this.selectedBoxId.set(id);
  }

  protected changeBoxClass(boxId: string, nextClass: AiLabelClass): void {
    const current = this.boxes();
    const target = current.find((b) => b.id === boxId);
    if (!target || target.className === nextClass) return;
    this.pushUndo(current);
    this.boxes.set(
      current.map((b) => (b.id === boxId ? { ...b, className: nextClass } : b)),
    );
  }

  protected onBoxClassSelect(boxId: string, event: Event): void {
    const value = (event.target as HTMLSelectElement).value as AiLabelClass;
    this.changeBoxClass(boxId, value);
  }

  protected onDefaultDrawClassChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as AiLabelClass;
    this.activeDrawClass.set(value);
  }

  protected deleteBox(boxId: string): void {
    const current = this.boxes();
    if (!current.some((b) => b.id === boxId)) return;
    this.pushUndo(current);
    const next = current.filter((b) => b.id !== boxId);
    this.boxes.set(next);
    if (this.selectedBoxId() === boxId) {
      this.selectedBoxId.set(next[0]?.id ?? null);
    }
  }

  protected undo(): void {
    const stack = this.undoStack();
    if (!stack.length) return;
    const prev = stack[stack.length - 1];
    this.redoStack.update((r) => [...r.slice(-(MAX_HISTORY - 1)), cloneBoxes(this.boxes())]);
    this.undoStack.set(stack.slice(0, -1));
    this.boxes.set(cloneBoxes(prev));
    if (this.selectedBoxId() && !prev.some((b) => b.id === this.selectedBoxId())) {
      this.selectedBoxId.set(prev[0]?.id ?? null);
    }
  }

  protected redo(): void {
    const stack = this.redoStack();
    if (!stack.length) return;
    const next = stack[stack.length - 1];
    this.undoStack.update((u) => [...u.slice(-(MAX_HISTORY - 1)), cloneBoxes(this.boxes())]);
    this.redoStack.set(stack.slice(0, -1));
    this.boxes.set(cloneBoxes(next));
  }

  protected resetToAiBoxes(): void {
    const ctx = this.context();
    if (!ctx) return;
    this.pushUndo(this.boxes());
    const reset = cloneBoxes(ctx.aiBoxes);
    this.boxes.set(reset);
    this.selectedBoxId.set(reset[0]?.id ?? null);
  }

  protected onFullyReviewedChange(event: Event): void {
    this.fullyReviewed.set((event.target as HTMLInputElement).checked);
  }

  protected onStagePointerDown(event: PointerEvent): void {
    if (event.button === 1 || this.effectiveTool() === 'pan') {
      event.preventDefault();
      this.capturePointer(event);
      this.activeDrag = {
        mode: 'pan',
        pointerId: event.pointerId,
        startNormX: 0,
        startNormY: 0,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPanX: this.panX(),
        startPanY: this.panY(),
        mutated: false,
      };
      return;
    }

    if (event.button !== 0) return;

    const imageRect = this.getImageRect();
    if (!imageRect) return;

    if (this.effectiveTool() === 'draw') {
      event.preventDefault();
      const pt = clientPointToNormalized(event.clientX, event.clientY, imageRect);
      this.capturePointer(event);
      this.activeDrag = {
        mode: 'draw',
        pointerId: event.pointerId,
        startNormX: pt.x,
        startNormY: pt.y,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPanX: 0,
        startPanY: 0,
        mutated: false,
      };
      this.draftDrawRect.set({ x: pt.x, y: pt.y, width: 0, height: 0 });
      return;
    }

    // Clicked empty background in select mode -> deselect
    this.selectedBoxId.set(null);
  }

  protected onBoxPointerDown(box: EditableBox, event: PointerEvent): void {
    if (event.button === 1 || this.effectiveTool() === 'pan' || this.effectiveTool() === 'draw') {
      return;
    }
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();

    this.selectedBoxId.set(box.id);
    const imageRect = this.getImageRect();
    if (!imageRect) return;
    const pt = clientPointToNormalized(event.clientX, event.clientY, imageRect);
    this.capturePointer(event);

    this.activeDrag = {
      mode: 'move',
      pointerId: event.pointerId,
      boxId: box.id,
      startNormX: pt.x,
      startNormY: pt.y,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPanX: 0,
      startPanY: 0,
      originBox: { ...box },
      beforeSnapshot: cloneBoxes(this.boxes()),
      mutated: false,
    };
  }

  protected onHandlePointerDown(
    box: EditableBox,
    handle: ResizeHandle,
    event: PointerEvent,
  ): void {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();

    this.selectedBoxId.set(box.id);
    const imageRect = this.getImageRect();
    if (!imageRect) return;
    const pt = clientPointToNormalized(event.clientX, event.clientY, imageRect);
    this.capturePointer(event);

    this.activeDrag = {
      mode: 'resize',
      pointerId: event.pointerId,
      boxId: box.id,
      handle,
      startNormX: pt.x,
      startNormY: pt.y,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPanX: 0,
      startPanY: 0,
      originBox: { ...box },
      beforeSnapshot: cloneBoxes(this.boxes()),
      mutated: false,
    };
  }

  protected onStagePointerMove(event: PointerEvent): void {
    const drag = this.activeDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (drag.mode === 'pan') {
      this.panX.set(drag.startPanX + (event.clientX - drag.startClientX));
      this.panY.set(drag.startPanY + (event.clientY - drag.startClientY));
      return;
    }

    const imageRect = this.getImageRect();
    if (!imageRect) return;
    const pt = clientPointToNormalized(event.clientX, event.clientY, imageRect);

    if (drag.mode === 'draw') {
      const x1 = Math.min(drag.startNormX, pt.x);
      const y1 = Math.min(drag.startNormY, pt.y);
      this.draftDrawRect.set({
        x: x1,
        y: y1,
        width: Math.abs(pt.x - drag.startNormX),
        height: Math.abs(pt.y - drag.startNormY),
      });
      return;
    }

    if (drag.mode === 'move' && drag.originBox && drag.boxId) {
      const dx = pt.x - drag.startNormX;
      const dy = pt.y - drag.startNormY;
      if (Math.abs(dx) < 0.0005 && Math.abs(dy) < 0.0005) return;
      const moved = moveBox(drag.originBox, dx, dy);
      drag.mutated = true;
      this.boxes.update((list) =>
        list.map((b) => (b.id === drag.boxId ? { ...b, ...moved } : b)),
      );
      return;
    }

    if (drag.mode === 'resize' && drag.originBox && drag.boxId && drag.handle) {
      const resized = resizeBox(drag.originBox, drag.handle, pt.x, pt.y);
      drag.mutated = true;
      this.boxes.update((list) =>
        list.map((b) => (b.id === drag.boxId ? { ...b, ...resized } : b)),
      );
    }
  }

  protected onStagePointerUp(event: PointerEvent): void {
    const drag = this.activeDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this.activeDrag = null;

    if (drag.mode === 'draw') {
      const imageRect = this.getImageRect();
      this.draftDrawRect.set(null);
      if (!imageRect) return;
      const pt = clientPointToNormalized(event.clientX, event.clientY, imageRect);
      const rect = rectFromDrag(drag.startNormX, drag.startNormY, pt.x, pt.y);
      if (!rect) return;

      this.pushUndo(this.boxes());
      this.manualCounter += 1;
      const newBox: EditableBox = {
        id: `manual-${Date.now()}-${this.manualCounter}`,
        className: this.activeDrawClass(),
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        source: 'manual',
        confidence: null,
      };
      this.boxes.update((list) => [...list, newBox]);
      this.selectedBoxId.set(newBox.id);
      this.tool.set('select');
      return;
    }

    if ((drag.mode === 'move' || drag.mode === 'resize') && drag.mutated && drag.beforeSnapshot) {
      this.pushUndo(drag.beforeSnapshot);
    }
  }

  protected save(): void {
    const ctx = this.context();
    if (!ctx || this.saving()) return;

    this.saving.set(true);
    this.error.set('');

    this.gateway
      .saveLabels({
        anomalyId: ctx.anomalyId,
        mediaKey: ctx.mediaKey,
        isFullyReviewed: this.fullyReviewed(),
        frameIndex: ctx.frameIndex,
        boxes: this.boxes().map((b) => ({
          className: b.className,
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          source: b.source,
          confidence: b.confidence,
        })),
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: (result) => {
          this.saved.emit(result);
        },
        error: () => {
          this.error.set('Không thể lưu bộ nhãn. Vui lòng thử lại.');
        },
      });
  }

  protected close(): void {
    if (this.saving()) return;
    this.closed.emit();
  }

  protected onDocumentKeyDown(event: KeyboardEvent): void {
    if (this.isTypingTarget(event.target)) return;

    if (event.key === 'Escape') {
      if (this.draftDrawRect()) {
        this.draftDrawRect.set(null);
        this.activeDrag = null;
        return;
      }
      if (this.tool() === 'draw') {
        this.tool.set('select');
        return;
      }
      this.close();
      return;
    }

    if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      this.spacePressed.set(true);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        this.redo();
      } else {
        this.undo();
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.redo();
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      const selected = this.selectedBoxId();
      if (selected) {
        event.preventDefault();
        this.deleteBox(selected);
      }
      return;
    }

    const shortcutClass = classByShortcut(event.key);
    if (shortcutClass) {
      event.preventDefault();
      const selected = this.selectedBoxId();
      if (selected) {
        this.changeBoxClass(selected, shortcutClass);
      } else {
        this.activeDrawClass.set(shortcutClass);
      }
      return;
    }

    if (event.key.toLowerCase() === 'n') {
      this.setTool(this.tool() === 'draw' ? 'select' : 'draw');
    } else if (event.key.toLowerCase() === 'v') {
      this.setTool('select');
    }
  }

  protected onDocumentKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space') {
      this.spacePressed.set(false);
    }
  }

  protected boxPercent(value: number): string {
    return `${(value * 100).toFixed(4)}%`;
  }

  private pushUndo(snapshot: readonly EditableBox[]): void {
    this.undoStack.update((stack) => [...stack.slice(-(MAX_HISTORY - 1)), cloneBoxes(snapshot)]);
    this.redoStack.set([]);
  }

  private getImageRect(): DOMRect | null {
    const img = this.imageElRef()?.nativeElement;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? rect : null;
  }

  private capturePointer(event: PointerEvent): void {
    const target = event.currentTarget as Element | null;
    if (target && 'setPointerCapture' in target) {
      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        // Ignore in synthetic test environments.
      }
    }
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }
}
