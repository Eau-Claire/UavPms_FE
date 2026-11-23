import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { SystemSettingItem } from '../../../models/system-settings.models';

@Injectable({ providedIn: 'root' })
export class SystemSettingsApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/system/settings`;

  /** Lấy danh sách cấu hình hệ thống trực tiếp từ Backend API thật (không dùng dữ liệu mẫu). */
  getAll(): Observable<readonly SystemSettingItem[]> {
    return this.http.get<unknown>(this.url).pipe(
      map((response) => {
        const data = unwrapApiData<unknown>(response);
        return Array.isArray(data) ? (data as SystemSettingItem[]) : [];
      }),
    );
  }

  /** Cập nhật giá trị cấu hình hệ thống qua Backend API thật. */
  update(key: string, value: string): Observable<SystemSettingItem> {
    return this.http.put<unknown>(`${this.url}/${encodeURIComponent(key)}`, { value }).pipe(
      map((response) => unwrapApiData<SystemSettingItem>(response)),
    );
  }
}

