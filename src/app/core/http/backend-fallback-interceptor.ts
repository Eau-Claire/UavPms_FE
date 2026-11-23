import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { BackendFallbackService } from './backend-fallback.service';

const RETRYABLE_BACKEND_STATUSES = new Set([0, 502, 503, 504]);

export const backendFallbackInterceptor: HttpInterceptorFn = (req, next) => {
  const fallback = inject(BackendFallbackService);

  if (!fallback.isPrimaryApiRequest(req.url)) {
    return next(req);
  }

  if (fallback.isUsingFallback()) {
    return next(req.clone({ url: fallback.toFallbackApiUrl(req.url) }));
  }

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && RETRYABLE_BACKEND_STATUSES.has(error.status)) {
        fallback.activateFallback();
        return next(req.clone({ url: fallback.toFallbackApiUrl(req.url) }));
      }
      return throwError(() => error);
    }),
  );
};
