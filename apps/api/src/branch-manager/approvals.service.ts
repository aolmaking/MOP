import { Injectable } from "@nestjs/common";
import type { Prisma } from "@mop/database";
import { PrismaService } from "../database/prisma.service";

export interface ApprovalRow {
  readonly requestId: string;
  readonly workOrderId: string;
  readonly identifier: string | null;
  readonly customerName: string;
  readonly customerPhone: string;
  readonly status: string;
  /**
   * From when the customer was ASKED, not when the request was drafted.
   * An unsent request is the branch's own delay, and charging it to the
   * customer would hide our failure inside theirs.
   */
  readonly waitingHours: number;
  readonly sent: boolean;
  readonly itemCount: number;
  readonly decidedCount: number;
  /** Money is a string across the API, always. */
  readonly pendingTotal: string;
  readonly hasCritical: boolean;
}

export interface ApprovalsResult {
  /** Sent and still unanswered -- the chase list. */
  readonly waiting: readonly ApprovalRow[];
  /**
   * Drafted but never sent. Separated because these are OUR delay, not
   * the customer's, and the action is different: send it, don't chase.
   */
  readonly unsent: readonly ApprovalRow[];
}

const OPEN_STATUSES = ["PENDING", "SENT", "VIEWED", "PARTIALLY_RESPONDED"] as const;

/**
 * "Who do I need to chase?"
 *
 * Its own page rather than a filter, because chasing is a batch activity
 * -- a manager does it in one sitting, working down a list with a phone
 * in their hand. Ordered oldest first for the same reason: the list is
 * worked top to bottom, so the order has to be the order you should act.
 */
@Injectable()
export class ApprovalsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(scope: { tenantId: string; branchScope: readonly string[] }): Promise<ApprovalsResult> {
    const rows = await this.prisma.customerDecisionRequest.findMany({
      where: {
        tenantId: scope.tenantId,
        status: { in: [...OPEN_STATUSES] },
        workOrder: scope.branchScope.length > 0 ? { branchId: { in: [...scope.branchScope] } } : {},
      },
      select: {
        id: true,
        status: true,
        sentAt: true,
        createdAt: true,
        workOrder: {
          select: {
            id: true,
            asset: { select: { plateNumber: true, serialNumber: true } },
            customer: { select: { fullName: true, phone: true } },
          },
        },
        items: { select: { id: true, decision: true, importance: true, total: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const now = Date.now();

    const mapped: ApprovalRow[] = rows.map((row) => {
      const pending = row.items.filter((item) => item.decision === "PENDING");
      const since = row.sentAt ?? row.createdAt;

      return {
        requestId: row.id,
        workOrderId: row.workOrder.id,
        identifier: row.workOrder.asset.plateNumber ?? row.workOrder.asset.serialNumber,
        customerName: row.workOrder.customer.fullName,
        customerPhone: row.workOrder.customer.phone,
        status: row.status,
        waitingHours: (now - since.getTime()) / 3_600_000,
        sent: row.sentAt !== null,
        itemCount: row.items.length,
        decidedCount: row.items.length - pending.length,
        pendingTotal: sumMoney(pending.map((item) => item.total)),
        hasCritical: pending.some((item) => item.importance === "CRITICAL"),
      };
    });

    return {
      waiting: mapped.filter((row) => row.sent),
      unsent: mapped.filter((row) => !row.sent),
    };
  }
}

/**
 * Sums money without ever going through a JS number.
 *
 * `Decimal.add` is exact; `Number(d.toString())` is not, and at invoice
 * scale the difference eventually shows up as a customer being charged a
 * cent they do not owe. Seeded from the first real Decimal rather than a
 * constructed zero so no Prisma runtime import is needed here -- the
 * generated client lives at a custom path and importing it for a zero
 * would drag the whole client into this module.
 */
function sumMoney(values: readonly Prisma.Decimal[]): string {
  if (values.length === 0) return "0.00";
  const total = values.slice(1).reduce((sum, value) => sum.add(value), values[0]);
  return total.toFixed(2);
}
