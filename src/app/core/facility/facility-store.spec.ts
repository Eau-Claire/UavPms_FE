import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { of } from 'rxjs';
import { ALL_REGIONS, FacilityStore } from './facility-store';
import { RegionsApi } from '../../features/towers/data-access/regions-api';
import { UsersApi } from '../../features/users/data-access/users-api';
import { Auth } from '../auth/auth';

describe('FacilityStore', () => {
  let store: FacilityStore;

  beforeEach(() => {
    localStorage.removeItem('uavpms.selectedFacilityId');
    TestBed.configureTestingModule({
      providers: [
        FacilityStore,
        {
          provide: RegionsApi,
          useValue: {
            getAll: () => of([{ id: 'r1', name: 'Hải Phòng' }, { id: 'r2', name: 'Hà Nội' }]),
          },
        },
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

  it('filters facilities to only the assigned region when user has a single geographic scope', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        FacilityStore,
        {
          provide: RegionsApi,
          useValue: {
            getAll: () => of([
              { id: 'r1', name: 'Phường 1, Quận 3' },
              { id: 'r2', name: 'Phường 25, Quận Bình Thạnh' },
            ]),
          },
        },
        {
          provide: Auth,
          useValue: {
            user: signal({ id: 'u-mgr-1', role: 'Manager' }),
          },
        },
        {
          provide: UsersApi,
          useValue: {
            getGeographicScopes: () => of({
              userId: 'u-mgr-1',
              regions: [{ regionId: 'r2', name: 'Phường 25, Quận Bình Thạnh' }],
            }),
          },
        },
      ],
    });
    const scopedStore = TestBed.inject(FacilityStore);
    expect(scopedStore.facilities().length).toBe(1);
    expect(scopedStore.facilities()[0].id).toBe('r2');
    expect(scopedStore.selectedFacilityId()).toBe('r2');
    expect(scopedStore.currentFacilityName()).toBe('PHƯỜNG 25, QUẬN BÌNH THẠNH');
  });
});
