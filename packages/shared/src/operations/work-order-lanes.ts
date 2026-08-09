/**
 * How work orders are grouped on the board.
 *
 * The graph has sixteen states. Sixteen columns is not a board, it is a
 * spreadsheet turned sideways -- and grouping by status would answer a
 * question the manager never asks. What they actually ask, twenty times a
 * day, is **whose move is it?**
 *
 * So the lanes are holders, not stages. This is the same idea the
 * attention queue ranks by: a job costs something different depending on
 * who is sitting on it. A car waiting on us is our failure; a car waiting
 * on the customer is a phone call; a car waiting on a part is a supplier
 * problem. Those are three different days.
 *
 * Lives in shared, like attention-ranking, so the board and any later
 * view can never disagree about which lane a job is in.
 */
export type WorkOrderLane = "NOT_STARTED" | "WITH_US" | "WAITING_CUSTOMER" | "WAITING_SUPPLY" | "READY_TO_LEAVE" | "FINISHED";

export interface LaneDefinition {
  readonly key: WorkOrderLane;
  /** What the manager calls this, not what the schema calls it. */
  readonly label: string;
  /** Answers "whose move is it?" in one line. */
  readonly holder: string;
  readonly statuses: readonly string[];
  /** Terminal lanes are excluded from the board's default view. */
  readonly closed: boolean;
}

export const WORK_ORDER_LANES: readonly LaneDefinition[] = [
  {
    key: "NOT_STARTED",
    label: "Not started",
    holder: "Booked in, nobody has touched it",
    statuses: ["DRAFT", "REGISTERED"],
    closed: false,
  },
  {
    key: "WITH_US",
    label: "With us",
    holder: "Ours to move",
    statuses: [
      "UNDER_INSPECTION",
      "APPROVED_FOR_WORK",
      "IN_PROGRESS",
      "READY_FOR_TEAM_REVIEW",
      "READY_FOR_QC",
      "QC_FAILED",
    ],
    closed: false,
  },
  {
    key: "WAITING_CUSTOMER",
    label: "Waiting on the customer",
    holder: "Needs a phone call",
    statuses: ["AWAITING_CUSTOMER_APPROVAL", "WAITING_CUSTOMER"],
    closed: false,
  },
  {
    key: "WAITING_SUPPLY",
    label: "Waiting on parts or a blocker",
    holder: "Somebody paid is idle",
    statuses: ["WAITING_PARTS", "BLOCKED"],
    closed: false,
  },
  {
    key: "READY_TO_LEAVE",
    label: "Ready to leave",
    holder: "Money, then the keys",
    statuses: ["READY_FOR_DELIVERY", "PAYMENT_PENDING"],
    closed: false,
  },
  {
    key: "FINISHED",
    label: "Finished",
    holder: "Nothing to do",
    statuses: ["CLOSED", "CANCELLED"],
    closed: true,
  },
];

const LANE_BY_STATUS = new Map<string, WorkOrderLane>(
  WORK_ORDER_LANES.flatMap((lane) => lane.statuses.map((status) => [status, lane.key] as const)),
);

/**
 * Never throws and never invents a lane. A status with no lane means the
 * graph grew and this map did not, which must show up as a visible gap on
 * the board rather than as a job quietly filed under the wrong holder.
 */
export function laneForStatus(status: string): WorkOrderLane | null {
  return LANE_BY_STATUS.get(status) ?? null;
}

export function openLanes(): readonly LaneDefinition[] {
  return WORK_ORDER_LANES.filter((lane) => !lane.closed);
}

/** Statuses that are not terminal -- the board's default scope. */
export function openStatuses(): readonly string[] {
  return openLanes().flatMap((lane) => lane.statuses);
}
