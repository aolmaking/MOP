import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PART_REQUEST_GRAPH, canTransition, isCapabilityActive } from "@mop/shared";
import type { Prisma, PartRequestStatus } from "@mop/database";
import { PrismaService } from "../database/prisma.service";
import { CapabilityResolutionService } from "../capabilities/capability-resolution.service";
import { OperationEventsService } from "../operations/operation-events.service";
import type { LifecycleActor } from "../operations/work-order-lifecycle.service";
import { StockService } from "./stock.service";

export interface RequestPartInput {
  readonly tenantId: string;
  readonly workOrderId: string;
  readonly inventoryItemId: string;
  readonly quantity: number;
  readonly taskId?: string;
  readonly reason?: string;
  readonly urgency?: string;
}

export interface IssueInput {
  readonly partRequestId: string;
  readonly warehouseId: string;
  /** May be less than what remains outstanding -- that is the point. */
  readonly quantity: number;
}

export interface Fulfilment {
  readonly requested: number;
  readonly issued: number;
  readonly outstanding: number;
}

/**
 * The part request lifecycle.
 *
 * Two rules shape everything here.
 *
 * **The graph decides, not this service.** Every status change is checked
 * against PART_REQUEST_GRAPH through the capability profile, exactly as
 * WorkOrderLifecycleService does for work orders. A workshop without
 * PART_RETURNS has no return edges, so a return is not "hidden" here --
 * it does not exist, and asking for one is refused by the router rather
 * than by an `if` somebody has to remember to write.
 *
 * **Stock moves in the same transaction as the issue.** A part cannot be
 * handed over without the balance moving with it. Splitting those two
 * writes is how a store ends up with paperwork that says a part left and
 * a shelf that still has it.
 */
