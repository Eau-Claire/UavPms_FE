import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { Auth } from './auth';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const router = inject(Router);
  const isAuthRequest = req.url.includes('/auth/');
  const token = auth.session()?.tokens.accessToken;
  const request = token && !isAuthRequest ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      // 401 Unauthorized handling
      if (error.status === 401 && token && !isAuthRequest) {
        return auth.refresh().pipe(
          switchMap((tokens) => next(req.clone({ setHeaders: { Authorization: `Bearer ${tokens.accessToken}` } }))),
          catchError((refreshError) => {
            auth.logout();
            void router.navigate(['/login'], { queryParams: { error: 'session_expired' } });
            return throwError(() => refreshError);
          }),
        );
      }

      // 403 Forbidden handling
      if (error.status === 403 && !isAuthRequest) {
        // Navigation to 403 page on forbidden page/data access
        if (req.method === 'GET' && !req.url.includes('/anomalies/pending')) {
          void router.navigate(['/403']);
        }
      }

      return throwError(() => error);
    }),
  );
};
