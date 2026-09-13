import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { of } from 'rxjs';
import { FacilityStore } from './facility-store';
import { GisApi } from '../../features/gis/data-access/gis-api';

describe('FacilityStore', () => {
  let store: FacilityStore;

  beforeEach(() => {
    const gisApiMock = {
      getRegions: () => of([]),
    };

    TestBed.configureTestingModule({
      providers: [
        FacilityStore,
        { provide: GisApi, useValue: gisApiMock },
      ],
    });

    store = TestBed.inject(FacilityStore);
  });

  it('should initialize with default facilities and first item selected', () => {
    const list = store.facilities();
    expect(list.length).toBeGreaterThan(0);
    expect(store.selectedFacility()?.id).toBe('evn-pha-lai');
    expect(store.currentFacilityName()).toBe('CÔNG TY CỔ PHẦN NHIỆT ĐIỆN PHẢ LẠI');
  });

  it('should update selected facility when selectFacility is called', () => {
    const target = store.facilities()[1];
    store.selectFacility(target);
    expect(store.selectedFacilityId()).toBe(target.id);
    expect(store.currentFacilityName()).toBe(target.name);
  });
});
