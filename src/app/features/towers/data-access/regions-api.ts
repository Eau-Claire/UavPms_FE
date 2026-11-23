import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { EMPTY, expand, map, Observable, reduce, shareReplay } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { RegionLookup } from '../../../models/assets.models';

const MAX_PAGE_SIZE = 100;

/** Read access to GET /regions (paged, max 100 per page). */
@Injectable({ providedIn: 'root' })
export class RegionsApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/regions`;
  private cache$: Observable<readonly RegionLookup[]> | null = null;

  /** Every region, following pagination. Cached for the session; pass `refresh` to reload. */
  getAll(refresh = false): Observable<readonly RegionLookup[]> {
    if (!this.cache$ || refresh) {
      const page = (number: number) =>
        this.http.get<unknown>(this.url, { params: { page: number, pageSize: MAX_PAGE_SIZE } }).pipe(
          map((response) => {
            const data = asRecord(unwrapApiData(response));
            const pagination = asRecord(data['pagination']);
            const items = Array.isArray(data['items']) ? data['items'] : Array.isArray(data) ? data : [];
            return {
              page: number,
              totalPages: Number(pagination['totalPages'] ?? 1) || 1,
              items: items.map(normalizeRegion).filter((region) => region.id),
            };
          }),
        );
      const request$ = page(1).pipe(
        expand((result) => (result.page < result.totalPages ? page(result.page + 1) : EMPTY)),
        reduce((all, result) => [...all, ...result.items], [] as RegionLookup[]),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
      this.cache$ = request$;
      // Drop a failed request from the cache so the next caller retries.
      request$.subscribe({ error: () => { if (this.cache$ === request$) this.cache$ = null; } });
    }
    return this.cache$;
  }
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const normalizeRegion = (value: unknown): RegionLookup => {
  const source = asRecord(value);
  return {
    id: String(source['id'] ?? ''),
    name: String(source['regionName'] ?? source['name'] ?? ''),
  };
};
