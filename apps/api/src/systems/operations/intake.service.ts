import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { WORK_ORDER_GRAPH } from "@mop/shared";
import type { CategoryCode, Prisma, WorkOrderStatus } from "@mop/database";
import { PrismaService } from "../../runtime/database/prisma.service";
import { OperationEventsService } from "./operation-events.service";
import { WorkOrderLifecycleService, type LifecycleActor } from "./work-order-lifecycle.service";

export interface CustomerInput {
  readonly existingCustomerId?: string;
  readonly fullName?: string;
  readonly phone?: string;
  readonly email?: string;
}

export interface AssetInput {
  readonly existingAssetId?: string;
  readonly category?: CategoryCode;
  readonly plateNumber?: string;
  readonly vinOrChassisNumber?: string;
  readonly serialNumber?: string;
}

export interface IntakeInput {
  readonly tenantId: string;
  readonly branchId: string;
  readonly customer: CustomerInput;
  readonly asset: AssetInput;
  readonly complaint?: string;
  /**
   * The customer declined inspection and asked for a named service. Stored
   * on the work order so the Finish Gate does not later block the job for
   * a step the customer refused (SCENARIOS.md 1.2).
   */
  readonly inspectionDeclined?: boolean;
  readonly assignToStaffUserId?: string;
  /**
   * Required when the asset's current owner differs from the person
   * bringing it in. Never inferred: transferring ownership silently would
   * hand one customer another's vehicle history.
   */
  readonly confirmOwnershipTransfer?: boolean;
  /**
   * Required when a NEW customer is being described (no
   * `existingCustomerId`) and that phone number already belongs to
   * another customer in this tenant. Same shape as
   * `confirmOwnershipTransfer`: refuse first, act only once a human has
   * been shown the ambiguity and confirmed which one they mean
   * (P-80, docs/POLICY_DECISION_INVENTORY.md §8.B) -- a phone match is
   * not proof of identity (a shared household phone is real), so this
   * never silently reuses or silently duplicates.
   */
  readonly confirmNewCustomerDespitePhoneMatch?: boolean;
}

export interface IntakeResult {
  readonly workOrderId: string;
  readonly customerId: string;
  readonly assetId: string;
  readonly status: WorkOrderStatus;
  readonly ownershipTransferred: boolean;
}

/**
 * Customer, asset, ownership and work order, created together or not at all.
 *
 * Everything here runs in one transaction because a half-finished intake
 * is worse than a failed one: a customer with no work order, or an asset
 * with no owner, is a record someone has to find and clean up by hand.
 *
 * Note what this service does NOT do: it never assigns a work-order
 * status. It creates the work order in the graph's declared initial state
 * and then asks WorkOrderLifecycleService to register it, so intake obeys
 * the same routing rules as every other step.
 */
