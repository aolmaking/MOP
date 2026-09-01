import type { EffectiveRole } from '@mop/shared';
import { isHeldBack } from '../runtime/launch-surface';

/**
 * Where to send someone who has just signed in and did not ask for a
 * particular page.
 *
 * The server already decides this -- AuthService fills
 * SessionContext.landingPage per role -- so this maps that answer onto a
 * route rather than re-deciding it. An unknown landing page is an access
 * boundary, not a guessable role fallback.
 */
const ROUTE_BY_LANDING_PAGE: Record<string, string> = {
  'platform-workshops': '/platform/workshops',
  'branch-home': '/branch/attention',
  'technician-home': '/tech',
  'inventory-home': '/inventory/home',
  'owner-home': '/owner/home',
  'team-leader-home': '/team-leader',
  'customer-portal-home': '/customer',
  'analytics-home': '/analyst/home',
};

export function landingRouteFor(session: { role: EffectiveRole; landingPage: string } | null): string {
  if (!session) return '/';
  const route = ROUTE_BY_LANDING_PAGE[session.landingPage];
  if (!route) return '/access-denied';
  // A role whose whole surface this sprint holds back lands on the same
  // boundary as an unknown one. Dropping them into a rail with nothing
  // on it would be worse than saying so: the scope calls this out
  // explicitly -- "Analyst/TL landing keys resolve to Access-Denied by
  // design if anyone logs in."
  return isHeldBack(route) ? '/access-denied' : route;
}
