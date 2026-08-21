import { Injectable, NotFoundException } from "@nestjs/common";
import { laneForStatus, openStatuses, type WorkOrderLane } from "@mop/shared";
import { PrismaService } from "../../runtime/database/prisma.service";

export interface BoardRow {
  readonly id: string;
  readonly status: string;
  readonly lane: WorkOrderLane | null;
  readonly identifier: string | null;
  readonly customerName: string;
  readonly branchId: string;
  /** Since it last moved. The board's only measure of "is this stuck". */
  readonly sinceHours: number;
  readonly assignedTo: string | null;
  /** Set when the customer refused inspection -- changes what may finish. */
  readonly inspectionDeclined: boolean;
}

export interface BoardLane {
  readonly key: WorkOrderLane;
  readonly rows: readonly BoardRow[];
}

export interface BoardResult {
  readonly lanes: readonly BoardLane[];
  readonly total: number;
  /**
   * Statuses present in the data that no lane claims. Surfaced rather than
   * swallowed: a job filed under no holder is invisible, and invisible
   * work is what this whole product exists to prevent.
   */
  readonly unlaned: readonly string[];
}

/** Enough rows to see the shape of a day; beyond this, search is the tool. */
const MAX_ROWS = 300;

@Injectable()
export class WorkOrderBoardService {
  constructor(private readonly prisma: PrismaService) {}

  async board(
    scope: { tenantId: string; branchScope: readonly string[] },
    options: { query?: string; includeFinished?: boolean } = {},
  ): Promise<BoardResult> {
    const query = options.query?.trim();

    const rows = await this.prisma.workOrder.findMany({
      where: {
        tenantId: scope.tenantId,
        ...(scope.branchScope.length > 0 ? { branchId: { in: [...scope.branchScope] } } : {}),
        ...(options.includeFinished ? {} : { status: { in: openStatuses() as never[] } }),
        ...(query
          ? {
              OR: [
                { asset: { plateNumber: { contains: query, mode: "insensitive" as const } } },
                { asset: { serialNumber: { contains: query, mode: "insensitive" as const } } },
                { customer: { fullName: { contains: query, mode: "insensitive" as const } } },
                { customer: { phone: { contains: query, mode: "insensitive" as const } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        status: true,
        branchId: true,
        updatedAt: true,
        inspectionDeclined: true,
        asset: { select: { plateNumber: true, serialNumber: true } },
        customer: { select: { fullName: true } },
        assignments: {
          take: 1,
          orderBy: { assignedAt: "desc" },
          select: { staffUser: { select: { fullName: true } } },
        },
      },
      orderBy: { updatedAt: "asc" },
      take: MAX_ROWS,
    });

    const now = Date.now();
    const mapped: BoardRow[] = rows.map((row) => ({
      id: row.id,
      status: row.status,
      lane: laneForStatus(row.status),
      identifier: row.asset.plateNumber ?? row.asset.serialNumber,
      customerName: row.customer.fullName,
      branchId: row.branchId,
      sinceHours: (now - row.updatedAt.getTime()) / 3_600_000,
      assignedTo: row.assignments[0]?.staffUser.fullName ?? null,
      inspectionDeclined: row.inspectionDeclined,
    }));

    const byLane = new Map<WorkOrderLane, BoardRow[]>();
    const unlaned = new Set<string>();

    for (const row of mapped) {
      if (!row.lane) {
        unlaned.add(row.status);
        continue;
      }
      const bucket = byLane.get(row.lane) ?? [];
      // Oldest first inside a lane: the manager's question within a
      // holder is always "what has been sitting here longest".
      bucket.push(row);
      byLane.set(row.lane, bucket);
    }

    const lanes: BoardLane[] = [...byLane.entries()].map(([key, laneRows]) => ({ key, rows: laneRows }));

    return { lanes, total: mapped.length, unlaned: [...unlaned] };
  }

  /**
   * Everything about one job. Deliberately assembled here rather than by
   * the page making six calls: the workspace is the destination of nearly
   * every click, and six round trips is six chances to render half a car.
   */
  async detail(scope: { tenantId: string; branchScope: readonly string[] }, workOrderId: string) {
    const workOrder = await this.prisma.workOrder.findFirst({
      where: {
        id: workOrderId,
        tenantId: scope.tenantId,
        ...(scope.branchScope.length > 0 ? { branchId: { in: [...scope.branchScope] } } : {}),
      },
      select: {
        id: true,
        status: true,
        branchId: true,
        createdAt: true,
        updatedAt: true,
        closedAt: true,
        inspectionDeclined: true,
        asset: { select: { id: true, category: true, plateNumber: true, serialNumber: true, vinOrChassisNumber: true } },
        customer: { select: { id: true, fullName: true, phone: true } },
        assignments: { select: { staffUser: { select: { fullName: true, role: true } } }, orderBy: { assignedAt: "desc" } },
        tasks: {
          select: {
            id: true,
            title: true,
            status: true,
            updatedAt: true,
            blockers: {
              where: { status: { in: ["OPEN", "ESCALATED"] } },
              select: { id: true, reason: true, note: true, createdAt: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        decisionRequests: {
          select: {
            id: true,
            status: true,
            sentAt: true,
            createdAt: true,
            items: {
              select: { id: true, name: true, importance: true, decision: true, warningAcknowledged: true, total: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    // Not found and out-of-scope are deliberately the same answer. A
    // different message would tell a scoped manager that a work order
    // exists in a branch they cannot see.
    if (!workOrder) {
      throw new NotFoundException({ code: "work_order_not_found", message: "That job is not in your branches." });
    }

    return {
      ...workOrder,
      lane: laneForStatus(workOrder.status),
      // Money crosses the API as a string -- a Decimal reaching the
      // browser as a JS number is a bug even when it looks right.
      decisionRequests: workOrder.decisionRequests.map((request) => ({
        ...request,
        items: request.items.map((item) => ({ ...item, total: item.total.toString() })),
      })),
    };
  }
}
