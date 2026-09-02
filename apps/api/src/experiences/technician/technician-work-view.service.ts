import { Injectable, NotFoundException } from "@nestjs/common";
import { gateDefinition, type GateEvaluation, type GateKey } from "@mop/shared";
import { PrismaService } from "../../runtime/database/prisma.service";
import { PolicyResolutionService } from "../../control/policies/policy-resolution.service";
import { WorkOrderLifecycleService } from "../../systems/operations/work-order-lifecycle.service";
import { AssetHistoryService } from "../../systems/operations/vehicle-history/asset-history.service";

export interface TechnicianJob {
  readonly workOrderId: string;
  readonly identifier: string | null;
  readonly customerName: string;
  readonly status: string;
  readonly complaint: string | null;
  readonly inspectionDeclined: boolean;
  readonly myTaskCount: number;
  readonly myOpenTaskCount: number;
  /** True when a task of theirs is IN_PROGRESS -- the car in front of them. */
  readonly active: boolean;
  readonly blocked: boolean;
  readonly sinceHours: number;
}

export interface TechnicianTask {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly blockedReason: string | null;
}

export interface FinishCheck {
  /** Null when this job has no finish step available from where it is. */
  readonly available: boolean;
  readonly passed: boolean;
  readonly conditions: readonly { satisfied: boolean; text: string }[];
}

/**
 * A part this technician asked for, and what they can do about it now.
 *
 * `waitingOn` names who currently owes the move -- the single thing a
 * technician standing at a car actually wants to know. It is derived
 * from the request's own status rather than stored, because the status
 * is the fact and a second column would be a second truth.
 */
export interface WorkCardPart {
  readonly partRequestId: string;
  readonly name: string;
  readonly sku: string;
  readonly quantity: number;
  readonly issued: number;
  readonly status: string;
  /** Human words for the state, never the enum. */
  readonly statusText: string;
  readonly waitingOn: "STORE" | "YOU" | "NOBODY";
  /**
   * Every action available to the technician right now -- plural, because
   * a received part offers a real choice (fit it, or send it back), not
   * a single next step. Empty when nothing is theirs to do.
   */
  readonly actions: readonly ("RECEIVE" | "MARK_USED" | "RETURN" | "RESPOND_CLARIFICATION")[];
  /** What the store actually asked, when RESPOND_CLARIFICATION is one of the actions above. */
  readonly clarificationQuestion: string | null;
}

export interface WorkCard {
  readonly workOrderId: string;
  readonly identifier: string | null;
  readonly customerName: string;
  readonly status: string;
  readonly complaint: string | null;
  readonly inspectionDeclined: boolean;
  readonly timeTracking: "OFF" | "OPTIONAL" | "REQUIRED";
  readonly tasks: readonly TechnicianTask[];
  readonly parts: readonly WorkCardPart[];
  readonly finish: FinishCheck;
}

/**
 * The words a technician reads, and whose move it is, per request state.
 *
 * Pinned per status deliberately: a new `PartRequestStatus` member must
 * fail a test here rather than reach a technician as a lowercased enum.
 * Same rule the gate registry and the customer status map already follow.
 */
const PART_STATE: Record<
  string,
  { text: string; waitingOn: WorkCardPart["waitingOn"]; actions: WorkCardPart["actions"] }
> = {
  DRAFT: { text: "Not sent to the store yet.", waitingOn: "YOU", actions: [] },
  REQUESTED: { text: "Asked. The store hasn't answered yet.", waitingOn: "STORE", actions: [] },
  WAREHOUSE_REVIEWING: { text: "The store is looking at it.", waitingOn: "STORE", actions: [] },
  APPROVED: { text: "Approved. Waiting to be handed over.", waitingOn: "STORE", actions: [] },
  ISSUED: { text: "Handed over by the store.", waitingOn: "YOU", actions: ["RECEIVE"] },
  IN_TRANSIT: { text: "On its way from another branch.", waitingOn: "STORE", actions: [] },
  ARRIVED: { text: "Arrived at the store. Collect it.", waitingOn: "YOU", actions: ["RECEIVE"] },
  RECEIVED_BY_TECHNICIAN: {
    text: "You have it. Fit it, or send it back.",
    waitingOn: "YOU",
    actions: ["MARK_USED", "RETURN"],
  },
  USED: { text: "Fitted to this vehicle.", waitingOn: "NOBODY", actions: [] },
  REJECTED: { text: "The store refused this request.", waitingOn: "NOBODY", actions: [] },
  UNAVAILABLE: { text: "The store doesn't have it.", waitingOn: "NOBODY", actions: [] },
  WAITING_TRANSFER: { text: "Coming from another branch.", waitingOn: "STORE", actions: [] },
  WAITING_SUPPLIER: { text: "On order from a supplier.", waitingOn: "STORE", actions: [] },
  RETURN_REQUESTED: { text: "You sent it back. Waiting on the store.", waitingOn: "STORE", actions: [] },
  RETURN_ACCEPTED: { text: "Your return was accepted.", waitingOn: "NOBODY", actions: [] },
  RETURNED_TO_STOCK: { text: "Back on the shelf.", waitingOn: "NOBODY", actions: [] },
  RETURN_REJECTED: {
    text: "The store refused the return. Fit it or speak to them.",
    waitingOn: "YOU",
    actions: ["MARK_USED"],
  },
  RETURN_CLARIFICATION_REQUESTED: {
    text: "The store asked you a question about the return.",
    waitingOn: "YOU",
    actions: ["RESPOND_CLARIFICATION"],
  },
  CANCELLED: { text: "Cancelled.", waitingOn: "NOBODY", actions: [] },
};

