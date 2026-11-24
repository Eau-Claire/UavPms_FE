import { Injectable, signal } from '@angular/core';
import { AnomalyItem } from './anomaly-api';

const STORAGE_KEY = 'uavpms_anomaly_reviews_v1';

@Injectable({
  providedIn: 'root',
})
export class AnomalyHistoryService {
  private readonly reviews = signal<Map<string, AnomalyItem>>(new Map());

  constructor() {
    this.initFromStorage();
  }

  private initFromStorage(): void {
    const map = new Map<string, AnomalyItem>();
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AnomalyItem[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed
            .filter((item) => item?.id && !item.id.startsWith('anom-seed-'))
            .forEach((item) => map.set(item.id, item));
        }
      }
    } catch {
      // Fallback
    }

    this.reviews.set(map);
  }

  private persist(map: Map<string, AnomalyItem>): void {
    try {
      const array = Array.from(map.values());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(array));
    } catch {
      // Storage full or quota exceeded
    }
  }

  cacheItem(item: AnomalyItem, aliasIds?: readonly string[]): void {
    if (!item?.id) return;
    const currentMap = new Map(this.reviews());
    let modified = false;
    if (!currentMap.has(item.id)) {
      currentMap.set(item.id, item);
      modified = true;
    }
    if (aliasIds && aliasIds.length > 0) {
      for (const alias of aliasIds) {
        if (alias && alias.trim() && !currentMap.has(alias.trim())) {
          currentMap.set(alias.trim(), { ...item, id: alias.trim() });
          modified = true;
        }
      }
    }
    if (modified) {
      this.reviews.set(currentMap);
      this.persist(currentMap);
    }
  }

  getReviewedItems(): AnomalyItem[] {
    return Array.from(this.reviews().values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  getReview(id: string): AnomalyItem | undefined {
    return this.reviews().get(id);
  }

  isReviewed(id: string): boolean {
    const item = this.reviews().get(id);
    return (
      !!item &&
      (item.validationStatus === 'Confirmed' ||
        item.validationStatus === 'Rejected' ||
        item.validationStatus === 'Resolved')
    );
  }

  saveReview(
    item: AnomalyItem,
    status: 'Confirmed' | 'Rejected',
    notes: string,
    aliasIds?: readonly string[],
  ): AnomalyItem {
    const updated: AnomalyItem = {
      ...item,
      validationStatus: status,
      analystNotes: notes,
      createdAt: item.createdAt || new Date().toISOString(),
    };

    const currentMap = new Map(this.reviews());
    currentMap.set(updated.id, updated);
    if (aliasIds && aliasIds.length > 0) {
      for (const alias of aliasIds) {
        if (alias && alias.trim()) {
          currentMap.set(alias.trim(), { ...updated, id: alias.trim() });
        }
      }
    }
    this.reviews.set(currentMap);
    this.persist(currentMap);
    return updated;
  }
}
