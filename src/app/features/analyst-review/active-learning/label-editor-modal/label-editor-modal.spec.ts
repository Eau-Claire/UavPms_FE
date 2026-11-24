import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AnomalyItem } from '../../data-access/anomaly-api';
import { ACTIVE_LEARNING_CONFIG } from '../active-learning.config';
import { SaveImageLabelsResult } from '../active-learning.models';
import { LabelEditorModal } from './label-editor-modal';

const STORAGE_KEY = 'uavpms.activeLearning.modal.spec.v1';

const sampleAnomaly: AnomalyItem = {
  id: 'anom-modal-1',
  mediaUrl: 'https://cdn.example.com/uav-frame.jpg',
  towerId: 'tower-1',
  towerCode: 'T-01',
  missionCode: 'M-01',
  missionName: 'Mission 1',
  categoryName: 'Sứ vỡ / rạn nứt',
  categoryCode: 'insulator_broken',
  boundingBox: { x: 15, y: 20, width: 25, height: 30, isNormalized: true },
  confidenceScore: 88,
  validationStatus: 'Pending',
  analystNotes: '',
  aiSource: 'yolov8m-v3',
  analysisRunId: 'run-1',
  executionLocation: 'Cloud',
  supersededById: null,
  createdAt: '2026-11-24T10:00:00Z',
  severity: 3,
  isEmergency: false,
};

describe('LabelEditorModal', () => {
  let fixture: ComponentFixture<LabelEditorModal>;

  beforeEach(async () => {
    localStorage.removeItem(STORAGE_KEY);
    await TestBed.configureTestingModule({
      imports: [LabelEditorModal],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ACTIVE_LEARNING_CONFIG,
          useValue: { enabled: true, mode: 'local', storageKey: STORAGE_KEY },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LabelEditorModal);
    fixture.componentRef.setInput('anomaly', sampleAnomaly);
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it('renders all 6 classes including insulator and shows concise local-mode notice', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Lưu cục bộ · chờ API');

    const drawOptions = Array.from(el.querySelectorAll('#le-draw-class option')).map((o) =>
      o.textContent?.trim(),
    );
    expect(drawOptions.length).toBe(6);
    expect(drawOptions.some((t) => t?.includes('Sứ cách điện'))).toBe(true);
    expect(drawOptions.some((t) => t?.includes('Đứt sợi dây dẫn'))).toBe(true);
  });

  it('saves as Draft when fully-reviewed checkbox is unticked, and FullyReviewed when ticked', () => {
    const results: SaveImageLabelsResult[] = [];
    fixture.componentInstance.saved.subscribe((r) => results.push(r));

    const el: HTMLElement = fixture.nativeElement;
    const saveBtn = el.querySelector('.le-save-actions .app-btn-primary') as HTMLButtonElement;
    saveBtn.click();
    fixture.detectChanges();

    expect(results[0]?.labelStatus).toBe('Draft');
    expect(results[0]?.boxes[0]?.x).toBe(0.15);
    expect(results[0]?.boxes[0]?.width).toBe(0.25);

    const checkbox = el.querySelector('.le-confirm-check input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    saveBtn.click();
    fixture.detectChanges();
    expect(results[1]?.labelStatus).toBe('FullyReviewed');
  });

  it('shows empty-image notice when all boxes are deleted and still allows saving 0 boxes', () => {
    const results: SaveImageLabelsResult[] = [];
    fixture.componentInstance.saved.subscribe((r) => results.push(r));

    const el: HTMLElement = fixture.nativeElement;
    const deleteBtn = el.querySelector('.le-row-delete') as HTMLButtonElement;
    deleteBtn.click();
    fixture.detectChanges();

    expect(el.textContent).toContain('Ảnh không có vật thể/lỗi');

    const saveBtn = el.querySelector('.le-save-actions .app-btn-primary') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
    saveBtn.click();
    fixture.detectChanges();

    expect(results[0]?.boxes).toEqual([]);
  });

  it('supports keyboard class reclassify (1-6), Delete, Undo, and Reset to AI boxes', () => {
    const el: HTMLElement = fixture.nativeElement;

    // Press '1' to reclassify selected box to 'insulator'
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    fixture.detectChanges();
    expect(el.querySelector('.le-box-tag')?.textContent).toContain('Sứ cách điện');

    // Press 'Delete' to remove box
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    fixture.detectChanges();
    expect(el.querySelectorAll('.le-box').length).toBe(0);

    // Undo restores box
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    fixture.detectChanges();
    expect(el.querySelectorAll('.le-box').length).toBe(1);

    // "Hoàn tác tất cả" restores original AI class (Sứ vỡ)
    const resetBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Hoàn tác tất cả'),
    ) as HTMLButtonElement;
    resetBtn.click();
    fixture.detectChanges();
    expect(el.querySelector('.le-box-tag')?.textContent).toContain('Sứ vỡ');
  });
});
