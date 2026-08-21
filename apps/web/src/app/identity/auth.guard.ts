import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthStore } from './auth.store';

/**
 * Resolves the real session from the server on every guarded navigation
 * (see AuthStore.bootstrap) rather than trusting a cached client-side flag
 * that could be stale relative to a session revoked/expired server-side.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  const session = await authStore.bootstrap();
  if (session) return true;

  return router.createUrlTree(['/login'], { queryParams: { redirectTo: state.url } });
};
