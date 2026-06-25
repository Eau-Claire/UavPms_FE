import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { unwrapApiData } from '../../models/api.models';
import { AuthSession, AuthTokens, AuthUser, LoginResult, OtpResult, UserRole } from '../../models/auth.models';

@Injectable({
  providedIn: 'root',
})
export class Auth {
  private readonly http = inject(HttpClient);
  private readonly sessionKey = 'uavpms.session';
  private readonly sessionState = signal<AuthSession | null>(this.readSession());
  readonly session = this.sessionState.asReadonly();
  readonly user = computed(() => this.sessionState()?.user ?? null);
  readonly isAuthenticated = computed(() => Boolean(this.sessionState()?.tokens.accessToken));

  login(credentials: { email: string; password: string }) {
    return this.http.post<unknown>(`${environment.apiBaseUrl}/auth/login`, credentials).pipe(
      map((response): LoginResult => {
        const payload = unwrapApiData<Record<string, unknown>>(response);
        const nested = (payload['authResult'] ?? payload) as Record<string, unknown>;
        if (Boolean(nested['otpRequired']) || !this.hasTokens(nested))
          return { otpRequired: true, email: String(nested['email'] ?? credentials.email) };
        return { otpRequired: false, session: this.normalizeSession(payload) };
      }),
      tap((result) => {
        if (!result.otpRequired) this.setSession(result.session);
      }),
    );
  }

  sendOtp(request: { email: string; purpose: string }) {
    return this.http.post(`${environment.apiBaseUrl}/auth/otp/send`, request);
  }
  verifyOtp(request: { email: string; otp: string; purpose: string }) {
    return this.http.post<unknown>(`${environment.apiBaseUrl}/auth/otp/verify`, request).pipe(
      map((response): OtpResult => {
        const payload = unwrapApiData<Record<string, unknown>>(response);
        const authPayload = payload['authResult'] as Record<string, unknown> | null | undefined;
        if (authPayload && this.hasTokens(authPayload)) {
          this.setSession(this.normalizeSession(authPayload));
          return { authenticated: true };
        }
        return {
          authenticated: false,
          verificationToken:
            String(
              payload['verificationToken'] ?? payload['token'] ?? payload['resetToken'] ?? '',
            ) || undefined,
        };
      }),
    );
  }
  resetPassword(request: { verificationToken: string; newPassword: string }) {
    return this.http.post(`${environment.apiBaseUrl}/auth/reset-password`, request);
  }
  changePassword(newPassword: string) {
    return this.http.post(`${environment.apiBaseUrl}/users/change-password`, { newPassword });
  }

  refresh() {
    return this.http
      .post<unknown>(`${environment.apiBaseUrl}/auth/refresh-token`, {
        refreshToken: this.sessionState()?.tokens.refreshToken,
      })
      .pipe(
        map((response) => unwrapApiData<AuthTokens>(response)),
        tap((tokens) => {
          const current = this.sessionState();
          if (current) this.setSession({ ...current, tokens });
        }),
      );
  }

  logout(): void {
    localStorage.removeItem(this.sessionKey);
    this.sessionState.set(null);
  }

  private setSession(session: AuthSession): void {
    localStorage.setItem(this.sessionKey, JSON.stringify(session));
    this.sessionState.set(session);
  }
  private readSession(): AuthSession | null {
    try {
      const value = localStorage.getItem(this.sessionKey);
      return value ? (JSON.parse(value) as AuthSession) : null;
    } catch {
      return null;
    }
  }

  private normalizeSession(payload: unknown): AuthSession {
    const source = payload as Record<string, unknown>;
    const nested = (source['authResult'] ?? source) as Record<string, unknown>;
    const rawUser = (nested['user'] ?? {}) as Record<string, unknown>;
    const rawTokens = (nested['tokens'] ?? nested) as Record<string, unknown>;
    const accessToken = String(
      rawTokens['accessToken'] ?? nested['accessToken'] ?? nested['token'] ?? '',
    );
    const refreshToken = String(rawTokens['refreshToken'] ?? nested['refreshToken'] ?? '');
    if (!accessToken || !refreshToken)
      throw new Error('Authentication response did not include tokens.');
    const roles = rawUser['userRoles'] as readonly { role?: { roleName?: UserRole } }[] | undefined;
    const user: AuthUser = {
      id: String(rawUser['id'] ?? ''),
      email: String(rawUser['email'] ?? ''),
      fullName: String(rawUser['fullName'] ?? rawUser['email'] ?? 'Operator'),
      role: roles?.[0]?.role?.roleName ?? (rawUser['role'] as UserRole | undefined) ?? 'Viewer',
      mustChangePassword: Boolean(rawUser['mustChangePassword']),
    };
    return { user, tokens: { accessToken, refreshToken } };
  }

  private hasTokens(payload: Record<string, unknown>): boolean {
    const tokens = (payload['tokens'] ?? payload) as Record<string, unknown>;
    return (
      Boolean(tokens['accessToken'] ?? payload['accessToken'] ?? payload['token']) &&
      Boolean(tokens['refreshToken'] ?? payload['refreshToken'])
    );
  }
}

