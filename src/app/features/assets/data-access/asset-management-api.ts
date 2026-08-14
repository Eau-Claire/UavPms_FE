import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { InspectionFilters, InspectionRecord, MonitorSummary, PagedResponse } from '../../../models/monitor.models';

export interface AssetMission {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly line: string;
  readonly towerCount: string;
  readonly surveyDate: string;
  readonly status: string;
  readonly description: string;
}

export interface UploadAnalysisFileRequest {
  readonly files: readonly File[];
  readonly missionId?: string;
  readonly analysisType?: AnalysisType;
  readonly preferredModel?: string;
  readonly notes?: string;
}

export type AnalysisType = 'DefectDetection' | 'HumanMotionDetection' | 'ObjectClassification' | 'AssetConditionAssessment' | 'General';
export type DetectionReviewDecision = 'Approved' | 'Rejected';

export interface ReviewMissionDetectionRequest {
  readonly decision: DetectionReviewDecision;
  readonly notes?: string;
}

export interface MissionAiDetection {
  readonly id: string;
  readonly mediaId: string;
  readonly assetId: string;
  readonly title: string;
  readonly categoryCode: string;
  readonly description: string;
  readonly missionId: string;
  readonly missionName: string;
  readonly mediaType: string;
  readonly imageUrl?: string;
  readonly sourceUrl?: string;
  readonly confidence: number;
  readonly timestampSeconds: number | null;
  readonly frameIndex: number | null;
  readonly videoDurationSeconds: number | null;
  readonly severityWeight: number;
  readonly isEmergency: boolean;
  readonly aiSource: string;
  readonly status: string;
  readonly mediaStatus: string;
  readonly analystNotes: string;
  readonly detectedAt: string;
  readonly validatedAt: string;
  readonly boundingBox?: DetectionBoundingBox;
}

export interface DetectionBoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface UploadedAnalysisFile {
  readonly id: string;
  readonly fileUrl: string;
  readonly mediaType: string;
  readonly analysisType: string;
  readonly status: string;
  readonly createdAt: string;
}

export interface AssetReportDetail {
  readonly id: string;
  readonly raw: unknown;
}

@Injectable({
  providedIn: 'root',
})
export class AssetManagementApi {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = environment.apiBaseUrl;

  getMissions(page = 1, pageSize = 5) {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<unknown>(`${this.apiBaseUrl}/missions`, { params }).pipe(
      map((response) => normalizePage(unwrapApiData(response), page, pageSize, normalizeMission)),
    );
  }

  getMission(id: string) {
    return this.http.get<unknown>(`${this.apiBaseUrl}/missions/${id}`).pipe(
      map((response) => normalizeMission(unwrapApiData(response), 0)),
    );
  }

  getSummary() {
    return this.http.get<unknown>(`${this.apiBaseUrl}/monitor/summary`).pipe(
      map((response) => normalizeSummary(unwrapApiData(response))),
    );
  }

  getInspections(filters: InspectionFilters) {
    let params = new HttpParams().set('page', filters.page).set('pageSize', filters.pageSize);
    if (filters.missionId) params = params.set('missionId', filters.missionId);
    if (filters.isDefect !== null) params = params.set('isDefect', filters.isDefect);
    if (filters.fromDate) params = params.set('fromDate', new Date(filters.fromDate).toISOString());
    if (filters.toDate) params = params.set('toDate', new Date(filters.toDate).toISOString());
    return this.http.get<unknown>(`${this.apiBaseUrl}/monitor/inspections`, { params }).pipe(
      map((response) => normalizePage(unwrapApiData(response), filters.page, filters.pageSize, normalizeInspection)),
    );
  }

  getInspectionReport(id: string) {
    return this.http.get<unknown>(`${this.apiBaseUrl}/inspections/report/${id}`).pipe(
      map((response) => ({ id, raw: unwrapApiData(response) }) satisfies AssetReportDetail),
    );
  }

  uploadAnalysisFile(request: UploadAnalysisFileRequest) {
    const form = new FormData();
    request.files.forEach((file) => form.append('files', file, file.name));
    form.append('analysisType', request.analysisType ?? 'DefectDetection');
    if (request.preferredModel) form.append('preferredModel', request.preferredModel);
    if (request.notes) form.append('notes', request.notes);
    const url = request.missionId
      ? `${this.apiBaseUrl}/missions/${request.missionId}/ai-analysis`
      : `${this.apiBaseUrl}/ai-analysis/upload`;
    return this.http.post<unknown>(url, form, {
      observe: 'events',
      reportProgress: true,
    });
  }

  getMissionDetections(missionId: string) {
    return this.http.get<unknown>(`${this.apiBaseUrl}/missions/${missionId}/ai-analysis/detections`).pipe(
      map((response) => normalizeDetectionList(unwrapApiData(response), missionId)),
    );
  }

