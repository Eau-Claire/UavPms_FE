import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { Auth } from './auth';

describe('Auth', () => {
  let auth: Auth;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(Auth);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => { http.verify(); localStorage.clear(); });

  it('routes tokenless login responses into OTP verification', () => {
    let result: { otpRequired: boolean; email?: string } | undefined;
    auth.login({ email: 'operator@evn.vn', password: 'secret12' }).subscribe((value) => result = value);
    http.expectOne(`${environment.apiBaseUrl}/auth/login`).flush({ data: { otpRequired: true, email: 'operator@evn.vn' } });
    expect(result).toEqual({ otpRequired: true, email: 'operator@evn.vn' });
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('persists authentication returned by login OTP verification', () => {
    auth.verifyOtp({ email: 'operator@evn.vn', otp: '123456', purpose: 'Login' }).subscribe();
    http.expectOne(`${environment.apiBaseUrl}/auth/otp/verify`).flush({ data: { authResult: { accessToken: 'access', refreshToken: 'refresh', user: { id: 'u1', email: 'operator@evn.vn', fullName: 'Operator', role: 'Inspector' } } } });
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.user()?.role).toBe('Inspector');
  });
});
