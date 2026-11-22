import { Injectable, signal } from '@angular/core';
import { AnomalyItem } from './anomaly-api';

const STORAGE_KEY = 'uavpms_anomaly_reviews_v1';

const INITIAL_REVIEWED_ITEMS: AnomalyItem[] = [
  {
    id: 'anom-seed-1',
    mediaUrl: '/images/defect-preview-frame.png',
    towerId: 'tow-seed-1',
    towerCode: 'HCM-TB-T01',
    missionCode: 'PMA-56F400D7',
    missionName: 'Khảo sát Tân Bình Tuyến 01',
    categoryName: 'Bát cách điện vỡ',
    categoryCode: 'BROKEN_INSULATOR',
    confidenceScore: 92,
    validationStatus: 'Confirmed',
    analystNotes: 'Đã xác nhận bát cách điện vỡ pha B. Cần lên phiếu bảo trì thay thế.',
    aiSource: 'Cloud (Server)',
    analysisRunId: null,
    executionLocation: 'Cloud',
    supersededById: null,
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    severity: 4,
    isEmergency: true,
  },
  {
    id: 'anom-seed-2',
    mediaUrl: '/images/defect-preview-frame.png',
    towerId: 'tow-seed-2',
    towerCode: 'HCM-TB-T03',
    missionCode: 'PMA-56F400D7',
    missionName: 'Khảo sát Tân Bình Tuyến 01',
    categoryName: 'Tổ chim',
    categoryCode: 'BIRD_NEST',
    confidenceScore: 88,
    validationStatus: 'Confirmed',
    analystNotes: 'Xác nhận tổ chim trên xà đỡ dây dẫn. Đã phê duyệt dọn dẹp.',
    aiSource: 'Cloud (Server)',
    analysisRunId: null,
    executionLocation: 'Cloud',
    supersededById: null,
    createdAt: new Date(Date.now() - 3600000 * 18).toISOString(),
    severity: 2,
    isEmergency: false,
  },
  {
    id: 'anom-seed-3',
    mediaUrl: '/images/defect-preview-frame.png',
    towerId: 'tow-seed-3',
    towerCode: 'HCM-TB-T04',
    missionCode: 'PMA-56F400D7',
    missionName: 'Khảo sát Tân Bình Tuyến 01',
    categoryName: 'Rỉ sét xà kim loại',
    categoryCode: 'RUST',
    confidenceScore: 48,
    validationStatus: 'Rejected',
    analystNotes: '[False Positive] Vệt đen do bóng đổ ánh mặt trời, không phải rỉ sét.',
    aiSource: 'Edge (UAV)',
    analysisRunId: null,
    executionLocation: 'Edge',
    supersededById: null,
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    severity: 1,
    isEmergency: false,
  },
  {
    id: 'anom-seed-4',
    mediaUrl: '/images/defect-preview-frame.png',
    towerId: 'tow-seed-4',
    towerCode: 'HCM-AP-T01',
    missionCode: 'PMA-88A123BC',
    missionName: 'Khảo sát An Phú Tuyến 02',
    categoryName: 'Dị vật vướng lưới',
    categoryCode: 'FOREIGN_OBJECT',
    confidenceScore: 35,
    validationStatus: 'Rejected',
    analystNotes: '[Poor Image Quality] Ảnh ngược sáng mờ nhòe, không đủ cơ sở xác thực dị vật.',
    aiSource: 'Edge (UAV)',
    analysisRunId: null,
    executionLocation: 'Edge',
    supersededById: null,
    createdAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    severity: 2,
    isEmergency: false,
  },
];

@Injectable({
  providedIn: 'root',
})
export class AnomalyHistoryService {
  private readonly reviews = signal<Map<string, AnomalyItem>>(new Map());

  constructor() {
    this.initFromStorage();
  }

  private initFromStorage(): void {
    const map = new Map<string, AnomalyItem>();
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AnomalyItem[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed.forEach((item) => map.set(item.id, item));
        }
      }
    } catch {
      // Fallback
    }

    if (map.size === 0) {
      INITIAL_REVIEWED_ITEMS.forEach((item) => map.set(item.id, item));
      this.persist(map);
    }

    this.reviews.set(map);
  }

  private persist(map: Map<string, AnomalyItem>): void {
    try {
      const array = Array.from(map.values());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(array));
    } catch {
      // Storage full or quota exceeded
    }
  }

  getReviewedItems(): AnomalyItem[] {
    return Array.from(this.reviews().values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  getReview(id: string): AnomalyItem | undefined {
    return this.reviews().get(id);
  }

  isReviewed(id: string): boolean {
    return this.reviews().has(id);
  }

  saveReview(item: AnomalyItem, status: 'Confirmed' | 'Rejected', notes: string): AnomalyItem {
    const updated: AnomalyItem = {
      ...item,
      validationStatus: status,
      analystNotes: notes,
      createdAt: item.createdAt || new Date().toISOString(),
    };

    const currentMap = new Map(this.reviews());
    currentMap.set(updated.id, updated);
    this.reviews.set(currentMap);
    this.persist(currentMap);
    return updated;
  }
}
