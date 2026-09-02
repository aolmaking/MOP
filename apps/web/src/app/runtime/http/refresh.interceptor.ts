import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { type Observable, catchError, finalize, shareReplay, switchMap, throwError } from 'rxjs';

const REFRESH_URL = '/api/v1/auth/refresh';

/**
 * The auth endpoints themselves -- never retried through a refresh, or a
 * refresh call that itself 401s would try to refresh itself forever.
 */
const EXEMPT = ['/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/auth/logout'];

/**
 * One refresh call shared by every request that hits it concurrently,
 * rather than one per 401 -- a page that fires several requests at once
 * (a dashboard, a poll) must not send the refresh endpoint a burst.
 * Module-level rather than per-injector: this interceptor is a singleton
 * for the app's lifetime, same as the HttpClient it wraps.
 */
let refreshInFlight: Observable<unknown> | null = null;

/**
 * M-6: the access cookie expires after 20 minutes; the refresh cookie
 * lasts 14 days. `POST auth/refresh` and the TTL split have existed
 * since the auth system was built -- nothing on the client ever called
 * it, so a session hard-expired at 20 minutes no matter how long the
 * refresh cookie still had to run, and `AuthStore.bootstrap()`'s `GET
 * auth/me` on every guarded navigation was the thing that surfaced it:
 * a manager who stepped away for half an hour was bounced to login with
 * a perfectly good refresh token sitting in their cookies.
 *
 * On a 401 from anything except the auth endpoints themselves, this
 * attempts exactly one refresh and retries the original request once.
 * If the refresh itself fails (the refresh cookie is also gone), the
 * ORIGINAL 401 propagates unchanged -- callers see exactly what they
 * would have without this interceptor, so `AuthStore.bootstrap()`'s
 * existing catch-and-sign-out path and the auth guard's redirect to
 * `/login` both still work exactly as before for a session that is
 * genuinely gone.
 */
export const refreshInterceptor: HttpInterceptorFn = (req, next) => {
  const http = inject(HttpClient);

  if (EXEMPT.some((path) => req.url.includes(path))) {
    return next(req);
  }

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }

      refreshInFlight ??= http.post(REFRESH_URL, {}).pipe(
        shareReplay(1),
        finalize(() => {
          refreshInFlight = null;
        }),
      );

      return refreshInFlight.pipe(
        switchMap(() => next(req)),
        // Either the refresh itself failed, or the retried request 401'd
        // again for some other reason -- either way, the session is not
        // salvageable here. Surface the ORIGINAL error, not a second
        // refresh attempt, so this can never loop.
        catchError(() => throwError(() => error)),
      );
    }),
  );
};
