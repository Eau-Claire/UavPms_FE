import { Injectable, computed, signal } from '@angular/core';
import { SelectableAsset } from '../../../models/assets.models';

@Injectable({ providedIn: 'root' })
export class MissionTargetSelection {
  private readonly selectedState = signal<readonly SelectableAsset[]>([]);
  readonly selected = this.selectedState.asReadonly();
  readonly count = computed(() => this.selectedState().length);

  add(asset: SelectableAsset): void {
    this.selectedState.update((items) => items.some((item) => item.assetId === asset.assetId) ? items : [...items, asset]);
  }

  addMany(assets: readonly SelectableAsset[]): void {
    assets.forEach((asset) => this.add(asset));
  }

  remove(assetId: string): void {
    this.selectedState.update((items) => items.filter((item) => item.assetId !== assetId));
  }

  has(assetId: string): boolean {
    return this.selectedState().some((item) => item.assetId === assetId);
  }

  clear(): void {
    this.selectedState.set([]);
  }

  moveUp(index: number): void {
    if (index <= 0) return;
    this.selectedState.update((items) => {
      if (index >= items.length) return items;
      const copy = [...items];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  }

  moveDown(index: number): void {
    this.selectedState.update((items) => {
      if (index < 0 || index >= items.length - 1) return items;
      const copy = [...items];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
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

  setAll(assets: readonly SelectableAsset[]): void {
    const unique: SelectableAsset[] = [];
    const seen = new Set<string>();
    for (const a of assets) {
      if (!seen.has(a.assetId)) {
        seen.add(a.assetId);
        unique.push(a);
      }
    }
    this.selectedState.set(unique);
  }
}
