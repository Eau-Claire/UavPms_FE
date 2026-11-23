import { Injectable, computed, signal } from '@angular/core';

/** Cột điện được chọn trên bản đồ để đưa vào phạm vi đánh giá / nhiệm vụ. */
export interface MissionTargetTower {
  readonly towerId: string;
  readonly towerCode: string;
  readonly regionId?: string;
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * Giỏ chọn cột điện dùng chung giữa bản đồ GIS và trang lập hồ sơ đánh giá (`/pre-mission/new`).
 * Nhiệm vụ không còn tạo trực tiếp từ danh sách cột: cột được đưa vào hồ sơ đánh giá trước.
 */
@Injectable({ providedIn: 'root' })
export class MissionTargetSelection {
  private readonly selectedState = signal<readonly MissionTargetTower[]>([]);
  readonly selected = this.selectedState.asReadonly();
  readonly count = computed(() => this.selectedState().length);

  add(tower: MissionTargetTower): void {
    this.selectedState.update((items) => (items.some((item) => item.towerId === tower.towerId) ? items : [...items, tower]));
  }

  addMany(towers: readonly MissionTargetTower[]): void {
    towers.forEach((tower) => this.add(tower));
  }

  remove(towerId: string): void {
    this.selectedState.update((items) => items.filter((item) => item.towerId !== towerId));
  }

  has(towerId: string): boolean {
    return this.selectedState().some((item) => item.towerId === towerId);
  }

  clear(): void {
    this.selectedState.set([]);
  }

  moveUp(index: number): void {
    if (index <= 0) return;
    this.reorder(index, index - 1);
  }

  moveDown(index: number): void {
    this.reorder(index, index + 1);
  }

  reorder(fromIndex: number, toIndex: number): void {
    this.selectedState.update((items) => {
      if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) {
        return items;
      }
      const copy = [...items];
      const [item] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, item);
      return copy;
    });
  }

  setAll(towers: readonly MissionTargetTower[]): void {
    const seen = new Set<string>();
    this.selectedState.set(
      towers.filter((t) => {
        if (seen.has(t.towerId)) return false;
        seen.add(t.towerId);
        return true;
      }),
    );
  }
}
