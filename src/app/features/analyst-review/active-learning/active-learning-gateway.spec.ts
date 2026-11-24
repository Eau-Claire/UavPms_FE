import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AnomalyItem } from '../data-access/anomaly-api';
import { ActiveLearningGateway } from './active-learning-gateway';
import { ACTIVE_LEARNING_CONFIG } from './active-learning.config';

const STORAGE_KEY = 'uavpms.activeLearning.test.v1';

const sampleAnomaly = (overrides: Partial<AnomalyItem> = {}): AnomalyItem => ({
  id: 'anom-1',
  mediaUrl: 'https://cdn.example.com/img-001.jpg',
  towerId: 'tower-1',
  towerCode: 'T-01',
  missionCode: 'M-01',
  missionName: 'Mission 1',
  categoryName: 'Sứ vỡ',
  categoryCode: 'insulator_broken',
  boundingBox: { x: 10, y: 20, width: 30, height: 40, isNormalized: true },
  confidenceScore: 92,
  validationStatus: 'Pending',
  analystNotes: '',
  aiSource: 'yolov8s-v2',
  analysisRunId: 'run-1',
  executionLocation: 'Cloud',
  supersededById: null,
  createdAt: '2026-11-24T10:00:00Z',
  severity: 3,
  isEmergency: false,
  ...overrides,
});

describe('ActiveLearningGateway', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it('loads AI boxes normalized 0..1 and persists Draft vs FullyReviewed in local mode', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ACTIVE_LEARNING_CONFIG,
          useValue: { enabled: true, mode: 'local', storageKey: STORAGE_KEY },
        },
      ],
    });

    const gateway = TestBed.inject(ActiveLearningGateway);
    const item = sampleAnomaly();

    const ctx = await firstValueFrom(gateway.loadContext(item));
    expect(ctx.aiBoxes.length).toBe(1);
    expect(ctx.aiBoxes[0].className).toBe('insulator_broken');
    expect(ctx.aiBoxes[0].x).toBe(0.1);
    expect(ctx.aiBoxes[0].y).toBe(0.2);
    expect(ctx.aiBoxes[0].width).toBe(0.3);
    expect(ctx.aiBoxes[0].height).toBe(0.4);
    expect(gateway.statusFor(item)).toBeNull();

    // Save as Draft (unchecked)
    const draft = await firstValueFrom(
      gateway.saveLabels({
        anomalyId: item.id,
        mediaKey: ctx.mediaKey,
        isFullyReviewed: false,
        boxes: [],
      }),
    );
    expect(draft.labelStatus).toBe('Draft');
    expect(draft.boxes).toEqual([]);
    expect(gateway.statusFor(item)).toBe('Draft');

    // Save as FullyReviewed (checked) with 0-box negative sample
    const confirmed = await firstValueFrom(
      gateway.saveLabels({
        anomalyId: item.id,
        mediaKey: ctx.mediaKey,
        isFullyReviewed: true,
        boxes: [],
      }),
    );
    expect(confirmed.labelStatus).toBe('FullyReviewed');
    expect(gateway.statusFor(item)).toBe('FullyReviewed');

    // Submit fully-reviewed image to AI learning check
    const submission = await firstValueFrom(gateway.submitForLearning(item));
    expect(submission.status).toBe('Accepted');
    expect(gateway.learningStatusFor(item)).toBe('Accepted');
  });

  it('sends strictly normalized 0..1 boxes to BE in api mode', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ACTIVE_LEARNING_CONFIG,
          useValue: { enabled: true, mode: 'api', storageKey: STORAGE_KEY },
        },
      ],
    });

    const gateway = TestBed.inject(ActiveLearningGateway);
    const httpMock = TestBed.inject(HttpTestingController);
    const item = sampleAnomaly();

    let resultStatus = '';
    gateway
      .saveLabels({
        anomalyId: item.id,
        mediaKey: 'media:1',
        isFullyReviewed: true,
        frameIndex: 42,
        boxes: [
          {
            className: 'insulator',
            x: 0.15,
            y: 0.25,
            width: 0.35,
            height: 0.45,
            source: 'manual',
            confidence: null,
          },
        ],
      })
      .subscribe((res) => {
        resultStatus = res.labelStatus;
      });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/anomalies/anom-1/labels`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      isFullyReviewed: true,
      frameIndex: 42,
      boxes: [
        {
          className: 'insulator',
          x: 0.15,
          y: 0.25,
          width: 0.35,
          height: 0.45,
          source: 'manual',
          confidence: null,
        },
      ],
    });

    req.flush({ data: { labelStatus: 'FullyReviewed', updatedAt: '2026-11-24T12:00:00Z' } });
    expect(resultStatus).toBe('FullyReviewed');
    httpMock.verify();
  });

  it('hides label status when feature flag is disabled', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ACTIVE_LEARNING_CONFIG,
          useValue: { enabled: false, mode: 'local', storageKey: STORAGE_KEY },
        },
      ],
    });

    const gateway = TestBed.inject(ActiveLearningGateway);
    expect(gateway.enabled).toBe(false);
    expect(gateway.statusFor(sampleAnomaly({ labelStatus: 'FullyReviewed' }))).toBeNull();
  });
});
