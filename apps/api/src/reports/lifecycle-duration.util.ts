/**
 * Reconstructs how long a work order spent in each status from its own
 * `work_order.status_changed` OperationEvent history
 * (work-order-lifecycle.service.ts emits one per transition, payload
 * `{ from, to }`), rather than reading only the current status -- per
 * the reporting brief: "a work order currently CLOSED does not tell you
 * how long it spent WAITING_PARTS if the transition history exists."
 *
 * Pure function, DB-free, so it is exhaustively unit-testable without a
 * database -- the query layer's only job is fetching the right rows in
 * the right order.
 */
/**
 * The states a job cannot leave.
 *
 * `computeStatusDurations` deliberately still partitions the whole
 * timeline, terminal states included -- that is a faithful account of
 * where a work order's clock went, and workflow-bottlenecks reads it
 * that way.
 *
 * What is NOT sound is publishing that slice as "average time in status".
 * A job closed in March has not spent eight months in CLOSED, and because
 * the slice runs to the end of the report range, asking for a year made
 * the figure larger than asking for a month, for the same jobs. Callers
 * that present a stage duration to a human filter these out first.
 */
export const TERMINAL_STATUSES: readonly string[] = ["CLOSED", "CANCELLED"];

export interface StatusChangeEvent {
  readonly workOrderId: string;
  readonly from: string;
  readonly to: string;
  readonly at: Date;
}

export interface WorkOrderDurations {
  readonly workOrderId: string;
  /** Milliseconds spent in each status this work order has passed through. */
  readonly msByStatus: Readonly<Record<string, number>>;
  readonly totalMs: number;
}

/**
 * `events` must be every status-changed event for the work orders being
 * analyzed, in any order -- this function sorts per work order. `asOf`
 * closes out whatever status a still-open work order is currently in
 * (usually "now"), so an in-progress job still contributes real,
 * partial duration data rather than being excluded until it closes.
 */
export function computeStatusDurations(events: readonly StatusChangeEvent[], asOf: Date): WorkOrderDurations[] {
  const byWorkOrder = new Map<string, StatusChangeEvent[]>();
  for (const event of events) {
    const list = byWorkOrder.get(event.workOrderId) ?? [];
    list.push(event);
    byWorkOrder.set(event.workOrderId, list);
  }

  const results: WorkOrderDurations[] = [];
  for (const [workOrderId, list] of byWorkOrder) {
    const sorted = [...list].sort((a, b) => a.at.getTime() - b.at.getTime());
    const msByStatus: Record<string, number> = {};

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i]!;
      const next = sorted[i + 1];
      const spanEnd = next ? next.at.getTime() : asOf.getTime();
      const spanStart = current.at.getTime();
      const durationMs = Math.max(0, spanEnd - spanStart);
      msByStatus[current.to] = (msByStatus[current.to] ?? 0) + durationMs;
    }

    const totalMs = Object.values(msByStatus).reduce((a, b) => a + b, 0);
    results.push({ workOrderId, msByStatus, totalMs });
  }

  return results;
}

/** Average milliseconds spent in each status, across every work order that ever entered it. */
export function averageMsByStatus(durations: readonly WorkOrderDurations[]): Record<string, number> {
  const totals = new Map<string, { sum: number; count: number }>();
  for (const d of durations) {
    for (const [status, ms] of Object.entries(d.msByStatus)) {
      const entry = totals.get(status) ?? { sum: 0, count: 0 };
      entry.sum += ms;
      entry.count += 1;
      totals.set(status, entry);
    }
  }

  const result: Record<string, number> = {};
  for (const [status, { sum, count }] of totals) {
    result[status] = count === 0 ? 0 : sum / count;
  }
  return result;
}
