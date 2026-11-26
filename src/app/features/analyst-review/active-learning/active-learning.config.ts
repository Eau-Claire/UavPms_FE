import { InjectionToken } from '@angular/core';

export type ActiveLearningMode = 'local' | 'api';

export interface ActiveLearningConfig {
  /**
   * Master feature flag for the Active Learning label editor flow.
   * Flip to `false` to hide all Active Learning UI immediately without affecting
   * existing Confirm / Reject or maintenance ticket flows.
   */
  readonly enabled: boolean;
  /**
   * - `'local'`: FE-first mode persisted in browser `localStorage` (no backend calls, no 404s).
   * - `'api'`: Connects to backend Active Learning endpoints once BE is ready.
   */
  readonly mode: ActiveLearningMode;
  /** LocalStorage key used when `mode === 'local'`. */
  readonly storageKey: string;
}

export const DEFAULT_ACTIVE_LEARNING_CONFIG: ActiveLearningConfig = {
  // Tạm đưa Active Learning vào backlog nghiên cứu sau theo MASTER_SYSTEM_SPEC.md Mục 2 (FE-REQ-003 Phương án 2A).
  // Tắt cờ này ẩn toàn bộ nút/tab/modal Sửa nhãn & chặn mọi request API Active Learning khỏi luồng vận hành.
  enabled: false,
  mode: 'local',
  storageKey: 'uavpms.activeLearning.labels.v1',
};

export const ACTIVE_LEARNING_CONFIG = new InjectionToken<ActiveLearningConfig>(
  'ACTIVE_LEARNING_CONFIG',
  {
    providedIn: 'root',
    factory: () => DEFAULT_ACTIVE_LEARNING_CONFIG,
  },
);
