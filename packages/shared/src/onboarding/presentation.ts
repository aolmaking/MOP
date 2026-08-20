import type { CapabilityKey, OwningSystem } from "../capabilities/types";

/**
 * Human-facing copy for the capability engine.
 *
 * Everything a workshop-creation screen can *derive* -- which gates die
 * with a capability, which roles it affects, which states stop existing,
 * which reports go quiet -- is already in the capability registry and is
 * read from there. This file holds only what cannot be derived: the
 * words. A `CapabilityKey` is `PART_RETURNS`; a workshop owner reading
 * a screen needs "Parts can come back."
 *
 * Kept beside the registry rather than in the Angular app for one
 * reason: the copy must die with the capability. A capability removed
 * from `CAPABILITY_KEYS` breaks the exhaustive record below at compile
 * time, where a map in a component would simply grow a dead entry and a
 * new capability would silently render as its own key.
 *
 * The rule for the copy itself: say what the workshop *does*, never what
 * the software *has*. "Parts are requested, issued and tracked against
 * stock" is a sentence a workshop owner can agree or disagree with;
 * "Inventory module" is not.
 */

export interface CapabilityPresentation {
  readonly key: CapabilityKey;
  /** Two or three words. Reads as a thing the workshop does. */
  readonly title: string;
  /** One line, under the title, on the card. */
  readonly summary: string;
  /**
   * What the workshop can do once this is on, in the workshop's own
   * terms. Three to five entries; a card that lists ten is not read.
   */
  readonly enables: readonly string[];
  /**
   * What changes *elsewhere* -- the answer to "why does this matter to
   * someone who is not the person turning it on".
   */
  readonly changesElsewhere: readonly string[];
  /**
   * What the workshop does instead, when this is off. Never "the
   * feature is hidden" -- every capability's removal policy names a real
   * replacement behaviour, and this is that behaviour in plain words.
   */
  readonly withoutIt: string;
}

/**
 * `Record`, not an array: a capability added to `CAPABILITY_KEYS`
 * without copy here fails the build rather than rendering as a raw key.
 */
