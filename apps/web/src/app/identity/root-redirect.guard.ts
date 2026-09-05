import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthStore } from './auth.store';
import { landingRouteFor } from './landing';

/**
 * When an authenticated user arrives at the root route ('/'), this guard
 * forwards them directly to the real landing page for their role (e.g.
 * '/tech', '/branch/attention', '/owner/home') instead of letting them fall
 * through into the outdated Phase 1 placeholder shell.
 */
export const rootRedirectGuard: CanActivateFn = async () => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  const session = authStore.session() ?? (await authStore.bootstrap());
  if (session) {
    const target = landingRouteFor(session);
    if (target && target !== '/' && target !== '/access-denied') {
      return router.parseUrl(target);
    }
  }

  return true;
};
