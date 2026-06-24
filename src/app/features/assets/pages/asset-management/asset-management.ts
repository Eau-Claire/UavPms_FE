import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NzIconModule } from 'ng-zorro-antd/icon';

@Component({
  selector: 'app-asset-management',
  imports: [NzIconModule],
  templateUrl: './asset-management.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetManagement {
  protected readonly towers = [
    { code: 'T01', status: 'Tốt', tone: 'ok', devices: 14, alerts: 0 },
    { code: 'T02', status: 'Cảnh báo', tone: 'warning', devices: 12, alerts: 1 },
    { code: 'T03', status: 'Lỗi', tone: 'critical', devices: 15, alerts: 2 },
    { code: 'T04', status: 'Khẩn cấp', tone: 'critical', devices: 12, alerts: 3 },
  ] as const;
}
