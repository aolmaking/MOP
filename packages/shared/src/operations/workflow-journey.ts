import { effectiveGraph } from "../capabilities/workflow-router";
import type { CapabilityProfile, WorkflowGraph } from "../capabilities/types";

/**
 * Where a stage sits relative to where the job actually is.
 *
 * `WAITING` and `BLOCKED` are both separate from `CURRENT`, and from each
 * other. A job in WAITING_PARTS is stopped but healthy -- somebody owes
 * it a move. A job in BLOCKED or QC_FAILED is stopped because something
 * went wrong. A strip that draws all three the same tells the viewer the
 * opposite of the truth about whether anyone needs to worry.
 */
export type JourneyStageState = "DONE" | "CURRENT" | "WAITING" | "BLOCKED" | "AHEAD";

export interface JourneyStage {
  /** The `WorkOrder.status` this stage represents. */
  readonly status: string;
  readonly state: JourneyStageState;
  /** When it actually happened. Null for anything not yet reached. */
  readonly at: string | null;
}

export interface WorkflowJourney {
  readonly stages: readonly JourneyStage[];
  /** True once the job has reached a terminal state. */
  readonly finished: boolean;
  /** True when the job is stopped waiting on somebody. */
  readonly waiting: boolean;
  /** True when the job is stopped because something went wrong. */
  readonly blocked: boolean;
}

export interface JourneyOptions {
  /**
   * Statuses that must NOT appear on the route ahead, even though the
   * graph offers an edge to them.
   *
   * This is what keeps the strip from lying about optional stages. The
   * graph says a job at UNDER_INSPECTION *can* go to
   * AWAITING_CUSTOMER_APPROVAL, and declaration order means the greedy
   * walk would always take it -- so every job would be drawn as needing
   * the customer, including the ones that do not. The caller knows
   * whether this particular job needs approval (a policy question, and a
   * question about whether a decision actually exists) and says so here.
   *
   * A skip is only honoured when another way forward exists. If the only
   * route out of a state runs through a skipped one, the stage is real
   * and is shown -- refusing to draw the only path would be a worse lie
   * than drawing an optional one.
   */
  readonly skipAhead?: readonly string[];
}

/**
 * Stopped, and somebody outside this bay owes the next move.
 *
 * Kept here rather than in a view because every role's presentation of
 * the journey needs the same answer, and three views deciding it
 * separately is how they come to disagree.
 */
const WAITING_STATES = new Set([
  "AWAITING_CUSTOMER_APPROVAL",
  "WAITING_CUSTOMER",
  "WAITING_PARTS",
  "READY_FOR_TEAM_REVIEW",
  "READY_FOR_QC",
  "PAYMENT_PENDING",
  "READY_FOR_DELIVERY",
]);

/** Stopped because something went wrong, rather than merely waiting. */
const BLOCKED_STATES = new Set(["BLOCKED", "QC_FAILED"]);

/**
 * The intents that carry a job FORWARD.
 *
 * Everything absent is a contingency or a setback -- REQUEST_PART,
 * ASK_CUSTOMER, REPORT_BLOCKER, QC_FAILED, REVIEW_REJECTED, CANCEL.
 * Those are real edges and a job may well take one, but none is where
 * the job is *expected* to go, and a strip that drew them as the plan
 * would tell a customer their car is scheduled to be blocked.
 *
 * The ones that CLEAR a wait -- PART_RECEIVED, CUSTOMER_RESPONDED,
 * RESOLVE_BLOCKER -- are forward: from WAITING_PARTS, getting the part
 * is genuinely the next step.
 */
const PROGRESS_INTENTS = new Set([
  "REGISTER",
  "START_INSPECTION",
  "REQUEST_APPROVAL",
  "APPROVE",
  "START_WORK",
  "PART_RECEIVED",
  "CUSTOMER_RESPONDED",
  "RESOLVE_BLOCKER",
  "FINISH",
  "REVIEW_PASSED",
  "QC_PASSED",
  "ISSUE_INVOICE",
  "SETTLE_PAYMENT",
  "DELIVER",
]);

