import { TestBed } from '@angular/core/testing';
import { MissionTargetSelection } from './mission-target-selection';

describe('MissionTargetSelection', () => {
  it('adds unique assets and supports removal and clearing', () => {
    const store = TestBed.inject(MissionTargetSelection);
    const asset = { assetId: 'a1', code: 'A-1', name: 'Asset', latitude: 21, longitude: 105, status: 'Operational' };
    store.add(asset); store.add(asset);
    store.remove('a1'); expect(store.count()).toBe(0);
    store.add(asset); store.clear(); expect(store.selected()).toEqual([]);
  });

  it('supports moving assets up, down, and arbitrary reordering', () => {
    const store = TestBed.inject(MissionTargetSelection);
    store.clear();
    const a1 = { assetId: 'a1', code: 'A-1', name: 'Asset 1', latitude: 21, longitude: 105, status: 'Operational' };
    const a2 = { assetId: 'a2', code: 'A-2', name: 'Asset 2', latitude: 21.1, longitude: 105.1, status: 'Operational' };
    const a3 = { assetId: 'a3', code: 'A-3', name: 'Asset 3', latitude: 21.2, longitude: 105.2, status: 'Operational' };
    store.addMany([a1, a2, a3]);

    // Move down
    store.moveDown(0);
    expect(store.selected().map((a) => a.assetId)).toEqual(['a2', 'a1', 'a3']);

    // Move up
    store.moveUp(2);
    expect(store.selected().map((a) => a.assetId)).toEqual(['a2', 'a3', 'a1']);

    // Arbitrary reorder
    store.reorder(0, 2);
    expect(store.selected().map((a) => a.assetId)).toEqual(['a3', 'a1', 'a2']);
  });
});
