export type AiLabelClass =
  | 'insulator'
  | 'insulator_broken'
  | 'insulator_flashover'
  | 'bird_nest'
  | 'foreign_object'
  | 'broken_strand';

export interface AiLabelClassMeta {
  readonly code: AiLabelClass;
  readonly label: string;
  readonly shortLabel: string;
  /** Keyboard shortcut 1–6. */
  readonly shortcut: string;
  /** High-contrast stroke/badge background color (WCAG AA with white text). */
  readonly color: string;
  /** Translucent fill for bounding box interior. */
  readonly fill: string;
  /** True for non-defect structural classes included for active learning balance. */
  readonly isNormalObject?: boolean;
}

export const AI_LABEL_CLASSES: readonly AiLabelClassMeta[] = [
  {
    code: 'insulator',
    label: 'Sứ cách điện (bình thường)',
    shortLabel: 'Sứ cách điện',
    shortcut: '1',
    color: '#0369a1',
    fill: 'rgba(3, 105, 161, 0.14)',
    isNormalObject: true,
  },
  {
    code: 'insulator_broken',
    label: 'Sứ vỡ / rạn nứt',
    shortLabel: 'Sứ vỡ',
    shortcut: '2',
    color: '#b91c1c',
    fill: 'rgba(185, 28, 28, 0.16)',
  },
  {
    code: 'insulator_flashover',
    label: 'Sứ phóng điện',
    shortLabel: 'Phóng điện',
    shortcut: '3',
    color: '#c2410c',
    fill: 'rgba(194, 65, 12, 0.16)',
  },
  {
    code: 'bird_nest',
    label: 'Tổ chim',
    shortLabel: 'Tổ chim',
    shortcut: '4',
    color: '#15803d',
    fill: 'rgba(21, 128, 61, 0.16)',
  },
  {
    code: 'foreign_object',
    label: 'Dị vật vướng dây',
    shortLabel: 'Dị vật',
    shortcut: '5',
    color: '#7e22ce',
    fill: 'rgba(126, 34, 206, 0.16)',
  },
  {
    code: 'broken_strand',
    label: 'Đứt sợi dây dẫn',
    shortLabel: 'Đứt dây',
    shortcut: '6',
    color: '#be123c',
    fill: 'rgba(190, 18, 60, 0.16)',
  },
] as const;

export const AI_LABEL_CLASS_MAP: Readonly<Record<AiLabelClass, AiLabelClassMeta>> = {
  insulator: AI_LABEL_CLASSES[0],
  insulator_broken: AI_LABEL_CLASSES[1],
  insulator_flashover: AI_LABEL_CLASSES[2],
  bird_nest: AI_LABEL_CLASSES[3],
  foreign_object: AI_LABEL_CLASSES[4],
  broken_strand: AI_LABEL_CLASSES[5],
};

export type LabelStatus = 'FullyReviewed' | 'Draft';

export type LearningAcceptanceStatus = 'Accepted' | 'Rejected';

export interface LearningSubmissionResult {
  readonly mediaKey: string;
  readonly status: LearningAcceptanceStatus;
  readonly message: string;
  readonly submittedAt: string;
}

export type BoxSource = 'ai' | 'manual';

/** Normalized bounding box in [0, 1] relative to the original image dimensions. */
export interface NormalizedBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface EditableBox extends NormalizedBox {
  readonly id: string;
  readonly className: AiLabelClass;
  readonly source: BoxSource;
  /** Confidence score in 0..100 for AI-originated boxes; null for manually drawn boxes. */
  readonly confidence: number | null;
}

export interface ImageLabelContext {
  readonly anomalyId: string;
  /** Stable key grouping detections belonging to the same image or video frame. */
  readonly mediaKey: string;
  readonly imageUrl: string;
  readonly isVideoSource: boolean;
  readonly frameIndex: number | null;
  readonly timestampSeconds: number | null;
  readonly imageWidth: number | null;
  readonly imageHeight: number | null;
  /** Original AI boxes on this image/frame (used for "Hoàn tác tất cả"). */
  readonly aiBoxes: readonly EditableBox[];
  /** Current working boxes (saved boxes if previously edited, otherwise aiBoxes). */
  readonly boxes: readonly EditableBox[];
  readonly labelStatus: LabelStatus | null;
  readonly updatedAt: string | null;
}

export interface SaveImageLabelsPayload {
  readonly anomalyId: string;
  readonly mediaKey: string;
  readonly isFullyReviewed: boolean;
  readonly frameIndex?: number | null;
  readonly boxes: readonly {
    readonly className: AiLabelClass;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly source: BoxSource;
    readonly confidence: number | null;
  }[];
}

export interface SaveImageLabelsResult {
  readonly mediaKey: string;
  readonly labelStatus: LabelStatus;
  readonly boxes: readonly EditableBox[];
  readonly updatedAt: string;
}

export const getLabelClassMeta = (code: AiLabelClass): AiLabelClassMeta =>
  AI_LABEL_CLASS_MAP[code] ?? AI_LABEL_CLASSES[1];

export const classByShortcut = (key: string): AiLabelClass | null => {
  const match = AI_LABEL_CLASSES.find((item) => item.shortcut === key);
  return match ? match.code : null;
};

/**
 * Best-effort mapping from existing AnomalyItem `categoryCode` / `categoryName`
 * (English or Vietnamese) to one of the 6 canonical YOLO classes.
 */
export const inferAiLabelClass = (
  categoryCode?: string | null,
  categoryName?: string | null,
): AiLabelClass => {
  const raw = `${categoryCode ?? ''} ${categoryName ?? ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (raw.includes('insulator_broken') || raw.includes('broken_insulator') || raw.includes('su vo') || raw.includes('ran nut')) {
    return 'insulator_broken';
  }
  if (raw.includes('insulator_flashover') || raw.includes('flashover') || raw.includes('phong dien')) {
    return 'insulator_flashover';
  }
  if (raw.includes('bird_nest') || raw.includes('nest') || raw.includes('to chim')) {
    return 'bird_nest';
  }
  if (raw.includes('foreign_object') || raw.includes('foreign') || raw.includes('di vat') || raw.includes('vuong day')) {
    return 'foreign_object';
  }
  if (raw.includes('broken_strand') || raw.includes('strand') || raw.includes('dut soi') || raw.includes('dut day')) {
    return 'broken_strand';
  }
  if (raw.includes('insulator') || raw.includes('su cach dien')) {
    return 'insulator';
  }
  return 'foreign_object';
};