export const CAPABILITY_PRESENTATION: Readonly<Record<CapabilityKey, CapabilityPresentation>> = {
  MULTI_BRANCH: {
    key: "MULTI_BRANCH",
    title: "More than one branch",
    summary: "Several locations, each with its own manager, board and staff.",
    enables: [
      "A work order belongs to the branch that took it in",
      "A branch manager sees their own branch's board, not everyone's",
      "Staff are scoped to the branches they actually work at",
      "Branch-by-branch comparison in reporting",
    ],
    changesElsewhere: [
      "The branch manager role has somewhere to be scoped to",
      "Warehouses can be granted to specific branches",
    ],
    withoutIt:
      "The workshop keeps exactly one branch and stops asking which one anything belongs to. The data shape " +
      "does not change, so turning this on later is a setting, not a migration.",
  },
  MULTI_WAREHOUSE: {
    key: "MULTI_WAREHOUSE",
    title: "More than one store",
    summary: "Stock lives in several places and moves between them.",
    enables: [
      "Stock is counted per store, not as one pooled number",
      "Transfers between stores, with both sides recorded",
      "A branch can be limited to the stores it may draw from",
    ],
    changesElsewhere: ["Part requests name which store the part came out of"],
    withoutIt: "All stock sits in one store and no transfer step is ever asked for.",
  },
  INVENTORY: {
    key: "INVENTORY",
    title: "Parts and stock",
    summary: "Parts are requested, issued against stock, and counted.",
    enables: [
      "Technicians request parts from the work card",
      "An inventory manager approves, issues and tracks every part",
      "Stock levels move only through recorded movements, never by editing a number",
      "A job can wait on a part, visibly, instead of silently",
    ],
    changesElsewhere: [
      "The finish checklist gains a check that received parts are accounted for",
      "Work order costs include what came out of stock",
      "The inventory manager role has work to do",
    ],
    withoutIt:
      "Parts are bought for the job or supplied by the customer, and a wait for one is recorded as a blocker " +
      "on the job rather than a stock request. No job is ever stuck waiting for a stockroom that does not exist.",
  },
  PART_RETURNS: {
    key: "PART_RETURNS",
    title: "Parts can come back",
    summary: "An unused part is returned to the store and stock rises again.",
    enables: [
      "A technician can return a part they did not fit",
      "The inventory manager accepts the return, which is what raises stock",
      "Returned-but-not-accepted parts stay visible instead of vanishing",
    ],
    changesElsewhere: ["The finish checklist waits for a pending return to be accepted"],
    withoutIt: "An issued part is consumed by the job. Correcting a mistake is a stock adjustment, not a return.",
  },
  EXTERNAL_PARTS: {
    key: "EXTERNAL_PARTS",
    title: "Customer-supplied and bought-in parts",
    summary: "Parts that never touch the workshop's own stock.",
    enables: [
      "A customer can bring their own part and have it recorded",
      "A part bought for one job is priced onto that job directly",
      "Who supplied a part is on the record, which matters when it fails",
    ],
    changesElsewhere: ["The finish checklist confirms externally-sourced parts were resolved"],
    withoutIt: "Every part on a job came from the workshop.",
  },
  TEAMS: {
    key: "TEAMS",
    title: "Teams and team leaders",
    summary: "Technicians are grouped, and someone is responsible for the group.",
    enables: [
      "Technicians belong to a team with a named leader",
      "A team leader sees their own technicians' work and load",
      "Supervision notes have a subject and an author",
      "Performance is readable per team, not only per person",
    ],
    changesElsewhere: ["The team leader role has people to lead"],
    withoutIt: "Technicians report to the branch manager directly. Past team history stays readable.",
  },
  TEAM_REVIEW: {
    key: "TEAM_REVIEW",
    title: "Team leader review",
    summary: "Finished work can be checked by the team leader before it moves on.",
    enables: [
      "A finished job can route to the team leader instead of straight onward",
      "A leader can send work back with a reason",
      "Review time is measurable",
    ],
    changesElsewhere: [
      "The finish checklist waits on the review",
      "Whether review is compulsory is a separate question, asked later",
    ],
    withoutIt: "Finished work goes straight to whatever comes next — quality control, invoicing, or delivery.",
  },
  QC: {
    key: "QC",
    title: "Quality control",
    summary: "A separate pass/fail check after the work is done.",
    enables: [
      "A finished job waits for a quality check",
      "A failed check sends the job back with a recorded reason",
      "Failure rates are reportable",
    ],
    changesElsewhere: ["Adds a step between finishing and handing the vehicle back"],
    withoutIt: "Finished work moves straight on. Past quality records stay readable.",
  },
  CUSTOMER_PORTAL: {
    key: "CUSTOMER_PORTAL",
    title: "Customer portal",
    summary: "The customer answers, and follows their job, themselves.",
    enables: [
      "The customer approves or declines extra work from their own phone",
      "They can see their job's progress without phoning the branch",
      "Their answer is timestamped and attributed to them",
    ],
    changesElsewhere: ["Staff can see whether a request has been seen, not just sent"],
    withoutIt:
      "Approval still happens — it moves to the counter, recorded by staff, with the same weight and the same " +
      "audit trail. The step is never removed, only the channel.",
  },
  FINANCE_CORE: {
    key: "FINANCE_CORE",
    title: "Pricing and payment",
    summary: "MOP prices the job, takes payment, and holds the balance.",
    enables: [
      "A running total that grows as work is added",
      "Payments recorded against the job, with the balance derived from them",
      "Discounts and refunds with a decision behind them",
      "What is owed, per job and in total",
    ],
    changesElsewhere: ["Delivery can be made to wait on payment", "Revenue reporting has numbers to report"],
    withoutIt:
      "Money is handled entirely outside MOP. Work still reaches delivery — MOP runs the operation and " +
      "something else runs the till.",
  },
  BILLING: {
    key: "BILLING",
    title: "Invoices issued by MOP",
    summary: "The legal invoice document is produced here.",
    enables: [
      "A numbered, sequential invoice document",
      "Credit notes against an issued invoice",
      "An issued invoice is frozen — its prices are a snapshot, not a live read",
    ],
    changesElsewhere: ["Delivery can be made to wait on the invoice existing"],
    withoutIt:
      "MOP still owns pricing, payments and balances; the legal invoice is issued from separate accounting " +
      "software and its reference recorded here.",
  },
  QUICK_INSPECTION: {
    key: "QUICK_INSPECTION",
    title: "Quick inspection",
    summary: "A short intake check for jobs that do not need the full one.",
    enables: [
      "A shorter inspection form for routine work",
      "An oil change is not held up by a 40-point check",
    ],
    changesElsewhere: ["Full inspection is still available and still required where it is scoped"],
    withoutIt: "Every inspection uses the full form.",
  },
} as const;

/**
 * Which system each capability belongs to, and how that reads on screen.
 * The grouping itself is the registry's `owningSystem`, not a second
 * opinion about it -- this only supplies the heading.
 */
export const OWNING_SYSTEM_PRESENTATION: Readonly<Record<OwningSystem, { title: string; summary: string }>> = {
  OPERATIONS: { title: "Operations", summary: "How a job moves from the gate to the customer's hand." },
  INVENTORY: { title: "Parts & stock", summary: "Whether the workshop holds parts, and how they are controlled." },
  FINANCE_CORE: { title: "Money", summary: "Whether MOP prices the work and holds the balance." },
  BILLING: { title: "Invoicing", summary: "Who produces the legal document." },
  PEOPLE_PERFORMANCE: { title: "People", summary: "How technicians are organised and supervised." },
  GOVERNANCE_CONTROL: { title: "Governance", summary: "Platform-level control over this workshop." },
};

export function capabilityPresentation(key: CapabilityKey): CapabilityPresentation {
  return CAPABILITY_PRESENTATION[key];
}
