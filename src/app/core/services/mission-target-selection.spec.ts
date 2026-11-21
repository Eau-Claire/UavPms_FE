import { TestBed } from '@angular/core/testing';
import { MissionTargetSelection, MissionTargetTower } from './mission-target-selection';

const tower = (id: string): MissionTargetTower => ({ towerId: id, towerCode: id.toUpperCase(), latitude: 21, longitude: 105 });

describe('MissionTargetSelection', () => {
  it('adds unique towers and supports removal and clearing', () => {
    const store = TestBed.inject(MissionTargetSelection);
    store.clear();
    store.add(tower('t1'));
    store.add(tower('t1'));
    expect(store.count()).toBe(1);
    expect(store.has('t1')).toBe(true);
    store.remove('t1');
    expect(store.count()).toBe(0);
    store.add(tower('t1'));
    store.clear();
    expect(store.selected()).toEqual([]);
  });

  it('supports moving towers up, down, and arbitrary reordering', () => {
    const store = TestBed.inject(MissionTargetSelection);
    store.clear();
    store.addMany([tower('t1'), tower('t2'), tower('t3')]);

    store.moveDown(0);
    expect(store.selected().map((t) => t.towerId)).toEqual(['t2', 't1', 't3']);

    store.moveUp(2);
    expect(store.selected().map((t) => t.towerId)).toEqual(['t2', 't3', 't1']);

    store.reorder(0, 2);
    expect(store.selected().map((t) => t.towerId)).toEqual(['t3', 't1', 't2']);
  });

  it('deduplicates towers when replacing the selection', () => {
    const store = TestBed.inject(MissionTargetSelection);
    store.setAll([tower('t1'), tower('t1'), tower('t2')]);
    expect(store.selected().map((t) => t.towerId)).toEqual(['t1', 't2']);
  });
});
