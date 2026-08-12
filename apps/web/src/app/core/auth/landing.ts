import type { EffectiveRole } from '@mop/shared';

/**
 * Where to send someone who has just signed in and did not ask for a
 * particular page.
 *
 * The server already decides this -- AuthService fills
 * SessionContext.landingPage per role -- so this maps that answer onto a
 * route rather than re-deciding it. Roles whose home is not built yet are
 * absent on purpose and fall through to '/', which says which phase
 * builds theirs instead of pretending to be it.
 */
const ROUTE_BY_LANDING_PAGE: Record<string, string> = {
  'branch-home': '/branch/attention',
  'technician-home': '/tech',
  'inventory-home': '/inventory/home',
  // Only History exists so far; the real Owner Home is Phase 10.
  'owner-home': '/owner/audit',
};

export function landingRouteFor(session: { role: EffectiveRole; landingPage: string } | null): string {
  if (!session) return '/';
  return ROUTE_BY_LANDING_PAGE[session.landingPage] ?? '/';
}
