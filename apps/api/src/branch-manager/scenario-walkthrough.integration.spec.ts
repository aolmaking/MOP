/**
 * Phase 5 exit criterion: one car, driven from the counter to the keys,
 * with every Branch Manager surface asked what it thinks at each step.
 *
 * The unit tests prove each page handles its own data. This proves
 * something they cannot: that the FIVE surfaces agree. A board that says
 * a car is with us, an attention queue that ignores it, and a delivery
 * page that says it can leave are each individually "correct" and
 * collectively a lie -- and that class of disagreement is exactly what
 * the previous implementation shipped.
 *
 * The scenario is the founding one from SCENARIOS.md 1.2: a customer who
 * declines inspection and asks for one named service. It is chosen
 * because it is the case a naive Finish Gate blocks forever.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { laneForStatus } from "@mop/shared";
import { IntakeService } from "../operations/intake.service";
import { WorkOrderLifecycleService } from "../operations/work-order-lifecycle.service";
import { GateEvaluatorService } from "../operations/gate-evaluator.service";
import { OperationEventsService } from "../operations/operation-events.service";
import { CustomerSafeProjectionService } from "../operations/customer-safe-projection.service";
import { CapabilityResolutionService } from "../capabilities/capability-resolution.service";
import { AuditService } from "../audit/audit.service";
import { AttentionQueueService } from "./attention-queue.service";
import { WorkOrderBoardService } from "./work-order-board.service";
import { ApprovalsService } from "./approvals.service";
import { DeliveryService } from "./delivery.service";
import type { PrismaService } from "../database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;

const events = new OperationEventsService(asService, new AuditService(asService), new CustomerSafeProjectionService());
const lifecycle = new WorkOrderLifecycleService(
  asService,
  new CapabilityResolutionService(asService),
  events,
  new GateEvaluatorService(asService),
);
const intake = new IntakeService(asService, events, lifecycle);

const attention = new AttentionQueueService(asService);
const board = new WorkOrderBoardService(asService);
const approvals = new ApprovalsService(asService);
const delivery = new DeliveryService(asService, lifecycle);

const ACTOR = { accountId: "advisor-1", displayName: "Advisor", actorType: "TENANT_STAFF" as const };
const SUFFIX = `walk-${Date.now()}`;
const PLATE = `WLK-${Date.now() % 100000}`;

let tenantId: string;
let planId: string;
let branchId: string;
let scope: { tenantId: string; branchScope: readonly string[] };

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Walkthrough",
      maxBranches: 5,
      maxUsers: 50,
      maxWarehouses: 5,
      allowedCategories: ["CARS"],
      allowedModules: [],
      allowedFeatures: [],
      allowedReports: [],
      monthlyPrice: 0,
    },
  });
  planId = plan.id;

  const tenant = await prisma.tenant.create({
    data: {
      name: `Walkthrough WS ${SUFFIX}`,
      nameNormalized: `walkthrough ws ${SUFFIX}`,
      slug: `walkthrough-ws-${SUFFIX}`,
      customerRegistrationCode: `WK-${SUFFIX}`,
      status: "ACTIVE",
      planId,
      country: "EG",
      city: "Cairo",
      businessType: "Garage",
      primaryCategory: "CARS",
      currency: "EGP",
      timezone: "Africa/Cairo",
    },
  });
  tenantId = tenant.id;

  branchId = (await prisma.branch.create({ data: { tenantId, name: "Main", code: "MAIN" } })).id;
  // Tenant-wide, the shape a single-branch workshop's manager actually has.
  scope = { tenantId, branchScope: [] };
}, 180_000);

afterAll(async () => {
  const where = { tenantId };
  await prisma.taskBlocker.deleteMany({ where });
  await prisma.task.deleteMany({ where });
  await prisma.customerDecisionItem.deleteMany({ where });
  await prisma.customerDecisionRequest.deleteMany({ where });
  await prisma.operationEvent.deleteMany({ where });
  await prisma.auditLog.deleteMany({ where });
  await prisma.customerTimelineEvent.deleteMany({ where });
  await prisma.workOrderAssignment.deleteMany({ where });
  await prisma.workOrder.deleteMany({ where });
  await prisma.assetOwnershipHistory.deleteMany({ where });
  await prisma.asset.deleteMany({ where });
  await prisma.customer.deleteMany({ where });
  await prisma.branch.deleteMany({ where });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 180_000);

/** The board's opinion about one specific job. */
async function laneOf(workOrderId: string): Promise<string | null> {
  const result = await board.board(scope);
  for (const lane of result.lanes) {
    if (lane.rows.some((row) => row.id === workOrderId)) return lane.key;
  }
  return null;
}

