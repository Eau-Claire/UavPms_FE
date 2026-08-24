import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { AssetManagementApi, AssetMission, DetectionBoundingBox, DetectionReviewDecision, MissionAiDetection } from '../../data-access/asset-management-api';
import { InspectionRecord, MonitorSummary } from '../../../../models/monitor.models';

type UploadStatus = 'uploading' | 'done' | 'pending';
type ReviewStatus = 'pending' | 'approved' | 'rejected';
type UploadFeedbackTone = 'info' | 'success' | 'error';

interface UploadFile {
  name: string;
  size: string;
  status: UploadStatus;
  progress: number;
}

interface DetectionCard {
  id: string;
  mediaId?: string;
  assetId?: string;
  title: string;
  categoryCode?: string;
  description?: string;
  location: string;
  voltage: string;
  confidence: number;
  severityWeight?: number;
  isEmergency?: boolean;
  aiSource?: string;
  mediaType?: string;
  mediaStatus?: string;
  analystNotes?: string;
  status: ReviewStatus;
  image: string;
  detectedAt: string;
  validatedAt?: string;
  sourceUrl?: string;
  box?: DefectBox;
  skeleton?: boolean;
}

interface DefectBox {
  left: number;
  top: number;
  width: number;
  height: number;
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
  private readonly route = inject(ActivatedRoute);
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
  private readonly missionDetectionCards = signal<DetectionCard[]>([]);
  protected readonly selectedDetection = signal<DetectionCard | null>(null);
  protected readonly detailFeedback = signal('');
  protected readonly reviewNotes = signal('');
  protected readonly missionId = signal('');

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
    this.missionId.set(this.route.snapshot.queryParamMap.get('missionId') ?? '');
    this.loadPageData();
  }

  protected setPhase(phase: 'upload' | 'review'): void {
    this.phase.set(phase);
    if (phase === 'review') {
      this.reviewPage.set(1);
      this.loadReviewData();
    }
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
    this.api.uploadAnalysisFile({
      files,
      missionId: this.mission().id || this.missionId() || undefined,
      analysisType: 'DefectDetection',
      preferredModel: 'SERVER',
      notes: this.mission().code,
    })
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
            this.uploadFeedback.set({ tone: 'success', message: this.uploadResultMessage(event.body) });
            this.phase.set('review');
            this.loadMissionDetections();
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

  protected setReviewNotes(value: string): void {
    this.reviewNotes.set(value);
  }

  protected reviewDetection(decision: DetectionReviewDecision): void {
    const detection = this.selectedDetection();
    const missionId = this.mission().id || this.missionId();
    if (!detection || !missionId) return;
    this.detailBusy.set(true);
    this.detailFeedback.set('');
    this.api.reviewMissionDetection(missionId, detection.id, { decision, notes: this.reviewNotes() })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.detailBusy.set(false)))
      .subscribe({
        next: (reviewed) => {
          const status = reviewed ? this.reviewStatusFromApi(reviewed.status || reviewed.mediaStatus) : this.reviewStatusFromDecision(decision);
          const mediaStatus = reviewed?.mediaStatus || reviewed?.status || decision;
          const analystNotes = reviewed?.analystNotes || this.reviewNotes();
          const validatedAt = reviewed?.validatedAt || new Date().toISOString();
          this.detailFeedback.set(decision === 'Approved' ? 'Đã xác nhận phát hiện.' : 'Đã từ chối phát hiện.');
          this.detections.update((cards) => cards.map((card) => card.id === detection.id ? { ...card, status, analystNotes, mediaStatus, validatedAt } : card));
          this.selectedDetection.update((selected) => selected ? { ...selected, status, analystNotes, mediaStatus, validatedAt } : selected);
          this.loadMissionDetections(detection.id);
        },
        error: (error: unknown) => this.detailFeedback.set(this.backendErrorMessage(error)),
      });
  }

  protected statusLabel(status: UploadStatus): string {
    return {
      uploading: 'Đang tải lên',
      done: 'Hoàn thành',
      pending: 'Chờ xử lý',
    }[status];
  }

  protected reviewStatusLabel(status: ReviewStatus): string {
    if (status === 'rejected') return 'Rejected';
    return status === 'approved' ? 'Đã duyệt' : 'Chờ duyệt';
  }

  protected goToReviewPage(page: number): void {
    if (page < 1 || page > this.reviewTotalPages() || page === this.reviewPage()) return;
    this.reviewPage.set(page);
    if (this.currentMissionId()) {
      this.applyMissionDetectionPage();
      return;
    }
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
    const selectedMissionId = this.missionId();
    if (selectedMissionId) {
      forkJoin({
        mission: this.api.getMission(selectedMissionId),
        summary: this.api.getSummary(),
        detections: this.api.getMissionDetections(selectedMissionId),
      })
        .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.pageBusy.set(false)))
        .subscribe({
          next: ({ mission, summary, detections }) => {
            this.mission.set(mission);
            const cards = this.cardsFromDetections(detections);
            this.missionDetectionCards.set(cards);
            this.applyMissionDetectionPage();
            if (!cards.length) this.summary.set(this.summaryFromApi(summary, 0));
          },
          error: (error: unknown) => this.uploadFeedback.set({ tone: 'error', message: this.backendErrorMessage(error) }),
        });
      return;
    }
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
    if (this.currentMissionId()) {
      this.loadMissionDetections();
      return;
    }
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
    const missionId = this.mission().id || this.missionId();
    if (missionId) {
      this.reviewNotes.set(this.selectedDetection()?.analystNotes ?? '');
      this.detailFeedback.set('Đã chọn phát hiện AI của nhiệm vụ.');
      return;
    }
    this.detailBusy.set(true);
    this.detailFeedback.set('');
    this.api.getInspectionReport(id)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.detailBusy.set(false)))
      .subscribe({
        next: () => this.detailFeedback.set('Đã tải chi tiết báo cáo.'),
        error: (error: unknown) => this.detailFeedback.set(this.backendErrorMessage(error)),
      });
  }

  private loadMissionDetections(selectedDetectionId = ''): void {
    const missionId = this.currentMissionId();
    if (!missionId) {
      this.reviewBusy.set(false);
      return;
    }
    this.reviewBusy.set(true);
    this.api.getMissionDetections(missionId)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.reviewBusy.set(false)))
      .subscribe({
        next: (detections) => {
          const cards = this.cardsFromDetections(detections);
          this.missionDetectionCards.set(cards);
          this.applyMissionDetectionPage(selectedDetectionId);
          const selected = selectedDetectionId ? this.detections().find((card) => card.id === selectedDetectionId && !card.skeleton) ?? null : null;
          this.selectedDetection.set(selected);
          if (selected) this.reviewNotes.set(selected.analystNotes ?? '');
        },
        error: (error: unknown) => this.detailFeedback.set(this.backendErrorMessage(error)),
      });
  }

  private currentMissionId(): string {
    return this.mission().id || this.missionId();
  }

  private summaryFromApi(summary: MonitorSummary, reviewCount: number) {
    return [
      { label: 'Tổng:', value: summary.totalDefects || reviewCount, tone: 'total' },
      { label: 'Chờ xem xét:', value: reviewCount, tone: 'waiting' },
      { label: 'Đã duyệt:', value: summary.completedMissions, tone: 'approved' },
      { label: 'Từ chối:', value: 0, tone: 'rejected' },
    ];
  }

  private cardsFromDetections(detections: readonly MissionAiDetection[]): DetectionCard[] {
    return detections.map((detection, index): DetectionCard => ({
      id: detection.id,
      mediaId: detection.mediaId,
      assetId: detection.assetId,
      title: detection.title,
      categoryCode: detection.categoryCode,
      description: detection.description,
      location: detection.assetId || this.mission().code || detection.missionName || detection.missionId,
      voltage: detection.assetId ? this.mission().code || detection.missionName : '',
      confidence: detection.confidence,
      severityWeight: detection.severityWeight,
      isEmergency: detection.isEmergency,
      aiSource: detection.aiSource,
      mediaType: detection.mediaType,
      mediaStatus: detection.mediaStatus,
      analystNotes: detection.analystNotes,
      status: this.reviewStatusFromApi(detection.status || detection.mediaStatus),
      image: detection.imageUrl || detection.sourceUrl || this.fallbackImage(index),
      sourceUrl: detection.sourceUrl || detection.imageUrl,
      detectedAt: detection.detectedAt,
      validatedAt: detection.validatedAt,
      box: this.boxFromBoundingBox(detection.boundingBox),
    }));
  }

  private applyMissionDetectionPage(selectedDetectionId = ''): void {
    const cards = this.missionDetectionCards();
    const totalCount = cards.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / this.reviewPageSize()));
    if (this.reviewPage() > totalPages) this.reviewPage.set(totalPages);
    const start = (this.reviewPage() - 1) * this.reviewPageSize();
    this.reviewTotalCount.set(totalCount);
    this.reviewTotalPages.set(totalPages);
    this.summary.set(this.summaryFromCards(cards));
    this.detections.set(this.withSkeletonCards(cards.slice(start, start + this.reviewPageSize())));
    if (selectedDetectionId) return;
    this.selectedDetection.set(null);
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
    return this.withSkeletonCards(cards);
  }

  private withSkeletonCards(cards: DetectionCard[]): DetectionCard[] {
    const result = [...cards];
    while (result.length < 6) {
      result.push({ id: `skeleton-${result.length}`, title: '', location: '', voltage: '', confidence: 0, status: 'pending', image: '', detectedAt: '', skeleton: true });
    }
    return result;
  }

  private summaryFromCards(cards: readonly DetectionCard[]) {
    const approved = cards.filter((card) => card.status === 'approved').length;
    const rejected = cards.filter((card) => card.status === 'rejected').length;
    return [
      { label: 'Tổng:', value: cards.length, tone: 'total' },
      { label: 'Chờ xem xét:', value: cards.length - approved - rejected, tone: 'waiting' },
      { label: 'Đã duyệt:', value: approved, tone: 'approved' },
      { label: 'Từ chối:', value: rejected, tone: 'rejected' },
    ];
  }

  private fallbackImage(index: number): string {
    return ['/images/defect-insulator-crack.png', '/images/defect-bolt-missing.png', '/images/defect-corridor-tree.png'][index % 3];
  }

  private reviewStatusFromApi(value: string): ReviewStatus {
    if (value === 'Accepted') return 'approved';
    if (value === 'Rejected') return 'rejected';
    if (value === 'Pending' || value === 'PendingReview') return 'pending';
    return 'pending';
  }

  private reviewStatusFromDecision(decision: DetectionReviewDecision): ReviewStatus {
    return decision === 'Approved' ? 'approved' : 'rejected';
  }

  private boxFromBoundingBox(box: DetectionBoundingBox | undefined): DefectBox | undefined {
    if (!box || box.width <= 0 || box.height <= 0) return undefined;
    const left = Math.min(100, Math.max(0, box.x * 100));
    const top = Math.min(100, Math.max(0, box.y * 100));
    const width = box.width * 100;
    const height = box.height * 100;
    return {
      left,
      top,
      width: Math.min(100 - left, Math.max(1, width)),
      height: Math.min(100 - top, Math.max(1, height)),
    };
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

  private uploadResultMessage(body: unknown): string {
    const data = this.record(this.record(body)['data']);
    const accepted = Number(data['acceptedFiles'] ?? 0);
    const rejected = Number(data['rejectedFiles'] ?? 0);
    const total = Number(data['totalFiles'] ?? accepted + rejected);
    if (total > 0) return `Đã tải lên ${accepted}/${total} tệp. ${rejected ? `${rejected} tệp bị từ chối bởi backend.` : 'Đã đưa vào hàng chờ AI.'}`;
    return this.backendMessage(body, 'Tệp đã gửi thành công.');
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
