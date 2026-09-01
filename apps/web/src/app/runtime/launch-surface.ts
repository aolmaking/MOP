/**
 * What the launch sprint holds back, and why.
 *
 * `docs/14-DAY-LAUNCH-SCOPE.md` ships one workshop shape well rather
 * than nine shapes badly. Everything named here is **built and
 * working** -- it is withheld from the surface for this sprint, not
 * removed from the product. That distinction is the whole point: the
 * pages, their APIs and their tests all still exist, and turning one
 * back on is deleting a line from this file.
 *
 * One file rather than conditionals spread across five shells, for two
 * reasons. Somebody has to be able to answer "what is hidden right
 * now?" without reading every template. And a reason written beside the
 * entry survives; a nav item quietly deleted from a shell leaves nothing
 * behind saying it was a decision at all.
 *
 * This is NOT a security boundary and must never be used as one. The
 * server refuses what a session may not do, and restricted data is
 * absent from the response rather than hidden here -- anyone can open
 * developer tools on a workshop tablet. Several of these routes are
 * additionally unreachable already, because the launch profile disables
 * the capability that owns them; that is the architecture doing the
 * hiding, and this list only stops the rail from advertising a door
 * that will refuse to open.
 */

export interface HeldBackSurface {
  readonly route: string;
  /** Why it is not on the rail this sprint, in one sentence. */
  readonly reason: string;
}

const HELD_BACK: readonly HeldBackSurface[] = [
  // The whole Data Analyst role. Complete and tested (7/7 pages,
  // including CSV export), and deferred wholesale by the scope: a
  // one-bay quick-service shop has no analyst.
  { route: '/analyst', reason: 'Data Analyst role deferred: no such person at a one-bay workshop.' },

  // The whole Team Leader role. TEAMS and TEAM_REVIEW are DISABLED in
  // the launch profile, so the capability layer already denies these --
  // this only stops the rail from offering them.
  { route: '/team-leader', reason: 'TEAMS/TEAM_REVIEW disabled in the launch profile; no supervision layer to lead.' },

  // Owner surfaces beyond the three the pilot owner actually needs
  // (home, organization, pricing).
  { route: '/owner/organization/teams', reason: 'TEAMS disabled in the launch profile.' },
  { route: '/owner/forms', reason: 'Custom forms and fields deferred; the standard intake is the launch intake.' },
  { route: '/owner/messages', reason: 'No messaging sender exists yet -- decision links are delivered by hand.' },
  { route: '/owner/reports', reason: 'Owner reports overview is S-3, a SHOULD; the rail stays quiet until it ships.' },
  { route: '/owner/workflow-health', reason: 'Workflow health is a diagnostic surface, not a pilot-week surface.' },
  { route: '/owner/audit', reason: 'History is written and queryable; the owner-facing view waits for M4.' },

  // Platform surfaces that exist for us, not for a customer.
  { route: '/platform/reports', reason: 'Platform reports sections 3-6 deferred; level 1 stays internal-only.' },
  { route: '/platform/live-view', reason: 'Live view is an internal diagnostic, kept off the rail during the pilot.' },
];

const HELD_BACK_ROUTES: ReadonlySet<string> = new Set(HELD_BACK.map((entry) => entry.route));

/**
 * True when this route is withheld for the launch sprint.
 *
 * Prefix-matched on a path boundary, so holding back `/analyst` holds
 * back all seven of its pages without listing each -- and so
 * `/analyst-something-else` would NOT match by accident.
 */
export function isHeldBack(route: string): boolean {
  if (HELD_BACK_ROUTES.has(route)) return true;
  for (const held of HELD_BACK_ROUTES) {
    if (route.startsWith(`${held}/`)) return true;
  }
  return false;
}

/** Nav helper: the entries a rail may still show. */
export function visibleNavigation<T extends { route: string }>(items: readonly T[]): readonly T[] {
  return items.filter((item) => !isHeldBack(item.route));
}

/** The list itself, for the handover document that has to name every deferral. */
export function heldBackSurfaces(): readonly HeldBackSurface[] {
  return HELD_BACK;
}
