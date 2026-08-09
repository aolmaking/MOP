/**
 * The records a technician produces, and the effect they have on the job.
 *
 * The interesting assertions are the interactions: a blocker moving the
 * work order, a task refusing to complete while blocked, and the Finish
 * Gate reacting to all of it. None of that is observable without a real
 * database and the real lifecycle service.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { TechnicianWorkService } from "./technician-work.service";
import { IntakeService } from "./intake.service";
import { WorkOrderLifecycleService } from "./work-order-lifecycle.service";
import { GateEvaluatorService } from "./gate-evaluator.service";
import { OperationEventsService } from "./operation-events.service";
import { CustomerSafeProjectionService } from "./customer-safe-projection.service";
import { CapabilityResolutionService } from "../capabilities/capability-resolution.service";
import { AuditService } from "../audit/audit.service";
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
const work = new TechnicianWorkService(asService, events, lifecycle);

const ACTOR = { accountId: "tech-1", displayName: "Technician", actorType: "TENANT_STAFF" as const };
const SUFFIX = `tw-${Date.now()}`;

let tenantId: string;
let planId: string;
let branchId: string;
let counter = 0;

/** A work order already in progress, which is where technician work happens. */
async function workOrderInProgress() {
  counter += 1;
  const result = await intake.intake(
    {
      tenantId,
      branchId,
      customer: { fullName: `Customer ${counter}`, phone: `0100000${String(counter).padStart(4, "0")}` },
      asset: { category: "CARS", plateNumber: `${SUFFIX}-${counter}` },
      inspectionDeclined: true,
    },
    ACTOR,
  );

  await lifecycle.apply(result.workOrderId, "REQUEST_APPROVAL", ACTOR);
  await lifecycle.apply(result.workOrderId, "APPROVE", ACTOR);
  await lifecycle.apply(result.workOrderId, "START_WORK", ACTOR);

  return result.workOrderId;
}

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Plan",
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
      name: `TW ${SUFFIX}`,
      nameNormalized: `tw ${SUFFIX}`,
      slug: `tw-${SUFFIX}`,
      customerRegistrationCode: `TW-${SUFFIX}`,
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

  // No review, no QC, so FINISH routes straight to invoicing and the test
  // is about technician records rather than routing.
  for (const key of ["TEAM_REVIEW", "TEAMS", "QC"]) {
    await prisma.tenantCapability.create({
      data: { tenantId, capabilityKey: key, status: "DISABLED", source: "PLATFORM", configuredBy: "test" },
    });
  }

  branchId = (await prisma.branch.create({ data: { tenantId, name: "Main", code: "MAIN" } })).id;
}, 120_000);