/**
 * What one technician can see.
 *
 * Scope is the whole point of this service. A technician sees their own
 * assigned work and nothing else, and the filter is applied in the query
 * rather than after it -- "restricted data is absent from the response,
 * never hidden client-side", and anyone can open developer tools on a
 * workshop tablet.
 *
 * Read-only. Every write a technician makes already goes through
 * TechnicianWorkService, which routes status changes through the
 * lifecycle. Nothing here is allowed to become a second path.
 */
@Injectable()
export class TechnicianWorkViewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: WorkOrderLifecycleService,
    private readonly assetHistory: AssetHistoryService,
    private readonly policies: PolicyResolutionService,
  ) {}

  async myWork(staffUserId: string, tenantId: string): Promise<readonly TechnicianJob[]> {
    const rows = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        // Assigned to them at the job level, or holding one of their
        // tasks. Both count as "mine" -- a technician handed a single
        // task on someone else's job still has to find it.
        OR: [
          { assignments: { some: { staffUserId } } },
          { tasks: { some: { assignments: { some: { staffUserId } } } } },
        ],
        status: { notIn: ["CLOSED", "CANCELLED"] },
      },
      select: {
        id: true,
        status: true,
        updatedAt: true,
        inspectionDeclined: true,
        asset: { select: { plateNumber: true, serialNumber: true } },
        customer: { select: { fullName: true } },
        tasks: {
          where: { assignments: { some: { staffUserId } } },
          select: {
            status: true,
            blockers: { where: { status: { in: ["OPEN", "ESCALATED"] } }, select: { id: true } },
          },
        },
      },
      orderBy: { updatedAt: "asc" },
    });

    const complaints = await this.assetHistory.complaintText(tenantId, rows.map((r) => r.id));

    const now = Date.now();
    return rows.map((row) => {
      const open = row.tasks.filter((task) => !["DONE", "CANCELLED"].includes(task.status));
      return {
        workOrderId: row.id,
        identifier: row.asset.plateNumber ?? row.asset.serialNumber,
        customerName: row.customer.fullName,
        status: row.status,
        complaint: complaints.get(row.id) ?? null,
        inspectionDeclined: row.inspectionDeclined,
        myTaskCount: row.tasks.length,
        myOpenTaskCount: open.length,
        active: row.tasks.some((task) => task.status === "IN_PROGRESS"),
        blocked: row.tasks.some((task) => task.blockers.length > 0),
        sinceHours: (now - row.updatedAt.getTime()) / 3_600_000,
      };
    });
  }

  /**
   * The car in front of them, if there is one.
   *
   * "Active" is a task they have actually started, not merely one
   * assigned. A technician with nine assigned jobs still has exactly one
   * in their hands, and guessing which from assignment alone would put
   * the wrong car on the page they never tap.
   */
  async activeJob(staffUserId: string, tenantId: string): Promise<TechnicianJob | null> {
    const work = await this.myWork(staffUserId, tenantId);
    return work.find((job) => job.active) ?? null;
  }

  async workCard(staffUserId: string, tenantId: string, workOrderId: string): Promise<WorkCard> {
    const workOrder = await this.prisma.workOrder.findFirst({
      where: {
        id: workOrderId,
        tenantId,
        OR: [
          { assignments: { some: { staffUserId } } },
          { tasks: { some: { assignments: { some: { staffUserId } } } } },
        ],
      },
      select: {
        id: true,
        status: true,
        inspectionDeclined: true,
        assetId: true,
        asset: { select: { plateNumber: true, serialNumber: true } },
        customer: { select: { fullName: true } },
        tasks: {
          where: { assignments: { some: { staffUserId } } },
          select: {
            id: true,
            title: true,
            status: true,
            blockers: {
              where: { status: { in: ["OPEN", "ESCALATED"] } },
              select: { reason: true, note: true },
              take: 1,
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    // Not-mine and not-found are the same answer, so a technician cannot
    // discover that a job exists by probing ids.
    if (!workOrder) {
      throw new NotFoundException({ code: "work_order_not_found", message: "That job is not assigned to you." });
    }

    const [complaints, timeTracking] = await Promise.all([
      this.assetHistory.complaintText(tenantId, [workOrder.id]),
      this.policies.resolveValue(tenantId, "TIME_TRACKING") as Promise<"OFF" | "OPTIONAL" | "REQUIRED">,
    ]);

    // Every part request on the job, not only this technician's own:
    // a second technician's request is still what is holding the car,
    // and hiding it would leave the first one staring at WAITING_PARTS
    // with nothing on screen to explain it.
    const partRequests = await this.prisma.partRequest.findMany({
      where: { workOrderId: workOrder.id, tenantId },
      select: {
        id: true,
        quantity: true,
        status: true,
        inventoryItem: { select: { name: true, sku: true } },
        issuedItems: { select: { quantity: true } },
        returnRequest: { select: { clarificationQuestion: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return {
      workOrderId: workOrder.id,
      identifier: workOrder.asset.plateNumber ?? workOrder.asset.serialNumber,
      customerName: workOrder.customer.fullName,
      status: workOrder.status,
      complaint: complaints.get(workOrder.id) ?? null,
      inspectionDeclined: workOrder.inspectionDeclined,
      timeTracking,
      tasks: workOrder.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        blockedReason: task.blockers[0]?.note ?? task.blockers[0]?.reason ?? null,
      })),
      parts: partRequests.map((request) => {
        const state = PART_STATE[request.status];
        if (!state) {
          // Deliberately loud rather than a lowercased enum: an unmapped
          // status is a missing product decision, not a display detail.
          throw new Error(`No technician-facing wording for part request status ${request.status}`);
        }
        return {
          partRequestId: request.id,
          name: request.inventoryItem.name,
          sku: request.inventoryItem.sku,
          quantity: request.quantity,
          // money-lint-ok: a count of physical objects, not a currency amount.
          issued: request.issuedItems.reduce((sum, issue) => sum + issue.quantity, 0),
          status: request.status,
          statusText: state.text,
          waitingOn: state.waitingOn,
          actions: state.actions,
          clarificationQuestion: request.returnRequest?.clarificationQuestion ?? null,
        };
      }),
      finish: await this.finishCheck(workOrderId),
    };
  }

  /**
   * "Previous history detected" (docs/POLICY_DECISION_INVENTORY.md
   * §8.B, P-81) -- reuses the same ownership check `workCard` already
   * does (a technician can only pull history for a job actually
   * assigned to them), then hands off to the shared, role-agnostic
   * history builder.
   */
  async vehicleHistory(staffUserId: string, tenantId: string, workOrderId: string) {
    const workOrder = await this.prisma.workOrder.findFirst({
      where: {
        id: workOrderId,
        tenantId,
        OR: [
          { assignments: { some: { staffUserId } } },
          { tasks: { some: { assignments: { some: { staffUserId } } } } },
        ],
      },
      select: { assetId: true },
    });
    if (!workOrder) {
      throw new NotFoundException({ code: "work_order_not_found", message: "That job is not assigned to you." });
    }

    return this.assetHistory.build(tenantId, workOrder.assetId, workOrderId);
  }

  /**
   * What the Finish Gate would say, before anything is pressed.
   *
   * This is the technician's only encounter with the capability engine,
   * and it must happen BEFORE the tap rather than as a failure after it.
   * A technician who presses finish and is refused has already put the
   * tablet down and picked a tool back up.
   */
  async finishCheck(workOrderId: string): Promise<FinishCheck> {
    const intents = await this.lifecycle.availableIntents(workOrderId);
    if (!intents.includes("FINISH")) {
      return { available: false, passed: false, conditions: [] };
    }

    const result = await this.lifecycle.previewGates(workOrderId, "FINISH");

    // No gates is a genuine pass. A workshop with the optional
    // capabilities removed has fewer conditions, not a missing answer.
    if (!result) return { available: true, passed: true, conditions: [] };

    return {
      available: true,
      passed: result.passed,
      conditions: result.evaluations.map((evaluation: GateEvaluation) => ({
        satisfied: evaluation.satisfied,
        // A blocked evaluation always carries a message; the fallback is
        // for the type, not for a case that happens. It still says
        // something rather than rendering an empty row.
        text: evaluation.satisfied
          ? describe(evaluation.gate)
          : (evaluation.blockedMessage ?? describe(evaluation.gate)),
      })),
    };
  }
}

/**
 * The words for a gate that is already satisfied.
 *
 * Read from the gate registry, never derived from the key. Stripping the
 * separators out of `parts.received_used_or_returned` produced "parts
 * received used or returned", which sat in a checklist directly beneath
 * "Complete the inspection before finishing." -- half the list written
 * for a technician and half of it leaked from the database.
 *
 * The fallback still says something rather than rendering an empty row,
 * but it is for the type: every gate in the registry carries the text.
 */
function describe(gate: string): string {
  return gateDefinition(gate as GateKey)?.satisfiedMessage ?? gate.replace(/[._]/g, " ");
}
