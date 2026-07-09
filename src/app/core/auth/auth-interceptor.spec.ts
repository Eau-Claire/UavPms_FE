import '@angular/compiler';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import { Auth } from './auth';
import { authInterceptor } from './auth-interceptor';

describe('authInterceptor', () => {
  let http: HttpTestingController;
  let client: HttpClient;

  beforeEach(() => {
    localStorage.setItem(
      'uavpms.session',
      JSON.stringify({
        user: { id: 'u1', email: 'operator@evn.vn', fullName: 'Operator', role: 'Inspector', mustChangePassword: false },
        tokens: { accessToken: 'stale-token', refreshToken: 'refresh-token' },
      }),
    );

    TestBed.configureTestingModule({
      providers: [
        Auth,
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('does not attach stale bearer tokens to auth requests', () => {
    client.post(`${environment.apiBaseUrl}/auth/login`, { email: 'operator@evn.vn', password: 'secret12' }).subscribe();

    const request = http.expectOne(`${environment.apiBaseUrl}/auth/login`);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ data: { otpRequired: true, email: 'operator@evn.vn' } });
  });

  it('attaches bearer tokens to protected API requests', () => {
    client.get(`${environment.apiBaseUrl}/monitor/summary`).subscribe();

    const request = http.expectOne(`${environment.apiBaseUrl}/monitor/summary`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer stale-token');
    request.flush({ data: {} });
  });
});
