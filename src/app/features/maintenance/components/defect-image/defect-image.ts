import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { MaintenanceBoundingBox } from '../../../../models/maintenance.models';

interface BoxStyle {
  readonly left: string;
  readonly top: string;
  readonly width: string;
  readonly height: string;
}

/** Defect photo with the AI bounding box drawn over it (same maths as the analyst review screen). */
@Component({
  selector: 'app-defect-image',
  template: `
    @if (src()) {
      <figure class="defect-figure">
        <div class="defect-frame">
          <div class="defect-stage">
            <img [src]="src()" [alt]="alt()" (load)="onLoad($event)" (error)="failed.set(true)" />
            @if (boxStyle(); as box) {
              <span class="defect-box" [style.left]="box.left" [style.top]="box.top" [style.width]="box.width" [style.height]="box.height" aria-hidden="true">
                @if (label()) { <span class="defect-box-tag">{{ label() }}</span> }
              </span>
            }
          </div>
        </div>
        @if (failed()) {
          <figcaption class="defect-caption">Không tải được ảnh. <a [href]="src()" target="_blank" rel="noopener">Mở ảnh gốc</a></figcaption>
        } @else if (boxStyle()) {
          <figcaption class="defect-caption">Khung đỏ đánh dấu vị trí khuyết tật do AI phát hiện.</figcaption>
        }
      </figure>
    } @else {
      <p class="defect-empty">Không có ảnh khuyết tật.</p>
    }
  `,
  styles: `
    :host { display: block; }
    .defect-figure { margin: 0; }
    .defect-frame { display: flex; justify-content: center; border-radius: 6px; background: #0f172a; }
    /* The stage shrinks to the rendered image, so box percentages are percentages of the image. */
    .defect-stage { position: relative; width: fit-content; max-width: 100%; line-height: 0; }
    .defect-stage img { display: block; max-width: 100%; max-height: 420px; width: auto; height: auto; }
    .defect-box { position: absolute; border: 2px solid #ef4444; box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6); line-height: 1; }
    .defect-box-tag { position: absolute; top: -22px; left: -2px; padding: 3px 6px; border-radius: 3px 3px 3px 0; background: #b91c1c; color: #ffffff; font-size: 11px; font-weight: 700; white-space: nowrap; }
    .defect-caption { margin-top: 6px; color: #526b82; font-size: 12px; }
    .defect-caption a { color: #10387d; }
    .defect-empty { margin: 0; padding: 24px; border: 1px dashed #cbd8e5; border-radius: 6px; color: #526b82; font-size: 13px; text-align: center; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DefectImage {
  readonly src = input<string | undefined>();
  readonly alt = input('Ảnh khuyết tật');
  readonly label = input('');
  readonly box = input<MaintenanceBoundingBox | undefined>();

  protected readonly failed = signal(false);
  private readonly natural = signal<{ readonly width: number; readonly height: number } | null>(null);

  /** Normalized boxes are already percentages; pixel boxes need the image's natural size first. */
  protected readonly boxStyle = computed<BoxStyle | null>(() => {
    const box = this.box();
    if (!box || box.width <= 0 || box.height <= 0) return null;
    if (box.isNormalized) return toStyle(box.x, box.y, box.width, box.height);
    const size = this.natural();
    if (!size || !size.width || !size.height) return null;
    return toStyle((box.x / size.width) * 100, (box.y / size.height) * 100, (box.width / size.width) * 100, (box.height / size.height) * 100);
  });

  protected onLoad(event: Event): void {
    const image = event.target as HTMLImageElement;
    this.failed.set(false);
    this.natural.set({ width: image.naturalWidth, height: image.naturalHeight });
  }
}

const clamp = (value: number, max: number): number => Math.max(0, Math.min(max, value));

const toStyle = (x: number, y: number, width: number, height: number): BoxStyle => ({
  left: `${clamp(x, 100)}%`,
  top: `${clamp(y, 100)}%`,
  width: `${clamp(width, 100 - clamp(x, 100))}%`,
  height: `${clamp(height, 100 - clamp(y, 100))}%`,
});
