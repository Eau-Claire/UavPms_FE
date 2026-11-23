import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import { backendFallbackInterceptor } from './backend-fallback-interceptor';
import { BackendFallbackService } from './backend-fallback.service';

describe('backendFallbackInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let fallback: BackendFallbackService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([backendFallbackInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    fallback = TestBed.inject(BackendFallbackService);
    fallback.resetToPrimary();
  });

  afterEach(() => {
    controller.verify();
    sessionStorage.clear();
  });

  it('uses primary backend when reachable', () => {
    let result: unknown;
    http.get(`${environment.apiBaseUrl}/missions`).subscribe((res) => (result = res));

    const req = controller.expectOne(`${environment.apiBaseUrl}/missions`);
    req.flush({ ok: true });

    expect(result).toEqual({ ok: true });
    expect(fallback.isUsingFallback()).toBe(false);
  });

  it('switches to duckdns fallback on network error (status 0) and routes subsequent requests directly to fallback', () => {
    let firstResult: unknown;
    http.get(`${environment.apiBaseUrl}/missions`).subscribe((res) => (firstResult = res));

    const primaryReq = controller.expectOne(`${environment.apiBaseUrl}/missions`);
    primaryReq.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    const retryReq = controller.expectOne(`${environment.fallbackApiBaseUrl}/missions`);
    retryReq.flush({ items: ['m1'] });

    expect(firstResult).toEqual({ items: ['m1'] });
    expect(fallback.isUsingFallback()).toBe(true);

    let secondResult: unknown;
    http.get(`${environment.apiBaseUrl}/towers`).subscribe((res) => (secondResult = res));

    const directFallbackReq = controller.expectOne(`${environment.fallbackApiBaseUrl}/towers`);
    directFallbackReq.flush({ items: ['t1'] });

    expect(secondResult).toEqual({ items: ['t1'] });
  });

  it('switches to duckdns fallback on 502/503/504 gateway errors', () => {
    let result: unknown;
    http.post(`${environment.apiBaseUrl}/auth/login`, { email: 'a@b.vn' }).subscribe((res) => (result = res));

    const primaryReq = controller.expectOne(`${environment.apiBaseUrl}/auth/login`);
    primaryReq.flush('Bad Gateway', { status: 502, statusText: 'Bad Gateway' });

    const retryReq = controller.expectOne(`${environment.fallbackApiBaseUrl}/auth/login`);
    expect(retryReq.request.body).toEqual({ email: 'a@b.vn' });
    retryReq.flush({ token: 'abc' });

    expect(result).toEqual({ token: 'abc' });
    expect(fallback.isUsingFallback()).toBe(true);
  });

  it('does not trigger fallback on 401/404 application errors', () => {
    let capturedStatus = 0;
    http.get(`${environment.apiBaseUrl}/missions/unknown`).subscribe({
      error: (err) => (capturedStatus = err.status),
    });

    const req = controller.expectOne(`${environment.apiBaseUrl}/missions/unknown`);
    req.flush({ message: 'Not Found' }, { status: 404, statusText: 'Not Found' });

    expect(capturedStatus).toBe(404);
    expect(fallback.isUsingFallback()).toBe(false);
  });

  it('leaves external non-backend URLs untouched', () => {
    http.get('https://api.open-meteo.com/v1/forecast').subscribe();

    const req = controller.expectOne('https://api.open-meteo.com/v1/forecast');
    req.flush({});
    expect(fallback.isUsingFallback()).toBe(false);
  });
});
