import { Injectable } from '@angular/core';

export interface TrustedDeviceEntry {
  readonly deviceId: string;
  readonly email: string;
  readonly trustedUntil: number; // epoch ms
}

@Injectable({ providedIn: 'root' })
export class TrustedDeviceService {
  private readonly DEVICE_ID_KEY = 'uavpms.device_id';
  private readonly TRUSTED_DEVICES_KEY = 'uavpms.trusted_devices';

  /** Lấy hoặc tự động tạo Device ID duy nhất cho trình duyệt này */
  getDeviceId(): string {
    try {
      let id = localStorage.getItem(this.DEVICE_ID_KEY);
      if (!id) {
        id = 'dev_' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
        localStorage.setItem(this.DEVICE_ID_KEY, id);
      }
      return id;
    } catch {
      return 'dev_default';
    }
  }

  /** Kiểm tra thiết bị có đang ở trạng thái tin cậy cho email hoặc username này không */
  isDeviceTrusted(emailOrUsername: string): boolean {
    if (!emailOrUsername) return false;
    try {
      const raw = localStorage.getItem(this.TRUSTED_DEVICES_KEY);
      if (!raw) return false;
      const list: TrustedDeviceEntry[] = JSON.parse(raw);
      const input = emailOrUsername.trim().toLowerCase();
      const inputUser = input.split('@')[0];
      const deviceId = this.getDeviceId();
      const match = list.find((d) => {
        const storedEmail = (d.email || '').trim().toLowerCase();
        const storedUser = storedEmail.split('@')[0];
        const emailMatches = storedEmail === input || storedUser === inputUser || storedEmail === inputUser || storedUser === input;
        return emailMatches && d.deviceId === deviceId;
      });
      return Boolean(match && match.trustedUntil > Date.now());
    } catch {
      return false;
    }
  }

  /** Lưu thiết bị tin cậy (Mặc định 30 ngày theo Auth:DeviceTrustDays) */
  trustDevice(emailOrUsername: string, days = 30): void {
    if (!emailOrUsername) return;
    try {
      const deviceId = this.getDeviceId();
      const normalized = emailOrUsername.trim().toLowerCase();
      const trustedUntil = Date.now() + days * 24 * 60 * 60 * 1000;
      const raw = localStorage.getItem(this.TRUSTED_DEVICES_KEY);
      const list: TrustedDeviceEntry[] = raw ? JSON.parse(raw) : [];
      const userPrefix = normalized.split('@')[0];
      const updated = list.filter((d) => {
        const target = (d.email || '').trim().toLowerCase();
        return !(d.deviceId === deviceId && (target === normalized || target === userPrefix));
      });
      updated.push({ deviceId, email: normalized, trustedUntil });
      if (userPrefix && userPrefix !== normalized) {
        updated.push({ deviceId, email: userPrefix, trustedUntil });
      }
      localStorage.setItem(this.TRUSTED_DEVICES_KEY, JSON.stringify(updated));
    } catch {
      // ignore localStorage quota error
    }
  }

  /** Hủy tin cậy thiết bị */
  untrustDevice(emailOrUsername?: string): void {
    try {
      if (!emailOrUsername) {
        localStorage.removeItem(this.TRUSTED_DEVICES_KEY);
        return;
      }
      const raw = localStorage.getItem(this.TRUSTED_DEVICES_KEY);
      if (!raw) return;
      const list: TrustedDeviceEntry[] = JSON.parse(raw);
      const normalized = emailOrUsername.trim().toLowerCase();
      const userPrefix = normalized.split('@')[0];
      const filtered = list.filter((d) => {
        const target = (d.email || '').trim().toLowerCase();
        return !(target === normalized || target === userPrefix);
      });
      localStorage.setItem(this.TRUSTED_DEVICES_KEY, JSON.stringify(filtered));
    } catch {
      // ignore
    }
  }
}

