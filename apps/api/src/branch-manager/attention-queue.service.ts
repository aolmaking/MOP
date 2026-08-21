import { Injectable } from "@nestjs/common";
import {
  attentionReason,
  rankAttentionItem,
  sortByAttention,
  type AttentionKind,
  type AttentionRank,
} from "@mop/shared";
import { PrismaService } from "../runtime/database/prisma.service";

/**
 * A row in the branch manager's queue. One thing that is stuck, why, and
 * the single most likely response to it.
 *
 * Deliberately flat and small: this is scanned, not read. Anything a
 * manager needs only after deciding to act belongs on the work order, not
 * here.
 */
export interface AttentionItem {
  readonly id: string;
  readonly kind: AttentionKind;
  readonly workOrderId: string;
  /** Plate or serial -- how a human identifies the car in the yard. */
  readonly identifier: string | null;
  readonly customerName: string;
  readonly branchId: string;
  /** A sentence, not a status code. See attention-ranking.ts for why. */
  readonly reason: string;
  readonly waitingSince: Date;
  readonly rank: AttentionRank;
  /** The one action most likely to unstick this, offered on the row itself. */
  readonly primaryAction: PrimaryAction;
}

export type PrimaryAction =
  | "CHASE_CUSTOMER"
  | "ESCALATE_CRITICAL"
  | "RESOLVE_BLOCKER"
  | "CHECK_PARTS"
  | "TAKE_PAYMENT"
  | "REASSIGN"
  | "REVIEW_OVERRUN";

export interface AttentionQueueScope {
  readonly tenantId: string;
  /** Empty means tenant-wide -- an owner, or a manager scoped to everything. */
  readonly branchScope: readonly string[];
}

/**
 * Builds the branch manager's queue: everything currently stuck, ranked by
 * what it costs to leave it stuck.
 *
 * Ranking lives in @mop/shared as a pure function, so this service decides
 * only *what is stuck*, never *what matters most*. That split is why two
 * screens can never disagree about the order.
 *
 * Every query is bounded by tenant and branch scope. A manager who covers
 * one branch must never see another's work, and the filter is applied in
 * the query rather than after it.
 */
@Injectable()
export class AttentionQueueService {
  constructor(private readonly prisma: PrismaService) {}

  async build(scope: AttentionQueueScope, now: Date = new Date()): Promise<AttentionItem[]> {
    const branchFilter = scope.branchScope.length > 0 ? { in: [...scope.branchScope] } : undefined;
    const workOrderWhere = { tenantId: scope.tenantId, ...(branchFilter ? { branchId: branchFilter } : {}) };

    const [criticalRejections, blockers, awaitingCustomer, overruns, readyUnpaid, waitingParts, rework] =
      await Promise.all([
        this.criticalRejections(workOrderWhere),
        this.blockedTechnicians(workOrderWhere),
        this.awaitingCustomer(workOrderWhere),
        this.slaOverruns(workOrderWhere, now),
        this.readyButUnpaid(workOrderWhere),
        this.byStatus(workOrderWhere, "WAITING_PARTS"),
        this.byStatus(workOrderWhere, "QC_FAILED"),
      ]);

    const items = [
      ...criticalRejections,
      ...blockers,
      ...awaitingCustomer,
      ...overruns,
      ...readyUnpaid,
      ...waitingParts.map((row) => this.toItem(row, "WAITING_PARTS", row.waitingSince, "CHECK_PARTS", now)),
      ...rework.map((row) => this.toItem(row, "REWORK_REQUIRED", row.waitingSince, "REASSIGN", now)),
    ];

    return sortByAttention(items);
  }

  /**
   * The customer rejected a critical repair and has not acknowledged the
   * warning. Top of the queue and never decays -- the workshop's liability
   * position does not improve by waiting.
   */
  private async criticalRejections(workOrderWhere: WorkOrderWhere): Promise<AttentionItem[]> {
    const rows = await this.prisma.customerDecisionItem.findMany({
      where: {
        importance: "CRITICAL",
        decision: "REJECTED",
        warningAcknowledged: false,
        decisionRequest: { workOrder: workOrderWhere },
      },
      select: {
        id: true,
        decidedAt: true,
        decisionRequest: { select: { workOrder: { select: WORK_ORDER_SUMMARY } } },
      },
    });

    return rows.map((row) =>
      this.toItem(
        { id: row.id, workOrder: row.decisionRequest.workOrder, waitingSince: row.decidedAt ?? new Date() },
        "CRITICAL_REJECTION_UNACKNOWLEDGED",
        row.decidedAt ?? new Date(),
        "ESCALATE_CRITICAL",
      ),
    );
  }

  /** Somebody paid is idle right now. */
  private async blockedTechnicians(workOrderWhere: WorkOrderWhere): Promise<AttentionItem[]> {
    const rows = await this.prisma.taskBlocker.findMany({
      where: { status: { in: ["OPEN", "ESCALATED"] }, task: { workOrder: workOrderWhere } },
      select: { id: true, createdAt: true, task: { select: { workOrder: { select: WORK_ORDER_SUMMARY } } } },
    });

    return rows.map((row) =>
      this.toItem(
        { id: row.id, workOrder: row.task.workOrder, waitingSince: row.createdAt },
        "TECHNICIAN_BLOCKED",
        row.createdAt,
        "RESOLVE_BLOCKER",
      ),
    );
  }

