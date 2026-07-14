import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, forkJoin } from 'rxjs';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { AssetManagementApi, AssetMission } from '../../data-access/asset-management-api';
import { InspectionRecord, MonitorSummary } from '../../../../models/monitor.models';

type UploadStatus = 'uploading' | 'done' | 'pending';
type ReviewStatus = 'pending' | 'approved';
type UploadFeedbackTone = 'info' | 'success' | 'error';

interface UploadFile {
  name: string;
  size: string;
  status: UploadStatus;
  progress: number;
}

interface DetectionCard {
  id: string;
  title: string;
  location: string;
  voltage: string;
  confidence: number;
  status: ReviewStatus;
  image: string;
  detectedAt: string;
  sourceUrl?: string;
  skeleton?: boolean;
}

interface UploadFeedback {
  tone: UploadFeedbackTone;
  message: string;
}

@Component({
  selector: 'app-asset-management',
  imports: [DatePipe, NzIconModule],
  templateUrl: './asset-management.html',
  styleUrl: './asset-management.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetManagement {
  private readonly api = inject(AssetManagementApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly phase = signal<'upload' | 'review'>('upload');
  protected readonly activeTab = signal<'local' | 'storage'>('local');
  protected readonly selectedFiles = signal<readonly File[]>([]);
  protected readonly uploadBusy = signal(false);
  protected readonly pageBusy = signal(false);
  protected readonly detailBusy = signal(false);
  protected readonly reviewBusy = signal(false);
  protected readonly reviewPage = signal(1);
  protected readonly reviewPageSize = signal(8);
  protected readonly reviewTotalCount = signal(0);
  protected readonly reviewTotalPages = signal(1);
  protected readonly uploadFeedback = signal<UploadFeedback | null>(null);
  protected readonly selectedDetection = signal<DetectionCard | null>(null);
  protected readonly detailFeedback = signal('');

  protected readonly mission = signal<AssetMission>({
    id: '',
    code: 'Đang tải',
    title: '',
    line: 'Đang tải nhiệm vụ',
    towerCount: 'N/A',
    surveyDate: 'N/A',
    status: '',
    description: '',
  });

  protected readonly uploadFiles = signal<UploadFile[]>([
    { name: 'Chưa chọn tệp', size: '-', status: 'pending', progress: 0 },
  ]);

  protected readonly summary = signal([
    { label: 'Tổng:', value: 0, tone: 'total' },
    { label: 'Chờ xem xét:', value: 0, tone: 'waiting' },
    { label: 'Đã duyệt:', value: 0, tone: 'approved' },
    { label: 'Từ chối:', value: 0, tone: 'rejected' },
  ]);

  protected readonly detections = signal<DetectionCard[]>([
    { id: 'skeleton-1', title: '', location: '', voltage: '', confidence: 0, status: 'pending', image: '', detectedAt: '', skeleton: true },
    { id: 'skeleton-2', title: '', location: '', voltage: '', confidence: 0, status: 'pending', image: '', detectedAt: '', skeleton: true },
    { id: 'skeleton-3', title: '', location: '', voltage: '', confidence: 0, status: 'pending', image: '', detectedAt: '', skeleton: true },
  ]);

  constructor() {
    this.loadPageData();
  }

  protected setPhase(phase: 'upload' | 'review'): void {
    this.phase.set(phase);
    if (phase === 'review') this.loadReviewData();
  }

  protected setTab(tab: 'local' | 'storage'): void {
    this.activeTab.set(tab);
  }

  protected chooseFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.selectedFiles.set(files);
    this.uploadFeedback.set(files.length ? { tone: 'info', message: `Đã chọn ${files.length} tệp.` } : null);
    this.uploadFiles.set(files.length
      ? files.map((file) => ({ name: file.name, size: this.formatBytes(file.size), status: 'pending', progress: 0 }))
      : [{ name: 'Chưa chọn tệp', size: '-', status: 'pending', progress: 0 }]);
  }

  protected sendSelectedVideo(): void {
    const files = this.selectedFiles();
    if (!files.length) {
      this.uploadFeedback.set({ tone: 'error', message: 'Chọn ít nhất một tệp trước khi gửi.' });
      return;
    }
    this.uploadBusy.set(true);
    this.uploadFeedback.set({ tone: 'info', message: `Đang gửi ${files.length} tệp...` });
    this.setUploadState('uploading', 0);
    this.api.uploadAnalysisFile({ files, notes: this.mission().code })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.uploadBusy.set(false)))
      .subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress) {
            const total = event.total || files.reduce((sum, file) => sum + file.size, 0);
            this.setUploadState('uploading', Math.round((event.loaded / total) * 100));
            return;
          }
          if (event.type === HttpEventType.Response) {
            this.setUploadState('done', 100);
            this.uploadFeedback.set({ tone: 'success', message: this.backendMessage(event.body, 'Tệp đã gửi thành công.') });
            this.prependUploadedCards(event.body);
            this.setPhase('review');
          }
        },
        error: (error: unknown) => {
          this.setUploadState('pending', 0);
          this.uploadFeedback.set({ tone: 'error', message: this.backendErrorMessage(error) });
        },
      });
  }

  protected removeUploadFile(name: string): void {
    if (this.uploadBusy()) return;
    const files = this.selectedFiles().filter((file) => file.name !== name);
    this.selectedFiles.set(files);
    this.uploadFiles.set(files.length
      ? files.map((file) => ({ name: file.name, size: this.formatBytes(file.size), status: 'pending', progress: 0 }))
      : [{ name: 'Chưa chọn tệp', size: '-', status: 'pending', progress: 0 }]);
    this.uploadFeedback.set(files.length ? { tone: 'info', message: `Còn ${files.length} tệp.` } : null);
  }

  protected selectDetection(card: DetectionCard): void {
    if (card.skeleton) return;
    this.selectedDetection.update((selected) => (selected?.id === card.id ? null : card));
    if (this.selectedDetection()) this.loadReportDetail(card.id);
  }

  protected statusLabel(status: UploadStatus): string {
    return {
      uploading: 'Đang tải lên',
      done: 'Hoàn thành',
      pending: 'Chờ xử lý',
    }[status];
  }

  protected reviewStatusLabel(status: ReviewStatus): string {
    return status === 'approved' ? 'Đã duyệt' : 'Chờ duyệt';
  }

  protected goToReviewPage(page: number): void {
    if (page < 1 || page > this.reviewTotalPages() || page === this.reviewPage()) return;
    this.reviewPage.set(page);
    this.loadReviewData();
  }

  protected reviewStartIndex(): number {
    if (!this.reviewTotalCount()) return 0;
    return (this.reviewPage() - 1) * this.reviewPageSize() + 1;
  }

  protected reviewEndIndex(): number {
    return Math.min(this.reviewTotalCount(), this.reviewPage() * this.reviewPageSize());
  }

  private loadPageData(): void {
    this.pageBusy.set(true);
    forkJoin({
      missions: this.api.getMissions(1, 5),
      summary: this.api.getSummary(),
      inspections: this.api.getInspections({ missionId: '', isDefect: null, fromDate: '', toDate: '', page: this.reviewPage(), pageSize: this.reviewPageSize() }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.pageBusy.set(false)))
      .subscribe({
        next: ({ missions, summary, inspections }) => {
          const firstMission = missions.items[0];
          if (firstMission) this.mission.set(firstMission);
          this.summary.set(this.summaryFromApi(summary, inspections.totalCount));
          this.reviewTotalCount.set(inspections.totalCount);
          this.reviewTotalPages.set(inspections.totalPages);
          this.detections.set(this.cardsFromInspections(inspections.items));
        },
        error: (error: unknown) => this.uploadFeedback.set({ tone: 'error', message: this.backendErrorMessage(error) }),
      });
  }

  private loadReviewData(): void {
    this.reviewBusy.set(true);
    forkJoin({
      summary: this.api.getSummary(),
      inspections: this.api.getInspections({ missionId: '', isDefect: null, fromDate: '', toDate: '', page: this.reviewPage(), pageSize: this.reviewPageSize() }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.reviewBusy.set(false)))
      .subscribe({
        next: ({ summary, inspections }) => {
          this.summary.set(this.summaryFromApi(summary, inspections.totalCount));
          this.reviewTotalCount.set(inspections.totalCount);
          this.reviewTotalPages.set(inspections.totalPages);
          this.detections.set(this.cardsFromInspections(inspections.items));
          this.selectedDetection.set(null);
        },
        error: (error: unknown) => this.detailFeedback.set(this.backendErrorMessage(error)),
      });
  }

  private loadReportDetail(id: string): void {
    this.detailBusy.set(true);
    this.detailFeedback.set('');
    this.api.getInspectionReport(id)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.detailBusy.set(false)))
      .subscribe({
        next: () => this.detailFeedback.set('Đã tải chi tiết báo cáo.'),
        error: (error: unknown) => this.detailFeedback.set(this.backendErrorMessage(error)),
      });
  }

  private prependUploadedCards(body: unknown): void {
    const uploads = this.arrayValue(this.record(body)['data']);
    const uploadedCards = uploads.map((upload, index): DetectionCard => {
      const source = this.record(upload);
      const fileUrl = String(source['fileUrl'] ?? '');
      return {
        id: String(source['id'] ?? `upload-${Date.now()}-${index}`),
        title: String(source['analysisType'] ?? 'DefectDetection'),
        location: String(source['status'] ?? 'Pending'),
        voltage: String(source['mediaType'] ?? 'Image'),
        confidence: 100,
        status: 'pending',
        image: fileUrl || this.fallbackImage(index),
        sourceUrl: fileUrl,
        detectedAt: String(source['createdAt'] ?? new Date().toISOString()),
      };
    });
    if (uploadedCards.length) this.detections.update((cards) => [...uploadedCards, ...cards.filter((card) => !card.skeleton)]);
  }

  private summaryFromApi(summary: MonitorSummary, reviewCount: number) {
    return [
      { label: 'Tổng:', value: summary.totalDefects || reviewCount, tone: 'total' },
      { label: 'Chờ xem xét:', value: reviewCount, tone: 'waiting' },
      { label: 'Đã duyệt:', value: summary.completedMissions, tone: 'approved' },
      { label: 'Từ chối:', value: 0, tone: 'rejected' },
    ];
  }

  private cardsFromInspections(inspections: readonly InspectionRecord[]): DetectionCard[] {
    const cards = inspections.map((inspection, index): DetectionCard => ({
      id: inspection.id,
      title: inspection.defectType || (inspection.isDefect ? 'Khuyết tật chưa phân loại' : 'Không phát hiện lỗi'),
      location: inspection.missionName,
      voltage: inspection.missionId,
      confidence: inspection.isDefect ? 94 : 80,
      status: 'pending',
      image: inspection.imageUrl || this.fallbackImage(index),
      sourceUrl: inspection.imageUrl,
      detectedAt: inspection.detectedAt,
    }));
    while (cards.length < 6) {
      cards.push({ id: `skeleton-${cards.length}`, title: '', location: '', voltage: '', confidence: 0, status: 'pending', image: '', detectedAt: '', skeleton: true });
    }
    return cards;
  }

  private fallbackImage(index: number): string {
    return ['/images/defect-insulator-crack.png', '/images/defect-bolt-missing.png', '/images/defect-corridor-tree.png'][index % 3];
  }

  private setUploadState(status: UploadStatus, progress: number): void {
    this.uploadFiles.update((files) => files.map((file) => ({ ...file, status, progress })));
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }

  private backendMessage(body: unknown, fallback: string): string {
    const source = this.record(body);
    return String(source['message'] ?? fallback);
  }

  private backendErrorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return 'Không thể tải dữ liệu.';
    const body = this.record(error.error);
    if (typeof error.error === 'string' && error.error.trim()) return error.error.trim();
    const errors = this.record(body['errors']);
    const firstError = Object.values(errors).flat().find(Boolean);
    if (firstError) return String(firstError);
    return this.backendMessage(body, error.message || 'Không thể tải dữ liệu.');
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  }

  private arrayValue(value: unknown): readonly unknown[] {
    return Array.isArray(value) ? value : [];
  }

}
