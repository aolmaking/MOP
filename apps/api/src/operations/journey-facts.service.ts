import { Injectable } from "@nestjs/common";
import { outstanding, sum } from "@mop/shared";
import { PrismaService } from "../runtime/database/prisma.service";

/**
 * One fact about a stage, already reduced to words.
 *
 * `value` is a string because everything here ends up on a screen and
 * because money must never become a JS number on the way. A count is
 * stringified at the edge rather than carried as a number and formatted
 * three different ways by three different views.
 */
export interface StageFact {
  readonly label: string;
  readonly value: string;
}

/**
 * Everything true about this job that a journey stage might need to
 * describe itself, gathered once.
 *
 * Deliberately ONE read per work order rather than a query per stage:
 * the manager's board draws a strip per row, and a per-stage query would
 * turn one screen into dozens of round trips.
 */
export interface JourneyFacts {
  readonly inspectionCount: number;
  readonly faultCount: number;

  readonly decisionsTotal: number;
  readonly decisionsAnswered: number;
  readonly decisionsApproved: number;
  readonly decisionsRejected: number;
  readonly decisionsOpen: number;
  /** Oldest unanswered ask, for "waiting since". */
  readonly decisionWaitingSince: string | null;

  readonly tasksTotal: number;
  readonly tasksDone: number;
  /** Who is actually on it, for the roles allowed to know. */
  readonly technicianNames: readonly string[];

  readonly partsOutstanding: readonly {
    readonly name: string;
    readonly quantity: number;
    readonly issued: number;
    readonly status: string;
    readonly warehouse: string | null;
    readonly requestedAt: string;
  }[];
  readonly partsUsed: number;

  readonly blockers: readonly { readonly reason: string; readonly note: string | null; readonly since: string }[];

  readonly invoice: {
    readonly number: string;
    readonly total: string;
    readonly paid: string;
    readonly outstanding: string;
    readonly settled: boolean;
  } | null;
  /** What the job would bill if invoiced now. Null once invoiced. */
  readonly runningTotal: string | null;
}

/**
 * The facts behind the journey.
 *
 * Separate from `WorkflowJourneyService` because they answer different
 * questions: that service decides WHICH stages exist and where the job
 * is, from the graph; this one says what is actually true at each of
 * them, from the records. Keeping them apart is what stops the graph
 * projection quietly growing a dependency on inventory or finance.
 *
 * Nothing here decides what a role may SEE -- that is the presenter's
 * job. This gathers; the presenter redacts.
 */
@Injectable()
export class JourneyFactsService {
  constructor(private readonly prisma: PrismaService) {}

  async gather(tenantId: string, workOrderId: string): Promise<JourneyFacts> {
    const [inspectionCount, faultCount, decisions, tasks, partRequests, blockers, invoice, running] =
      await Promise.all([
        this.prisma.inspection.count({ where: { workOrderId } }),
        this.prisma.fault.count({ where: { workOrderId } }),
        this.prisma.customerDecisionRequest.findMany({
          where: { tenantId, workOrderId, status: { not: "CANCELLED" } },
          select: {
            status: true,
            sentAt: true,
            createdAt: true,
            items: { select: { decision: true } },
          },
        }),
        this.prisma.task.findMany({
          where: { tenantId, workOrderId },
          select: {
            status: true,
            assignments: { select: { staffUser: { select: { fullName: true } } } },
          },
        }),
        this.prisma.partRequest.findMany({
          where: { tenantId, workOrderId },
          select: {
            status: true,
            quantity: true,
            createdAt: true,
            inventoryItem: { select: { name: true } },
            issuedItems: { select: { quantity: true, warehouse: { select: { name: true } } } },
          },
          orderBy: { createdAt: "asc" },
        }),
        this.prisma.taskBlocker.findMany({
          where: { tenantId, task: { workOrderId }, status: { in: ["OPEN", "ESCALATED"] } },
          select: { reason: true, note: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        }),
        this.prisma.invoice.findUnique({
          where: { workOrderId },
          select: { invoiceNumber: true, total: true, payments: { select: { amount: true } } },
        }),
        this.prisma.runningInvoice.findUnique({
          where: { workOrderId },
          select: { lines: { select: { total: true } } },
        }),
      ]);

    const items = decisions.flatMap((request) => request.items);
    const open = decisions.filter((request) => !["RESOLVED", "EXPIRED"].includes(request.status));

    // money-lint-ok: counts of physical objects and records, not currency.
    const partsUsed = partRequests.filter((request) => request.status === "USED").length;

    const settledStatuses = ["USED", "RETURNED_TO_STOCK", "REJECTED", "UNAVAILABLE", "CANCELLED"];

    return {
      inspectionCount,
      faultCount,

      decisionsTotal: items.length,
      decisionsAnswered: items.filter((item) => item.decision !== "PENDING").length,
      decisionsApproved: items.filter((item) => item.decision === "APPROVED").length,
      decisionsRejected: items.filter((item) => item.decision === "REJECTED").length,
      decisionsOpen: open.length,
      // The clock starts when the customer was ASKED, not when the
      // request was drafted -- an unsent ask is the branch's own delay,
      // and charging it to the customer hides our failure as theirs.
      decisionWaitingSince: open.length > 0 ? (open[0].sentAt ?? open[0].createdAt).toISOString() : null,

      tasksTotal: tasks.length,
      tasksDone: tasks.filter((task) => task.status === "DONE").length,
      technicianNames: [
        ...new Set(
          tasks.flatMap((task) => task.assignments.map((assignment) => assignment.staffUser?.fullName ?? null)),
        ),
      ].filter((name): name is string => name !== null),

      partsOutstanding: partRequests
        .filter((request) => !settledStatuses.includes(request.status))
        .map((request) => ({
          name: request.inventoryItem.name,
          quantity: request.quantity,
          // money-lint-ok: a count of physical objects.
          issued: request.issuedItems.reduce((total, issue) => total + issue.quantity, 0),
          status: request.status,
          warehouse: request.issuedItems[0]?.warehouse?.name ?? null,
          requestedAt: request.createdAt.toISOString(),
        })),
      partsUsed,

      blockers: blockers.map((blocker) => ({
        reason: blocker.reason,
        note: blocker.note,
        since: blocker.createdAt.toISOString(),
      })),

      invoice: invoice
        ? (() => {
            const total = invoice.total.toFixed(2);
            // Derived from payment rows, never a cached column -- the
            // same rule FinanceService.settlement() follows, because the
            // strip must not be able to disagree with the counter.
            const paid = sum(invoice.payments.map((payment) => payment.amount.toFixed(2)));
            const due = outstanding(total, paid);
            return {
              number: invoice.invoiceNumber,
              total,
              paid,
              outstanding: due,
              settled: due === "0.00",
            };
          })()
        : null,

      runningTotal: invoice ? null : running ? sum(running.lines.map((line) => line.total.toFixed(2))) : null,
    };
  }
}
