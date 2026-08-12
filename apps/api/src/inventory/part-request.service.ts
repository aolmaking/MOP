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

  // --- returns (7.D, Returns/Movements) -------------------------------

  /**
   * A technician sends a part back.
   *
   * Refused when PART_RETURNS is off -- and refused BY THE GRAPH, which
   * simply has no edge there. The part can still be used; only the return
   * path disappears. That is the capability model doing its job rather
   * than a feature flag hiding a button.
   *
   * Writes the `PartReturnRequest` row the Returns/Movements queue reads
   * from (previously left uncreated -- the model existed, nothing wrote
   * it) and records a RETURN_PENDING stock movement against the
   * warehouse the part was actually issued from, so the part is neither
   * sellable nor still "with the technician" for the whole time it is
   * in limbo between here and a decision.
   */
  async requestReturn(partRequestId: string, quantity: number, actor: LifecycleActor, reason?: string) {
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

    const warehouseId = await this.issuedWarehouseOf(partRequestId);

    await this.prisma.$transaction(async (tx) => {
      await tx.partReturnRequest.upsert({
        where: { partRequestId },
        create: { tenantId: request.tenantId, partRequestId, quantity, reason, requestedById: actor.accountId, warehouseId },
        // warehouseId is deliberately re-set here too: a second return
        // request against the same part request (e.g. after a rejection
        // was resolved and a new one raised) may have been issued from a
        // different warehouse the second time, and the RETURN_PENDING
        // reversal must always match whichever movement is actually open.
        update: { quantity, reason, resolvedAt: null, resolvedById: null, clarificationQuestion: null, warehouseId },
      });

      await this.stock.record(
        {
          tenantId: request.tenantId,
          inventoryItemId: request.inventoryItemId,
          warehouseId,
          type: "RETURN_PENDING",
          quantity,
          actorId: actor.accountId,
          referenceType: "PartRequest",
          referenceId: partRequestId,
        },
        tx,
      );

      await this.transition(tx, request, "RETURN_REQUESTED", actor);
      await this.emit(tx, request.tenantId, "part_request.return_requested", partRequestId, actor, {
        quantity,
        reason,
      });
    });

    return { id: partRequestId, status: "RETURN_REQUESTED" as const };
  }

  /**
   * The inventory manager asks a question instead of deciding yet.
   *
   * Deliberately does not touch stock -- the RETURN_PENDING movement
   * from `requestReturn` stands untouched through as many rounds of this
   * loop as it takes; asking a question is not itself a decision about
   * the part.
   */
  async requestClarification(partRequestId: string, actor: LifecycleActor, question: string) {
    if (!question.trim()) {
      throw new BadRequestException({ code: "question_required", message: "Say what you need to know." });
    }

    const request = await this.load(partRequestId);
    await this.requireInventory(request.tenantId);

    await this.prisma.$transaction(async (tx) => {
      await tx.partReturnRequest.update({ where: { partRequestId }, data: { clarificationQuestion: question } });
      await this.transition(tx, request, "RETURN_CLARIFICATION_REQUESTED", actor);
      await this.emit(tx, request.tenantId, "part_request.return_clarification_requested", partRequestId, actor, {
        question,
      });
    });

    return { id: partRequestId, status: "RETURN_CLARIFICATION_REQUESTED" as const };
  }

  /**
   * The technician answers. Loops back to RETURN_REQUESTED so the
   * manager's next move -- accept, reject, or ask again -- is the same
   * decision as a first-time request, per the spec's explicit "this loop
   * can repeat" note.
   */
  async respondToClarification(partRequestId: string, actor: LifecycleActor, response: string) {
    if (!response.trim()) {
      throw new BadRequestException({ code: "response_required", message: "Write a reply before sending it." });
    }

    const request = await this.load(partRequestId);
    await this.requireInventory(request.tenantId);

    await this.prisma.$transaction(async (tx) => {
      await tx.partReturnRequest.update({
        where: { partRequestId },
        // The question is answered, so it stops showing as outstanding;
        // the reply itself is folded into `reason`, which is what the
        // queue and the ledger both already read.
        data: { clarificationQuestion: null, reason: response },
      });
      await this.transition(tx, request, "RETURN_REQUESTED", actor);
      await this.emit(tx, request.tenantId, "part_request.return_clarified", partRequestId, actor, { response });
    });

    return { id: partRequestId, status: "RETURN_REQUESTED" as const };
  }

  /**
   * The technician's return is refused -- not the same event as REJECTED,
   * which is the whole request dying before a part was ever handed over.
   * Here the part already left the shelf, so it does not silently vanish
   * from tracking: the technician has to resolve it, typically by
   * marking it Used after all (`resolveRejectedReturn`).
   *
   * This was the gap named directly in the spec ("the action the
   * previous build was missing entirely") and it was two gaps, not one:
   * no method, and a workflow graph with no edge into RETURN_REJECTED at
   * all despite the state existing in the Prisma enum.
   */
  async rejectReturn(partRequestId: string, actor: LifecycleActor, reason?: string) {
    const request = await this.load(partRequestId);
    await this.requireInventory(request.tenantId);

    await this.prisma.$transaction(async (tx) => {
      await tx.partReturnRequest.update({
        where: { partRequestId },
        data: { resolvedAt: new Date(), resolvedById: actor.accountId, clarificationQuestion: null, reason },
      });
      await this.transition(tx, request, "RETURN_REJECTED", actor);
      await this.emit(tx, request.tenantId, "part_request.return_rejected", partRequestId, actor, { reason });
    });

    return { id: partRequestId, status: "RETURN_REJECTED" as const };
  }

  /**
   * A rejected return is resolved by marking the part used after all.
   *
   * This is where the RETURN_PENDING balance `requestReturn` opened is
   * finally reversed -- not at `rejectReturn` itself, because a rejected
   * return is not yet closed (the technician still has to act on it),
   * and reversing the pending quantity before that would let a second,
   * unrelated return request momentarily read a balance that does not
   * reflect the part still sitting in limbo. Reads the warehouse back
   * from `PartReturnRequest` rather than trusting a caller-supplied one,
   * for the same reason `completeReturn` now does.
   */
  async resolveRejectedReturn(partRequestId: string, actor: LifecycleActor) {
    const request = await this.load(partRequestId);
    await this.requireInventory(request.tenantId);

    const returnRequest = await this.prisma.partReturnRequest.findUnique({ where: { partRequestId } });
    if (!returnRequest) {
      throw new ConflictException({
        code: "no_return_on_record",
        message: "There is no rejected return on this request to resolve.",
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await this.stock.record(
        {
          tenantId: request.tenantId,
          inventoryItemId: request.inventoryItemId,
          warehouseId: returnRequest.warehouseId,
          type: "RETURN_PENDING",
          quantity: -returnRequest.quantity,
          actorId: actor.accountId,
          referenceType: "PartRequest",
          referenceId: partRequestId,
        },
        tx,
      );

      await this.transition(tx, request, "USED", actor);
      await this.emit(tx, request.tenantId, "part_request.used", partRequestId, actor, {});
    });

    return { id: partRequestId, status: "USED" as const };
  }

  async acceptReturn(partRequestId: string, actor: LifecycleActor) {
    return this.move(partRequestId, "RETURN_ACCEPTED", actor);
  }

  /**
   * The part physically comes back -- called after `acceptReturn`, in the
   * same request from the caller's point of view (the controller wraps
   * both into the single "Accept Return to Stock" / "Accept as Damaged"
   * click the spec describes).
   *
   * `damaged` decides which bucket it lands in, and the two are not the
   * same event: sellable stock going up is a different claim about the
   * world from a damaged count going up (SCENARIOS.md 3.3). Damaged stock
   * never becomes sellable, here or anywhere. The RETURN_PENDING balance
   * opened by `requestReturn` is reversed in the same transaction as the
   * movement that replaces it, so the part is never counted twice and
   * never silently disappears from every bucket at once.
   *
   * `warehouseId` here is where the part physically lands on the shelf,
   * chosen by whoever is standing in front of it -- a legitimate choice
   * that can differ from where it was issued. The RETURN_PENDING reversal
   * must NOT use that same value: it has to match whichever warehouse
   * `requestReturn` actually opened the pending balance against, read
   * back from `PartReturnRequest.warehouseId` rather than trusted from
   * the caller, or a mismatched choice here corrupts a warehouse that
   * has nothing to do with this return.
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

    const returnRequest = await this.prisma.partReturnRequest.findUnique({ where: { partRequestId } });
    if (!returnRequest) {
      throw new ConflictException({
        code: "no_return_on_record",
        message: "There is no open return on this request to complete.",
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // Reverses the RETURN_PENDING movement opened when the return was
      // first requested -- a negative RETURN_PENDING quantity is the one
      // place ADJUSTMENT-style signed movement isn't used, because this
      // is a real, typed event (the pending return being resolved), not
      // a correction. Deliberately `returnRequest.warehouseId`, not the
      // `warehouseId` parameter -- see the note above.
      await this.stock.record(
        {
          tenantId: request.tenantId,
          inventoryItemId: request.inventoryItemId,
          warehouseId: returnRequest.warehouseId,
          type: "RETURN_PENDING",
          quantity: -quantity,
          actorId: actor.accountId,
          referenceType: "PartRequest",
          referenceId: partRequestId,
        },
        tx,
      );

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

      await tx.partReturnRequest.update({
        where: { partRequestId },
        data: { resolvedAt: new Date(), resolvedById: actor.accountId, clarificationQuestion: null },
      });

      await this.transition(tx, request, "RETURNED_TO_STOCK", actor);

      await this.emit(tx, request.tenantId, "part_request.returned", partRequestId, actor, {
        quantity,
        warehouseId,
        damaged: options.damaged ?? false,
      });
    });
  }

  /** Every open return, for the queue. Newest request first. */
  async openReturns(tenantId: string) {
    const rows = await this.prisma.partReturnRequest.findMany({
      where: {
        tenantId,
        resolvedAt: null,
        partRequest: { status: { in: ["RETURN_REQUESTED", "RETURN_CLARIFICATION_REQUESTED"] } },
      },
      orderBy: { createdAt: "desc" },
      include: {
        partRequest: {
          select: {
            id: true,
            status: true,
            workOrderId: true,
            inventoryItem: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    });

    return rows.map((row) => ({
      partRequestId: row.partRequestId,
      status: row.partRequest.status,
      itemId: row.partRequest.inventoryItem.id,
      itemName: row.partRequest.inventoryItem.name,
      sku: row.partRequest.inventoryItem.sku,
      workOrderId: row.partRequest.workOrderId,
      quantity: row.quantity,
      reason: row.reason,
      clarificationQuestion: row.clarificationQuestion,
      requestedById: row.requestedById,
      requestedAt: row.createdAt,
    }));
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

  /**
   * Which warehouse a return's RETURN_PENDING movement belongs to.
   *
   * A request can be issued from more than one warehouse across several
   * partial hand-overs; a return is asked about as one quantity, not
   * per-warehouse, so this uses the most recent issue's warehouse -- the
   * technician is returning what they most recently received, which is
   * the overwhelmingly common case, and correct for the single-warehouse
   * case that is nearly all of them.
   */
  private async issuedWarehouseOf(partRequestId: string): Promise<string> {
    const latest = await this.prisma.issuedItem.findFirst({
      where: { partRequestId },
      orderBy: { issuedAt: "desc" },
      select: { warehouseId: true },
    });
    if (!latest) {
      throw new ConflictException({
        code: "nothing_issued",
        message: "Nothing has been issued against this request yet, so there is nothing to return.",
      });
    }
    return latest.warehouseId;
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
