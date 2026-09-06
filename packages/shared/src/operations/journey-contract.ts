import type { JourneyStageState } from "./workflow-journey";

/**
 * The live Work Order Journey, as it crosses the wire.
 *
 * Published here rather than in either app because three role surfaces
 * and one API render the SAME projection, and a shape re-declared per
 * consumer is how the customer's strip and the technician's strip come
 * to disagree about what a stage means. One contract, three
 * vocabularies -- the words differ by audience, the facts never do.
 */

/** Who is looking. The same journey reads differently to each of them. */
export type JourneyAudience = "CUSTOMER" | "TECHNICIAN" | "MANAGER";

/**
 * What actually happened, named.
 *
 * A closed union rather than a free string because the client keys
 * icons, grouping and ordering off it. Every member below is produced
 * from a real record or a real event row -- nothing here exists to make
 * a timeline look fuller than the job was.
 */
export type JourneyEventKind =
  | "work_order.created"
  | "work_order.status_changed"
  | "inspection.recorded"
  | "fault.recorded"
  | "decision.asked"
  | "decision.viewed"
  | "decision.answered"
  | "decision.withdrawn"
  | "task.created"
  | "task.started"
  | "task.completed"
  | "blocker.raised"
  | "blocker.resolved"
  | "part.requested"
  | "part.approved"
  | "part.refused"
  | "part.issued"
  | "part.arrived"
  | "part.received"
  | "part.used"
  | "part.external_recorded"
  | "return.requested"
  | "return.clarification_asked"
  | "return.clarification_answered"
  | "return.accepted"
  | "return.rejected"
  | "invoice.issued"
  | "payment.recorded"
  | "work_order.closed";

/**
 * One thing that happened, dated by the record that proves it.
 *
 * `at` is always the moment the thing OCCURRED, read from the row that
 * recorded it -- never the moment this projection ran, and never
 * inferred from current state. A stage the job is sitting in has no
 * completion event until it completes.
 */
export interface JourneyEvent {
  readonly kind: JourneyEventKind;
  /** ISO 8601, from the database. The client formats; it never invents. */
  readonly at: string;
  /** Plain words, already reduced to what this audience may read. */
  readonly message: string;
  /** One line of real extra detail, or null when there is nothing true to add. */
  readonly detail: string | null;
  /** Who did it, where naming them is allowed for this audience. */
  readonly actor: string | null;
  /**
   * The `WorkOrder.status` this event belongs under, when it maps to one
   * cleanly. Lets a client group the history beneath the strip without
   * re-deriving the mapping and disagreeing with the server about it.
   */
  readonly stage: string | null;
}

/** One fact behind a stage, already reduced to words. */
export interface JourneyStageFact {
  readonly label: string;
  readonly value: string;
}

export interface PresentedJourneyStage {
  readonly status: string;
  readonly state: JourneyStageState;
  /** When the job entered this stage. Null for anything not yet reached. */
  readonly at: string | null;
  /** Plain words for this audience. Never the enum. */
  readonly label: string;
  readonly detail: string | null;
  readonly facts: readonly JourneyStageFact[];
}

/**
 * An action this reader may actually take on this job, right now.
 *
 * Present ONLY when the server has confirmed both halves: the reader
 * holds the permission, and the domain would accept the move. A client
 * that offers an action it merely guesses at teaches people that half
 * the buttons fail, which is worse than offering none.
 */
export interface JourneyAction {
  /** Stable key the client routes on. */
  readonly key: string;
  readonly label: string;
  /** Why this is the useful next move, in one line. */
  readonly hint: string | null;
}

/**
 * Where the job is, why, and what it is waiting for -- the panel a
 * person reads before they read the strip.
 */
export interface JourneyCurrentStage {
  readonly status: string;
  readonly label: string;
  /** When the job entered this stage, from the real transition event. */
  readonly since: string | null;
  /**
   * How long it has been here, in whole minutes, computed server-side
   * from `since`. Sent rather than left to the client because three
   * surfaces computing "how long" from a timestamp is three chances to
   * compute it differently.
   */
  readonly forMinutes: number | null;
  /** Whose move it is, in this audience's words. Null when nobody owes one. */
  readonly waitingOn: string | null;
  /** Since when they have owed it -- often earlier than stage entry. */
  readonly waitingSince: string | null;
  readonly waitingForMinutes: number | null;
  /** Why it is stopped, when it is. Null when it is simply moving. */
  readonly reason: string | null;
  /** What has to happen for it to move. Null once terminal. */
  readonly next: string | null;
}

/**
 * One work order's journey, projected for one reader.
 *
 * Derived, never authored, and never a second source of truth: the
 * workflow remains the authoritative state machine, and everything here
 * reads, interprets and projects it.
 */
export interface PresentedJourney {
  readonly workOrderId: string;
  readonly stages: readonly PresentedJourneyStage[];
  readonly finished: boolean;
  readonly waiting: boolean;
  readonly blocked: boolean;
  /** Where are we, and why, in one sentence. */
  readonly headline: string;
  /** What happened to get here. Null at the very start. */
  readonly happened: string | null;
  /** What happens next. Null once terminal. */
  readonly next: string | null;
  /** Who owes the move. Null when nobody does. */
  readonly waitingOn: { readonly who: string; readonly since: string | null } | null;
  readonly current: JourneyCurrentStage;
  /** The real chronology, oldest first, safe for this audience. */
  readonly events: readonly JourneyEvent[];
  /** Real, authorized, currently-valid moves. Empty is a real answer. */
  readonly actions: readonly JourneyAction[];
  /** When the server built this. For "as of", never for event times. */
  readonly asOf: string;
}
