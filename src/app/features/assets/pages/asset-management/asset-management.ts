import { ChangeDetectionStrategy, Component, signal, ViewEncapsulation } from '@angular/core';
import { NzIconModule } from 'ng-zorro-antd/icon';

type UploadStatus = 'uploading' | 'done' | 'pending';
type ReviewStatus = 'pending' | 'approved';

interface UploadFile {
  name: string;
  size: string;
  status: UploadStatus;
  progress: number;
}

interface DetectionCard {
  title: string;
  location: string;
  voltage: string;
  confidence: number;
  status: ReviewStatus;
  image: string;
  selected?: boolean;
  skeleton?: boolean;
}

@Component({
  selector: 'app-asset-management',
  imports: [NzIconModule],
  templateUrl: './asset-management.html',
  styleUrl: './asset-management.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetManagement {
  protected readonly phase = signal<'upload' | 'review'>('upload');
  protected readonly activeTab = signal<'local' | 'storage'>('local');

  protected readonly mission = {
    code: 'NV-2025-0042',
    line: '110kV Bình Dương - Thủ Đức',
    towers: '87 cột',
    surveyDate: '15/11/2025',
  };

  protected readonly uploadFiles: UploadFile[] = [
    { name: 'DJI_0042.mp4', size: '2.3 GB', status: 'uploading', progress: 65 },
    { name: 'DJI_0043.mp4', size: '1.8 GB', status: 'done', progress: 100 },
    { name: 'DJI_0044.mp4', size: '3.1 GB', status: 'pending', progress: 0 },
  ];

  protected readonly summary = [
    { label: 'Tổng:', value: 12, tone: 'total' },
    { label: 'Chờ xem xét:', value: 8, tone: 'waiting' },
    { label: 'Đã duyệt:', value: 3, tone: 'approved' },
    { label: 'Từ chối:', value: 1, tone: 'rejected' },
  ] as const;

  protected readonly detections: DetectionCard[] = [
    { title: 'Sứ cách điện — Nứt vỡ', location: 'Cột 23 / Tuyến', voltage: '110kV', confidence: 94, status: 'pending', image: '/images/defect-insulator-crack.png' },
    { title: 'Phụ kiện — Bulông thiếu', location: 'Cột 12 / Tuyến', voltage: '220kV', confidence: 88, status: 'pending', image: '/images/defect-bolt-missing.png' },
    { title: 'Hành lang — Cây vi phạm', location: 'Cột 45 / Tuyến', voltage: '500kV', confidence: 91, status: 'pending', image: '/images/defect-corridor-tree.png' },
    { title: 'Sứ cách điện — Ố bẩn', location: 'Cột 08 / Tuyến', voltage: '110kV', confidence: 82, status: 'approved', image: '/images/defect-insulator-dirty.png' },
    { title: '', location: '', voltage: '', confidence: 0, status: 'pending', image: '', skeleton: true },
    { title: '', location: '', voltage: '', confidence: 0, status: 'pending', image: '', skeleton: true },
  ];

  protected readonly selectedDetection = signal<DetectionCard | null>(null);

  protected setPhase(phase: 'upload' | 'review'): void {
    this.phase.set(phase);
  }

  protected setTab(tab: 'local' | 'storage'): void {
    this.activeTab.set(tab);
  }

  protected selectDetection(card: DetectionCard): void {
    if (!card.skeleton) {
      this.selectedDetection.update((selected) => (selected === card ? null : card));
    }
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
}