describe("one car, counter to keys, with every surface agreeing", () => {
  let workOrderId: string;

  it("1. the counter: a customer who declines inspection is booked in", async () => {
    const result = await intake.intake(
      {
        tenantId,
        branchId,
        customer: { fullName: "Mona Adel", phone: `0100${Date.now() % 1000000}` },
        asset: { category: "CARS", plateNumber: PLATE },
        complaint: "Replace the front brake pads. Nothing else.",
        // SCENARIOS.md 1.2 -- the founding case. Recorded as a fact, so
        // the Finish Gate never blocks the job for a step the customer
        // refused.
        inspectionDeclined: true,
      },
      ACTOR,
    );

    workOrderId = result.workOrderId;
    expect(result.status).toBe("REGISTERED");
  });

  it("2. the board files it under 'not started', and the lane map knows the status", async () => {
    expect(laneForStatus("REGISTERED")).toBe("NOT_STARTED");
    await expect(laneOf(workOrderId)).resolves.toBe("NOT_STARTED");
  });

  it("3. nothing is stuck yet, so the attention queue stays quiet", async () => {
    // A freshly booked car is not a problem. If it appeared here, the
    // queue would fill with normal work and stop meaning anything.
    const items = await attention.build(scope);

    expect(items.some((item) => item.workOrderId === workOrderId)).toBe(false);
  });

  it("4. the declined inspection routes straight to approval, skipping inspection", async () => {
    // The graph's own edge for this case. A workshop without it would
    // strand every customer who refuses an inspection.
    const moved = await lifecycle.apply(workOrderId, "REQUEST_APPROVAL", ACTOR);

    expect(moved.to).toBe("AWAITING_CUSTOMER_APPROVAL");
  });

  it("5. the board moves it to the customer's lane, and only that lane", async () => {
    await expect(laneOf(workOrderId)).resolves.toBe("WAITING_CUSTOMER");
  });

  it("6. an unsent request is OUR delay, and approvals says so", async () => {
    await prisma.customerDecisionRequest.create({
      data: {
        tenantId,
        workOrderId,
        customerId: (await prisma.workOrder.findUniqueOrThrow({
          where: { id: workOrderId },
          select: { customerId: true },
        })).customerId,
        status: "PENDING",
        secureToken: `walk-${workOrderId}`,
        createdById: ACTOR.accountId,
        // Deliberately never sent.
        sentAt: null,
      },
    });

    const result = await approvals.list(scope);

    expect(result.unsent.some((row) => row.workOrderId === workOrderId)).toBe(true);
    expect(result.waiting.some((row) => row.workOrderId === workOrderId)).toBe(false);
  });

  it("7. once sent, it becomes the customer's delay and moves lists", async () => {
    await prisma.customerDecisionRequest.updateMany({
      where: { workOrderId },
      data: { status: "SENT", sentAt: new Date() },
    });

    const result = await approvals.list(scope);

    expect(result.waiting.some((row) => row.workOrderId === workOrderId)).toBe(true);
    expect(result.unsent.some((row) => row.workOrderId === workOrderId)).toBe(false);
  });

  it("8. and the attention queue now agrees the customer is holding it", async () => {
    // The board, approvals and the attention queue are three different
    // queries. This is the assertion that they cannot drift apart.
    const items = await attention.build(scope);
    const mine = items.find((item) => item.workOrderId === workOrderId);

    expect(mine?.kind).toBe("CUSTOMER_APPROVAL_WAITING");
    await expect(laneOf(workOrderId)).resolves.toBe("WAITING_CUSTOMER");
  });

  it("9. the customer approves, and the job becomes ours again", async () => {
    await prisma.customerDecisionRequest.updateMany({
      where: { workOrderId },
      data: { status: "RESOLVED", respondedAt: new Date() },
    });

    const approved = await lifecycle.apply(workOrderId, "APPROVE", ACTOR);
    expect(approved.to).toBe("APPROVED_FOR_WORK");

    const started = await lifecycle.apply(workOrderId, "START_WORK", ACTOR);
    expect(started.to).toBe("IN_PROGRESS");

    await expect(laneOf(workOrderId)).resolves.toBe("WITH_US");
  });

  it("10. a blocked technician reaches the attention queue immediately", async () => {
    const task = await prisma.task.create({
      data: { tenantId, workOrderId, title: "Replace front brake pads", status: "BLOCKED" },
    });
    await prisma.taskBlocker.create({
      data: { tenantId, taskId: task.id, reason: "TOOL_MISSING", reportedBy: ACTOR.accountId, status: "OPEN" },
    });

    const items = await attention.build(scope);
    const mine = items.filter((item) => item.workOrderId === workOrderId);

    expect(mine.some((item) => item.kind === "TECHNICIAN_BLOCKED")).toBe(true);
  });

  it("11. resolving the blocker removes it from the queue rather than leaving a ghost", async () => {
    await prisma.taskBlocker.updateMany({ where: { task: { workOrderId } }, data: { status: "RESOLVED", resolvedAt: new Date() } });
    await prisma.task.updateMany({ where: { workOrderId }, data: { status: "DONE" } });

    const items = await attention.build(scope);

    expect(items.some((item) => item.workOrderId === workOrderId && item.kind === "TECHNICIAN_BLOCKED")).toBe(false);
  });

  it("12. the Finish Gate does NOT demand the inspection the customer refused", async () => {
    // The whole reason inspectionDeclined is stored as a fact. A naive
    // gate blocks this job forever, which is the failure the founding
    // scenario exists to prevent.
    const finished = await lifecycle.apply(workOrderId, "FINISH", ACTOR);

    expect(["READY_FOR_TEAM_REVIEW", "READY_FOR_QC", "PAYMENT_PENDING", "READY_FOR_DELIVERY"]).toContain(finished.to);
  });

  it("13. delivery refuses to release it, and says exactly why", async () => {
    // Drive it to the handover step whatever the profile routed through.
    for (const intent of ["REVIEW_PASSED", "QC_PASSED"] as const) {
      const current = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrderId }, select: { status: true } });
      if (["READY_FOR_DELIVERY", "PAYMENT_PENDING"].includes(current.status)) break;
      try {
        await lifecycle.apply(workOrderId, intent, ACTOR);
      } catch {
        // Not every profile has this step; the loop is finding the path,
        // not asserting one.
      }
    }

    const status = (await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrderId }, select: { status: true } })).status;
    expect(["READY_FOR_DELIVERY", "PAYMENT_PENDING"]).toContain(status);

    const result = await delivery.board(scope);
    const mine =
      result.held.find((row) => row.workOrderId === workOrderId) ??
      result.ready.find((row) => row.workOrderId === workOrderId);

    expect(mine).toBeDefined();
    // No invoice exists, so it must be held -- and the reason must be a
    // sentence a manager can act on, never a gate key.
    expect(mine?.canLeave).toBe(false);
    expect(mine?.blockedBy.length).toBeGreaterThan(0);
    expect(mine?.blockedBy.join(" ")).not.toContain("invoice.issued");
  });

  it("14. every surface still tells the same story about this one car", async () => {
    // The exit criterion, stated as an assertion: one job, five queries,
    // no contradiction.
    const [lane, items, approvalRows, deliveryBoard] = await Promise.all([
      laneOf(workOrderId),
      attention.build(scope),
      approvals.list(scope),
      delivery.board(scope),
    ]);

    expect(lane).toBe("READY_TO_LEAVE");

    // Resolved, so it is off the chase list.
    expect(approvalRows.waiting.some((row) => row.workOrderId === workOrderId)).toBe(false);
    expect(approvalRows.unsent.some((row) => row.workOrderId === workOrderId)).toBe(false);

    // Held at delivery, and never claimed to be ready.
    expect(deliveryBoard.ready.some((row) => row.workOrderId === workOrderId)).toBe(false);
    expect(deliveryBoard.held.some((row) => row.workOrderId === workOrderId)).toBe(true);

    // The attention queue may or may not rank it depending on invoicing,
    // but it must never contradict the others by calling it blocked.
    expect(items.some((item) => item.workOrderId === workOrderId && item.kind === "TECHNICIAN_BLOCKED")).toBe(false);
  });
});
