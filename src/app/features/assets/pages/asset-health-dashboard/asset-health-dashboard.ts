import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { AssetHealthItem, AssetType, MaintenancePriority, RiskLevel } from '../../../../models/assets.models';
import { DataState } from '../../../../shared/components/data-state/data-state';
import { Pagination } from '../../../../shared/components/pagination/pagination';
import { AssetHealthStore } from '../../data-access/asset-health-store';

@Component({
  selector: 'app-asset-health-dashboard',
  imports: [DatePipe, DecimalPipe, NzIconModule, Pagination, DataState],
  providers: [AssetHealthStore],
  templateUrl: './asset-health-dashboard.html',
  styleUrl: './asset-health-dashboard.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetHealthDashboard implements OnInit {
  protected readonly store = inject(AssetHealthStore);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly assetTypes: readonly { readonly value: string; readonly label: string }[] = [
    { value: 'ALL', label: 'Tất cả loại thiết bị' },
    { value: 'Insulator', label: 'Chuỗi sứ (Insulator)' },
    { value: 'Cable', label: 'Dây dẫn / Dây chống sét (Cable)' },
    { value: 'Tower Structure', label: 'Thân cột / Xà thép (Tower Structure)' },
    { value: 'Vibration Damper', label: 'Tạ chống rung (Vibration Damper)' },
  ];

  ngOnInit(): void {
    this.store.loadData();

    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.store.openAssetDetail(id);
      }
    });
  }

  onRiskFilterChange(risk: string): void {
    this.store.setRiskFilter(risk);
  }

  onAssetTypeChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.store.setAssetTypeFilter(target.value);
  }

  onTowerChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.store.setTowerFilter(target.value);
  }

  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.store.setSearch(target.value);
  }

  onSort(field: 'currentHealthScore' | 'riskLevel' | 'assetCode' | 'lastInspectedAt'): void {
    this.store.setSorting(field);
  }

  onPageChange(page: number): void {
    this.store.setPage(page);
  }

  onViewDetail(asset: AssetHealthItem): void {
    this.store.openAssetDetail(asset.id);
  }

  onCloseDetail(): void {
    this.store.closeAssetDetail();
  }

  onRefresh(): void {
    this.store.loadData();
  }

  onResetFilters(): void {
    this.store.resetFilters();
  }

  getRiskBadgeClass(riskLevel: RiskLevel): string {
    switch (riskLevel) {
      case 'Critical Risk':
        return 'risk-badge--critical';
      case 'High Risk':
        return 'risk-badge--high';
      case 'Medium Risk':
        return 'risk-badge--medium';
      case 'Low Risk':
        return 'risk-badge--low';
      default:
        return 'risk-badge--unknown';
    }
  }

  getRiskBadgeText(riskLevel: RiskLevel): string {
    switch (riskLevel) {
      case 'Critical Risk':
        return 'Nguy cấp (Critical)';
      case 'High Risk':
        return 'Rủi ro cao (High)';
      case 'Medium Risk':
        return 'Trung bình (Medium)';
      case 'Low Risk':
        return 'Ổn định (Low)';
      default:
        return riskLevel;
    }
  }

  getHealthScoreColor(score: number): string {
    if (score < 40) return '#dc2626'; // red-600
    if (score < 60) return '#ea580c'; // orange-600
    if (score < 80) return '#d97706'; // amber-600
    return '#16a34a'; // green-600
  }

  getHealthScoreBgClass(score: number): string {
    if (score < 40) return 'score-bar--critical';
    if (score < 60) return 'score-bar--high';
    if (score < 80) return 'score-bar--medium';
    return 'score-bar--low';
  }

  getPriorityBadgeClass(priority?: MaintenancePriority): string {
    switch (priority) {
      case 'Immediate':
        return 'priority-badge--immediate';
      case 'High':
        return 'priority-badge--high';
      case 'Medium':
        return 'priority-badge--medium';
      default:
        return 'priority-badge--routine';
    }
  }

  getPriorityText(priority?: MaintenancePriority): string {
    switch (priority) {
      case 'Immediate':
        return 'Khẩn cấp';
      case 'High':
        return 'Ưu tiên cao';
      case 'Medium':
        return 'Trung bình';
      default:
        return 'Định kỳ';
    }
  }

  getAssetTypeIcon(type: AssetType): string {
    switch (type) {
      case 'Insulator':
        return 'disconnect';
      case 'Cable':
        return 'line';
      case 'Tower Structure':
        return 'gateway';
      case 'Vibration Damper':
        return 'cluster';
      default:
        return 'tool';
    }
  }
}
