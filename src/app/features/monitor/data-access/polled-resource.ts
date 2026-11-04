import { DestroyRef, Signal, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, Subject, catchError, finalize, fromEvent, map, merge, of, startWith, switchMap, throttleTime, timer } from 'rxjs';

/** Field-role dashboards refresh their own data every minute (and when the browser tab regains focus). */
export const FIELD_DASHBOARD_POLL_MS = 60_000;

export interface PolledResource<T> {
  readonly value: Signal<T | undefined>;
  readonly loading: Signal<boolean>;
  readonly error: Signal<string | null>;
  /** Epoch milliseconds of the last successful load. */
  readonly loadedAt: Signal<number | null>;
  refresh(): void;
}

export interface PollOptions {
  readonly errorMessage: string;
  readonly intervalMs?: number;
}

type LoadResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

/**
 * Loads `load()` immediately, then every `intervalMs`, whenever the window regains focus and on `refresh()`.
 * A newer load cancels a pending one; on error the last good value is kept. Must run in an injection context.
 */
export function pollResource<T>(load: () => Observable<T>, options: PollOptions): PolledResource<T> {
  const destroyRef = inject(DestroyRef);
  const value = signal<T | undefined>(undefined);
  const loading = signal(false);
  const error = signal<string | null>(null);
  const loadedAt = signal<number | null>(null);
  const manual = new Subject<void>();
  const intervalMs = options.intervalMs ?? FIELD_DASHBOARD_POLL_MS;
  const focus$ = typeof window === 'undefined' ? EMPTY : fromEvent(window, 'focus').pipe(throttleTime(10_000));

  merge(timer(intervalMs, intervalMs), focus$, manual)
    .pipe(
      startWith(null),
      switchMap(() => {
        loading.set(true);
        return load().pipe(
          map((result): LoadResult<T> => ({ ok: true, value: result })),
          catchError(() => of<LoadResult<T>>({ ok: false })),
          finalize(() => loading.set(false)),
        );
      }),
      takeUntilDestroyed(destroyRef),
    )
    .subscribe((result) => {
      if (result.ok) {
        value.set(result.value);
        error.set(null);
        loadedAt.set(Date.now());
      } else {
        error.set(options.errorMessage);
      }
    });

  return {
    value: value.asReadonly(),
    loading: loading.asReadonly(),
    error: error.asReadonly(),
    loadedAt: loadedAt.asReadonly(),
    refresh: () => manual.next(),
  };
}
