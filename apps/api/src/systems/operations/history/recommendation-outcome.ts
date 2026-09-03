/**
 * What actually became of a recommendation.
 *
 * The hardest rule in the history module, and the reason this is its own
 * file with its own tests: **a recommendation is never "completed"
 * because it was recommended, approved, planned, or billed.** Each member
 * below is reached only from evidence that already exists in the domain,
 * and every one carries that evidence back to the reader (see
 * `RecommendationEvidence`), so somebody who disbelieves a label can
 * check it rather than trust it.
 *
 * The evidence chain runs:
 *   CustomerDecisionItem (what the customer was offered, and answered)
 *     -> Task.decisionItemId (what the workshop planned in response)
 *       -> Task.status (what the workshop actually finished)
 *
 * The middle link did not exist before this module; without it the only
 * way to connect an approval to the work was to compare free text, which
 * is exactly how a history starts lying. Items with no linked task
 * therefore resolve to APPROVED_NO_WORK_LINKED -- an honest "we do not
 * know", never a guessed PERFORMED.
 */
export type RecommendationOutcome =
  | "AWAITING_CUSTOMER"
  | "DECLINED"
  | "EXPIRED"
  | "CANCELLED"
  | "APPROVED_NO_WORK_LINKED"
  | "APPROVED_PLANNED"
  | "APPROVED_IN_PROGRESS"
  | "PARTIALLY_PERFORMED"
  | "PERFORMED"
  | "NOT_PERFORMED";

/**
 * One fact that contributed to the outcome, in the reader's words.
 *
 * `at` is null when the underlying record genuinely carries no timestamp
 * for that fact -- never "now", and never the moment this projection ran.
 */
export interface RecommendationEvidence {
  readonly at: string | null;
  readonly text: string;
}

/** Human wording per outcome. Pinned here so no surface invents its own. */
export const OUTCOME_LABEL: Readonly<Record<RecommendationOutcome, string>> = {
  AWAITING_CUSTOMER: "Awaiting the customer",
  DECLINED: "Customer declined",
  EXPIRED: "Expired without an answer",
  CANCELLED: "Cancelled before an answer",
  APPROVED_NO_WORK_LINKED: "Approved - no work linked",
  APPROVED_PLANNED: "Approved - planned, not started",
  APPROVED_IN_PROGRESS: "Approved - work in progress",
  PARTIALLY_PERFORMED: "Partially performed",
  PERFORMED: "Performed",
  NOT_PERFORMED: "Not performed",
};

/**
 * The outcomes that mean "this was agreed and the vehicle did not get
 * it". The technician brief raises these to the top, because an old
 * approved-but-undone item is the single most likely explanation for a
 * complaint that has come back.
 */
export const UNRESOLVED_OUTCOMES: readonly RecommendationOutcome[] = [
  "NOT_PERFORMED",
  "PARTIALLY_PERFORMED",
  "APPROVED_NO_WORK_LINKED",
  "APPROVED_PLANNED",
];