@Injectable()
export class PartRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilities: CapabilityResolutionService,
    private readonly stock: StockService,
    private readonly events: OperationEventsService,
  ) {}

  /**
   * A technician asks for a part.
   *
   * Refused outright when the workshop has no inventory: PART_REQUEST_GRAPH
   * declares `requires: ["INVENTORY"]`, so the entity is never created
   * rather than created and then stranded. That distinction is the whole
   * reason the graph carries a `requires` at entity level.
   */
  async request(input: RequestPartInput, actor: LifecycleActor): Promise<{ id: string; status: PartRequestStatus }> {
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new BadRequestException({ code: "quantity_invalid", message: "Ask for a whole number, at least one." });
    }

    await this.requireInventory(input.tenantId);

    const created = await this.prisma.$transaction(async (tx) => {
      const request = await tx.partRequest.create({
        data: {
          tenantId: input.tenantId,
          workOrderId: input.workOrderId,
          taskId: input.taskId,
          inventoryItemId: input.inventoryItemId,
          requestedById: actor.accountId,
          quantity: input.quantity,
          reason: input.reason,
          urgency: input.urgency ?? "normal",
          // Straight to REQUESTED: a draft nobody submitted helps nobody,
          // and the technician pressed a button that means "I need this".
          status: "REQUESTED",
        },
        select: { id: true, status: true },
      });

      await this.emit(tx, input.tenantId, "part_request.created", request.id, actor, {
        workOrderId: input.workOrderId,
        inventoryItemId: input.inventoryItemId,
        quantity: input.quantity,
      });

      return request;
    });

    return created;
  }

  async approve(partRequestId: string, actor: LifecycleActor) {
    return this.move(partRequestId, "APPROVED", actor);
  }

  async reject(partRequestId: string, actor: LifecycleActor, reason?: string) {
    return this.move(partRequestId, "REJECTED", actor, { reason });
  }

  async markUnavailable(partRequestId: string, actor: LifecycleActor) {
    return this.move(partRequestId, "UNAVAILABLE", actor);
  }

  /**
   * Hand a part over, and move the stock with it.
   *
   * Partial by design (SCENARIOS.md 3.5): issuing less than what is
   * outstanding leaves the request where it is, so the remainder can be
   * issued later against the same request. The status only advances to
   * ISSUED once the request is fully covered -- a request that is half
   * filled has not been filled.
   */
  async issue(input: IssueInput, actor: LifecycleActor): Promise<Fulfilment> {
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new BadRequestException({ code: "quantity_invalid", message: "Issue a whole number, at least one." });
    }

    const request = await this.load(input.partRequestId);
    await this.requireInventory(request.tenantId);

    if (!["APPROVED", "ISSUED"].includes(request.status)) {
      throw new ConflictException({
        code: "not_issuable",
        message: `A request in ${request.status.toLowerCase().replace(/_/g, " ")} cannot be issued.`,
      });
    }

    const before = await this.fulfilment(input.partRequestId);
    if (input.quantity > before.outstanding) {
      // Refused rather than trimmed. Issuing four against a request for
      // three means somebody miscounted, and quietly issuing three would
      // hide it while the fourth walks out of the store.
      throw new BadRequestException({
        code: "over_issue",
        message: `Only ${before.outstanding} of ${before.requested} still outstanding.`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.issuedItem.create({
        data: {
          tenantId: request.tenantId,
          partRequestId: input.partRequestId,
          warehouseId: input.warehouseId,
          quantity: input.quantity,
          issuedById: actor.accountId,
        },
      });

      // Same transaction, deliberately. Paperwork and shelf move together
      // or neither moves.
      await this.stock.record(
        {
          tenantId: request.tenantId,
          inventoryItemId: request.inventoryItemId,
          warehouseId: input.warehouseId,
          type: "ISSUE",
          quantity: input.quantity,
          actorId: actor.accountId,
          referenceType: "PartRequest",
          referenceId: input.partRequestId,
        },
        tx,
      );

      const nowIssued = before.issued + input.quantity;
      if (nowIssued >= before.requested && request.status !== "ISSUED") {
        await this.transition(tx, request, "ISSUED", actor);
      }

      await this.emit(tx, request.tenantId, "part_request.issued", input.partRequestId, actor, {
        quantity: input.quantity,
        warehouseId: input.warehouseId,
        fullyIssued: nowIssued >= before.requested,
      });
    });

    return this.fulfilment(input.partRequestId);
  }

  async markArrived(partRequestId: string, actor: LifecycleActor) {
    return this.move(partRequestId, "ARRIVED", actor);
  }

  async receive(partRequestId: string, actor: LifecycleActor) {
    return this.move(partRequestId, "RECEIVED_BY_TECHNICIAN", actor);
  }

  async markUsed(partRequestId: string, actor: LifecycleActor) {
    return this.move(partRequestId, "USED", actor);
  }

  // --- returns (7.D) -------------------------------------------------

  /**
   * A technician sends a part back.
   *
   * Refused when PART_RETURNS is off -- and refused BY THE GRAPH, which
   * simply has no edge there. The part can still be used; only the return
   * path disappears. That is the capability model doing its job rather
   * than a feature flag hiding a button.
   */
  async requestReturn(partRequestId: string, actor: LifecycleActor, reason?: string) {
    return this.move(partRequestId, "RETURN_REQUESTED", actor, { reason });
  }

  async acceptReturn(partRequestId: string, actor: LifecycleActor) {
    return this.move(partRequestId, "RETURN_ACCEPTED", actor);
  }

  /**
   * The part physically comes back.
   *
   * `damaged` decides which bucket it lands in, and the two are not the
   * same event: sellable stock going up is a different claim about the
   * world from a damaged count going up (SCENARIOS.md 3.3). Damaged stock
   * never becomes sellable, here or anywhere.
   */
  async completeReturn(
    partRequestId: string,
    warehouseId: string,
    quantity: number,
    actor: LifecycleActor,
    options: { damaged?: boolean } = {},
  ) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException({ code: "quantity_invalid", message: "Return a whole number, at least one." });
    }

    const request = await this.load(partRequestId);
    await this.requireInventory(request.tenantId);

    const issued = await this.fulfilment(partRequestId);
    if (quantity > issued.issued) {
      throw new BadRequestException({
        code: "over_return",
        message: `Only ${issued.issued} were issued; ${quantity} cannot come back.`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await this.stock.record(
        {
          tenantId: request.tenantId,
          inventoryItemId: request.inventoryItemId,
          warehouseId,
          type: options.damaged ? "DAMAGED" : "RETURN_TO_STOCK",
          quantity,
          actorId: actor.accountId,
          referenceType: "PartRequest",
          referenceId: partRequestId,
        },
        tx,
      );

      await this.transition(tx, request, "RETURNED_TO_STOCK", actor);

      await this.emit(tx, request.tenantId, "part_request.returned", partRequestId, actor, {
        quantity,
        warehouseId,
        damaged: options.damaged ?? false,
      });
    });
  }

  // --- reads ---------------------------------------------------------

  /**
   * Requested versus actually handed over.
   *
   * Computed every time, never stored. A cached total is a second source
   * of truth and the two will eventually disagree (PHASE_7.md section 2).
   */
  async fulfilment(partRequestId: string): Promise<Fulfilment> {
    const request = await this.prisma.partRequest.findUnique({
      where: { id: partRequestId },
      select: { quantity: true },
    });
    if (!request) throw new NotFoundException({ code: "part_request_not_found", message: "Request not found." });

    const sum = await this.prisma.issuedItem.aggregate({
      where: { partRequestId },
      _sum: { quantity: true },
    });
    const issued = sum._sum.quantity ?? 0;

    return { requested: request.quantity, issued, outstanding: request.quantity - issued };
  }

  // --- internals -----------------------------------------------------

  private async load(id: string) {
    const request = await this.prisma.partRequest.findUnique({
      where: { id },
      select: { id: true, tenantId: true, status: true, inventoryItemId: true, workOrderId: true },
    });
    if (!request) throw new NotFoundException({ code: "part_request_not_found", message: "Request not found." });
    return request;
  }

  private async requireInventory(tenantId: string): Promise<void> {
    const profile = await this.capabilities.resolveCurrent(tenantId);
    // isCapabilityActive, not `!== "ENABLED"`. A profile lists deviations,
    // so an absent key means enabled -- reading it the other way tells a
    // freshly-provisioned workshop it has no inventory.
    if (!isCapabilityActive(profile, "INVENTORY")) {
      throw new ForbiddenException({
        code: "inventory_disabled",
        message: "This workshop does not hold stock, so parts are not requested through it.",
      });
    }
  }

  private async move(
    id: string,
    to: PartRequestStatus,
    actor: LifecycleActor,
    payload: Record<string, unknown> = {},
  ) {
    const request = await this.load(id);
    await this.requireInventory(request.tenantId);

    await this.prisma.$transaction(async (tx) => {
      await this.transition(tx, request, to, actor);
      await this.emit(tx, request.tenantId, `part_request.${to.toLowerCase()}`, id, actor, payload);
    });

    return { id, status: to };
  }

  /**
   * The single place a PartRequest status changes.
   *
   * Asks the graph under this workshop's capability profile. A transition
   * the profile has removed is refused here rather than anywhere else,
   * which is what stops "returns are off" from becoming a hidden button
   * instead of an absent edge.
   */
  private async transition(
    tx: Prisma.TransactionClient,
    request: { id: string; tenantId: string; status: PartRequestStatus },
    to: PartRequestStatus,
    actor: LifecycleActor,
  ): Promise<void> {
    const profile = await this.capabilities.resolveCurrent(request.tenantId);

    if (!canTransition(PART_REQUEST_GRAPH, profile, request.status, to)) {
      throw new ConflictException({
        code: "transition_not_allowed",
        message: `A part request cannot go from ${label(request.status)} to ${label(to)} in this workshop.`,
      });
    }

    await tx.partRequest.update({ where: { id: request.id }, data: { status: to } });
    request.status = to;
    void actor;
  }

  private async emit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    eventKey: string,
    targetId: string,
    actor: LifecycleActor,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.events.emit(
      {
        tenantId,
        eventKey,
        actorId: actor.accountId,
        actorName: actor.displayName,
        actorType: actor.actorType,
        targetType: "PartRequest",
        targetId,
        riskLevel: "LOW",
        payload,
      },
      tx,
    );
  }
}

function label(status: string): string {
  return status.toLowerCase().replace(/_/g, " ");
}
