import { Injectable } from "@nestjs/common";
import type { ChargeableWorkItem } from "@mop/shared";
import { PrismaService } from "../../runtime/database/prisma.service";

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
   * Every extra the customer actually APPROVED.
   *
   * The third producer, and the one that closes a real money hole: a
   * customer approving "Front brake discs, 2800.00" produced no charge
   * at all, because only tasks and parts were ever collected. The
   * workshop did the work it was told to do and billed nothing for it.
   *
   * **The price is the one the customer agreed to**, snapshotted onto
   * the decision item when the request was raised. That is the whole
   * point of `CustomerDecisionItem.price` existing rather than the
   * catalogue being consulted again later: an approval is a contract
   * about a number, and re-pricing it afterwards would change what
   * somebody consented to.
   *
   * REJECTED and PENDING items produce nothing. Only work the customer
   * said yes to is billable, which is the entire reason the approval
   * loop exists.
   */
  async approvedDecisionItems(tenantId: string, workOrderId: string): Promise<readonly ChargeableWorkItem[]> {
    const [workOrder, items] = await Promise.all([
      this.prisma.workOrder.findFirst({
        where: { id: workOrderId, tenantId },
        select: { branchId: true, assetId: true, customerId: true },
      }),
      this.prisma.customerDecisionItem.findMany({
        where: {
          tenantId,
          decision: "APPROVED",
          decisionRequest: { workOrderId, status: { notIn: ["CANCELLED"] } },
        },
        select: { id: true, name: true, price: true, laborPrice: true, decidedAt: true },
        orderBy: { decidedAt: "asc" },
      }),
    ]);

    if (!workOrder) return [];

    return items.map((item) => ({
      tenantId,
      branchId: workOrder.branchId,
      workOrderId,
      taskId: null,
      assetId: workOrder.assetId,
      customerId: workOrder.customerId,
      itemType: "SERVICE" as const,
      itemName: item.name,
      quantity: 1,
      provenance: "NOT_APPLICABLE" as const,
      inventoryItemId: null,
      sourceType: "MANUAL" as const,
      sourceId: item.id,
      requiresCustomerApproval: true,
      approvalStatus: "APPROVED" as const,
      // Money as a string, always -- and this one is a promise already
      // made to a customer, not a lookup.
      approvedUnitPrice: item.price.toFixed(2),
      approvedLabourPrice: item.laborPrice.toFixed(2),
      addedAt: (item.decidedAt ?? new Date()).toISOString(),
    }));
  }

  /**
   * Every catalogued service actually performed on this job.
   *
   * The other half of the chain the parts work opened up: a `Task`
   * carries a `serviceKey` naming a row in the workshop's Service
   * Catalog, and until this existed nothing turned a completed one into
   * a charge -- so a job whose only work was labour reached the counter
   * with "There is nothing on this job to invoice."
   *
   * **Only DONE tasks.** Work in progress is not yet a charge, and
   * billing it would let a job be invoiced for something abandoned
   * halfway. **Only tasks with a `serviceKey`** -- ad-hoc work with no
   * catalogue row has no price this service could honestly claim, and
   * inventing one is worse than leaving it to be added by hand.
   *
   * `approvedUnitPrice` is deliberately NULL: Operations states that
   * something is billable and never what it costs. Finance resolves the
   * price from the catalogue, per the contract's own rule.
   */
  async serviceItems(tenantId: string, workOrderId: string): Promise<readonly ChargeableWorkItem[]> {
    const [workOrder, tasks] = await Promise.all([
      this.prisma.workOrder.findFirst({
        where: { id: workOrderId, tenantId },
        select: { branchId: true, assetId: true, customerId: true },
      }),
      this.prisma.task.findMany({
        where: { workOrderId, tenantId, status: "DONE", serviceKey: { not: null } },
        select: { id: true, title: true, serviceKey: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    if (!workOrder) return [];

    return tasks.map((task) => ({
      tenantId,
      branchId: workOrder.branchId,
      workOrderId,
      taskId: task.id,
      assetId: workOrder.assetId,
      customerId: workOrder.customerId,
      itemType: "SERVICE" as const,
      // The catalogue key is the billable identity; the title is only
      // what somebody typed on the job card.
      itemName: task.serviceKey as string,
      quantity: 1,
      provenance: "NOT_APPLICABLE" as const,
      inventoryItemId: null,
      sourceType: "TASK" as const,
      sourceId: task.id,
      requiresCustomerApproval: false,
      approvalStatus: "NOT_REQUIRED" as const,
      // Operations never computes money.
      approvedUnitPrice: null,
      approvedLabourPrice: null,
      addedAt: task.createdAt.toISOString(),
    }));
  }

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