  private async awaitingCustomer(workOrderWhere: WorkOrderWhere): Promise<AttentionItem[]> {
    const rows = await this.prisma.customerDecisionRequest.findMany({
      where: {
        status: { in: ["PENDING", "SENT", "VIEWED", "PARTIALLY_RESPONDED"] },
        workOrder: workOrderWhere,
      },
      select: { id: true, createdAt: true, sentAt: true, workOrder: { select: WORK_ORDER_SUMMARY } },
    });

    return rows.map((row) => {
      // The clock starts when the customer was asked, not when the request
      // was drafted -- a request sitting unsent is the branch's delay, and
      // charging it to the customer would hide our own.
      const waitingSince = row.sentAt ?? row.createdAt;
      return this.toItem(
        { id: row.id, workOrder: row.workOrder, waitingSince },
        "CUSTOMER_APPROVAL_WAITING",
        waitingSince,
        "CHASE_CUSTOMER",
      );
    });
  }

  /**
   * A job actively in progress, past its promised time (Phase 16.A/16.E).
   * `updatedAt` stands in for "since work started" -- the same honest-not-
   * precise proxy `byStatus` already uses below, until the lifecycle
   * records a real state-entry timestamp. Read in application code rather
   * than the query itself: the threshold is per-work-order
   * (`expectedDurationMinutes`), so there is no single interval Postgres
   * can filter by without a generated column.
   */
  private async slaOverruns(workOrderWhere: WorkOrderWhere, now: Date): Promise<AttentionItem[]> {
    const candidates = await this.prisma.workOrder.findMany({
      where: { ...workOrderWhere, status: "IN_PROGRESS", expectedDurationMinutes: { not: null } },
      select: { ...WORK_ORDER_SUMMARY, updatedAt: true, expectedDurationMinutes: true },
    });

    return candidates
      .filter((row) => {
        const elapsedMinutes = (now.getTime() - row.updatedAt.getTime()) / 60_000;
        return elapsedMinutes > (row.expectedDurationMinutes ?? Infinity);
      })
      .map((row) =>
        this.toItem(
          { id: row.id, workOrder: row, waitingSince: row.updatedAt },
          "SLA_OVERRUN",
          row.updatedAt,
          "REVIEW_OVERRUN",
          now,
        ),
      );
  }

  private async readyButUnpaid(workOrderWhere: WorkOrderWhere): Promise<AttentionItem[]> {
    const rows = await this.prisma.invoice.findMany({
      where: { balance: { gt: 0 }, workOrder: { ...workOrderWhere, status: "READY_FOR_DELIVERY" } },
      select: { id: true, issuedAt: true, workOrder: { select: WORK_ORDER_SUMMARY } },
    });

    return rows.map((row) =>
      this.toItem(
        { id: row.id, workOrder: row.workOrder, waitingSince: row.issuedAt },
        "READY_UNPAID",
        row.issuedAt,
        "TAKE_PAYMENT",
      ),
    );
  }

  private async byStatus(workOrderWhere: WorkOrderWhere, status: "WAITING_PARTS" | "QC_FAILED") {
    const rows = await this.prisma.workOrder.findMany({
      where: { ...workOrderWhere, status },
      select: { ...WORK_ORDER_SUMMARY, updatedAt: true },
    });

    // updatedAt is the best available proxy for "since it entered this
    // state". A dedicated statusChangedAt column would be exact; until the
    // lifecycle records one, this is honest rather than precise.
    return rows.map((row) => ({ id: row.id, workOrder: row, waitingSince: row.updatedAt }));
  }

  private toItem(
    source: { id: string; workOrder: WorkOrderSummary; waitingSince: Date },
    kind: AttentionKind,
    waitingSince: Date,
    primaryAction: PrimaryAction,
    now: Date = new Date(),
  ): AttentionItem {
    const rank = rankAttentionItem({ kind, waitingSince }, now);

    return {
      id: `${kind}:${source.id}`,
      kind,
      workOrderId: source.workOrder.id,
      identifier: source.workOrder.asset.plateNumber ?? source.workOrder.asset.serialNumber,
      customerName: source.workOrder.customer.fullName,
      branchId: source.workOrder.branchId,
      reason: attentionReason(kind, rank.waitingHours),
      waitingSince,
      rank,
      primaryAction,
    };
  }
}

/**
 * Exactly what a queue row needs and nothing more. No prices, no internal
 * notes, no cost -- a row the manager scans should not carry data they did
 * not ask for, and absent beats hidden.
 */
const WORK_ORDER_SUMMARY = {
  id: true,
  branchId: true,
  asset: { select: { plateNumber: true, serialNumber: true } },
  customer: { select: { fullName: true } },
} as const;

interface WorkOrderSummary {
  id: string;
  branchId: string;
  asset: { plateNumber: string | null; serialNumber: string | null };
  customer: { fullName: string };
}

interface WorkOrderWhere {
  tenantId: string;
  branchId?: { in: string[] };
}
