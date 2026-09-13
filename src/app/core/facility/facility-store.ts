import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { GisApi } from '../../features/gis/data-access/gis-api';

export interface FacilityItem {
  readonly id: string;
  readonly name: string;
  readonly code?: string;
}

const STORAGE_KEY = 'uavpms.selectedFacilityId';

const DEFAULT_FACILITIES: readonly FacilityItem[] = [
  { id: 'evn-pha-lai', name: 'CÔNG TY CỔ PHẦN NHIỆT ĐIỆN PHẢ LẠI', code: 'PPC' },
  { id: 'evn-hai-phong', name: 'CÔNG TY CỔ PHẦN NHIỆT ĐIỆN HẢI PHÒNG', code: 'HND' },
  { id: 'evn-can-tho', name: 'CÔNG TY NHIỆT ĐIỆN CẦN THƠ', code: 'CT' },
  { id: 'evn-spc-hcm', name: 'TỔNG CÔNG TY ĐIỆN LỰC MIỀN NAM (EVNSPC)', code: 'SPC' },
  { id: 'evn-npt-1', name: 'CÔNG TY TRUYỀN TẢI ĐIỆN 1 (EVNNPT)', code: 'PTC1' },
  { id: 'evn-dong-nai', name: 'CÔNG TY TNHH MTV ĐIỆN LỰC ĐỒNG NAI', code: 'PC-DNAI' },
  { id: 'evn-binh-duong', name: 'CÔNG TY ĐIỆN LỰC BÌNH DƯƠNG', code: 'PC-BDUONG' },
];

@Injectable({
  providedIn: 'root',
})
export class FacilityStore {
  private readonly gisApi = inject(GisApi);

  readonly facilities = signal<readonly FacilityItem[]>(DEFAULT_FACILITIES);
  readonly selectedFacilityId = signal<string>(this.getInitialFacilityId());

  readonly selectedFacility = computed(() => {
    const list = this.facilities();
    const id = this.selectedFacilityId();
    return list.find((f) => f.id === id) ?? list[0] ?? null;
  });

  readonly currentFacilityName = computed(() => {
    return this.selectedFacility()?.name ?? 'CÔNG TY CỔ PHẦN NHIỆT ĐIỆN PHẢ LẠI';
  });

  constructor() {
    this.loadFacilities();
  }

  loadFacilities(): void {
    this.gisApi.getRegions().pipe(
      catchError(() => of([]))
    ).subscribe((regions) => {
      if (regions && regions.length > 0) {
        const mapped = regions.map((r) => ({
          id: r.id,
          name: r.name.toUpperCase().startsWith('CÔNG TY') || r.name.toUpperCase().startsWith('TỔNG CÔNG TY')
            ? r.name.toUpperCase()
            : `CÔNG TY ĐIỆN LỰC ${r.name.toUpperCase()}`,
          code: r.id,
        }));

        const combined = [
          DEFAULT_FACILITIES[0],
          ...mapped.filter((m) => m.id !== DEFAULT_FACILITIES[0].id),
        ];
        this.facilities.set(combined);

        const savedId = localStorage.getItem(STORAGE_KEY);
        if (savedId && combined.some((f) => f.id === savedId)) {
          this.selectedFacilityId.set(savedId);
        } else {
          this.selectedFacilityId.set(combined[0].id);
        }
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

  private getInitialFacilityId(): string {
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_FACILITIES[0].id;
    } catch {
      return DEFAULT_FACILITIES[0].id;
    }
  }
}
