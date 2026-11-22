import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import { AiAnalysisSessionStore, StandaloneMediaPreview } from './ai-analysis-session-store';
import { AiDetection } from './ai-analysis-api';

describe('AiAnalysisSessionStore', () => {
  let store: AiAnalysisSessionStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AiAnalysisSessionStore],
    });
    store = TestBed.inject(AiAnalysisSessionStore);
    store.resetSession();
  });

  it('initializes with default idle stage and image mode', () => {
    expect(store.workflowMode()).toBe('image');
    expect(store.workflowStage()).toBe('idle');
    expect(store.selectedFiles()).toHaveLength(0);
    expect(store.currentMedia()).toBeNull();
    expect(store.allDetections()).toHaveLength(0);
  });

  it('maintains state across simulated tab switching', () => {
    const mockFile = new File(['mock content'], 'tower-defect.jpg', { type: 'image/jpeg' });
    const preview: StandaloneMediaPreview = {
      id: 'media-1',
      file: mockFile,
      name: 'tower-defect.jpg',
      sizeFormatted: '1.2 MB',
      previewUrl: 'blob:mock-url',
      thumbnailUrl: 'blob:mock-url',
      resolution: '1920 x 1080',
      fps: '-',
      duration: '-',
      durationSeconds: 0,
      kind: 'image',
      status: 'Sẵn sàng kiểm tra',
      progress: 0,
    };

    store.setFiles([preview]);
    store.setWorkflowStage('inspected');

    const mockDetection: AiDetection = {
      id: 'det-1',
      title: 'Bát cách điện vỡ',
      confidence: 62,
      categoryCode: 'BROKEN_INSULATOR',
      description: 'Phát hiện nứt vỡ bát cách điện',
      mediaType: 'image',
      timestampSeconds: null,
      timestampLabel: 'Ảnh đơn lẻ',
      frameIndex: 1,
      gps: '10.8, 106.7',
      tower: 'HCM-TB-T02',
      missionName: 'Phân tích độc lập',
      imageUrl: 'blob:mock-url',
      severityWeight: 4,
      isEmergency: true,
      status: 'Pending',
      detectedAt: '2026-11-22T16:10:00Z',
    };

    store.setDetections([mockDetection]);

    // Read signals as if returning to the tab
    expect(store.workflowStage()).toBe('inspected');
    expect(store.selectedFiles()).toHaveLength(1);
    expect(store.currentMedia()?.name).toBe('tower-defect.jpg');
    expect(store.allDetections()).toHaveLength(1);
    expect(store.selectedDetection()?.title).toBe('Bát cách điện vỡ');
    expect(store.filteredDetections()).toHaveLength(1);
  });

  it('filters detections based on confidence threshold', () => {
    const d1: AiDetection = {
      id: 'det-1',
      title: 'Khuyết tật 1',
      confidence: 75,
      categoryCode: 'C1',
      description: '',
      mediaType: 'image',
      timestampSeconds: null,
      timestampLabel: '',
      frameIndex: 1,
      gps: '-',
      tower: '-',
      missionName: '',
      imageUrl: '',
      severityWeight: 1,
      isEmergency: false,
      status: 'Pending',
      detectedAt: '',
    };
    const d2: AiDetection = {
      ...d1,
      id: 'det-2',
      title: 'Khuyết tật 2',
      confidence: 50,
    };

    store.setDetections([d1, d2]);
    store.setConfidenceThreshold(60);

    expect(store.filteredDetections()).toHaveLength(1);
    expect(store.filteredDetections()[0].id).toBe('det-1');

    store.setConfidenceThreshold(40);
    expect(store.filteredDetections()).toHaveLength(2);
  });
});
