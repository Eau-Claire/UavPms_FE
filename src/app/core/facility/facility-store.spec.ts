import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { of } from 'rxjs';
import { ALL_REGIONS, FacilityStore } from './facility-store';
import { RegionsApi } from '../../features/towers/data-access/regions-api';

describe('FacilityStore', () => {
  let store: FacilityStore;

  beforeEach(() => {
    localStorage.removeItem('uavpms.selectedFacilityId');
    TestBed.configureTestingModule({
      providers: [
        FacilityStore,
        { provide: RegionsApi, useValue: { getAll: () => of([{ id: 'r1', name: 'Hải Phòng' }, { id: 'r2', name: 'Hà Nội' }]) } },
      ],
    });
    store = TestBed.inject(FacilityStore);
  });

  it('lists the "all regions" entry followed by the regions from the API', () => {
    expect(store.facilities().map((item) => item.id)).toEqual([ALL_REGIONS.id, 'r1', 'r2']);
    expect(store.selectedFacility().id).toBe(ALL_REGIONS.id);
    expect(store.currentFacilityName()).toBe(ALL_REGIONS.name);
  });

  it('updates the selected facility when selectFacility is called', () => {
    const target = store.facilities()[1];
    store.selectFacility(target);
    expect(store.selectedFacilityId()).toBe('r1');
    expect(store.currentFacilityName()).toBe('HẢI PHÒNG');
  });
});
