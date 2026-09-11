import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import { Auth } from './auth';

describe('Auth', () => {
  let auth: Auth;
  let http: HttpTestingController;

  beforeAll(() => {
    if (!globalThis.localStorage) {
      let store = new Map<string, string>();
      Object.defineProperty(globalThis, 'localStorage', {
        value: {
          getItem: (key: string) => store.get(key) ?? null,
          setItem: (key: string, value: string) => store.set(key, value),
          removeItem: (key: string) => store.delete(key),
          clear: () => { store = new Map<string, string>(); },
        },
      });
    }
  });

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(Auth);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => { http.verify(); localStorage.clear(); });

  it('routes tokenless login responses into OTP verification', () => {
    let result: { otpRequired: boolean; email?: string } | undefined;
    auth.login({ username: 'operator@evn.vn', password: 'secret12' }).subscribe((value) => result = value);
    http.expectOne(`${environment.apiBaseUrl}/auth/login`).flush({ data: { otpRequired: true, email: 'operator@evn.vn' } });
    expect(result).toEqual({ otpRequired: true, email: 'operator@evn.vn' });
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('normalizes login username email before sending credentials', () => {
    auth.login({ username: '  OPERATOR@EVN.VN  ', password: 'secret12' }).subscribe();
    const request = http.expectOne(`${environment.apiBaseUrl}/auth/login`);
    expect(request.request.body).toEqual({ username: 'OPERATOR@EVN.VN', email: 'OPERATOR@EVN.VN', password: 'secret12' });
    request.flush({ data: { otpRequired: true, email: 'OPERATOR@EVN.VN' } });
  });

  it('normalizes OTP send email before sending request', () => {
    auth.sendOtp({ email: '  OPERATOR@EVN.VN ', purpose: 'ForgotPassword' }).subscribe();
    const request = http.expectOne(`${environment.apiBaseUrl}/auth/otp/send`);
    expect(request.request.body).toEqual({ email: 'OPERATOR@EVN.VN', purpose: 'ForgotPassword' });
    request.flush({ success: true });
  });

  it('persists authentication returned by login OTP verification', () => {
    auth.verifyOtp({ email: 'operator@evn.vn', otp: '123456', purpose: 'Login' }).subscribe();
    http.expectOne(`${environment.apiBaseUrl}/auth/otp/verify`).flush({ data: { authResult: { accessToken: 'access', refreshToken: 'refresh', user: { id: 'u1', email: 'operator@evn.vn', fullName: 'Operator', role: 'Inspector' } } } });
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.user()?.role).toBe('Inspector');
  });

  it('does not treat an expired JWT as an authenticated session', () => {
    localStorage.setItem('uavpms.session', JSON.stringify({
      user: { id: 'u1', email: 'operator@evn.vn', fullName: 'Operator', role: 'Inspector', mustChangePassword: false },
      tokens: { accessToken: jwtWithExpiry(Math.floor(Date.now() / 1000) - 60), refreshToken: 'refresh' },
    }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(Auth);
    http = TestBed.inject(HttpTestingController);
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('exposes refresh activity so protected content can be hidden', () => {
    auth.verifyOtp({ email: 'operator@evn.vn', otp: '123456', purpose: 'Login' }).subscribe();
    http.expectOne(`${environment.apiBaseUrl}/auth/otp/verify`).flush({ data: { authResult: { accessToken: 'access', refreshToken: 'refresh', user: { id: 'u1', role: 'Inspector' } } } });

    auth.refresh().subscribe();
    expect(auth.refreshing()).toBe(true);
    http.expectOne(`${environment.apiBaseUrl}/auth/refresh-token`).flush({ data: { accessToken: 'new-access', refreshToken: 'new-refresh' } });
    expect(auth.refreshing()).toBe(false);
  });
});

const jwtWithExpiry = (expiresAtSeconds: number): string => {
  const encoded = btoa(JSON.stringify({ exp: expiresAtSeconds })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `header.${encoded}.signature`;
};
