import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { RegionsApi } from '../../features/towers/data-access/regions-api';

/** A selectable working area in the header. After ERD v2.2 these are the regions from GET /regions. */
export interface FacilityItem {
  readonly id: string;
  readonly name: string;
  readonly code?: string;
}

const STORAGE_KEY = 'uavpms.selectedFacilityId';

/** Always-present first entry so the header never renders an empty selection. */
export const ALL_REGIONS: FacilityItem = { id: 'all', name: 'TẤT CẢ KHU VỰC' };

@Injectable({
  providedIn: 'root',
})
export class FacilityStore {
  private readonly regionsApi = inject(RegionsApi);

  readonly facilities = signal<readonly FacilityItem[]>([ALL_REGIONS]);
  readonly selectedFacilityId = signal<string>(readStoredId());

  readonly selectedFacility = computed(() => {
    const list = this.facilities();
    const id = this.selectedFacilityId();
    return list.find((f) => f.id === id) ?? list[0] ?? ALL_REGIONS;
  });

  readonly currentFacilityName = computed(() => this.selectedFacility().name);

  constructor() {
    this.loadFacilities();
  }

  loadFacilities(): void {
    this.regionsApi.getAll().pipe(catchError(() => of([]))).subscribe((regions) => {
      const items = regions.map((region): FacilityItem => ({ id: region.id, name: region.name.toUpperCase() }));
      this.facilities.set([ALL_REGIONS, ...items]);
      if (!this.facilities().some((item) => item.id === this.selectedFacilityId())) {
        this.selectedFacilityId.set(ALL_REGIONS.id);
      }
    });
  }

  selectFacility(facility: FacilityItem): void {
    this.selectedFacilityId.set(facility.id);
    try {
      localStorage.setItem(STORAGE_KEY, facility.id);
    } catch {
      // ignore storage access restrictions if any
    }
  }
}

const readStoredId = (): string => {
  try {
    return localStorage.getItem(STORAGE_KEY) || ALL_REGIONS.id;
  } catch {
    return ALL_REGIONS.id;
  }
};
