/**
 * Reconstructs how long a work order spent in each status from its own
 * `work_order.status_changed` OperationEvent history, preserving initial
 * states (e.g. DRAFT before the first transition) and separating active
 * work time from waiting time.
 */

export const TERMINAL_STATUSES: readonly string[] = ["CLOSED", "CANCELLED"];

/**
 * Statuses where active technician work (labor/inspection) takes place.
 */
export const ACTIVE_WORK_STATUSES: readonly string[] = ["IN_PROGRESS", "UNDER_INSPECTION"];

/**
 * Statuses where the work order is waiting on dependencies, customers, or queues.
 */
export const WAITING_STATUSES: readonly string[] = [
  "DRAFT",
  "REGISTERED",
  "AWAITING_CUSTOMER_APPROVAL",
  "APPROVED_FOR_WORK",
  "WAITING_PARTS",
  "WAITING_CUSTOMER",
  "BLOCKED",
  "READY_FOR_TEAM_REVIEW",
  "READY_FOR_QC",
  "QC_FAILED",
  "PAYMENT_PENDING",
  "READY_FOR_DELIVERY",
];

export interface StatusChangeEvent {
  readonly tenantId?: string;
  readonly branchId?: string;
  readonly workOrderId: string;
  readonly from: string;
  readonly to: string;
  readonly at: Date;
}

export interface WorkOrderMeta {
  readonly workOrderId: string;
  readonly createdAt: Date;
  readonly initialStatus?: string;
  readonly closedAt?: Date | null;
  readonly tenantId?: string;
  readonly branchId?: string;
}

export interface StageTransitionSpan {
  readonly tenantId?: string;
  readonly branchId?: string;
  readonly workOrderId: string;
  readonly status: string;
  readonly enteredAt: Date;
  readonly exitedAt: Date;
  readonly durationMs: number;
}

export interface WorkOrderDurations {
  readonly workOrderId: string;
  /** Milliseconds spent in each status this work order has passed through. */
  readonly msByStatus: Readonly<Record<string, number>>;
  readonly totalMs: number;
  readonly activeWorkMs?: number;
  readonly waitingMs?: number;
  readonly bottleneckStatus?: string | null;
  readonly spans?: readonly StageTransitionSpan[];
}

/**
 * Computes status durations for work orders.
 *
 * If `workOrderMetas` is supplied, the initial state (from work order creation
 * until the first status change) is faithfully preserved and attributed to
 * `initialStatus` (or `firstEvent.from`, defaulting to DRAFT).
 */
export function computeStatusDurations(
  events: readonly StatusChangeEvent[],
  asOf: Date,
  workOrderMetas?: ReadonlyMap<string, WorkOrderMeta> | readonly WorkOrderMeta[],
): WorkOrderDurations[] {
  const metaMap = new Map<string, WorkOrderMeta>();
  if (workOrderMetas) {
    if (Array.isArray(workOrderMetas)) {
      for (const m of workOrderMetas) metaMap.set(m.workOrderId, m);
    } else {
      for (const [k, v] of (workOrderMetas as ReadonlyMap<string, WorkOrderMeta>).entries()) {
        metaMap.set(k, v);
      }
    }
  }

  const byWorkOrder = new Map<string, StatusChangeEvent[]>();
  for (const event of events) {
    const list = byWorkOrder.get(event.workOrderId) ?? [];
    list.push(event);
    byWorkOrder.set(event.workOrderId, list);
  }

  // Include work orders that have meta even if they have zero events yet
  for (const [workOrderId] of metaMap) {
    if (!byWorkOrder.has(workOrderId)) {
      byWorkOrder.set(workOrderId, []);
    }
  }

  const results: WorkOrderDurations[] = [];

  for (const [workOrderId, list] of byWorkOrder) {
    const meta = metaMap.get(workOrderId);
    const sorted = [...list].sort((a, b) => a.at.getTime() - b.at.getTime());
    const msByStatus: Record<string, number> = {};
    const spans: StageTransitionSpan[] = [];

    // 1. Initial status before first transition
    if (meta) {
      if (sorted.length > 0) {
        const first = sorted[0]!;
        if (first.at.getTime() > meta.createdAt.getTime()) {
          const initialStatus = first.from && first.from !== "UNKNOWN" ? first.from : (meta.initialStatus ?? "DRAFT");
          const durationMs = first.at.getTime() - meta.createdAt.getTime();
          msByStatus[initialStatus] = (msByStatus[initialStatus] ?? 0) + durationMs;
          spans.push({
            tenantId: meta.tenantId ?? first.tenantId,
            branchId: meta.branchId ?? first.branchId,
            workOrderId,
            status: initialStatus,
            enteredAt: meta.createdAt,
            exitedAt: first.at,
            durationMs,
          });
        }
      } else {
        // Zero transitions: spent entire lifetime in initial status
        const initialStatus = meta.initialStatus ?? "DRAFT";
        const endTime = meta.closedAt ? meta.closedAt.getTime() : asOf.getTime();
        const durationMs = Math.max(0, endTime - meta.createdAt.getTime());
        msByStatus[initialStatus] = (msByStatus[initialStatus] ?? 0) + durationMs;
        spans.push({
          tenantId: meta.tenantId,
          branchId: meta.branchId,
          workOrderId,
          status: initialStatus,
          enteredAt: meta.createdAt,
          exitedAt: new Date(endTime),
          durationMs,
        });
      }
    }

    // 2. Each recorded transition
    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i]!;
      const next = sorted[i + 1];
      const isTerminal = TERMINAL_STATUSES.includes(current.to);

      let spanEnd: Date;
      let durationMs: number;

      if (next) {
        spanEnd = next.at;
        durationMs = Math.max(0, spanEnd.getTime() - current.at.getTime());
      } else {
        if (meta && isTerminal) {
          // Terminal status: duration in CLOSED or CANCELLED is 0 after finish
          spanEnd = current.at;
          durationMs = 0;
        } else {
          // If no meta, legacy behavior: terminal statuses ran to asOf
          spanEnd = asOf;
          durationMs = Math.max(0, asOf.getTime() - current.at.getTime());
        }
      }

      msByStatus[current.to] = (msByStatus[current.to] ?? 0) + durationMs;
      spans.push({
        tenantId: current.tenantId ?? meta?.tenantId,
        branchId: current.branchId ?? meta?.branchId,
        workOrderId,
        status: current.to,
        enteredAt: current.at,
        exitedAt: spanEnd,
        durationMs,
      });
    }

    // Calculate active vs waiting breakdown
    let activeWorkMs = 0;
    let waitingMs = 0;
    let bottleneckStatus: string | null = null;
    let maxStageMs = -1;

    for (const [status, ms] of Object.entries(msByStatus)) {
      if (TERMINAL_STATUSES.includes(status)) continue;

      if (ACTIVE_WORK_STATUSES.includes(status)) {
        activeWorkMs += ms;
      } else {
        waitingMs += ms;
      }

      if (ms > maxStageMs) {
        maxStageMs = ms;
        bottleneckStatus = status;
      }
    }

    const totalMs = Object.values(msByStatus).reduce((a, b) => a + b, 0);

    results.push({
      workOrderId,
      msByStatus,
      totalMs,
      activeWorkMs,
      waitingMs,
      bottleneckStatus,
      spans,
    });
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
