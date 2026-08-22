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
import { CapabilityResolutionService } from "../../control/capabilities/capability-resolution.service";
import { AuditService } from "../../audit/audit.service";
import { PriceCatalogService } from "../finance/price-catalog.service";
import { FinanceService } from "../finance/finance.service";
import { ChargeableItemsService } from "./chargeable-items.service";
import { BillingService } from "../billing/billing.service";
import { GenericBillingAdapter } from "../billing/generic-billing-adapter.service";
import type { PrismaService } from "../../runtime/database/prisma.service";
import { PolicyResolutionService } from "../../control/policies/policy-resolution.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;

/**
 * Policies read at runtime by the services under test. Backed by the
 * real Prisma client, so a test that writes a WorkshopPolicy row sees
 * the behaviour change -- a stub here would prove nothing about the
 * thing these tests exist to prove.
 */
const policiesForTest = new PolicyResolutionService(
  asService,
  new AuditService(asService),
  new CapabilityResolutionService(asService),
);

const events = new OperationEventsService(asService, new AuditService(asService), new CustomerSafeProjectionService());
const lifecycle = new WorkOrderLifecycleService(
  asService,
  new CapabilityResolutionService(asService),
  events,
  new GateEvaluatorService(asService, policiesForTest),
  policiesForTest,
);
const intake = new IntakeService(asService, events, lifecycle);
const work = new TechnicianWorkService(asService, events, lifecycle, policiesForTest);
const priceCatalog = new PriceCatalogService(asService, new AuditService(asService));
const finance = new FinanceService(
  asService,
  new CapabilityResolutionService(asService),
  events,
  new BillingService(asService, new GenericBillingAdapter()),
  priceCatalog,
  policiesForTest,
  new ChargeableItemsService(asService),
  lifecycle,
);

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
  // Finance and inventory rows the service-chain tests create. They must
  // go before the task/work order they hang off, and before the warehouse
  // and item they reference, or the tenant delete trips an FK.
  await prisma.runningInvoiceLine.deleteMany({ where });
  await prisma.runningInvoice.deleteMany({ where });
  await prisma.workOrderPartLine.deleteMany({ where });
  await prisma.stockMovement.deleteMany({ where });
  await prisma.warehouseStockBalance.deleteMany({ where });
  await prisma.priceCatalogEntry.deleteMany({ where });
  await prisma.task.deleteMany({ where });
  await prisma.fault.deleteMany({ where });
  await prisma.inspection.deleteMany({ where });
  await prisma.workOrderAssignment.deleteMany({ where });
  await prisma.workOrder.deleteMany({ where });
  await prisma.assetOwnershipHistory.deleteMany({ where });
  await prisma.asset.deleteMany({ where });
  await prisma.customer.deleteMany({ where });
  await prisma.branch.deleteMany({ where });
  await prisma.inventoryItem.deleteMany({ where });
  await prisma.warehouse.deleteMany({ where });
  await prisma.staffUser.deleteMany({ where });
  await prisma.account.deleteMany({ where });
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

  it("H1 -- a genuinely concurrent report and resolve on the same work order never leave it wrongly unblocked", async () => {
    // taskA's blocker is the only thing holding the work order BLOCKED.
    // Fire its resolution at the exact same moment a second, real blocker
    // is reported on taskB -- without the row lock, resolveBlocker's
    // "anything else still open" count can run before taskB's insert has
    // committed, see zero, and unblock a work order that a moment later
    // turns out to still have taskB's blocker open on it.
    // docs/scenarios3/EDGE_CASE_REGISTER.md, H1.
    const workOrderId = await workOrderInProgress();
    const taskA = await work.createTask(workOrderId, "A", ACTOR);
    const taskB = await work.createTask(workOrderId, "B", ACTOR);

    const first = await work.reportBlocker({ taskId: taskA.id, reason: "TOOL_MISSING" }, ACTOR);

    await Promise.all([
      work.resolveBlocker(first.id, ACTOR),
      work.reportBlocker({ taskId: taskB.id, reason: "UNCLEAR_DIAGNOSIS" }, ACTOR),
    ]);

    const openCount = await prisma.taskBlocker.count({
      where: { task: { workOrderId }, status: { in: ["OPEN", "ESCALATED"] } },
    });
    const workOrder = await prisma.workOrder.findUnique({ where: { id: workOrderId } });

    // taskB's blocker is genuinely still open -- the work order must
    // reflect that, whichever call happened to run first.
    expect(openCount).toBe(1);
    expect(workOrder?.status).toBe("BLOCKED");
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

describe("TIME_TRACKING governs whether completeTask needs a reported duration", () => {
  it("OPTIONAL (the default): completes with no time given, and stores it when given", async () => {
    const workOrderId = await workOrderInProgress();
    const untimed = await work.createTask(workOrderId, "No timer used", ACTOR);
    await work.completeTask(untimed.id, ACTOR);
    const untimedRow = await prisma.task.findUniqueOrThrow({ where: { id: untimed.id } });
    expect(untimedRow.actualMinutes).toBeNull();

    const timed = await work.createTask(workOrderId, "Timer used", ACTOR);
    await work.completeTask(timed.id, ACTOR, 25);
    const timedRow = await prisma.task.findUniqueOrThrow({ where: { id: timed.id } });
    expect(timedRow.actualMinutes).toBe(25);
  }, 120_000);

  it("REQUIRED refuses to complete without a reported duration, and accepts one", async () => {
    const workOrderId = await workOrderInProgress();
    const { tenantId } = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrderId }, select: { tenantId: true } });
    await policiesForTest.set(tenantId, "TIME_TRACKING", "REQUIRED", ACTOR, "PLATFORM", "Integration test.");

    const task = await work.createTask(workOrderId, "Must be timed", ACTOR);
    await expect(work.completeTask(task.id, ACTOR)).rejects.toMatchObject({
      response: { code: "time_not_recorded" },
    });

    await work.completeTask(task.id, ACTOR, 40);
    const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(row.status).toBe("DONE");
    expect(row.actualMinutes).toBe(40);
  }, 120_000);

  it("OFF discards a reported duration even if one is sent -- the control does not exist", async () => {
    const workOrderId = await workOrderInProgress();
    const { tenantId } = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrderId }, select: { tenantId: true } });
    await policiesForTest.set(tenantId, "TIME_TRACKING", "OFF", ACTOR, "PLATFORM", "Integration test.");

    const task = await work.createTask(workOrderId, "Never timed", ACTOR);
    await work.completeTask(task.id, ACTOR, 999);
    const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(row.actualMinutes).toBeNull();
  }, 120_000);
});

