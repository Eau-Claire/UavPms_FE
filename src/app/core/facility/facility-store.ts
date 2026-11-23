import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { RegionsApi } from '../../features/towers/data-access/regions-api';
import { UsersApi } from '../../features/users/data-access/users-api';
import { Auth } from '../auth/auth';

/** A selectable working area in the header. After ERD v2.2 these are the regions from GET /regions. */
export interface FacilityItem {
  readonly id: string;
  readonly name: string;
  readonly code?: string;
}

const STORAGE_KEY = 'uavpms.selectedFacilityId';

/** Always-present first entry so the header never renders an empty selection. */
export const ALL_REGIONS: FacilityItem = { id: 'all', name: 'Tất cả khu vực' };

@Injectable({
  providedIn: 'root',
})
export class FacilityStore {
  private readonly regionsApi = inject(RegionsApi);
  private readonly usersApi = inject(UsersApi, { optional: true });
  private readonly auth = inject(Auth, { optional: true });

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
    if (this.auth) {
      effect(() => {
        const u = this.auth?.user();
        if (u) {
          this.loadFacilities();
        }
      });
    }
  }

  loadFacilities(): void {
    this.regionsApi.getAll().pipe(catchError(() => of([]))).subscribe((regions) => {
      const items = regions.map((region): FacilityItem => ({
        id: region.id,
        name: region.name.toUpperCase(),
        code: (region as { id: string; name: string; code?: string }).code,
      }));
      const user = this.auth?.user();

      // Nếu là Admin hoặc chưa đăng nhập hoặc không có UsersApi -> hiển thị toàn bộ
      if (!user || user.role === 'Admin' || !this.usersApi) {
        this.facilities.set([ALL_REGIONS, ...items]);
        this.ensureValidSelection();
        return;
      }

      // Kiểm tra phạm vi địa lý được phân quyền của người dùng (GET /users/{id}/geographic-scopes)
      this.usersApi.getGeographicScopes(user.id).pipe(
        catchError(() => {
          try {
            const cached = localStorage.getItem(`uavpms.scopes.${user.id}`);
            if (cached) return of(JSON.parse(cached));
          } catch {
            // ignore
          }
          return of({ userId: user.id, regions: [] });
        }),
      ).subscribe((scopes) => {
        if (scopes.regions && scopes.regions.length > 0) {
          const assignedIds = new Set(
            scopes.regions.map((r: { regionId?: string; id?: string }) => r.regionId || r.id),
          );
          const filtered = items.filter((item) => assignedIds.has(item.id));

          if (filtered.length === 1) {
            // Chỉ được phân quyền 1 khu vực: Chỉ hiển thị duy nhất khu vực đó trong menu
            this.facilities.set(filtered);
            this.selectedFacilityId.set(filtered[0].id);
          } else if (filtered.length > 1) {
            // Phân quyền nhiều khu vực: Hiển thị tùy chọn Tất cả khu vực (trong phạm vi phân quyền) và các khu vực đó
            this.facilities.set([ALL_REGIONS, ...filtered]);
            this.ensureValidSelection();
          } else {
            // Trường hợp ID khu vực trong scopes là dữ liệu tùy biến
            const scopeItems: FacilityItem[] = scopes.regions.map((r: { regionId?: string; id?: string; name?: string; code?: string }) => ({
              id: String(r.regionId || r.id),
              name: String(r.name || 'KHU VỰC').toUpperCase(),
              code: r.code,
            }));
            this.facilities.set(scopeItems.length === 1 ? scopeItems : [ALL_REGIONS, ...scopeItems]);
            this.ensureValidSelection();
          }
        } else {
          // Không bị giới hạn phân quyền (Manager mặc định xem toàn bộ hệ thống)
          this.facilities.set([ALL_REGIONS, ...items]);
          this.ensureValidSelection();
        }
      });
    });
  }

  private ensureValidSelection(): void {
    const list = this.facilities();
    if (!list.some((item) => item.id === this.selectedFacilityId())) {
      this.selectedFacilityId.set(list[0]?.id || ALL_REGIONS.id);
    }
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
