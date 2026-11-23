import { Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

const FALLBACK_STORAGE_KEY = 'uavpms_be_fallback_active';

@Injectable({ providedIn: 'root' })
export class BackendFallbackService {
  private readonly usingFallbackState = signal<boolean>(this.readStoredFlag());

  readonly isUsingFallback = this.usingFallbackState.asReadonly();

  readonly primaryApiBaseUrl = environment.apiBaseUrl;
  readonly fallbackApiBaseUrl = environment.fallbackApiBaseUrl;
  readonly primaryHubUrl = environment.notificationsHubUrl;
  readonly fallbackHubUrl = environment.fallbackNotificationsHubUrl;

  activateFallback(): void {
    if (this.usingFallbackState()) return;
    this.usingFallbackState.set(true);
    this.writeStoredFlag(true);
    console.warn(`[BackendFallback] Primary BE (${this.primaryApiBaseUrl}) unreachable. Switched to fallback (${this.fallbackApiBaseUrl}).`);
  }

  resetToPrimary(): void {
    this.usingFallbackState.set(false);
    this.writeStoredFlag(false);
  }

  isPrimaryApiRequest(url: string): boolean {
    return url.startsWith(this.primaryApiBaseUrl) && this.fallbackApiBaseUrl !== this.primaryApiBaseUrl;
  }

  toFallbackApiUrl(url: string): string {
    if (!url.startsWith(this.primaryApiBaseUrl)) return url;
    return `${this.fallbackApiBaseUrl}${url.slice(this.primaryApiBaseUrl.length)}`;
  }

  getActiveHubUrl(): string {
    return this.usingFallbackState() ? this.fallbackHubUrl : this.primaryHubUrl;
  }

  private readStoredFlag(): boolean {
    try {
      return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(FALLBACK_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private writeStoredFlag(active: boolean): void {
    try {
      if (typeof sessionStorage === 'undefined') return;
      if (active) {
        sessionStorage.setItem(FALLBACK_STORAGE_KEY, '1');
      } else {
        sessionStorage.removeItem(FALLBACK_STORAGE_KEY);
      }
    } catch {
      return;
    }
  }
}