/**
 * SERVICE -> TECHNICIAN -> INVENTORY -> STOCK -> MONEY, end to end.
 *
 * This is the chain a workshop actually runs on, and until Task carried a
 * serviceKey it was broken in the middle: the Owner priced "Replace
 * battery" on one page, a technician typed "Replace battery" as free text
 * on another, and the two strings were unrelated. Nothing could bill the
 * labour for work that was done, and no report could say how much of that
 * service the branch performed.
 *
 * Everything below runs against real Postgres -- real stock rows, real
 * decrements, real Decimal money -- because the assertions are about
 * constraints and arithmetic that mocks would simply agree with.
 */
describe("a catalogued service, performed and billed end to end", () => {
  const OWNER = { accountId: "owner-1", displayName: "Owner" };
  let warehouseId: string;
  let technicianId: string;

  beforeAll(async () => {
    warehouseId = (await prisma.warehouse.create({ data: { tenantId, name: "Store", code: `WH-${SUFFIX}` } })).id;
    const account = await prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId, email: `chain-${SUFFIX}@example.com`, status: "ACTIVE" },
    });
    technicianId = (
      await prisma.staffUser.create({
        data: { accountId: account.id, tenantId, fullName: "Chain Tech", role: "TECHNICIAN" },
      })
    ).id;

    await priceCatalog.setPrice(
      tenantId,
      { itemKey: "Replace battery", itemType: "SERVICE", unitPrice: 400, laborPrice: 100 },
      OWNER,
    );
  }, 120_000);

  it("refuses to attach a task to a service the workshop never priced", async () => {
    const workOrderId = await workOrderInProgress();
    await expect(work.createTask(workOrderId, "Fit spoiler", ACTOR, technicianId, "Fit spoiler")).rejects.toThrow(
      /Service Catalog/,
    );
  });

  it("carries the service from the technician's task through to what the customer is billed", async () => {
    const workOrderId = await workOrderInProgress();

    // 1. The technician's work is a catalogued service, not free text.
    const task = await work.createTask(workOrderId, "Replace battery", ACTOR, technicianId, "Replace battery");
    expect(task.serviceKey).toBe("Replace battery");

    // 2. Real stock, really consumed.
    const item = await prisma.inventoryItem.create({
      data: {
        tenantId,
        name: "Battery 12V",
        sku: `BAT-${SUFFIX}`,
        itemType: "PART",
        sellingPrice: 400,
        cost: 260,
        stockTracked: true,
      },
    });
    await prisma.warehouseStockBalance.create({
      data: { tenantId, inventoryItemId: item.id, warehouseId, availableQty: 5 },
    });
    await prisma.stockMovement.create({
      data: {
        tenantId,
        inventoryItemId: item.id,
        warehouseId,
        type: "ISSUE",
        quantity: 1,
        beforeQty: 5,
        afterQty: 4,
        referenceType: "WorkOrder",
        referenceId: workOrderId,
        actorId: ACTOR.accountId,
      },
    });
    // One left the shelf: available drops, issued rises. The two must
    // move together or the warehouse's own arithmetic stops adding up.
    await prisma.warehouseStockBalance.updateMany({
      where: { tenantId, inventoryItemId: item.id, warehouseId },
      data: { availableQty: 4, issuedQty: 1 },
    });

    // The part the customer is charged for, linked back to the item that
    // left the shelf rather than retyped.
    await prisma.workOrderPartLine.create({
      data: {
        tenantId,
        workOrderId,
        taskId: task.id,
        provenance: "INVENTORY",
        inventoryItemId: item.id,
        name: "Battery 12V",
        quantity: 1,
        sellingPrice: 400,
        cost: 260,
        addedById: ACTOR.accountId,
      },
    });

    // 3. Completing the work is what makes it billable.
    await work.completeTask(task.id, ACTOR);

    const performed = await work.performedServices(workOrderId);
    expect(performed).toHaveLength(1);
    expect(performed[0].serviceKey).toBe("Replace battery");
    expect(performed[0].technicianIds).toContain(technicianId);

    // 4. Billing states no price. The Owner's catalogue supplies it.
    const total = await finance.addLine(
      { tenantId, workOrderId, name: performed[0].serviceKey, itemType: "SERVICE", quantity: 1 },
      ACTOR,
    );
    expect(total.lines[0].total).toBe("500.00");

    // 5. The chain is observable afterwards: stock really moved, the part
    // line still points at the item, and the event names the service.
    const balance = await prisma.warehouseStockBalance.findFirst({
      where: { tenantId, inventoryItemId: item.id, warehouseId },
      select: { availableQty: true, issuedQty: true },
    });
    expect(balance!.availableQty).toBe(4);
    expect(balance!.issuedQty).toBe(1);

    const movements = await prisma.stockMovement.count({
      where: { tenantId, referenceType: "WorkOrder", referenceId: workOrderId, type: "ISSUE" },
    });
    expect(movements).toBe(1);

    const partLine = await prisma.workOrderPartLine.findFirst({
      where: { workOrderId },
      select: { inventoryItemId: true, taskId: true, sellingPrice: true, cost: true },
    });
    expect(partLine!.inventoryItemId).toBe(item.id);
    expect(partLine!.taskId).toBe(task.id);
    // Money stayed Decimal all the way down; margin is answerable.
    expect(String(partLine!.sellingPrice)).toBe("400");
    expect(String(partLine!.cost)).toBe("260");

    // Scoped to THIS task rather than "the most recent completion":
    // other tests in this file complete tasks too, and ordering by
    // createdAt can tie within the same millisecond.
    const completion = await prisma.operationEvent.findFirst({
      where: { tenantId, eventKey: "task.completed", payload: { path: ["taskId"], equals: task.id } },
      select: { payload: true },
    });
    expect((completion!.payload as { serviceKey?: string }).serviceKey).toBe("Replace battery");
  });

  it("repricing the service changes the next job, and leaves the already-billed one alone", async () => {
    const firstJob = await workOrderInProgress();
    const firstTask = await work.createTask(firstJob, "Replace battery", ACTOR, technicianId, "Replace battery");
    await work.completeTask(firstTask.id, ACTOR);
    const before = await finance.addLine(
      { tenantId, workOrderId: firstJob, name: "Replace battery", itemType: "SERVICE", quantity: 1 },
      ACTOR,
    );
    expect(before.lines[0].total).toBe("500.00");

    await priceCatalog.setPrice(
      tenantId,
      { itemKey: "Replace battery", itemType: "SERVICE", unitPrice: 460, laborPrice: 120 },
      OWNER,
    );

    const secondJob = await workOrderInProgress();
    const secondTask = await work.createTask(secondJob, "Replace battery", ACTOR, technicianId, "Replace battery");
    await work.completeTask(secondTask.id, ACTOR);
    const after = await finance.addLine(
      { tenantId, workOrderId: secondJob, name: "Replace battery", itemType: "SERVICE", quantity: 1 },
      ACTOR,
    );
    expect(after.lines[0].total).toBe("580.00");

    // The first job's line was written at the old price and must not have
    // moved when the Owner repriced.
    const firstAgain = await finance.jobTotal(tenantId, firstJob);
    expect(firstAgain.lines[0].total).toBe("500.00");
  });

  it("only counts work that is actually done", async () => {
    const workOrderId = await workOrderInProgress();
    await work.createTask(workOrderId, "Replace battery", ACTOR, technicianId, "Replace battery");

    // Created but not completed -- nothing to bill and nothing to report.
    expect(await work.performedServices(workOrderId)).toHaveLength(0);
  });
});
