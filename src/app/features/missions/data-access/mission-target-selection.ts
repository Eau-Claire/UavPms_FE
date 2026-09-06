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
}