  reviewMissionDetection(missionId: string, detectionId: string, request: ReviewMissionDetectionRequest) {
    return this.http.put<unknown>(`${this.apiBaseUrl}/missions/${missionId}/ai-analysis/detections/${detectionId}/review`, request).pipe(
      map((response) => {
        const data = unwrapApiData(response);
        return hasReviewPayload(data) ? normalizeDetection(data, 0, missionId) : null;
      }),
    );
  }

  analyzeMissionMedia(missionId: string, mediaId: string, request: Omit<UploadAnalysisFileRequest, 'files' | 'missionId'> = {}) {
    let params = new HttpParams().set('analysisType', request.analysisType ?? 'DefectDetection').set('preferredModel', request.preferredModel ?? 'SERVER');
    if (request.notes) params = params.set('notes', request.notes);
    return this.http.post<unknown>(`${this.apiBaseUrl}/missions/${missionId}/ai-analysis/from-media/${mediaId}`, null, { params });
  }
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? value as Record<string, unknown> : {};

const pick = (source: Record<string, unknown>, ...keys: string[]) =>
  keys.map((key) => source[key]).find((value) => value !== undefined && value !== null);

const stringValue = (value: unknown, fallback = '') =>
  value === undefined || value === null ? fallback : String(value);

const numberValue = (value: unknown) => Number(value ?? 0) || 0;

const hasReviewPayload = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && Object.keys(value).length);

const arrayValue = (value: unknown): readonly unknown[] => {
  if (Array.isArray(value)) return value;
  const source = record(value);
  const list = pick(source, 'items', 'records', 'results', 'data');
  return Array.isArray(list) ? list : [];
};

const normalizePage = <T>(
  value: unknown,
  page: number,
  pageSize: number,
  mapper: (value: unknown, index: number) => T,
): PagedResponse<T> => {
  const source = record(value);
  const items = arrayValue(value).map(mapper);
  const pagination = record(source['pagination']);
  const totalCount = numberValue(pick(source, 'totalCount', 'totalItems', 'count')) || numberValue(pagination['totalItems']) || items.length;
  return {
    items,
    page: numberValue(pick(source, 'page') ?? pagination['page']) || page,
    pageSize: numberValue(pick(source, 'pageSize') ?? pagination['pageSize']) || pageSize,
    totalCount,
    totalPages: numberValue(pick(source, 'totalPages') ?? pagination['totalPages']) || Math.max(1, Math.ceil(totalCount / pageSize)),
  };
};

const normalizeMission = (value: unknown, index: number): AssetMission => {
  const source = record(value);
  const createdAt = stringValue(source['createdAt']);
  return {
    id: stringValue(source['id'], `mission-${index}`),
    code: stringValue(pick(source, 'missionCode', 'code'), `MISSION-${index + 1}`),
    title: stringValue(source['title']),
    line: stringValue(pick(source, 'routeData', 'title', 'description'), 'Chưa có tuyến'),
    towerCount: 'N/A',
    surveyDate: createdAt ? new Date(createdAt).toLocaleDateString('vi-VN') : 'N/A',
    status: stringValue(source['status']),
    description: stringValue(source['description']),
  };
};

const normalizeSummary = (value: unknown): MonitorSummary => {
  const source = record(value);
  return {
    totalMissions: numberValue(source['totalMissions']),
    pendingMissions: numberValue(source['pendingMissions']),
    inProgressMissions: numberValue(source['inProgressMissions']),
    completedMissions: numberValue(source['completedMissions']),
    totalInspections: numberValue(source['totalInspections']),
    totalDefects: numberValue(source['totalDefects']),
    criticalDefects: numberValue(source['criticalDefects']),
  };
};

const normalizeInspection = (value: unknown, index: number): InspectionRecord => {
  const source = record(value);
  return {
    id: stringValue(pick(source, 'inspectionId', 'id'), `inspection-${index}`),
    missionId: stringValue(source['missionId']),
    missionName: stringValue(pick(source, 'missionTitle', 'missionName'), 'Unknown mission'),
    imageUrl: stringValue(source['imageUrl']) || undefined,
    isDefect: Boolean(source['isDefect']),
    defectType: stringValue(source['defectType']) || undefined,
    detectedAt: stringValue(pick(source, 'detectedAt', 'createdAt'), new Date(0).toISOString()),
  };
};

const normalizeDetectionList = (value: unknown, missionId: string): readonly MissionAiDetection[] =>
  arrayValue(value).flatMap((item, index) => normalizeDetectionGroup(item, index, missionId));

