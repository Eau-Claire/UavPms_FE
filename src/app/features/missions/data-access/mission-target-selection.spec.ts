import { TestBed } from '@angular/core/testing';
import { MissionTargetSelection } from './mission-target-selection';

describe('MissionTargetSelection', () => {
  it('adds unique assets and supports removal and clearing', () => {
    const store = TestBed.inject(MissionTargetSelection);
    const asset = { assetId: 'a1', code: 'A-1', name: 'Asset', latitude: 21, longitude: 105, status: 'Operational' };
    store.add(asset); store.add(asset);
    expect(store.count()).toBe(1);
    store.remove('a1'); expect(store.count()).toBe(0);
    store.add(asset); store.clear(); expect(store.selected()).toEqual([]);
  });
});
