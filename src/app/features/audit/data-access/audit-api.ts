import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { AuditFilters, AuditLogPage, AuditRecord } from '../../../models/audit.models';

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

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const pick = (source: Record<string, unknown>, ...keys: string[]) =>
  keys.map((key) => source[key]).find((value) => value !== undefined && value !== null);

const stringValue = (value: unknown, fallback = '') =>
  value === undefined || value === null ? fallback : String(value);

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const itemsValue = (value: unknown): readonly unknown[] => {
  if (Array.isArray(value)) return value;
  const source = record(value);
  const items = pick(source, 'items', 'records', 'results', 'data');
  return Array.isArray(items) ? items : [];
};

const normalizeAuditLogPage = (value: unknown, filters: AuditFilters): AuditLogPage => {
  const source = record(value);
  const paginationSource = record(source['pagination']);
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
      : numberValue(pick(source, 'totalItems', 'totalCount', 'count') ?? paginationSource['totalItems']) ||
        items.length;
  const page =
    numberValue(pick(source, 'page') ?? paginationSource['page']) || filters.page;
  const pageSize =
    numberValue(pick(source, 'pageSize') ?? paginationSource['pageSize']) || filters.pageSize;
  const totalPages =
    numberValue(pick(source, 'totalPages') ?? paginationSource['totalPages']) ||
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
  const source = record(value);
  return {
    id: stringValue(source['id']),
    userId: source['userId'] ? String(source['userId']) : null,
    operatorEmail: stringValue(pick(source, 'operatorEmail', 'userEmail', 'email'), 'Hệ thống'),
    tableName: stringValue(pick(source, 'tableName', 'table', 'entity', 'resource'), 'Không xác định'),
    recordId: stringValue(pick(source, 'recordId', 'entityId', 'id')),
    actionType: stringValue(pick(source, 'actionType', 'action'), 'Modified'),
    oldValues: source['oldValues'] !== undefined && source['oldValues'] !== null ? String(source['oldValues']) : null,
    newValues: source['newValues'] !== undefined && source['newValues'] !== null ? String(source['newValues']) : null,
    ipAddress: stringValue(source['ipAddress'], '-'),
    userAgent: stringValue(source['userAgent'], '-'),
    createdAt: stringValue(source['createdAt'], new Date().toISOString()),
  };
};