export interface OutcomeInputTask {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OutcomeInput {
  readonly decision: string;
  readonly decidedAt: Date | null;
  readonly requestStatus: string;
  readonly sentAt: Date | null;
  readonly viewedAt: Date | null;
  readonly respondedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly workOrderStatus: string;
  readonly workOrderClosedAt: Date | null;
  readonly tasks: readonly OutcomeInputTask[];
  /** Evaluated against this instant, passed in so tests are not clock-dependent. */
  readonly now: Date;
}

export interface OutcomeResult {
  readonly outcome: RecommendationOutcome;
  readonly label: string;
  readonly evidence: readonly RecommendationEvidence[];
}

const TERMINAL_JOB_STATUSES = ["CLOSED", "CANCELLED"];

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/**
 * Resolve one recommendation's outcome from its evidence.
 *
 * Pure, and deliberately takes plain values rather than Prisma rows: the
 * rule IS the product decision, so it has to be testable without a
 * database and reusable by every projection without being re-derived.
 */
export function resolveOutcome(input: OutcomeInput): OutcomeResult {
  const evidence: RecommendationEvidence[] = [];

  evidence.push({ at: iso(input.sentAt), text: input.sentAt ? "Sent to the customer" : "Raised, not yet sent" });
  if (input.viewedAt) evidence.push({ at: iso(input.viewedAt), text: "Customer opened the request" });

  // Cancelled is a fact about the REQUEST, so it is asked before the
  // item's own decision -- an item still PENDING inside a cancelled
  // request was never declined by anybody, and saying so would put words
  // in a customer's mouth.
  if (input.decision === "PENDING" && input.requestStatus === "CANCELLED") {
    evidence.push({ at: null, text: "The request was cancelled before the customer answered" });
    return { outcome: "CANCELLED", label: OUTCOME_LABEL.CANCELLED, evidence };
  }

  if (input.decision === "REJECTED") {
    evidence.push({ at: iso(input.decidedAt), text: "Customer declined this item" });
    return { outcome: "DECLINED", label: OUTCOME_LABEL.DECLINED, evidence };
  }

  if (input.decision === "PENDING") {
    if (input.expiresAt && !input.respondedAt && input.expiresAt.getTime() < input.now.getTime()) {
      evidence.push({ at: iso(input.expiresAt), text: "The request expired with no answer" });
      return { outcome: "EXPIRED", label: OUTCOME_LABEL.EXPIRED, evidence };
    }
    evidence.push({ at: null, text: "No answer recorded yet" });
    return { outcome: "AWAITING_CUSTOMER", label: OUTCOME_LABEL.AWAITING_CUSTOMER, evidence };
  }

  // APPROVED from here down. Approval alone is never performance.
  evidence.push({ at: iso(input.decidedAt), text: "Customer approved this item" });

  if (input.tasks.length === 0) {
    evidence.push({ at: null, text: "No work on this job is linked to this recommendation" });
    return { outcome: "APPROVED_NO_WORK_LINKED", label: OUTCOME_LABEL.APPROVED_NO_WORK_LINKED, evidence };
  }

  const done = input.tasks.filter((task) => task.status === "DONE");
  const cancelled = input.tasks.filter((task) => task.status === "CANCELLED");
  const started = input.tasks.filter((task) => task.status === "IN_PROGRESS");

  for (const task of done) {
    // `updatedAt` is the only completion timestamp Task carries. Reported
    // as "last changed" rather than "completed at", so the wording does
    // not claim a precision the column does not have.
    evidence.push({ at: iso(task.updatedAt), text: `Task "${task.title}" completed (last changed)` });
  }
  for (const task of input.tasks.filter((t) => t.status !== "DONE")) {
    evidence.push({
      at: iso(task.createdAt),
      text: `Task "${task.title}" is ${task.status.toLowerCase().replace(/_/g, " ")}`,
    });
  }

  if (done.length === input.tasks.length) {
    return { outcome: "PERFORMED", label: OUTCOME_LABEL.PERFORMED, evidence };
  }

  // A cancelled task is not outstanding work. If everything that was not
  // cancelled is done, the recommendation was carried out as far as the
  // workshop ever intended to carry it.
  if (done.length > 0 && done.length + cancelled.length === input.tasks.length) {
    return { outcome: "PERFORMED", label: OUTCOME_LABEL.PERFORMED, evidence };
  }

  if (done.length > 0) {
    return { outcome: "PARTIALLY_PERFORMED", label: OUTCOME_LABEL.PARTIALLY_PERFORMED, evidence };
  }

  const jobIsOver = TERMINAL_JOB_STATUSES.includes(input.workOrderStatus) || input.workOrderClosedAt !== null;
  if (jobIsOver) {
    evidence.push({ at: iso(input.workOrderClosedAt), text: "The job ended with none of this work completed" });
    return { outcome: "NOT_PERFORMED", label: OUTCOME_LABEL.NOT_PERFORMED, evidence };
  }

  if (started.length > 0) {
    return { outcome: "APPROVED_IN_PROGRESS", label: OUTCOME_LABEL.APPROVED_IN_PROGRESS, evidence };
  }

  return { outcome: "APPROVED_PLANNED", label: OUTCOME_LABEL.APPROVED_PLANNED, evidence };
}
