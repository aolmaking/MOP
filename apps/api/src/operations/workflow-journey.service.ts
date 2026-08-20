import { Injectable, NotFoundException } from "@nestjs/common";
import { WORK_ORDER_GRAPH, workflowJourney, type JourneyStage, type WorkflowJourney } from "@mop/shared";
import { PrismaService } from "../database/prisma.service";
import { CapabilityResolutionService } from "../capabilities/capability-resolution.service";

/** Who is looking. The same journey reads differently to each of them. */
export type JourneyAudience = "CUSTOMER" | "TECHNICIAN" | "MANAGER";

export interface PresentedStage extends JourneyStage {
  /** Plain words for this audience. Never the enum. */
  readonly label: string;
}

export interface PresentedJourney extends Omit<WorkflowJourney, "stages"> {
  readonly stages: readonly PresentedStage[];
  /** One sentence naming what the job is waiting on, for this audience. */
  readonly headline: string;
}

/**
 * The stage names each audience reads.
 *
 * Three vocabularies over one underlying state, which is the point:
 * `AWAITING_CUSTOMER_APPROVAL` is "Waiting for your approval" to the
 * customer, "Waiting on the customer" to the technician who cannot
 * proceed, and "Awaiting customer approval" to the manager counting how
 * many jobs are stuck there. Same fact, three different things to know.
 *
 * Every status in `WORK_ORDER_GRAPH.states` must appear in all three, and
 * a test asserts it -- the fallback would print a lowercased enum at a
 * paying customer, which is the bug this file exists to prevent.
 */
export const JOURNEY_LABELS: Record<JourneyAudience, Record<string, string>> = {
  CUSTOMER: {
    DRAFT: "Being set up",
    REGISTERED: "Checked in",
    UNDER_INSPECTION: "Being inspected",
    AWAITING_CUSTOMER_APPROVAL: "Waiting for your approval",
    APPROVED_FOR_WORK: "Approved",
    IN_PROGRESS: "Being worked on",
    WAITING_PARTS: "Waiting for a part",
    WAITING_CUSTOMER: "Waiting for your answer",
    BLOCKED: "On hold",
    READY_FOR_TEAM_REVIEW: "Being checked",
    READY_FOR_QC: "Final checks",
    QC_FAILED: "Being corrected",
    READY_FOR_DELIVERY: "Ready for pickup",
    PAYMENT_PENDING: "Payment",
    CLOSED: "Completed",
    CANCELLED: "Cancelled",
  },
  TECHNICIAN: {
    DRAFT: "Being set up",
    REGISTERED: "Checked in",
    UNDER_INSPECTION: "Inspection",
    AWAITING_CUSTOMER_APPROVAL: "Waiting on the customer",
    APPROVED_FOR_WORK: "Approved to start",
    IN_PROGRESS: "Work",
    WAITING_PARTS: "Waiting on the store",
    WAITING_CUSTOMER: "Waiting on the customer",
    BLOCKED: "Blocked",
    READY_FOR_TEAM_REVIEW: "Team review",
    READY_FOR_QC: "QC",
    QC_FAILED: "Rework",
    READY_FOR_DELIVERY: "Ready to hand over",
    PAYMENT_PENDING: "Payment",
    CLOSED: "Closed",
    CANCELLED: "Cancelled",
  },
  MANAGER: {
    DRAFT: "Draft",
    REGISTERED: "Registered",
    UNDER_INSPECTION: "Under inspection",
    AWAITING_CUSTOMER_APPROVAL: "Awaiting customer approval",
    APPROVED_FOR_WORK: "Approved for work",
    IN_PROGRESS: "In progress",
    WAITING_PARTS: "Waiting for parts",
    WAITING_CUSTOMER: "Waiting for customer",
    BLOCKED: "Blocked",
    READY_FOR_TEAM_REVIEW: "Team review",
    READY_FOR_QC: "Quality check",
    QC_FAILED: "QC failed",
    READY_FOR_DELIVERY: "Ready for delivery",
    PAYMENT_PENDING: "Payment pending",
    CLOSED: "Closed",
    CANCELLED: "Cancelled",
  },
};

/**
 * The one sentence at the top, per audience, for the states where
 * somebody is actually waiting on somebody else.
 *
 * A customer needs to know it is their move. A technician needs to know
 * it is NOT theirs and why they cannot continue. A manager needs to know
 * which role owns the delay so they can go and unstick it.
 */
