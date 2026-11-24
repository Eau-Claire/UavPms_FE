import { AnomalyBoundingBox } from '../data-access/anomaly-api';
import { EditableBox, NormalizedBox } from './active-learning.models';

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface RectLike {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export const MIN_BOX_SIZE = 0.008;

const VIDEO_EXT_PATTERN = /\.(mp4|webm|mov|m4v|avi|mkv)(\?.*)?$/i;

export const isVideoUrl = (url?: string | null): boolean =>
  Boolean(url && VIDEO_EXT_PATTERN.test(url.trim()));

export const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const round6 = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

/**
 * Guarantees a box is strictly normalized in [0, 1] with x + width <= 1 and y + height <= 1.
 */
export const sanitizeNormalizedBox = (
  box: NormalizedBox,
  minSize = MIN_BOX_SIZE,
): NormalizedBox => {
  const x1 = clamp01(box.x);
  const y1 = clamp01(box.y);
  const maxW = Math.max(0, 1 - x1);
  const maxH = Math.max(0, 1 - y1);
  const width = Math.min(maxW, Math.max(Math.min(minSize, maxW), clamp01(box.width)));
  const height = Math.min(maxH, Math.max(Math.min(minSize, maxH), clamp01(box.height)));

  return {
    x: round6(x1),
    y: round6(y1),
    width: round6(width),
    height: round6(height),
  };
};

/**
 * Converts an existing `AnomalyBoundingBox` (which `anomaly-api.ts` stores in 0..100%
 * or raw pixel units) into a strict 0..1 `NormalizedBox`.
 */
export const normalizeFromAnomalyBox = (
  box: AnomalyBoundingBox | undefined,
  naturalWidth?: number | null,
  naturalHeight?: number | null,
): NormalizedBox | null => {
  if (!box) return null;

  const looksLikePercent =
    box.isNormalized ||
    (box.x >= 0 &&
      box.y >= 0 &&
      box.width > 0 &&
      box.height > 0 &&
      box.x <= 100 &&
      box.y <= 100 &&
      box.width <= 100 &&
      box.height <= 100 &&
      box.x + box.width <= 100.5 &&
      box.y + box.height <= 100.5);

  if (looksLikePercent) {
    // Handle case where raw values were already 0..1 without being multiplied by 100.
    const alreadyUnit =
      !box.isNormalized &&
      box.x <= 1 &&
      box.y <= 1 &&
      box.width <= 1 &&
      box.height <= 1;
    const scale = alreadyUnit ? 1 : 100;
    return sanitizeNormalizedBox({
      x: box.x / scale,
      y: box.y / scale,
      width: box.width / scale,
      height: box.height / scale,
    });
  }

  if (naturalWidth && naturalHeight && naturalWidth > 0 && naturalHeight > 0) {
    return sanitizeNormalizedBox({
      x: box.x / naturalWidth,
      y: box.y / naturalHeight,
      width: box.width / naturalWidth,
      height: box.height / naturalHeight,
    });
  }

  return null;
};

/**
 * Converts pointer client coordinates into normalized [0, 1] image coordinates.
 * Because `imageRect` is the live `getBoundingClientRect()` of the rendered `<img>`
 * (including any CSS zoom/pan transform), the output is invariant to screen pixels and zoom.
 */
export const clientPointToNormalized = (
  clientX: number,
  clientY: number,
  imageRect: RectLike,
): { readonly x: number; readonly y: number } => {
  if (imageRect.width <= 0 || imageRect.height <= 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: round6(clamp01((clientX - imageRect.left) / imageRect.width)),
    y: round6(clamp01((clientY - imageRect.top) / imageRect.height)),
  };
};

/** Moves a box by normalized deltas `(dx, dy)` while preserving its size inside [0, 1]. */
export const moveBox = (box: NormalizedBox, dx: number, dy: number): NormalizedBox => {
  const width = clamp01(box.width);
  const height = clamp01(box.height);
  const maxX = Math.max(0, 1 - width);
  const maxY = Math.max(0, 1 - height);

  return {
    x: round6(Math.min(maxX, Math.max(0, box.x + dx))),
    y: round6(Math.min(maxY, Math.max(0, box.y + dy))),
    width: round6(width),
    height: round6(height),
  };
};

/**
 * Resizes a box from one of the 8 drag handles to a target normalized point `(targetX, targetY)`.
 * Supports dragging past the opposite edge (flips cleanly) and clamps strictly to [0, 1].
 */
export const resizeBox = (
  box: NormalizedBox,
  handle: ResizeHandle,
  targetX: number,
  targetY: number,
  minSize = MIN_BOX_SIZE,
): NormalizedBox => {
  let left = box.x;
  let right = box.x + box.width;
  let top = box.y;
  let bottom = box.y + box.height;

  const nx = clamp01(targetX);
  const ny = clamp01(targetY);

  if (handle.includes('w')) left = nx;
  if (handle.includes('e')) right = nx;
  if (handle.includes('n')) top = ny;
  if (handle.includes('s')) bottom = ny;

  let x1 = Math.min(left, right);
  let x2 = Math.max(left, right);
  let y1 = Math.min(top, bottom);
  let y2 = Math.max(top, bottom);

  if (x2 - x1 < minSize) {
    if (handle.includes('w')) {
      x1 = Math.max(0, x2 - minSize);
    } else {
      x2 = Math.min(1, x1 + minSize);
    }
  }
  if (y2 - y1 < minSize) {
    if (handle.includes('n')) {
      y1 = Math.max(0, y2 - minSize);
    } else {
      y2 = Math.min(1, y1 + minSize);
    }
  }

  return sanitizeNormalizedBox(
    {
      x: x1,
      y: y1,
      width: x2 - x1,
      height: y2 - y1,
    },
    minSize,
  );
};

/** Creates a normalized box from a drag-draw gesture, or null if too small. */
export const rectFromDrag = (
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  minSize = MIN_BOX_SIZE,
): NormalizedBox | null => {
  const x1 = clamp01(Math.min(startX, endX));
  const y1 = clamp01(Math.min(startY, endY));
  const x2 = clamp01(Math.max(startX, endX));
  const y2 = clamp01(Math.max(startY, endY));

  const width = x2 - x1;
  const height = y2 - y1;
  if (width < minSize || height < minSize) {
    return null;
  }
  return sanitizeNormalizedBox({ x: x1, y: y1, width, height }, minSize);
};

export const cloneBoxes = (boxes: readonly EditableBox[]): EditableBox[] =>
  boxes.map((b) => ({ ...b }));
