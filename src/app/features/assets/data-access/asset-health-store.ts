import { computed, inject, Injectable, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import {
  AssetDashboardSummary,
  AssetDetail,
  AssetFilters,
  AssetHealthItem,
  RegionLookup,
  RiskLevel,
  TowerLookup,
} from '../../../models/assets.models';
import { MonitorSummary } from '../../../models/monitor.models';
import { AssetHealthApi } from './asset-health-api';

@Injectable()
export class AssetHealthStore {
  private readonly api = inject(AssetHealthApi);

  readonly assets = signal<readonly AssetHealthItem[]>([]);
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(10);
  readonly totalItems = signal<number>(0);
  readonly totalPages = signal<number>(1);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly filterRiskLevel = signal<string>('ALL');
  readonly filterAssetType = signal<string>('ALL');
  readonly filterTowerId = signal<string>('ALL');
  readonly searchQuery = signal<string>('');
  readonly sortBy = signal<'currentHealthScore' | 'riskLevel' | 'assetCode' | 'lastInspectedAt'>('currentHealthScore');
  readonly sortOrder = signal<'asc' | 'desc'>('asc');

  readonly selectedAssetDetail = signal<AssetDetail | null>(null);
  readonly detailLoading = signal<boolean>(false);
  readonly detailError = signal<string | null>(null);

  readonly towers = signal<readonly TowerLookup[]>([]);
  readonly regions = signal<readonly RegionLookup[]>([]);
  readonly monitorSummary = signal<MonitorSummary | null>(null);
  readonly lastRefreshedAt = signal<Date>(new Date());

  readonly filteredAssets = computed(() => {
    let list = [...this.assets()];
    const risk = this.filterRiskLevel();
    const type = this.filterAssetType();
    const tower = this.filterTowerId();
    const query = this.searchQuery().trim().toLowerCase();

    if (risk !== 'ALL') {
      list = list.filter((item) => item.riskLevel.toLowerCase() === risk.toLowerCase());
    }

    if (type !== 'ALL') {
      list = list.filter((item) => item.assetType.toLowerCase() === type.toLowerCase());
    }

    if (tower !== 'ALL') {
      list = list.filter((item) => item.towerId === tower || item.towerCode === tower);
    }

    if (query) {
      list = list.filter(
        (item) =>
          item.assetCode.toLowerCase().includes(query) ||
          (item.towerCode && item.towerCode.toLowerCase().includes(query)) ||
          item.assetType.toLowerCase().includes(query),
      );
    }

    const field = this.sortBy();
    const order = this.sortOrder() === 'asc' ? 1 : -1;

    return list.sort((a, b) => {
      if (field === 'currentHealthScore') {
        return (a.currentHealthScore - b.currentHealthScore) * order;
      }
      if (field === 'assetCode') {
        return a.assetCode.localeCompare(b.assetCode) * order;
      }
      if (field === 'lastInspectedAt') {
        const dateA = a.lastInspectedAt ? Date.parse(a.lastInspectedAt) : 0;
        const dateB = b.lastInspectedAt ? Date.parse(b.lastInspectedAt) : 0;
        return (dateA - dateB) * order;
      }
      if (field === 'riskLevel') {
        const rank = (r: RiskLevel) => {
          if (r === 'Critical Risk') return 1;
          if (r === 'High Risk') return 2;
          if (r === 'Medium Risk') return 3;
          return 4;
        };
        return (rank(a.riskLevel) - rank(b.riskLevel)) * order;
      }
      return 0;
    });
  });

  readonly kpiSummary = computed<AssetDashboardSummary>(() => {
    const list = this.assets();
    const total = list.length;
    if (!total) {
      const summary = this.monitorSummary();
      return {
        totalAssets: 0,
        criticalRiskCount: 0,
        highRiskCount: 0,
        mediumRiskCount: 0,
        lowRiskCount: 0,
        averageHealthScore: 0,
        criticalDefectsCount: summary?.criticalDefects ?? 0,
      };
    }

    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;
    let scoreSum = 0;

    for (const item of list) {
      scoreSum += item.currentHealthScore;
      if (item.currentHealthScore < 40 || item.riskLevel === 'Critical Risk') {
        critical++;
      } else if (item.currentHealthScore < 60 || item.riskLevel === 'High Risk') {
        high++;
      } else if (item.currentHealthScore < 80 || item.riskLevel === 'Medium Risk') {
        medium++;
      } else {
        low++;
      }
    }

    const summary = this.monitorSummary();
    return {
      totalAssets: total,
      criticalRiskCount: critical,
      highRiskCount: high,
      mediumRiskCount: medium,
      lowRiskCount: low,
      averageHealthScore: Math.round((scoreSum / total) * 10) / 10,
      criticalDefectsCount: summary?.criticalDefects ?? critical,
    };
  });

  loadData() {
    this.loading.set(true);
    this.error.set(null);

    const filters: AssetFilters = {
      page: this.page(),
      pageSize: this.pageSize(),
      towerId: this.filterTowerId() !== 'ALL' ? this.filterTowerId() : undefined,
      assetType: this.filterAssetType() !== 'ALL' ? this.filterAssetType() : undefined,
    };

    forkJoin({
      assetsPage: this.api.getAssets(filters),
      summary: this.api.getDashboardSummary(),
      towers: this.api.getTowers(),
      regions: this.api.getRegions(),
    }).subscribe({
      next: ({ assetsPage, summary, towers, regions }) => {
        this.assets.set(assetsPage.items);
        this.totalItems.set(assetsPage.totalItems);
        this.totalPages.set(assetsPage.totalPages);
        this.monitorSummary.set(summary);
        this.towers.set(towers);
        this.regions.set(regions);
        this.lastRefreshedAt.set(new Date());
        this.loading.set(false);
      },
      error: (err) => {
        // In case asset endpoint is loading, fallback to single asset endpoint or set error
        this.api.getAssets(filters).subscribe({
          next: (assetsPage) => {
            this.assets.set(assetsPage.items);
            this.totalItems.set(assetsPage.totalItems);
            this.totalPages.set(assetsPage.totalPages);
            this.lastRefreshedAt.set(new Date());
            this.loading.set(false);
          },
          error: (assetErr) => {
            this.error.set(
              assetErr?.message || err?.message || 'Không thể tải dữ liệu sức khỏe tài sản từ hệ thống.',
            );
            this.loading.set(false);
          },
        });
      },
    });
  }

  setRiskFilter(risk: string) {
    this.filterRiskLevel.set(risk);
  }

  setAssetTypeFilter(type: string) {
    this.filterAssetType.set(type);
    this.page.set(1);
    this.loadData();
  }

  setTowerFilter(towerId: string) {
    this.filterTowerId.set(towerId);
    this.page.set(1);
    this.loadData();
  }

  setSearch(query: string) {
    this.searchQuery.set(query);
  }

  setSorting(field: 'currentHealthScore' | 'riskLevel' | 'assetCode' | 'lastInspectedAt') {
    if (this.sortBy() === field) {
      this.sortOrder.update((curr) => (curr === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortBy.set(field);
      this.sortOrder.set(field === 'currentHealthScore' ? 'asc' : 'desc');
    }
  }

  setPage(page: number) {
    this.page.set(page);
    this.loadData();
  }

  openAssetDetail(id: string) {
    this.detailLoading.set(true);
    this.detailError.set(null);

    // Initial placeholder from existing list
    const found = this.assets().find((a) => a.id === id);
    if (found) {
      this.selectedAssetDetail.set({
        ...found,
        activeAnomalies: [],
      });
    }

    this.api.getAssetDetail(id).subscribe({
      next: (detail) => {
        this.selectedAssetDetail.set(detail);
        this.detailLoading.set(false);
      },
      error: (err) => {
        if (!found) {
          this.detailError.set(err?.message || 'Không thể tải thông tin chi tiết thiết bị.');
        }
        this.detailLoading.set(false);
      },
    });
  }

  closeAssetDetail() {
    this.selectedAssetDetail.set(null);
    this.detailError.set(null);
  }

  resetFilters() {
    this.filterRiskLevel.set('ALL');
    this.filterAssetType.set('ALL');
    this.filterTowerId.set('ALL');
    this.searchQuery.set('');
    this.sortBy.set('currentHealthScore');
    this.sortOrder.set('asc');
    this.page.set(1);
    this.loadData();
  }
}
