import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import {
  RegionOption,
  REPORT_STATUS_LABELS,
  REPORT_TYPE_LABELS,
  ReportCreateRequest,
  ReportCreator,
  ReportDetail,
  ReportFile,
  ReportFileFormat,
  ReportFilterParams,
  ReportItem,
  ReportListResult,
  ReportMissionSummary,
  ReportStatistics,
  ReportStatus,
  ReportType,
} from '../../../models/reports.models';

@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/reports`;
  private readonly regionsUrl = `${environment.apiBaseUrl}/regions`;

  listReports(filters: ReportFilterParams = {}): Observable<ReportListResult> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 10;
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);

    if (filters.search?.trim()) params = params.set('search', filters.search.trim());
    if (filters.type && filters.type !== 'all') params = params.set('type', filters.type);
    if (filters.status && filters.status !== 'all') params = params.set('status', filters.status);
    if (filters.regionId) params = params.set('regionId', filters.regionId);
    if (filters.sortBy) params = params.set('sortBy', filters.sortBy);
    if (filters.sortOrder) params = params.set('sortOrder', filters.sortOrder);

    return this.http
      .get<unknown>(this.baseUrl, { params })
      .pipe(map((response) => normalizeReportPage(unwrapApiData(response), page, pageSize)));
  }

  getStatistics(period?: string): Observable<ReportStatistics> {
    let params = new HttpParams();
    if (period && period !== 'all') params = params.set('period', period);
    return this.http
      .get<unknown>(`${this.baseUrl}/statistics`, { params })
      .pipe(map((response) => normalizeStatistics(unwrapApiData(response))));
  }

  getReport(id: string): Observable<ReportDetail> {
    return this.http
      .get<unknown>(`${this.baseUrl}/${encodeURIComponent(id)}`)
      .pipe(map((response) => normalizeReportDetail(unwrapApiData(response))));
  }

  createReport(request: ReportCreateRequest): Observable<ReportDetail> {
    const payload: Record<string, unknown> = { title: request.title.trim(), type: request.type };
    if (request.regionId) payload['regionId'] = request.regionId;
    if (request.missionIds?.length) payload['missionIds'] = request.missionIds;
    if (request.description) payload['description'] = request.description;
    if (request.dateFrom) payload['dateFrom'] = request.dateFrom;
    if (request.dateTo) payload['dateTo'] = request.dateTo;

    return this.http
      .post<unknown>(this.baseUrl, payload)
      .pipe(map((response) => normalizeReportDetail(unwrapApiData(response))));
  }

  updateReport(id: string, request: ReportCreateRequest): Observable<ReportDetail> {
    const payload: Record<string, unknown> = { title: request.title.trim(), type: request.type };
    if (request.regionId) payload['regionId'] = request.regionId;
    if (request.missionIds?.length) payload['missionIds'] = request.missionIds;
    if (request.description !== undefined) payload['description'] = request.description;
    if (request.dateFrom) payload['dateFrom'] = request.dateFrom;
    if (request.dateTo) payload['dateTo'] = request.dateTo;

    return this.http
      .put<unknown>(`${this.baseUrl}/${encodeURIComponent(id)}`, payload)
      .pipe(map((response) => normalizeReportDetail(unwrapApiData(response))));
  }

  /**
   * `GET /reports/{id}/download?format=pdf|excel`: the file is generated on request and streamed back
   * (approved reports with a snapshot are generated from the snapshot).
   */
  downloadReportFile(id: string, format: ReportFileFormat): Observable<ReportFile> {
    const params = new HttpParams().set('format', format);
    return this.http
      .get(`${this.baseUrl}/${encodeURIComponent(id)}/download`, { params, responseType: 'blob', observe: 'response' })
      .pipe(map((response: HttpResponse<Blob>) => ({
        blob: response.body ?? new Blob(),
        fileName: fileNameFromDisposition(response.headers.get('Content-Disposition')),
      })));
  }

  submitReport(id: string): Observable<unknown> {
    return this.http.put<unknown>(`${this.baseUrl}/${encodeURIComponent(id)}/submit`, {});
  }

  approveReport(id: string): Observable<unknown> {
    return this.http.put<unknown>(`${this.baseUrl}/${encodeURIComponent(id)}/approve`, {});
  }

  rejectReport(id: string, reason: string): Observable<unknown> {
    return this.http.put<unknown>(`${this.baseUrl}/${encodeURIComponent(id)}/reject`, { reason });
  }

  deleteReport(id: string): Observable<unknown> {
    return this.http.delete<unknown>(`${this.baseUrl}/${encodeURIComponent(id)}`);
  }

  /** `GET /regions` (page size is capped at 100 by the backend). */
  getRegions(): Observable<readonly RegionOption[]> {
    const params = new HttpParams().set('page', 1).set('pageSize', 100);
    return this.http
      .get<unknown>(this.regionsUrl, { params })
      .pipe(map((response) => arrayOf(recordOf(unwrapApiData(response))['items']).map(normalizeRegion)));
  }
}

// ---------------- Normalization ----------------

const recordOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const arrayOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

const stringOf = (value: unknown, fallback = ''): string => (value == null ? fallback : String(value));

const optionalString = (value: unknown): string | null => {
  const text = stringOf(value).trim();
  return text ? text : null;
};

const numberOf = (value: unknown, fallback = 0): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const toType = (value: unknown): ReportType => {
  const type = stringOf(value).toLowerCase();
  return type in REPORT_TYPE_LABELS ? (type as ReportType) : 'defect';
};

const toStatus = (value: unknown): ReportStatus => {
  const status = stringOf(value).toLowerCase();
  return status in REPORT_STATUS_LABELS ? (status as ReportStatus) : 'draft';
};

const normalizePerson = (value: unknown): ReportCreator | null => {
  const source = recordOf(value);
  const id = optionalString(source['id']);
  return id ? { id, fullName: stringOf(source['fullName']) } : null;
};

const normalizeRegion = (value: unknown): RegionOption => {
  const source = recordOf(value);
  return { id: stringOf(source['id']), name: stringOf(source['name'] ?? source['regionName']) };
};

export function normalizeReportItem(value: unknown): ReportItem {
  const r = recordOf(value);
  const type = toType(r['type']);
  const status = toStatus(r['status']);
  const region = r['region'] ? normalizeRegion(r['region']) : null;

  return {
    id: stringOf(r['id']),
    code: stringOf(r['code']),
    title: stringOf(r['title']),
    type,
    typeName: REPORT_TYPE_LABELS[type],
    status,
    statusName: REPORT_STATUS_LABELS[status],
    createdAt: stringOf(r['createdAt']),
    region: region?.id ? region : null,
    creator: normalizePerson(r['creator']),
    defectCount: numberOf(r['defectCount']),
    hasSnapshot: r['hasSnapshot'] === true,
  };
}

function normalizeReportDetail(value: unknown): ReportDetail {
  const r = recordOf(value);
  return {
    ...normalizeReportItem(value),
    description: optionalString(r['description']),
    updatedAt: optionalString(r['updatedAt']),
    dateFrom: optionalString(r['dateFrom']),
    dateTo: optionalString(r['dateTo']),
    rejectionReason: optionalString(r['rejectionReason']),
    approvedBy: normalizePerson(r['approvedBy']),
    approvedAt: optionalString(r['approvedAt']),
    missions: arrayOf(r['missions']).map((mission): ReportMissionSummary => {
      const m = recordOf(mission);
      return {
        id: stringOf(m['id']),
        missionCode: stringOf(m['missionCode']),
        title: stringOf(m['title']),
        status: stringOf(m['status']),
        plannedStart: optionalString(m['plannedStart']),
      };
    }),
  };
}

function normalizeReportPage(value: unknown, page: number, pageSize: number): ReportListResult {
  const r = recordOf(value);
  const items = arrayOf(r['items']).map(normalizeReportItem);
  const pagination = recordOf(r['pagination']);
  const totalItems = numberOf(pagination['totalItems'], items.length);

  return {
    items,
    pagination: {
      page: numberOf(pagination['page'], page),
      pageSize: numberOf(pagination['pageSize'], pageSize),
      totalItems,
      totalPages: Math.max(1, numberOf(pagination['totalPages'], Math.ceil(totalItems / pageSize))),
    },
  };
}

function normalizeStatistics(value: unknown): ReportStatistics {
  const r = recordOf(value);
  const byType = recordOf(r['byType']);
  const byStatus = recordOf(r['byStatus']);

  return {
    total: numberOf(r['total']),
    byType: {
      defect: numberOf(byType['defect']),
      periodic: numberOf(byType['periodic']),
      thermal: numberOf(byType['thermal']),
      corridor: numberOf(byType['corridor']),
    },
    byStatus: {
      approved: numberOf(byStatus['approved']),
      pending: numberOf(byStatus['pending']),
      draft: numberOf(byStatus['draft']),
    },
  };
}

/** Reads `filename*=UTF-8''...` or `filename="..."` from a Content-Disposition header. */
export function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const encoded = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, ''));
    } catch {
      // fall through to the plain filename
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : null;
}
