import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AccessApi } from './access.api';
import { AuthStore } from './auth.store';
import { landingRouteFor } from './landing';

/**
 * A whole role surface, gated on the permission that surface is for.
 *
 * `authGuard` answers "is anyone signed in?", which is not the same
 * question as "is this their screen?". Every role surface was mounted on
 * `authGuard` alone, so any signed-in person could open any other role's
 * pages -- and one route reliably did it by accident: a session that
 * expires on `/operator` bounces to `/login?redirectTo=/operator`, and
 * the login page honours `redirectTo` whoever signs in next. A technician
 * picking up a shared tablet at the front desk landed on the front desk.
 *
 * The permission asked here is the same key the surface's own controller
 * requires, resolved by the same eleven-layer service -- so a workshop
 * that genuinely delegates reception to a technician keeps working, and
 * a capability switched off closes the page as well as the buttons on it.
 * Refusal is not an error screen: they are sent to their own landing
 * page, because being in the wrong place is a navigation mistake, not a
 * security incident to shout about.
 */
export function surfaceGuard(permissionKey: string): CanActivateFn {
  return async () => {
    const access = inject(AccessApi);
    const authStore = inject(AuthStore);
    const router = inject(Router);

    if (await firstValueFrom(access.can(permissionKey))) return true;

    const session = authStore.session() ?? (await authStore.bootstrap());
    const home = landingRouteFor(session);
    // `/access-denied` is what `landingRouteFor` answers for a session it
    // cannot place, and it is the right answer here too: somebody with no
    // surface of their own has nowhere to be sent back to.
    return router.parseUrl(home);
  };
}