const HEADLINES: Record<JourneyAudience, Record<string, string>> = {
  CUSTOMER: {
    AWAITING_CUSTOMER_APPROVAL: "We're waiting for your approval before work can continue.",
    WAITING_CUSTOMER: "We're waiting to hear back from you.",
    WAITING_PARTS: "We're waiting for a part to arrive.",
    BLOCKED: "Your job is on hold while we sort something out.",
    QC_FAILED: "We found something in our final check and are putting it right.",
    PAYMENT_PENDING: "Your invoice is ready and payment is outstanding.",
    READY_FOR_DELIVERY: "Your vehicle is ready to collect.",
    CLOSED: "This job is finished.",
    CANCELLED: "This job was cancelled.",
  },
  TECHNICIAN: {
    AWAITING_CUSTOMER_APPROVAL: "Customer approval required before continuing.",
    WAITING_CUSTOMER: "Waiting on the customer. You cannot continue yet.",
    WAITING_PARTS: "Waiting on the store for a part.",
    BLOCKED: "Blocked. Your branch manager has to clear this.",
    QC_FAILED: "QC sent this back. Rework needed.",
    PAYMENT_PENDING: "Finished. The counter handles payment from here.",
    READY_FOR_DELIVERY: "Done. Ready to hand over.",
    CLOSED: "Closed.",
    CANCELLED: "Cancelled.",
  },
  MANAGER: {
    AWAITING_CUSTOMER_APPROVAL: "Blocked awaiting a customer decision.",
    WAITING_CUSTOMER: "Blocked awaiting a customer response.",
    WAITING_PARTS: "Blocked on inventory.",
    BLOCKED: "Blocked. Needs someone to clear it.",
    QC_FAILED: "Failed QC and is back with the technician.",
    PAYMENT_PENDING: "Invoiced, payment outstanding.",
    READY_FOR_DELIVERY: "Ready for handover.",
    CLOSED: "Closed.",
    CANCELLED: "Cancelled.",
  },
};

const MOVING: Record<JourneyAudience, string> = {
  CUSTOMER: "Your vehicle is being worked on.",
  TECHNICIAN: "This job is yours to move.",
  MANAGER: "Moving normally.",
};

/**
 * The workflow strip, generated per work order and per audience.
 *
 * Two rules make this worth having rather than decorative.
 *
 * **Nothing here is authored.** The stages behind are the transitions
 * that really happened, read from `work_order.status_changed` events; the
 * stages ahead are what this workshop's own effective graph allows from
 * here. Removing a capability removes its stage from every strip because
 * the edge is gone, not because a list was edited.
 *
 * **The words differ by audience, the state does not.** One projection,
 * three vocabularies -- so a customer and the technician looking at the
 * same blocked job are never told two different stories.
 */
@Injectable()
export class WorkflowJourneyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilities: CapabilityResolutionService,
  ) {}

  async forWorkOrder(tenantId: string, workOrderId: string, audience: JourneyAudience): Promise<PresentedJourney> {
    const workOrder = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId },
      select: { status: true, createdAt: true },
    });
    if (!workOrder) {
      throw new NotFoundException({ code: "work_order_not_found", message: "Work order not found." });
    }

    const [profile, history] = await Promise.all([
      this.capabilities.resolveCurrent(tenantId),
      this.statusHistory(tenantId, workOrderId),
    ]);

    const journey = workflowJourney(WORK_ORDER_GRAPH, profile, workOrder.status, history);

    return {
      finished: journey.finished,
      waiting: journey.waiting,
      stages: journey.stages.map((stage) => ({
        ...stage,
        label: JOURNEY_LABELS[audience][stage.status] ?? stage.status,
      })),
      headline: HEADLINES[audience][workOrder.status] ?? MOVING[audience],
    };
  }

  /**
   * Every stage this job actually reached, oldest first.
   *
   * Read from the event stream rather than a column, because a status
   * column knows only where a job is now. `payload.to` is the stage that
   * was entered; the job's own creation supplies the first one, which no
   * transition event covers because nothing transitioned INTO DRAFT.
   */
  private async statusHistory(
    tenantId: string,
    workOrderId: string,
  ): Promise<readonly { status: string; at: string }[]> {
    const events = await this.prisma.operationEvent.findMany({
      where: { tenantId, eventKey: "work_order.status_changed" },
      select: { payload: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const mine: { status: string; at: string }[] = [];
    for (const event of events) {
      const payload = event.payload as { workOrderId?: string; to?: string } | null;
      if (payload?.workOrderId !== workOrderId || !payload.to) continue;
      mine.push({ status: payload.to, at: event.createdAt.toISOString() });
    }

    return mine;
  }
}
