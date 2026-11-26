import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { AuditFilters, AuditLogPage, AuditRecord } from '../../../models/audit.models';
import { asRecord, readArray, readOptionalNumber, readOptionalString, readString } from '../../../shared/utils';

@Injectable({ providedIn: 'root' })
export class AuditApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/audit-logs`;

  list(filters: AuditFilters): Observable<AuditLogPage> {
    let params = new HttpParams()
      .set('page', filters.page)
      .set('pageSize', filters.pageSize);

    if (filters.search?.trim()) {
      params = params.set('search', filters.search.trim());
    }
    if (filters.actionType) {
      params = params.set('actionType', filters.actionType);
    }
    if (filters.tableName) {
      params = params.set('tableName', filters.tableName);
    }

    return this.http
      .get<unknown>(this.url, { params })
      .pipe(
        map((response) => normalizeAuditLogPage(unwrapApiData(response), filters)),
        catchError((err: unknown) => {
          // If backend returns 404 (Not Found) or 400 when no records match filter/search, return empty page
          if (err instanceof HttpErrorResponse && (err.status === 404 || err.status === 400)) {
            return of({
              items: [],
              pagination: {
                page: filters.page,
                pageSize: filters.pageSize,
                totalItems: 0,
                totalPages: 1,
              },
            });
          }
          return throwError(() => err);
        }),
      );
  }
}

const readFirstString = (source: Record<string, unknown> | null, keys: readonly string[], fallback = ''): string => {
  for (const key of keys) {
    const value = readOptionalString(source, key);
    if (value !== null) return value;
  }
  return fallback;
};

const readFirstNumber = (source: Record<string, unknown> | null, keys: readonly string[]): number | null => {
  for (const key of keys) {
    const value = readOptionalNumber(source, key);
    if (value !== null) return value;
  }
  return null;
};

const itemsValue = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  const source = asRecord(value);
  for (const key of ['items', 'records', 'results', 'data']) {
    if (Array.isArray(source?.[key])) return readArray(source[key]);
  }
  return [];
};

const normalizeAuditLogPage = (value: unknown, filters: AuditFilters): AuditLogPage => {
  const source = asRecord(value);
  const paginationSource = asRecord(source?.['pagination']);
  const rawItems = itemsValue(value).map(normalizeAuditRecord);

  const query = filters.search?.trim().toLowerCase();
  const items = query
    ? rawItems.filter((it) =>
        it.operatorEmail.toLowerCase().includes(query) ||
        it.tableName.toLowerCase().includes(query) ||
        it.actionType.toLowerCase().includes(query) ||
        it.recordId.toLowerCase().includes(query) ||
        it.ipAddress.toLowerCase().includes(query) ||
        it.userAgent.toLowerCase().includes(query) ||
        (it.oldValues && it.oldValues.toLowerCase().includes(query)) ||
        (it.newValues && it.newValues.toLowerCase().includes(query))
      )
    : rawItems;

  const totalItems =
    query && items.length !== rawItems.length
      ? items.length
      : (readFirstNumber(source, ['totalItems', 'totalCount', 'count']) ?? readOptionalNumber(paginationSource, 'totalItems')) ||
        items.length;
  const page = (readOptionalNumber(source, 'page') ?? readOptionalNumber(paginationSource, 'page')) || filters.page;
  const pageSize =
    (readOptionalNumber(source, 'pageSize') ?? readOptionalNumber(paginationSource, 'pageSize')) || filters.pageSize;
  const totalPages =
    (readOptionalNumber(source, 'totalPages') ?? readOptionalNumber(paginationSource, 'totalPages')) ||
    Math.max(1, Math.ceil(totalItems / pageSize));

  return {
    items,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
    },
  };
};

const normalizeAuditRecord = (value: unknown): AuditRecord => {
  const source = asRecord(value);
  return {
    id: readString(source, 'id'),
    userId: source?.['userId'] ? String(source['userId']) : null,
    operatorEmail: readFirstString(source, ['operatorEmail', 'userEmail', 'email'], 'Hệ thống'),
    tableName: readFirstString(source, ['tableName', 'table', 'entity', 'resource'], 'Không xác định'),
    recordId: readFirstString(source, ['recordId', 'entityId', 'id']),
    actionType: readFirstString(source, ['actionType', 'action'], 'Modified'),
    oldValues: source?.['oldValues'] !== undefined && source['oldValues'] !== null ? String(source['oldValues']) : null,
    newValues: source?.['newValues'] !== undefined && source['newValues'] !== null ? String(source['newValues']) : null,
    ipAddress: readString(source, 'ipAddress', '-'),
    userAgent: readString(source, 'userAgent', '-'),
    createdAt: readString(source, 'createdAt', new Date().toISOString()),
  };
};
