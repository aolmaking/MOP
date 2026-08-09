/**
 * Who needs to know when a technician is blocked, and how urgently.
 *
 * A blocker that only appears on the technician's own screen is not a
 * blocker, it is a note. The point of reporting one is that somebody else
 * picks it up -- so the reason determines the audience, and that mapping
 * is declared here rather than decided ad hoc at each call site.
 *
 * Declared now, in Phase 4, because the event payload must carry the
 * audience from the moment blockers exist. The *read* side -- these
 * appearing on a Branch Manager's attention centre or an Inventory
 * Manager's queue -- is built with those pages in Phase 5 onward.
 */

export const BLOCKER_REASONS = [
  "WAITING_PART",
  "WAITING_CUSTOMER",
  "NEED_TEAM_LEADER",
  "TOOL_MISSING",
  "SAFETY_ISSUE",
  "UNCLEAR_DIAGNOSIS",
  "OTHER",
] as const;

export type BlockerReasonKey = (typeof BLOCKER_REASONS)[number];

export type NotifiedRole =
  | "BRANCH_MANAGER"
  | "INVENTORY_MANAGER"
  | "TEAM_LEADER"
  | "TENANT_OWNER";

export interface BlockerRoute {
  readonly reason: BlockerReasonKey;
  readonly notify: readonly NotifiedRole[];
  /** URGENT surfaces above everything else on the receiving role's page. */
  readonly urgency: "NORMAL" | "URGENT";
  /** What the customer is told, if anything. Absent means the customer sees nothing. */
  readonly customerSafeMessage?: string;
}

const ROUTES: readonly BlockerRoute[] = [
  {
    reason: "WAITING_PART",
    // Inventory can fulfil it, the branch manager is accountable for the
    // delay, and the team leader needs it for their technician's load.
    // The previous implementation notified only the first two.
    notify: ["INVENTORY_MANAGER", "BRANCH_MANAGER", "TEAM_LEADER"],
    urgency: "NORMAL",
    customerSafeMessage: "We are waiting for a required part. The branch will update you when it arrives.",
  },
  {
    reason: "WAITING_CUSTOMER",
    notify: ["BRANCH_MANAGER"],
    urgency: "NORMAL",
    // No customer message: the customer already knows they were asked.
    // Telling them "we are waiting for you" adds nothing and reads badly.
  },
  { reason: "NEED_TEAM_LEADER", notify: ["TEAM_LEADER"], urgency: "NORMAL" },
  { reason: "TOOL_MISSING", notify: ["BRANCH_MANAGER"], urgency: "NORMAL" },
  {
    reason: "SAFETY_ISSUE",
    // Safety goes wide and loud. A workshop can lose a person to a
    // blocker that sat in one queue.
    notify: ["BRANCH_MANAGER", "TEAM_LEADER", "TENANT_OWNER"],
    urgency: "URGENT",
    customerSafeMessage: "We have paused work on your vehicle for a safety check. The branch will contact you.",
  },
  { reason: "UNCLEAR_DIAGNOSIS", notify: ["TEAM_LEADER", "BRANCH_MANAGER"], urgency: "NORMAL" },
  { reason: "OTHER", notify: ["BRANCH_MANAGER"], urgency: "NORMAL" },
];

const BY_REASON: ReadonlyMap<BlockerReasonKey, BlockerRoute> = new Map(ROUTES.map((route) => [route.reason, route]));

/**
 * Never returns null: an unrouted blocker would be reported into silence,
 * which is worse than routing it somewhere slightly wrong. OTHER is the
 * catch-all, and it reaches the branch manager.
 */
export function routeForBlocker(reason: BlockerReasonKey): BlockerRoute {
  return BY_REASON.get(reason) ?? BY_REASON.get("OTHER")!;
}

export const BLOCKER_ROUTES = ROUTES;