const normalizeDetectionGroup = (value: unknown, index: number, missionId: string): readonly MissionAiDetection[] => {
  const source = record(value);
  const detections = arrayValue(source['detections']);
  if (!detections.length) return [normalizeDetection(value, index, missionId)];
  const metadata = record(source['videoMetadata']);
  const mediaWidth = numberValue(pick(metadata, 'width', 'Width') ?? pick(source, 'width', 'imageWidth'));
  const mediaHeight = numberValue(pick(metadata, 'height', 'Height') ?? pick(source, 'height', 'imageHeight'));
  const videoDurationSeconds = nullableNumber(pick(metadata, 'duration', 'Duration'));
  return detections.map((detection, detectionIndex) => {
    const detail = record(detection);
    return normalizeDetection(
      {
        ...source,
        ...detail,
        missionId: pick(detail, 'missionId') ?? source['missionId'],
        mediaStatus: source['validationStatus'],
        imageUrl: pick(detail, 'imageUrl', 'fileUrl') ?? source['fileUrl'],
        sourceUrl: pick(detail, 'sourceUrl', 'fileUrl') ?? source['fileUrl'],
        detectedAt: pick(detail, 'detectedAt', 'createdAt') ?? source['createdAt'],
        mediaWidth,
        mediaHeight,
        videoDurationSeconds,
      },
      index + detectionIndex,
      missionId,
    );
  });
};

const normalizeDetection = (value: unknown, index: number, missionId: string): MissionAiDetection => {
  const source = record(value);
  const confidence = numberValue(pick(source, 'confidence', 'score', 'confidenceScore'));
  const timestamp = stringValue(pick(source, 'detectedAt', 'timestamp', 'createdAt'), new Date(0).toISOString());
  const timestampSeconds = parseTimestampSeconds(pick(source, 'timestampSeconds', 'timestamp', 'timeOffset', 'timeOffsetSeconds', 'videoTimestamp'));
  const rawBox = pick(source, 'boundingBox', 'rawBoundingBox', 'box');
  const boundingBox = normalizeBoundingBox(rawBox, numberValue(source['mediaWidth']), numberValue(source['mediaHeight']));
  return {
    id: stringValue(pick(source, 'id', 'detectionId', 'trackId'), `detection-${index}`),
    mediaId: stringValue(source['mediaId']),
    assetId: stringValue(source['assetId']),
    title: stringValue(pick(source, 'defectType', 'categoryName', 'categoryCode', 'className', 'label'), 'AI detection'),
    categoryCode: stringValue(source['categoryCode']),
    description: stringValue(pick(source, 'categoryDescription', 'description')),
    missionId: stringValue(source['missionId'], missionId),
    missionName: stringValue(pick(source, 'missionName', 'missionTitle'), missionId),
    mediaType: stringValue(source['mediaType'], 'Image'),
    imageUrl: stringValue(pick(source, 'imageUrl', 'thumbnailUrl', 'fileUrl', 'imageName')) || undefined,
    sourceUrl: stringValue(pick(source, 'sourceUrl', 'fileUrl', 'mediaUrl')) || undefined,
    confidence: confidence > 1 ? Math.round(confidence) : Math.round(confidence * 100),
    timestampSeconds,
    frameIndex: nullableNumber(pick(source, 'frameIndex', 'frameNumber')),
    videoDurationSeconds: nullableNumber(source['videoDurationSeconds']),
    severityWeight: numberValue(source['severityWeight']),
    isEmergency: Boolean(source['isEmergencyClass']),
    aiSource: stringValue(source['aiSource']),
    status: stringValue(pick(source, 'reviewStatus', 'validationStatus', 'status'), 'Pending'),
    mediaStatus: stringValue(source['mediaStatus']),
    analystNotes: stringValue(source['analystNotes']),
    detectedAt: timestamp,
    validatedAt: stringValue(source['validatedAt']),
    boundingBox,
  };
};

const nullableNumber = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseTimestampSeconds = (value: unknown): number | null => {
  const direct = nullableNumber(value);
  if (direct !== null) return direct;
  const text = stringValue(value);
  const match = /(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/.exec(text);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
};

const normalizeBoundingBox = (value: unknown, mediaWidth = 0, mediaHeight = 0): DetectionBoundingBox | undefined => {
  const toPercentBox = (box: DetectionBoundingBox): DetectionBoundingBox => {
    if (box.x <= 1 && box.y <= 1 && box.width <= 1 && box.height <= 1) {
      return { x: box.x * 100, y: box.y * 100, width: box.width * 100, height: box.height * 100 };
    }
    if (box.x <= 100 && box.y <= 100 && box.width <= 100 && box.height <= 100) return box;
    if (!mediaWidth || !mediaHeight) return box;
    return {
      x: (box.x / mediaWidth) * 100,
      y: (box.y / mediaHeight) * 100,
      width: (box.width / mediaWidth) * 100,
      height: (box.height / mediaHeight) * 100,
    };
  };
  if (Array.isArray(value) && value.length >= 4) {
    return toPercentBox({ x: numberValue(value[0]), y: numberValue(value[1]), width: numberValue(value[2]), height: numberValue(value[3]) });
  }
  if (!value || typeof value !== 'object') return undefined;
  const source = record(value);
  return toPercentBox({
    x: numberValue(source['x']),
    y: numberValue(source['y']),
    width: numberValue(source['width']),
    height: numberValue(source['height']),
  });
};
