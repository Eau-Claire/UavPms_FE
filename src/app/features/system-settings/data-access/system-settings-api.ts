import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { DEFAULT_SYSTEM_SETTINGS, SystemSettingItem } from '../../../models/system-settings.models';

const STORAGE_KEY = 'uavpms.system_settings';

@Injectable({ providedIn: 'root' })
export class SystemSettingsApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/system/settings`;

  /** Lấy danh sách cấu hình hệ thống (Có cache và fallback chuẩn theo systemsettings) */
  getAll(): Observable<readonly SystemSettingItem[]> {
    return this.http.get<unknown>(this.url).pipe(
      map((response) => {
        const data = unwrapApiData<unknown>(response);
        if (Array.isArray(data) && data.length > 0) {
          return data as SystemSettingItem[];
        }
        return this.loadLocal();
      }),
      catchError(() => of(this.loadLocal())),
    );
  }

  /** Cập nhật giá trị cấu hình hệ thống */
  update(key: string, value: string): Observable<SystemSettingItem> {
    return this.http.put<unknown>(`${this.url}/${encodeURIComponent(key)}`, { value }).pipe(
      map((response) => {
        const item = unwrapApiData<SystemSettingItem>(response);
        this.saveLocalItem(key, value);
        if (item && item.key) return item;
        const local = this.loadLocal().find((s) => s.key === key);
        return (
          local || {
            id: key,
            key,
            value,
            description: '',
            category: 'AI' as const,
            dataType: 'String' as const,
          }
        );
      }),
      catchError(() => {
        this.saveLocalItem(key, value);
        const item = this.loadLocal().find((s) => s.key === key);
        const fallback: SystemSettingItem = item || {
          id: 'temp',
          key,
          value,
          description: '',
          category: 'AI' as const,
          dataType: 'String' as const,
        };
        return of(fallback);
      }),
    );
  }

  private loadLocal(): SystemSettingItem[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    return [...DEFAULT_SYSTEM_SETTINGS];
  }

  private saveLocalItem(key: string, value: string): void {
    try {
      const items = this.loadLocal();
      const updated = items.map((item) => (item.key === key ? { ...item, value } : item));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }
}

