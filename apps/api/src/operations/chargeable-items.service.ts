import { Injectable } from "@nestjs/common";
import type { ChargeableWorkItem } from "@mop/shared";
import { PrismaService } from "../database/prisma.service";

/**
 * What Operations says is billable on a job.
 *
 * This service exists to close a real hole rather than to tidy an
 * abstraction. `WorkOrderPartLine` was read by the work-order dossier,
 * the finish gate and the parts-profitability report, and written by
 * nothing in production -- so a part a technician requested, the store
 * issued and the technician fitted never reached a bill. The workshop
 * paid for the customer's part.
 *
 * The shape it returns is `ChargeableWorkItem` from
 * `packages/shared/src/contracts/cross-system.ts`, which has carried a
 * `sourceType: "PART_REQUEST"` member since Phase 2 and had no producer.
 * That contract exists for a stated reason: without it Finance works out
 * what to bill by reading `Task` and `PartRequest` itself, and every
 * change to the work-order schema breaks invoicing.
 *
 * **Operations never computes money.** The prices below are passed
 * through exactly as they were snapshotted onto the part line when the
 * part left the store; nothing here adds, rounds or discounts. Finance
 * decides what a total is.
 */
@Injectable()
export class ChargeableItemsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every part fitted to this job, as chargeable items.
   *
   * Reads `WorkOrderPartLine` -- Operations' own table -- and nothing
   * from Finance. A part that was issued and then returned has already
   * had its line reduced or removed by `PartRequestService`, so a
   * returned part simply is not here.
   */
  async partItems(tenantId: string, workOrderId: string): Promise<readonly ChargeableWorkItem[]> {
    const [workOrder, lines] = await Promise.all([
      this.prisma.workOrder.findFirst({
        where: { id: workOrderId, tenantId },
        select: { branchId: true, assetId: true, customerId: true },
      }),
      this.prisma.workOrderPartLine.findMany({
        where: { workOrderId, tenantId },
        select: {
          id: true,
          taskId: true,
          provenance: true,
          inventoryItemId: true,
          name: true,
          quantity: true,
          sellingPrice: true,
          partRequestId: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    if (!workOrder) return [];

    return lines.map((line) => ({
      tenantId,
      branchId: workOrder.branchId,
      workOrderId,
      taskId: line.taskId,
      assetId: workOrder.assetId,
      customerId: workOrder.customerId,
      itemType: "PART" as const,
      itemName: line.name,
      quantity: line.quantity,
      provenance: line.provenance,
      inventoryItemId: line.inventoryItemId,
      // The part request is the better source when there is one: it is
      // the thing a person can open and read. The line's own id is the
      // fallback for a part added without an inventory request behind it.
      sourceType: line.partRequestId ? ("PART_REQUEST" as const) : ("MANUAL" as const),
      sourceId: line.partRequestId ?? line.id,
      // A part that reached this table was already agreed: either it was
      // approved through a customer decision or the workshop issued it
      // under its own authority. The approval question is asked and
      // answered upstream, on the decision, not re-litigated per line.
      requiresCustomerApproval: false,
      approvalStatus: "NOT_REQUIRED" as const,
      // Money as a string, always. Snapshotted at issue -- never the
      // catalogue's price today.
      approvedUnitPrice: line.sellingPrice.toFixed(2),
      approvedLabourPrice: null,
      addedAt: line.createdAt.toISOString(),
    }));
  }
}
