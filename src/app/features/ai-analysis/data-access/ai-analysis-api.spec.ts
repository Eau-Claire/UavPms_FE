import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { AiAnalysisApi, AnalysisSessionResult } from './ai-analysis-api';

describe('AiAnalysisApi', () => {
  let api: AiAnalysisApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(AiAnalysisApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts standalone upload with multipart/form-data to /ai-analysis/upload', () => {
    const file = new File(['mock image content'], 'insulator-test.jpg', { type: 'image/jpeg' });

    api
      .uploadStandaloneAnalysis({
        files: [file],
        analysisType: 'DefectDetection',
        notes: 'Test defect detection note',
      })
      .subscribe();

    const req = http.expectOne(`${environment.apiBaseUrl}/ai-analysis/upload`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);

    const formData = req.request.body as FormData;
    expect(formData.get('analysisType')).toBe('DefectDetection');
    expect(formData.get('notes')).toBe('Test defect detection note');

    req.flush({
      success: true,
      message: 'Upload and analysis initiated successfully',
      data: {
        id: 'analysis-12345',
        status: 'Processing',
        analysisType: 'DefectDetection',
      },
    });
  });

  it('retrieves and normalizes analysis result by ID', () => {
    let result: AnalysisSessionResult | undefined;
    const testId = 'analysis-12345';

    api.getAnalysisResult(testId).subscribe((res) => (result = res));

    const req = http.expectOne(`${environment.apiBaseUrl}/ai-analysis/${testId}`);
    expect(req.request.method).toBe('GET');

    req.flush({
      success: true,
      data: {
        id: testId,
        status: 'Completed',
        analysisType: 'AssetConditionAssessment',
        notes: 'Evaluation complete',
        createdAt: '2026-08-27T20:00:00Z',
        detections: [
          {
            id: 'det-1',
            label: 'Crack',
            confidence: 0.95,
          },
        ],
      },
    });

    expect(result).toBeDefined();
    expect(result?.id).toBe(testId);
    expect(result?.status).toBe('Completed');
    expect(result?.analysisType).toBe('AssetConditionAssessment');
    expect(result?.notes).toBe('Evaluation complete');
    expect(result?.detections).toHaveLength(1);
  });
});
