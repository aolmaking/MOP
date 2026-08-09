import { Injectable, NotFoundException } from "@nestjs/common";
import type { GateEvaluation } from "@mop/shared";
import { PrismaService } from "../database/prisma.service";
import { WorkOrderLifecycleService } from "../operations/work-order-lifecycle.service";

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

export interface WorkCard {
  readonly workOrderId: string;
  readonly identifier: string | null;
  readonly customerName: string;
  readonly status: string;
  readonly complaint: string | null;
  readonly inspectionDeclined: boolean;
  readonly tasks: readonly TechnicianTask[];
  readonly finish: FinishCheck;
}

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

    const now = Date.now();
    return rows.map((row) => {
      const open = row.tasks.filter((task) => !["DONE", "CANCELLED"].includes(task.status));
      return {
        workOrderId: row.id,
        identifier: row.asset.plateNumber ?? row.asset.serialNumber,
        customerName: row.customer.fullName,
        status: row.status,
        complaint: null,
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

    return {
      workOrderId: workOrder.id,
      identifier: workOrder.asset.plateNumber ?? workOrder.asset.serialNumber,
      customerName: workOrder.customer.fullName,
      status: workOrder.status,
      complaint: null,
      inspectionDeclined: workOrder.inspectionDeclined,
      tasks: workOrder.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        blockedReason: task.blockers[0]?.note ?? task.blockers[0]?.reason ?? null,
      })),
      finish: await this.finishCheck(workOrderId),
    };
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
        text: evaluation.satisfied ? describe(evaluation.gate) : (evaluation.blockedMessage ?? describe(evaluation.gate)),
      })),
    };
  }
}

/**
 * A satisfied gate still needs words. The registry only carries a message
 * for the blocked case, because that is the one that has to be actionable
 * -- so a passed condition is stated as the gate turned into a phrase
 * rather than left blank.
 */
function describe(gate: string): string {
  return gate.replace(/[._]/g, " ");
}
