import { HttpClient, HttpEvent, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';

export type AnalysisType =
  | 'DefectDetection'
  | 'HumanMotionDetection'
  | 'ObjectClassification'
  | 'AssetConditionAssessment'
  | 'General';

export interface StandaloneUploadRequest {
  readonly files: readonly File[];
  readonly analysisType?: AnalysisType;
  readonly notes?: string;
}

export interface AnalysisSessionResult {
  readonly id: string;
  readonly status: string;
  readonly analysisType: AnalysisType;
  readonly notes?: string;
  readonly createdAt: string;
  readonly filesCount: number;
  readonly detections?: readonly unknown[];
  readonly raw?: unknown;
}

@Injectable({
  providedIn: 'root',
})
export class AiAnalysisApi {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = environment.apiBaseUrl;

  uploadStandaloneAnalysis(request: StandaloneUploadRequest): Observable<HttpEvent<unknown>> {
    const formData = new FormData();
    request.files.forEach((file) => formData.append('files', file, file.name));
    formData.append('analysisType', request.analysisType ?? 'DefectDetection');
    if (request.notes?.trim()) {
      formData.append('notes', request.notes.trim());
    }

    return this.http.post<unknown>(`${this.apiBaseUrl}/ai-analysis/upload`, formData, {
      observe: 'events',
      reportProgress: true,
    });
  }

  getAnalysisResult(id: string): Observable<AnalysisSessionResult> {
    return this.http
      .get<unknown>(`${this.apiBaseUrl}/ai-analysis/${id}`)
      .pipe(map((response) => normalizeAnalysisResult(unwrapApiData(response), id)));
  }
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const pick = (source: Record<string, unknown>, ...keys: string[]) =>
  keys.map((key) => source[key]).find((value) => value !== undefined && value !== null);

const stringValue = (value: unknown, fallback = '') =>
  value === undefined || value === null ? fallback : String(value);

const normalizeAnalysisResult = (value: unknown, fallbackId: string): AnalysisSessionResult => {
  const source = record(value);
  const detectionsRaw = pick(source, 'detections', 'items', 'results', 'anomalies');
  const detections = Array.isArray(detectionsRaw) ? detectionsRaw : [];

  return {
    id: stringValue(pick(source, 'id', 'sessionId', 'analysisId'), fallbackId),
    status: stringValue(pick(source, 'status', 'state'), 'Processing'),
    analysisType: (stringValue(pick(source, 'analysisType', 'type'), 'DefectDetection')) as AnalysisType,
    notes: stringValue(pick(source, 'notes', 'description')),
    createdAt: stringValue(
      pick(source, 'createdAt', 'timestamp', 'date'),
      new Date().toISOString(),
    ),
    filesCount: Array.isArray(source['files']) ? source['files'].length : 1,
    detections,
    raw: value,
  };
};