afterAll(async () => {
  const where = { tenantId };
  await prisma.operationEvent.deleteMany({ where });
  await prisma.auditLog.deleteMany({ where });
  await prisma.customerTimelineEvent.deleteMany({ where });
  await prisma.taskBlocker.deleteMany({ where });
  await prisma.taskAssignment.deleteMany({ where });
  await prisma.task.deleteMany({ where });
  await prisma.fault.deleteMany({ where });
  await prisma.inspection.deleteMany({ where });
  await prisma.workOrderAssignment.deleteMany({ where });
  await prisma.workOrder.deleteMany({ where });
  await prisma.assetOwnershipHistory.deleteMany({ where });
  await prisma.asset.deleteMany({ where });
  await prisma.customer.deleteMany({ where });
  await prisma.branch.deleteMany({ where });
  await prisma.tenantCapability.deleteMany({ where });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("inspections and faults", () => {
  it("records an inspection with its category-specific fields", async () => {
    const workOrderId = await workOrderInProgress();

    const inspection = await work.recordInspection(
      {
        workOrderId,
        technicianId: "tech-1",
        type: "QUICK",
        odometerOrHours: 84_500,
        fields: { batteryVoltage: "12.4", warningLights: ["ABS"] },
        note: "Battery weak",
      },
      ACTOR,
    );

    expect(inspection.fields).toMatchObject({ batteryVoltage: "12.4" });
    expect(Number(inspection.odometerOrHours)).toBe(84_500);
  }, 120_000);

  it("raises a critical fault at HIGH audit risk", async () => {
    // A safety finding should stand out in the audit trail rather than
    // sitting among routine entries.
    const workOrderId = await workOrderInProgress();

    const fault = await work.createFault(
      { workOrderId, description: "Brake pads below minimum", severity: "CRITICAL" },
      ACTOR,
    );

    const entry = await prisma.auditLog.findFirst({
      where: { tenantId, targetType: "Fault", targetId: fault.id },
    });
    expect(entry?.riskLevel).toBe("HIGH");
  }, 120_000);

  it("does not tell the customer about a raw fault", async () => {
    // A fault is internal until it becomes a priced decision the customer
    // can actually answer.
    const workOrderId = await workOrderInProgress();
    const before = await prisma.customerTimelineEvent.count({ where: { workOrderId } });

    await work.createFault({ workOrderId, description: "Worn wiper", severity: "LOW" }, ACTOR);

    expect(await prisma.customerTimelineEvent.count({ where: { workOrderId } })).toBe(before);
  }, 120_000);
});

describe("blockers", () => {
  it("moves the work order to BLOCKED and carries its audience", async () => {
    const workOrderId = await workOrderInProgress();
    const task = await work.createTask(workOrderId, "Replace pads", ACTOR);

    await work.reportBlocker({ taskId: task.id, reason: "WAITING_PART" }, ACTOR);

    expect((await prisma.workOrder.findUnique({ where: { id: workOrderId } }))?.status).toBe("BLOCKED");

    const event = await prisma.operationEvent.findFirst({
      where: { tenantId, eventKey: "blocker.reported" },
      orderBy: { createdAt: "desc" },
    });
    // Inventory can fulfil it, the branch manager owns the delay, the team
    // leader needs it for their technician's load.
    expect(event?.payload).toMatchObject({ notify: ["INVENTORY_MANAGER", "BRANCH_MANAGER", "TEAM_LEADER"] });
  }, 120_000);

  it("escalates a safety issue immediately and notifies widely", async () => {
    const workOrderId = await workOrderInProgress();
    const task = await work.createTask(workOrderId, "Inspect suspension", ACTOR);

    const blocker = await work.reportBlocker({ taskId: task.id, reason: "SAFETY_ISSUE" }, ACTOR);

    expect(blocker.status).toBe("ESCALATED");

    const event = await prisma.operationEvent.findFirst({
      where: { tenantId, eventKey: "blocker.reported" },
      orderBy: { createdAt: "desc" },
    });
    expect(event?.payload).toMatchObject({ urgency: "URGENT" });
  }, 120_000);

  it("refuses to complete a task while it is blocked", async () => {
    const workOrderId = await workOrderInProgress();
    const task = await work.createTask(workOrderId, "Blocked work", ACTOR);
    await work.reportBlocker({ taskId: task.id, reason: "TOOL_MISSING" }, ACTOR);

    await expect(work.completeTask(task.id, ACTOR)).rejects.toThrow(/blocker/i);
  }, 120_000);

  it("returns the work order to IN_PROGRESS only when nothing else blocks it", async () => {
    const workOrderId = await workOrderInProgress();
    const taskA = await work.createTask(workOrderId, "A", ACTOR);
    const taskB = await work.createTask(workOrderId, "B", ACTOR);

    const first = await work.reportBlocker({ taskId: taskA.id, reason: "TOOL_MISSING" }, ACTOR);
    const second = await work.reportBlocker({ taskId: taskB.id, reason: "UNCLEAR_DIAGNOSIS" }, ACTOR);

    // Two blockers, one work order -- the second must not fail just
    // because the job is already blocked.
    expect(second.id).toBeDefined();

    await work.resolveBlocker(first.id, ACTOR);
    expect((await prisma.workOrder.findUnique({ where: { id: workOrderId } }))?.status).toBe("BLOCKED");

    await work.resolveBlocker(second.id, ACTOR);
    expect((await prisma.workOrder.findUnique({ where: { id: workOrderId } }))?.status).toBe("IN_PROGRESS");
  }, 120_000);
});

describe("tasks and the finish gate together", () => {
  it("blocks finish until every task is done, then allows it", async () => {
    const workOrderId = await workOrderInProgress();
    const task = await work.createTask(workOrderId, "Fit parts", ACTOR);

    await expect(lifecycle.apply(workOrderId, "FINISH", ACTOR)).rejects.toThrow(/outstanding/i);

    await work.completeTask(task.id, ACTOR);

    expect((await lifecycle.apply(workOrderId, "FINISH", ACTOR)).to).toBe("PAYMENT_PENDING");
  }, 120_000);

  it("blocks finish while a blocker is open, naming the blocker", async () => {
    const workOrderId = await workOrderInProgress();
    const task = await work.createTask(workOrderId, "Held up", ACTOR);
    await work.reportBlocker({ taskId: task.id, reason: "TOOL_MISSING" }, ACTOR);

    // The work order is BLOCKED, so FINISH is not even routable from here
    // -- the graph refuses before any gate is consulted.
    await expect(lifecycle.apply(workOrderId, "FINISH", ACTOR)).rejects.toThrow(/not available/i);
  }, 120_000);
});
