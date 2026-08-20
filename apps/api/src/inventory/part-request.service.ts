import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PART_REQUEST_GRAPH, canTransition, isCapabilityActive } from "@mop/shared";
import type { Prisma, PartRequestStatus } from "@mop/database";
import { PrismaService } from "../database/prisma.service";
import { CapabilityResolutionService } from "../capabilities/capability-resolution.service";
import { OperationEventsService } from "../operations/operation-events.service";
import { WorkOrderLifecycleService, type LifecycleActor } from "../operations/work-order-lifecycle.service";
import { StockService } from "./stock.service";
import { PolicyResolutionService } from "../policies/policy-resolution.service";

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
    private readonly policies: PolicyResolutionService,
    private readonly lifecycle: WorkOrderLifecycleService,
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

      await this.emit(
        tx,
        input.tenantId,
        "part_request.created",
        request.id,
        actor,
        { workOrderId: input.workOrderId, inventoryItemId: input.inventoryItemId, quantity: input.quantity },
        input.workOrderId,
      );

      // Same transaction as the create. A work order already WAITING_PARTS
      // from a different task's request simply refuses the move -- this
      // request still stands on its own, same shape as
      // TechnicianWorkService.moveIfPossible for blockers.
      await this.moveIfPossible(input.workOrderId, "REQUEST_PART", actor, tx);

      return request;
    });

    return created;
  }

  /**
   * Approve a part request, under this workshop's own separation-of-duties
   * rule.
   *
   * Phase 19.A built this enforcement as a *global* rule. It broke 22
   * tests modelling a legitimate single-storekeeper shop -- where the
   * person who raises the request is necessarily the person who approves
   * it -- and was reverted, with `PHASE_19.md` concluding that the real
   * fix needs a per-workshop opt-in policy. Policy P-07 is that policy,
   * and this is where it is finally read: a workshop that never opts in
   * behaves exactly as it does today.
   */
  async approve(partRequestId: string, actor: LifecycleActor) {
    const request = await this.load(partRequestId);
    const rule = await this.policies.resolveValue(request.tenantId, "PARTS_SEPARATION_OF_DUTIES");

    if (rule === "DIFFERENT_PERSON" && request.requestedById === actor.accountId) {
      throw new ForbiddenException({
        code: "self_approval_refused",
        message: "This workshop requires a part request to be approved by someone other than the person who raised it.",
      });
    }

    if (rule === "ROLE_SEPARATED") {
      const approver = await this.prisma.staffUser.findFirst({
        where: { accountId: actor.accountId, tenantId: request.tenantId },
        select: { role: true },
      });
      if (approver?.role !== "INVENTORY_MANAGER") {
        throw new ForbiddenException({
          code: "approver_role_refused",
          message: "This workshop requires an inventory manager to approve a part request.",
        });
      }
    }

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
      const fullyIssued = nowIssued >= before.requested;

      // The part is now the customer's problem to pay for. Written HERE,
      // in the same transaction the shelf moves in, because a part that
      // left the store and never reached a bill is the workshop paying
      // for the customer's repair -- and until this existed, nothing in
      // production wrote a WorkOrderPartLine at all: the model was read
      // by the dossier, the finish gate and the profitability report,
      // and written only by the demo seed.
      await this.recordBillableLine(tx, request, nowIssued, actor);
      if (fullyIssued && request.status !== "ISSUED") {
        await this.transition(tx, request, "ISSUED", actor);
      }

      await this.emit(
        tx,
        request.tenantId,
        "part_request.issued",
        input.partRequestId,
        actor,
        { quantity: input.quantity, warehouseId: input.warehouseId, fullyIssued },
        request.workOrderId,
      );

      // The technician's own blocker was "I don't have the part" -- once
      // the store has fully handed it over, that stops being true. Same
      // swallow-if-refused shape as everywhere else this asks the graph
      // rather than assuming.
      if (fullyIssued) {
        await this.moveIfPossible(request.workOrderId, "PART_RECEIVED", actor, tx);
      }
    });

    return this.fulfilment(input.partRequestId);
  }

  /**
   * Which work order a request belongs to, scoped to the tenant.
   *
   * Exists so a caller can run its own ownership check against the work
   * order without reaching into `partRequest` itself -- the same reason
   * every other cross-system read here goes through a method rather
   * than a foreign query.
   */
  async workOrderOf(partRequestId: string, tenantId: string): Promise<string> {
    const request = await this.prisma.partRequest.findFirst({
      where: { id: partRequestId, tenantId },
      select: { workOrderId: true },
    });
    if (!request) {
      throw new NotFoundException({ code: "part_request_not_found", message: "Request not found." });
    }
    return request.workOrderId;
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
      await this.emit(tx, request.tenantId, "part_request.used", partRequestId, actor, {}, request.workOrderId);
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

      // A part that came back is a part the customer does not pay for.
      // Same transaction as the shelf movement, for the same reason the
      // line was written in the same transaction as the issue: a bill
      // that disagrees with the shelf is the bug this pairing prevents.
      await this.unbillReturnedQuantity(tx, partRequestId, quantity);

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

  /**
   * The billable line for an issued part.
   *
   * **Prices are snapshotted, never referenced.** `sellingPrice` and
   * `cost` are copied off the catalogue row at the moment the part is
   * handed over, so an Owner editing the catalogue next month reprices
   * future work and leaves this job's bill exactly as it was agreed.
   * Reading the catalogue live at invoice time would silently rewrite
   * history, which is the one thing a finished invoice may never do.
   *
   * Upserted rather than created per issue: `partRequestId` is unique,
   * and a request filled across two partial hand-overs is still one part
   * on one bill. The quantity is the running issued total, passed in by
   * the caller which already computed it inside the same transaction.
   */
  private async recordBillableLine(
    tx: Prisma.TransactionClient,
    request: { id: string; tenantId: string; workOrderId: string; inventoryItemId: string },
    issuedQuantity: number,
    actor: LifecycleActor,
  ): Promise<void> {
    const item = await tx.inventoryItem.findUnique({
      where: { id: request.inventoryItemId },
      select: { name: true, sellingPrice: true, cost: true },
    });
    if (!item) return;

    await tx.workOrderPartLine.upsert({
      where: { partRequestId: request.id },
      create: {
        tenantId: request.tenantId,
        workOrderId: request.workOrderId,
        // It came off this workshop's own shelf, which is what decides
        // both who warrants it and whether a cost exists at all.
        provenance: "INVENTORY",
        inventoryItemId: request.inventoryItemId,
        name: item.name,
        quantity: issuedQuantity,
        sellingPrice: item.sellingPrice,
        cost: item.cost,
        partRequestId: request.id,
        addedById: actor.accountId,
      },
      // Only the quantity moves on a second partial issue. The prices
      // stay at what they were when the first of this part was handed
      // over -- the same snapshot rule, applied within one request.
      update: { quantity: issuedQuantity },
    });
  }

  /**
   * Takes a returned quantity back off the bill.
   *
   * The line is deleted outright when nothing is left rather than kept
   * at quantity zero, because a zero-quantity line still prints on an
   * invoice and a customer reading "Alternator ×0" reasonably asks what
   * it means. The `PartRequest` itself keeps the whole story either way
   * -- the line is the charge, not the history.
   */
  private async unbillReturnedQuantity(
    tx: Prisma.TransactionClient,
    partRequestId: string,
    returnedQuantity: number,
  ): Promise<void> {
    const line = await tx.workOrderPartLine.findUnique({
      where: { partRequestId },
      select: { id: true, quantity: true },
    });
    if (!line) return;

    const remaining = line.quantity - returnedQuantity;
    if (remaining > 0) {
      await tx.workOrderPartLine.update({ where: { id: line.id }, data: { quantity: remaining } });
    } else {
      await tx.workOrderPartLine.delete({ where: { id: line.id } });
    }
  }

  /**
   * Applies a work-order lifecycle intent where the graph allows it, and
   * stays quiet where it does not -- same pattern as
   * TechnicianWorkService.moveIfPossible. A part request stands on its
   * own record either way; only the work order's position in the graph
   * is opportunistic.
   */
  private async moveIfPossible(
    workOrderId: string,
    intent: "REQUEST_PART" | "PART_RECEIVED",
    actor: LifecycleActor,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    try {
      await this.lifecycle.apply(workOrderId, intent, actor, { tx });
    } catch {
      // Not available from the work order's current state; the part
      // request record stands on its own.
    }
  }

  private async load(id: string) {
    const request = await this.prisma.partRequest.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        status: true,
        inventoryItemId: true,
        workOrderId: true,
        approvedById: true,
        // Read for P-07's self-approval check -- the attribution has
        // always been stored, it just had nothing reading it.
        requestedById: true,
      },
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
   *
   * The write is conditional on `request.status`, the value `load()` read
   * before this transaction opened (H2, `docs/scenarios3/EDGE_CASE_REGISTER.md`)
   * -- otherwise two concurrent decisions on the same request (e.g. one
   * approving, one marking unavailable) would both pass `canTransition`
   * against the same stale status and the second write would silently
   * clobber the first rather than the graph having any say over it.
   * Mirrors `WorkOrderLifecycleService`'s own guarded `updateMany`.
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

    const updated = await tx.partRequest.updateMany({
      where: { id: request.id, status: request.status },
      // Phase 19.A -- recorded only on the transition INTO approved, never
      // overwritten by a later transition, so `issue()` can always ask
      // "who approved this" regardless of how many steps happened since.
      data: { status: to, ...(to === "APPROVED" ? { approvedById: actor.accountId } : {}) },
    });

    if (updated.count === 0) {
      throw new ConflictException({
        code: "concurrent_transition",
        message: "This part request changed while you were working on it. Reload and try again.",
      });
    }

    request.status = to;
  }

  /**
   * `workOrderId` is optional and, when given, puts a safe sentence on
   * the customer's own timeline as well.
   *
   * Not every part event is the customer's business -- a return being
   * clarified between the technician and the store is internal -- so
   * this is opt-in per call rather than automatic. Without it the
   * customer's activity feed stayed empty through a whole repair, which
   * is what "see meaningful progress" was supposed to mean.
   */
  private async emit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    eventKey: string,
    targetId: string,
    actor: LifecycleActor,
    payload: Record<string, unknown>,
    workOrderId?: string,
  ): Promise<void> {
    const customer = workOrderId ? await this.customerOf(tx, workOrderId) : null;

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
        ...(customer ? { customer: { customerId: customer, workOrderId } } : {}),
      },
      tx,
    );
  }

  private async customerOf(tx: Prisma.TransactionClient, workOrderId: string): Promise<string | null> {
    const workOrder = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      select: { customerId: true },
    });
    return workOrder?.customerId ?? null;
  }
}

function label(status: string): string {
  return status.toLowerCase().replace(/_/g, " ");
}
