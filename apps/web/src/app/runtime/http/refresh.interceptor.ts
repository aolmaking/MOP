import { HttpClient, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, from, switchMap, throwError } from 'rxjs';
import type { SessionContext } from '@mop/shared';
import { AuthStore } from '../../identity/auth.store';
import type { PresentedError } from './error.interceptor';

/**
 * Keeps a signed-in day signed in.
 *
 * The access cookie lives twenty minutes; the refresh cookie lives
 * fourteen days, and `POST /api/v1/auth/refresh` has existed since the
 * auth service was written. Nothing in the browser ever called it. The
 * effect on a real workshop is not subtle: a technician who puts the
 * tablet down between two cars comes back to a login screen, and a
 * manager mid-intake loses the form. That is the whole of M-6.
 *
 * On a 401 this asks for a new pair once and replays the original
 * request. If the refresh is itself refused -- revoked session, expired
 * fourteen days, frozen tenant -- the original 401 is what propagates,
 * so the guard and the login redirect behave exactly as they did before.
 *
 * ## Why the single flight is required, not merely tidy
 *
 * `AuthService.refresh` ROTATES the session: it issues a new refresh
 * token and replaces the stored hash. A second concurrent refresh
 * carrying the token the first one just invalidated is therefore
 * refused, and the user is logged out by the very mechanism meant to
 * keep them in. Any page that fires several requests at once -- the
 * work card asks for its card and its journey together -- would hit
 * this on the first expiry. So concurrent 401s share one refresh and
 * all wait on its answer.
 */

/**
 * The endpoints a 401 is the final answer from.
 *
 * A 401 from `login` means the password was wrong, and a 401 from
 * `refresh` means the refresh itself is spent -- refreshing on either
 * would hide the real answer or recurse.
 *
 * `me` is deliberately NOT among them, though it was. `authGuard`
 * resolves the session by calling `/api/v1/auth/me` on every guarded
 * navigation, so `me` is the request most likely to be the one that
 * meets an expired access cookie -- and a 401 from it is not a wrong
 * password or a spent refresh, it is exactly the twenty-minute
 * expiry this interceptor exists to renew. Listing it here meant a
 * technician who put the tablet down between two cars came back, tapped
 * a job, and was sent to the login screen with a valid fourteen-day
 * refresh cookie still in the jar.
 */
function isAuthEndpoint(req: HttpRequest<unknown>): boolean {
  return /\/api\/v1\/auth\/(login|refresh|logout)$/.test(req.url);
}

/**
 * The refresh in flight, shared by every request that arrives while it
 * is running. Module-level because interceptors are functions, not
 * instances, and the flight has to outlive any one of them.
 */
let inFlight: Promise<SessionContext> | null = null;

function refreshOnce(http: HttpClient, store: AuthStore): Promise<SessionContext> {
  inFlight ??= new Promise<SessionContext>((resolve, reject) => {
    http.post<SessionContext>('/api/v1/auth/refresh', {}).subscribe({
      next: (session) => {
        // The server may have resolved a different context than the one
        // held here -- a role change, a revoked responsibility -- so the
        // store adopts what came back rather than assuming continuity.
        store.adopt(session);
        resolve(session);
      },
      error: (error: unknown) => reject(error),
    });
  }).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export const refreshInterceptor: HttpInterceptorFn = (req, next) => {
  const http = inject(HttpClient);
  const store = inject(AuthStore);

  return next(req).pipe(
    catchError((error: unknown) => {
      const presented = error as PresentedError;
      if (presented?.httpStatus !== 401 || isAuthEndpoint(req)) {
        return throwError(() => error);
      }

      return from(refreshOnce(http, store)).pipe(
        // Replay the original request, once. A second 401 after a
        // successful refresh is a real authorization answer, not a
        // stale cookie, and must reach the caller.
        switchMap(() => next(req)),
        catchError(() => throwError(() => error)),
      ) as Observable<never>;
    }),
  );
};

/** Only for tests: a spent flight must not leak between cases. */
export function resetRefreshFlight(): void {
  inFlight = null;
}