@Injectable()
export class IntakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: OperationEventsService,
    private readonly lifecycle: WorkOrderLifecycleService,
  ) {}

  async intake(input: IntakeInput, actor: LifecycleActor): Promise<IntakeResult> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { id: true, plan: { select: { allowedCategories: true } } },
    });
    if (!tenant) throw new NotFoundException({ code: "tenant_not_found", message: "Workshop not found." });

    const branch = await this.prisma.branch.findFirst({
      where: { id: input.branchId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!branch) {
      throw new BadRequestException({ code: "branch_not_found", message: "That branch does not belong to this workshop." });
    }

    const { workOrderId, customerId, assetId, ownershipTransferred } = await this.prisma.$transaction(async (tx) => {
      const customerId = await this.resolveCustomer(tx, input);
      const { assetId, transferred } = await this.resolveAsset(tx, input, customerId, tenant.plan.allowedCategories);

      const workOrder = await tx.workOrder.create({
        data: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          customerId,
          assetId,
          // The graph's own starting point, not a literal -- even intake
          // does not get to decide what "new" means.
          status: WORK_ORDER_GRAPH.initial as WorkOrderStatus,
          inspectionDeclined: input.inspectionDeclined ?? false,
        },
        select: { id: true },
      });

      if (input.assignToStaffUserId) {
        await tx.workOrderAssignment.create({
          data: { tenantId: input.tenantId, workOrderId: workOrder.id, staffUserId: input.assignToStaffUserId },
        });
      }

      await this.events.emit(
        {
          tenantId: input.tenantId,
          eventKey: "work_order.created",
          actorId: actor.accountId,
          actorName: actor.displayName,
          actorType: actor.actorType,
          targetType: "WorkOrder",
          targetId: workOrder.id,
          riskLevel: "LOW",
          payload: {
            workOrderId: workOrder.id,
            customerId,
            assetId,
            branchId: input.branchId,
            complaint: input.complaint ?? null,
            inspectionDeclined: input.inspectionDeclined ?? false,
          },
          // The customer is told their vehicle was booked in -- through
          // the safe projection, never with raw internal text.
          customer: { customerId, workOrderId: workOrder.id },
        },
        tx,
      );

      return { workOrderId: workOrder.id, customerId, assetId, ownershipTransferred: transferred };
    });

    // Outside the transaction on purpose: the lifecycle service owns
    // status changes and runs its own transaction. Intake's job is to
    // create the records; moving the work order is the lifecycle's.
    const registered = await this.lifecycle.apply(workOrderId, "REGISTER", actor, { reason: input.complaint });

    return { workOrderId, customerId, assetId, status: registered.to, ownershipTransferred };
  }

  private async resolveCustomer(tx: Prisma.TransactionClient, input: IntakeInput): Promise<string> {
    if (input.customer.existingCustomerId) {
      const existing = await tx.customer.findFirst({
        where: { id: input.customer.existingCustomerId, tenantId: input.tenantId },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundException({ code: "customer_not_found", message: "That customer does not belong to this workshop." });
      }
      return existing.id;
    }

    if (!input.customer.fullName || !input.customer.phone) {
      throw new BadRequestException({
        code: "customer_details_required",
        message: "A new customer needs a name and a phone number.",
      });
    }

    // A phone match is a strong signal, not proof -- refuse and name the
    // existing customer rather than silently reusing them (could be the
    // wrong person on a shared phone) or silently creating a duplicate
    // identity for someone who already exists (P-80).
    const phoneMatch = await tx.customer.findFirst({
      where: { tenantId: input.tenantId, phone: input.customer.phone },
      select: { id: true, fullName: true },
    });
    if (phoneMatch && !input.confirmNewCustomerDespitePhoneMatch) {
      throw new ConflictException({
        code: "phone_number_already_registered",
        message: `A customer named "${phoneMatch.fullName}" already uses this phone number. Select them, or confirm this is a different person.`,
        details: { existingCustomerId: phoneMatch.id, existingCustomerName: phoneMatch.fullName },
      });
    }

    const created = await tx.customer.create({
      data: {
        tenantId: input.tenantId,
        fullName: input.customer.fullName,
        phone: input.customer.phone,
        email: input.customer.email,
      },
      select: { id: true },
    });
    return created.id;
  }

  private async resolveAsset(
    tx: Prisma.TransactionClient,
    input: IntakeInput,
    customerId: string,
    allowedCategories: readonly CategoryCode[],
  ): Promise<{ assetId: string; transferred: boolean }> {
    if (input.asset.existingAssetId) {
      const existing = await tx.asset.findFirst({
        where: { id: input.asset.existingAssetId, tenantId: input.tenantId },
        select: { id: true, currentOwnerCustomerId: true },
      });
      if (!existing) {
        throw new NotFoundException({ code: "asset_not_found", message: "That vehicle does not belong to this workshop." });
      }

      if (existing.currentOwnerCustomerId && existing.currentOwnerCustomerId !== customerId) {
        // Refused rather than inferred. Quietly reassigning would give the
        // new owner the previous owner's service history, which is a
        // privacy incident, not a data-entry convenience.
        if (!input.confirmOwnershipTransfer) {
          throw new ConflictException({
            code: "ownership_transfer_required",
            message: "This vehicle is registered to a different customer. Confirm the ownership transfer to continue.",
          });
        }
        await this.transferOwnership(tx, input.tenantId, existing.id, customerId);
        return { assetId: existing.id, transferred: true };
      }

      if (!existing.currentOwnerCustomerId) {
        await this.openOwnership(tx, input.tenantId, existing.id, customerId);
        return { assetId: existing.id, transferred: false };
      }

      return { assetId: existing.id, transferred: false };
    }

    if (!input.asset.category) {
      throw new BadRequestException({ code: "asset_category_required", message: "A new vehicle needs a category." });
    }

    // A workshop only accepts what its plan covers -- a car arriving at a
    // motorcycle-only workshop is refused with a reason rather than
    // silently accepted and then unserviceable (SCENARIOS.md 2.4).
    if (allowedCategories.length > 0 && !allowedCategories.includes(input.asset.category)) {
      throw new BadRequestException({
        code: "category_not_serviced",
        message: "This workshop does not service that category of vehicle.",
      });
    }

    const created = await tx.asset.create({
      data: {
        tenantId: input.tenantId,
        category: input.asset.category,
        plateNumber: input.asset.plateNumber,
        vinOrChassisNumber: input.asset.vinOrChassisNumber,
        serialNumber: input.asset.serialNumber,
        currentOwnerCustomerId: customerId,
      },
      select: { id: true },
    });

    await this.openOwnership(tx, input.tenantId, created.id, customerId);
    return { assetId: created.id, transferred: false };
  }

  /**
   * Closes the previous ownership period and opens a new one. The closed
   * row is what lets a new owner see technical history while the previous
   * owner's financial records stay theirs.
   */
  private async transferOwnership(
    tx: Prisma.TransactionClient,
    tenantId: string,
    assetId: string,
    newOwnerId: string,
  ): Promise<void> {
    await tx.assetOwnershipHistory.updateMany({
      where: { assetId, endedAt: null },
      data: { endedAt: new Date() },
    });
    await this.openOwnership(tx, tenantId, assetId, newOwnerId);
    await tx.asset.update({ where: { id: assetId }, data: { currentOwnerCustomerId: newOwnerId } });
  }

  private async openOwnership(
    tx: Prisma.TransactionClient,
    tenantId: string,
    assetId: string,
    customerId: string,
  ): Promise<void> {
    await tx.assetOwnershipHistory.create({ data: { tenantId, assetId, customerId } });
  }
}