/**
 * The journey a work order is actually on.
 *
 * **This is derived, never authored.** The stages behind come from what
 * really happened (the transition history the caller supplies); the
 * stages ahead come from the route this workshop's own effective graph
 * still allows from here. A workshop without QC has no QC stage, not a
 * hidden one -- the edge does not exist in its graph, so the walk cannot
 * pass through it.
 *
 * That is the whole reason this reads the graph rather than a list: a
 * fixed sequence would be a picture of one workshop's process shown to
 * every workshop, and would go on claiming a stage after the capability
 * that owns it was removed.
 *
 * `CANCELLED` is never routed toward. It is reachable from nearly every
 * state and would otherwise always be the shortest way out, drawing
 * every job as one step from abandonment.
 */
export function workflowJourney(
  graph: WorkflowGraph,
  profile: CapabilityProfile,
  currentStatus: string,
  history: readonly { readonly status: string; readonly at: string }[] = [],
  options: JourneyOptions = {},
): WorkflowJourney {
  const effective = effectiveGraph(graph, profile);
  const finished = effective.terminal.includes(currentStatus);

  // What already happened, in order, de-duplicated: a job that bounced
  // IN_PROGRESS -> BLOCKED -> IN_PROGRESS should read as one journey,
  // not a strip with the same stage drawn twice.
  const seen = new Map<string, string>();
  for (const entry of history) {
    if (!seen.has(entry.status)) seen.set(entry.status, entry.at);
  }

  const past: JourneyStage[] = [];
  for (const [status, at] of seen) {
    if (status === currentStatus) continue;
    past.push({ status, state: "DONE", at });
  }

  const current: JourneyStage = {
    status: currentStatus,
    state: finished
      ? "DONE"
      : BLOCKED_STATES.has(currentStatus)
        ? "BLOCKED"
        : WAITING_STATES.has(currentStatus)
          ? "WAITING"
          : "CURRENT",
    at: seen.get(currentStatus) ?? null,
  };

  const ahead = finished
    ? []
    : routeToEnd(effective, currentStatus, new Set(options.skipAhead ?? [])).map((status) => ({
        status,
        state: "AHEAD" as const,
        at: null,
      }));

  return {
    stages: [...past, current, ...ahead],
    finished,
    waiting: current.state === "WAITING",
    blocked: current.state === "BLOCKED",
  };
}

/**
 * The route this job is actually expected to take from here.
 *
 * **Declaration order is precedence**, exactly as `resolveIntent` treats
 * it: a workshop with team review, QC and finance has three live FINISH
 * edges out of IN_PROGRESS, and the graph's own comment says review must
 * win. So this walks the graph the way the router will, taking the first
 * declared live progress edge at each step.
 *
 * It deliberately does NOT search for the shortest path. Shortest-path
 * was the first implementation and it was wrong in a way that only
 * showed up under a capability change: with QC off it routed
 * IN_PROGRESS -> PAYMENT_PENDING directly, skipping the team review the
 * router would actually have sent the job to. A strip that disagrees
 * with the router is worse than no strip, because it is confidently
 * wrong.
 *
 * Returns nothing when no route exists -- a real answer, not a failure:
 * it means the capability engine has stranded this job, the exact
 * condition the reachability guarantee exists to prevent, and a caller
 * should be able to see it rather than have it papered over.
 */
function routeToEnd(
  effective: {
    readonly transitions: readonly { from: string; to: string; intent?: string }[];
    readonly terminal: readonly string[];
  },
  from: string,
  skip: ReadonlySet<string>,
): readonly string[] {
  const route: string[] = [];
  // Visiting a state twice would mean a loop -- a rework cycle, which is
  // possible in reality but is not a *plan*.
  const visited = new Set([from]);
  let at = from;

  while (!effective.terminal.includes(at)) {
    const candidates = effective.transitions.filter(
      (transition) =>
        transition.from === at &&
        transition.intent !== undefined &&
        PROGRESS_INTENTS.has(transition.intent) &&
        !visited.has(transition.to),
    );

    // A skipped stage is stepped around only when there is another way
    // forward. If the skip would strand the job, the stage is genuinely
    // on its path and gets drawn.
    const preferred = candidates.find((transition) => !skip.has(transition.to));
    const next = preferred ?? candidates[0];
    if (!next) break;

    route.push(next.to);
    visited.add(next.to);
    at = next.to;
  }

  return route;
}
