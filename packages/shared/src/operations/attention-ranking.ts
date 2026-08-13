/**
 * How urgent is this, really?
 *
 * A branch manager is accountable for delay, not for repair. Their whole
 * job is finding what is stuck, so the order of their queue is the single
 * most consequential piece of logic in their interface -- get it wrong and
 * they scroll past the thing that mattered.
 *
 * Newest-first is the obvious default and the wrong one: a blocker raised
 * an hour ago can matter less than an approval a customer has ignored for
 * three days.
 *
 * Pure and shared so the ranking is computed once, server-side, and two
 * screens can never disagree about what is most urgent.
 */

export const ATTENTION_KINDS = [
  "CRITICAL_REJECTION_UNACKNOWLEDGED",
  "TECHNICIAN_BLOCKED",
  "CUSTOMER_APPROVAL_WAITING",
  "SLA_OVERRUN",
  "READY_UNPAID",
  "WAITING_PARTS",
  "REWORK_REQUIRED",
] as const;

export type AttentionKind = (typeof ATTENTION_KINDS)[number];

/**
 * Lower tier = more urgent.
 *
 * 1 Safety liability is unbounded and does not decay with time.
 * 2 A blocked technician is a paid person idle right now -- immediate and certain.
 * 3 A waiting customer risks being lost, and holds a bay. Scales sharply with age.
 * 4 A job already past its promised time is a promise about to be broken --
 *   worse than a customer merely waiting to be asked, better than one
 *   already ignored for a day (Phase 16.E).
 * 5 Uncollected money on a finished car, occupying space.
 * 6 Parts waits are real but usually outside this person's control.
 * 7 Rework needs attention, rarely within the hour.
 */
const BASE_TIER: Readonly<Record<AttentionKind, number>> = {
  CRITICAL_REJECTION_UNACKNOWLEDGED: 1,
  TECHNICIAN_BLOCKED: 2,
  CUSTOMER_APPROVAL_WAITING: 3,
  SLA_OVERRUN: 4,
  READY_UNPAID: 5,
  WAITING_PARTS: 6,
  REWORK_REQUIRED: 7,
};

/**
 * Waits that promote an item one tier, in hours.
 *
 * A customer ignored for a day is no longer "waiting" -- they are being
 * lost, which outranks an hour of idle technician time. Safety never
 * escalates because it is already top, and never decays either.
 */
const ESCALATE_AFTER_HOURS: Readonly<Partial<Record<AttentionKind, number>>> = {
  CUSTOMER_APPROVAL_WAITING: 24,
  WAITING_PARTS: 72,
  READY_UNPAID: 48,
  REWORK_REQUIRED: 48,
};

export interface AttentionInput {
  readonly kind: AttentionKind;
  /** When this became the manager's problem -- not when the work order was created. */
  readonly waitingSince: Date;
}

export interface AttentionRank {
  readonly tier: number;
  readonly waitingHours: number;
  readonly escalated: boolean;
  /** Sort ascending. Lower is more urgent. */
  readonly score: number;
}

export function rankAttentionItem(input: AttentionInput, now: Date = new Date()): AttentionRank {
  const waitingHours = Math.max(0, (now.getTime() - input.waitingSince.getTime()) / 3_600_000);

  const base = BASE_TIER[input.kind];
  const threshold = ESCALATE_AFTER_HOURS[input.kind];
  const escalated = threshold !== undefined && waitingHours >= threshold;
  const tier = escalated ? base - 1 : base;

  // Age breaks ties inside a tier, oldest first. Divided so it can never
  // push an item across a tier boundary on its own -- escalation is the
  // only thing allowed to do that, and it does so explicitly.
  const score = tier * 1000 - Math.min(waitingHours, 999);

  return { tier, waitingHours, escalated, score };
}

/** Most urgent first. */
export function sortByAttention<T extends { readonly rank: AttentionRank }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.rank.score - b.rank.score);
}

/**
 * Plain-language reason, shown on the row instead of a status badge.
 *
 * A badge asks the reader to remember what it maps to; a sentence does
 * not. The manager should be able to disagree with our ranking, which
 * means seeing what it was based on.
 */
export function attentionReason(kind: AttentionKind, waitingHours: number): string {
  const age = describeWait(waitingHours);

  switch (kind) {
    case "CRITICAL_REJECTION_UNACKNOWLEDGED":
      return `Customer rejected a critical repair and has not acknowledged the warning — ${age}`;
    case "TECHNICIAN_BLOCKED":
      return `Technician is blocked and cannot continue — ${age}`;
    case "CUSTOMER_APPROVAL_WAITING":
      return `Waiting for the customer to approve — ${age}`;
    case "SLA_OVERRUN":
      return `Past its promised time — ${age} over`;
    case "READY_UNPAID":
      return `Ready to collect but not paid — ${age}`;
    case "WAITING_PARTS":
      return `Waiting for a part — ${age}`;
    case "REWORK_REQUIRED":
      return `Returned for rework — ${age}`;
  }
}

/**
 * Rounded deliberately. "3 days" is what a manager acts on; "73.4 hours"
 * is a number they have to convert first.
 */
export function describeWait(hours: number): string {
  if (hours < 1) return "just now";
  if (hours < 2) return "1 hour";
  if (hours < 24) return `${Math.floor(hours)} hours`;

  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}
