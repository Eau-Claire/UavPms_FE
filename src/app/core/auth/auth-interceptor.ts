import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { Auth } from './auth';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const isAuthRequest = req.url.includes('/auth/');
  const token = auth.session()?.tokens.accessToken;
  const request = token && !isAuthRequest ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(request).pipe(catchError((error: HttpErrorResponse) => {
    const canRefresh = error.status === 401 && token && !isAuthRequest;
    if (!canRefresh) return throwError(() => error);
    return auth.refresh().pipe(
      switchMap((tokens) => next(req.clone({ setHeaders: { Authorization: `Bearer ${tokens.accessToken}` } }))),
      catchError((refreshError) => { auth.logout(); return throwError(() => refreshError); }),
    );
  }));
};
