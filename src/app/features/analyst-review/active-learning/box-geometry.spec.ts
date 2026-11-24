import {
  clientPointToNormalized,
  isVideoUrl,
  moveBox,
  normalizeFromAnomalyBox,
  rectFromDrag,
  resizeBox,
  sanitizeNormalizedBox,
} from './box-geometry';

describe('box-geometry (Active Learning 0..1 normalization)', () => {
  it('converts client coordinates to 0..1 independent of rendered image size and zoom/pan offset', () => {
    const smallRect = { left: 100, top: 50, width: 400, height: 300 };
    const largeZoomedRect = { left: -240, top: -120, width: 1600, height: 1200 };

    const ptSmall = clientPointToNormalized(300, 200, smallRect);
    const ptLarge = clientPointToNormalized(560, 480, largeZoomedRect);

    expect(ptSmall).toEqual({ x: 0.5, y: 0.5 });
    expect(ptLarge).toEqual({ x: 0.5, y: 0.5 });
  });

  it('clamps client coordinates outside the image bounds strictly to [0, 1]', () => {
    const rect = { left: 50, top: 50, width: 200, height: 100 };
    expect(clientPointToNormalized(10, 0, rect)).toEqual({ x: 0, y: 0 });
    expect(clientPointToNormalized(500, 400, rect)).toEqual({ x: 1, y: 1 });
  });

  it('normalizes percentage, unit, and pixel AnomalyBoundingBox values to 0..1', () => {
    expect(
      normalizeFromAnomalyBox({ x: 25, y: 50, width: 20, height: 10, isNormalized: true }),
    ).toEqual({ x: 0.25, y: 0.5, width: 0.2, height: 0.1 });

    expect(
      normalizeFromAnomalyBox({ x: 400, y: 300, width: 800, height: 600, isNormalized: false }, 4000, 3000),
    ).toEqual({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 });

    expect(
      normalizeFromAnomalyBox({ x: 128, y: 72, width: 256, height: 144, isNormalized: false }, 1280, 720),
    ).toEqual({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 });
  });

  it('moves boxes while preserving size and clamping within [0, 1]', () => {
    const base = { x: 0.2, y: 0.3, width: 0.25, height: 0.2 };
    expect(moveBox(base, 0.1, -0.1)).toEqual({ x: 0.3, y: 0.2, width: 0.25, height: 0.2 });
    expect(moveBox(base, 5, 5)).toEqual({ x: 0.75, y: 0.8, width: 0.25, height: 0.2 });
    expect(moveBox(base, -5, -5)).toEqual({ x: 0, y: 0, width: 0.25, height: 0.2 });
  });

  it('resizes from corner and edge handles and handles inverted drags cleanly', () => {
    const base = { x: 0.2, y: 0.2, width: 0.3, height: 0.3 };
    expect(resizeBox(base, 'se', 0.8, 0.7)).toEqual({ x: 0.2, y: 0.2, width: 0.6, height: 0.5 });
    expect(resizeBox(base, 'nw', 0.1, 0.1)).toEqual({ x: 0.1, y: 0.1, width: 0.4, height: 0.4 });
    // Dragging west edge past east edge flips cleanly
    expect(resizeBox(base, 'w', 0.7, 0.3)).toEqual({ x: 0.5, y: 0.2, width: 0.2, height: 0.3 });
  });

  it('creates normalized box from drag and ignores tiny accidental clicks', () => {
    expect(rectFromDrag(0.5, 0.5, 0.501, 0.501)).toBeNull();
    expect(rectFromDrag(0.6, 0.7, 0.2, 0.3)).toEqual({ x: 0.2, y: 0.3, width: 0.4, height: 0.4 });
  });

  it('sanitizes out-of-range boxes so x + width <= 1 and y + height <= 1', () => {
    const safe = sanitizeNormalizedBox({ x: 0.9, y: 0.85, width: 0.5, height: 0.5 });
    expect(safe.x).toBe(0.9);
    expect(safe.width).toBeCloseTo(0.1, 6);
    expect(safe.y).toBe(0.85);
    expect(safe.height).toBeCloseTo(0.15, 6);
  });

  it('detects video URLs accurately', () => {
    expect(isVideoUrl('https://cdn.example.com/flight-01.mp4?token=abc')).toBe(true);
    expect(isVideoUrl('/media/frame.jpg')).toBe(false);
  });
});
