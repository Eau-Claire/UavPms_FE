import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Auth } from './auth';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const router = inject(Router);
  const isInternalApi = req.url.startsWith(environment.apiBaseUrl);
  const isAuthRequest = req.url.includes('/auth/');
  const token = auth.session()?.tokens.accessToken;
  const request = token && isInternalApi && !isAuthRequest ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {

      if (error.status === 401 && token && isInternalApi && !isAuthRequest) {
        return auth.refresh().pipe(
          switchMap((tokens) => next(req.clone({ setHeaders: { Authorization: `Bearer ${tokens.accessToken}` } }))),
          catchError((refreshError) => {
            auth.logout();
            const isTerminated =
              refreshError?.error?.errorCode === 'SESSION_TERMINATED' ||
              String(refreshError?.error?.message ?? '').toLowerCase().includes('revoked') ||
              String(refreshError?.message ?? '').toLowerCase().includes('revoked');
            void router.navigate(['/login'], {
              queryParams: { error: isTerminated ? 'session_terminated' : 'session_expired' },
            });
            return throwError(() => refreshError);
          }),
        );
      }

      return throwError(() => error);
    }),
  );
};
