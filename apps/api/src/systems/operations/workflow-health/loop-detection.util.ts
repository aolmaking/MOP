import type { StatusChangeEvent } from "../../../reports/lifecycle-duration.util";

export interface StatusLoop {
  readonly workOrderId: string;
  /** The status re-entered after already having been left once -- e.g. IN_PROGRESS after QC_FAILED sent it back. */
  readonly reenteredStatus: string;
  readonly count: number;
}

/**
 * Finds every status a work order entered more than once -- a real rework
 * loop (IN_PROGRESS -> READY_FOR_QC -> QC_FAILED -> IN_PROGRESS), distinct
 * from a normal single-pass lifecycle. Pure and DB-free for the same
 * reason lifecycle-duration.util.ts is: exhaustively unit-testable
 * without a database.
 */
export function detectStatusLoops(events: readonly StatusChangeEvent[]): StatusLoop[] {
  const byWorkOrder = new Map<string, StatusChangeEvent[]>();
  for (const event of events) {
    const list = byWorkOrder.get(event.workOrderId) ?? [];
    list.push(event);
    byWorkOrder.set(event.workOrderId, list);
  }

  const loops: StatusLoop[] = [];
  for (const [workOrderId, list] of byWorkOrder) {
    const sorted = [...list].sort((a, b) => a.at.getTime() - b.at.getTime());
    const entryCounts = new Map<string, number>();
    for (const event of sorted) {
      entryCounts.set(event.to, (entryCounts.get(event.to) ?? 0) + 1);
    }
    for (const [status, count] of entryCounts) {
      if (count > 1) {
        loops.push({ workOrderId, reenteredStatus: status, count });
      }
    }
  }

  return loops;
}
