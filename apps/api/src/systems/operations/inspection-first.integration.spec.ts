/**
 * The inspection-first boundary, proved against real Postgres.
 *
 * The rule this pins: **a Task exists only for work the effective
 * workflow currently authorizes.** Diagnostic activity before that point
 * is an Inspection, which is the one work vehicle a pre-authorization job
 * legitimately has.
 *
 * Before this boundary existed, every one of the paths below was open.
 * `createTask`, `startTask`, `completeTask`, `addExternalPartLine` and
 * both PartRequest entry points checked their own record and nothing
 * else, so a technician could plan, start, part-fit, complete and bill a
 * full repair while the job sat in REGISTERED and the customer had agreed
 * to nothing. The finish gate was the only objection, and it fired after
 * the labour was spent -- which does not prevent the work, it traps the
 * car.
 *
 * These are integration tests because the answer comes from stored
 * capabilities, stored policies and real rows. A mocked lifecycle would
 * prove only that the mock was called.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { WorkOrderLifecycleService } from "./work-order-lifecycle.service";
import { GateEvaluatorService } from "./gate-evaluator.service";
import { OperationEventsService } from "./operation-events.service";
import { CustomerSafeProjectionService } from "./customer-safe-projection.service";
import { TechnicianWorkService } from "./technician-work.service";
import { PartRequestService } from "../inventory/part-request.service";
import { StockService } from "../inventory/stock.service";
import { CapabilityResolutionService } from "../../control/capabilities/capability-resolution.service";
import { AuditService } from "../../audit/audit.service";
import type { PrismaService } from "../../runtime/database/prisma.service";
import { PolicyResolutionService } from "../../control/policies/policy-resolution.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;

const policiesForTest = new PolicyResolutionService(
  asService,
  new AuditService(asService),
  new CapabilityResolutionService(asService),
);

const capabilities = new CapabilityResolutionService(asService);
const events = new OperationEventsService(asService, new AuditService(asService), new CustomerSafeProjectionService());
const gates = new GateEvaluatorService(asService, policiesForTest);
const lifecycle = new WorkOrderLifecycleService(asService, capabilities, events, gates, policiesForTest);
const techWork = new TechnicianWorkService(asService, events, lifecycle, policiesForTest);
const stock = new StockService(asService);
const partRequests = new PartRequestService(asService, capabilities, stock, events, policiesForTest, lifecycle);

const ACTOR = { accountId: "tech-1", displayName: "Technician", actorType: "TENANT_STAFF" as const };
const SUFFIX = `insp-${Date.now()}`;

let tenantId: string;
let planId: string;
let branchId: string;
let customerId: string;
let assetId: string;
let inventoryItemId: string;

async function newWorkOrder(inspectionDeclined = false) {
  return prisma.workOrder.create({
    data: { tenantId, branchId, assetId, customerId, status: "DRAFT", inspectionDeclined },
  });
}

/** Records a completed inspection, the way the technician's endpoint does. */
async function inspect(workOrderId: string) {
  return techWork.recordInspection(
    { workOrderId, technicianId: "tech-1", type: "QUICK", fields: {}, note: "Checked." },
    ACTOR,
  );
}

/**
 * The whole legal journey, for the tests that need a job past the
 * boundary rather than at it.
 *
 * BEYOND_INITIAL_SCOPE is this tenant's default approval scope, which is
 * exactly why the APPROVE straight out of UNDER_INSPECTION is available:
 * work inside what was already agreed needs no separate decision.
 */
async function authorize(workOrderId: string) {
  await lifecycle.apply(workOrderId, "REGISTER", ACTOR);
  await lifecycle.apply(workOrderId, "START_INSPECTION", ACTOR);
  await inspect(workOrderId);
  await lifecycle.apply(workOrderId, "APPROVE", ACTOR);
}

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: SUFFIX,
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
      name: `WS ${SUFFIX}`,
      nameNormalized: `ws ${SUFFIX}`,
      slug: SUFFIX,
      customerRegistrationCode: SUFFIX.toUpperCase(),
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
  customerId = (await prisma.customer.create({ data: { tenantId, fullName: "Customer", phone: "0100000001" } })).id;
  assetId = (await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `P-${SUFFIX}` } })).id;
  await prisma.warehouse.create({ data: { tenantId, name: "Store", code: "ST" } });
  inventoryItemId = (
    await prisma.inventoryItem.create({
      data: { tenantId, sku: `SKU-${SUFFIX}`, name: "Brake pad", itemType: "PART", sellingPrice: "120.00", workOrderUsable: true },
    })
  ).id;
}, 180_000);

afterAll(async () => {
  const where = { tenantId };
  await prisma.partRequest.deleteMany({ where });
  await prisma.workOrderPartLine.deleteMany({ where });
  await prisma.taskBlocker.deleteMany({ where });
  await prisma.taskAssignment.deleteMany({ where });
  await prisma.task.deleteMany({ where });
  await prisma.customerDecisionItem.deleteMany({ where });
  await prisma.customerDecisionRequest.deleteMany({ where });
  await prisma.fault.deleteMany({ where });
  await prisma.inspection.deleteMany({ where });
  await prisma.operationEvent.deleteMany({ where });
  await prisma.auditLog.deleteMany({ where });
  await prisma.customerTimelineEvent.deleteMany({ where });
  await prisma.workOrder.deleteMany({ where });
  await prisma.inventoryItem.deleteMany({ where });
  await prisma.warehouse.deleteMany({ where });
  await prisma.asset.deleteMany({ where });
  await prisma.customer.deleteMany({ where });
  await prisma.branch.deleteMany({ where });
  await prisma.workshopPolicy.deleteMany({ where });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 180_000);

describe("repair work is refused before the workflow authorizes it", () => {
  it("refuses to plan a task on a job that is only registered", async () => {
    const job = await newWorkOrder();
    await lifecycle.apply(job.id, "REGISTER", ACTOR);

    await expect(techWork.createTask(job.id, "Replace pads", ACTOR)).rejects.toMatchObject({
      response: { code: "work_not_authorized" },
    });

    // And nothing was written. A refusal that still leaves the row behind
    // is not a refusal.
    expect(await prisma.task.count({ where: { workOrderId: job.id } })).toBe(0);
  });

  it("refuses to plan a task while the inspection is still under way", async () => {
    const job = await newWorkOrder();
    await lifecycle.apply(job.id, "REGISTER", ACTOR);
    await lifecycle.apply(job.id, "START_INSPECTION", ACTOR);

    await expect(techWork.createTask(job.id, "Replace pads", ACTOR)).rejects.toMatchObject({
      response: { code: "work_not_authorized" },
    });
  });

  it("refuses to plan a task after the inspection but before the approval it still needs", async () => {
    // ALL_WORK: this workshop wants a decision on everything, so the
    // direct UNDER_INSPECTION -> APPROVED_FOR_WORK edge is dark and a
    // completed inspection alone does not authorize anything.
    await policiesForTest.set(
      tenantId,
      "APPROVAL_REQUIRED_SCOPE",
      "ALL_WORK",
      ACTOR,
      "PLATFORM",
      "Integration test: nothing proceeds without a customer decision.",
    );

    try {
      const job = await newWorkOrder();
      await lifecycle.apply(job.id, "REGISTER", ACTOR);
      await lifecycle.apply(job.id, "START_INSPECTION", ACTOR);
      await inspect(job.id);
      await lifecycle.apply(job.id, "REQUEST_APPROVAL", ACTOR);

      // Inspected, findings in, customer asked -- and still not authorized,
      // because under ALL_WORK the customer has not answered.
      await expect(techWork.createTask(job.id, "Replace pads", ACTOR)).rejects.toMatchObject({
        response: { code: "work_not_authorized" },
      });
    } finally {
      await policiesForTest.set(
        tenantId,
        "APPROVAL_REQUIRED_SCOPE",
        "BEYOND_INITIAL_SCOPE",
        ACTOR,
        "PLATFORM",
        "Integration test: restoring the default.",
      );
    }
  });

  it("allows the task once the job is authorized, and stamps when it started", async () => {
    const job = await newWorkOrder();
    await authorize(job.id);

    const task = await techWork.createTask(job.id, "Replace pads", ACTOR);
    await techWork.startTask(task.id, ACTOR);

    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.status).toBe("IN_PROGRESS");
    expect(stored.startedAt).toBeInstanceOf(Date);
  });

  it("refuses to start a task whose job fell back behind the boundary", async () => {
    const job = await newWorkOrder();
    await authorize(job.id);
    const task = await techWork.createTask(job.id, "Replace pads", ACTOR);

    // The job goes back to the customer mid-flight. The task was planned
    // while it was legal; starting it now is not.
    await lifecycle.apply(job.id, "START_WORK", ACTOR);
    await lifecycle.apply(job.id, "ASK_CUSTOMER", ACTOR);
    await prisma.workOrder.update({ where: { id: job.id }, data: { status: "AWAITING_CUSTOMER_APPROVAL" } });

    await expect(techWork.startTask(task.id, ACTOR)).rejects.toMatchObject({
      response: { code: "work_not_authorized" },
    });
  });
});

describe("the inventory and billing doors are the same door", () => {
  it("refuses a part request on an unauthorized job", async () => {
    const job = await newWorkOrder();
    await lifecycle.apply(job.id, "REGISTER", ACTOR);

    await expect(
      partRequests.request({ tenantId, workOrderId: job.id, inventoryItemId, quantity: 1 }, ACTOR),
    ).rejects.toMatchObject({ response: { code: "work_not_authorized" } });

    expect(await prisma.partRequest.count({ where: { workOrderId: job.id } })).toBe(0);
  });

  it("refuses a whole cart on an unauthorized job, on every submit and not just the first", async () => {
    const job = await newWorkOrder();
    await lifecycle.apply(job.id, "REGISTER", ACTOR);
    const cartKey = `cart-${job.id}`;

    for (const attempt of [1, 2]) {
      await expect(
        partRequests.requestMany(
          { tenantId, workOrderId: job.id, cartKey, lines: [{ inventoryItemId, quantity: 2 }] },
          ACTOR,
        ),
      ).rejects.toMatchObject({ response: { code: "work_not_authorized" } });
      expect(attempt).toBeLessThan(3);
    }

    expect(await prisma.partRequest.count({ where: { workOrderId: job.id } })).toBe(0);
  });

  it("allows a part the DIAGNOSIS consumes, named by its own inspection", async () => {
    // The case the boundary must not break: a diagnosis legitimately uses
    // stock before any repair is agreed.
    const job = await newWorkOrder();
    await lifecycle.apply(job.id, "REGISTER", ACTOR);
    await lifecycle.apply(job.id, "START_INSPECTION", ACTOR);
    const inspection = await inspect(job.id);

    const created = await partRequests.request(
      { tenantId, workOrderId: job.id, inventoryItemId, quantity: 1, inspectionId: inspection.id },
      ACTOR,
    );

    const stored = await prisma.partRequest.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.inspectionId).toBe(inspection.id);
  });

  it("refuses an inspection id belonging to another job", async () => {
    // Otherwise `inspectionId` would be the bypass it exists to prevent:
    // quote any inspection and walk the store empty.
    const diagnosed = await newWorkOrder();
    await lifecycle.apply(diagnosed.id, "REGISTER", ACTOR);
    await lifecycle.apply(diagnosed.id, "START_INSPECTION", ACTOR);
    const inspection = await inspect(diagnosed.id);

    const other = await newWorkOrder();
    await lifecycle.apply(other.id, "REGISTER", ACTOR);

    await expect(
      partRequests.request(
        { tenantId, workOrderId: other.id, inventoryItemId, quantity: 1, inspectionId: inspection.id },
        ACTOR,
      ),
    ).rejects.toMatchObject({ response: { code: "inspection_not_on_this_job" } });
  });

  it("refuses an external part line on an unauthorized job", async () => {
    // The shortest route in the product from unauthorized job to invoice
    // line: WorkOrderPartLine is billable on creation and never passes
    // through inventory at all.
    const job = await newWorkOrder();
    await lifecycle.apply(job.id, "REGISTER", ACTOR);

    await expect(
      techWork.addExternalPartLine(job.id, { name: "Customer's own filter", provenance: "CUSTOMER_SUPPLIED" }, ACTOR),
    ).rejects.toMatchObject({ response: { code: "work_not_authorized" } });

    expect(await prisma.workOrderPartLine.count({ where: { workOrderId: job.id } })).toBe(0);
  });
});

describe("a late inspection cannot legitimize work that already happened", () => {
  it("refuses to approve a job for work with no inspection recorded", async () => {
    const job = await newWorkOrder();
    await lifecycle.apply(job.id, "REGISTER", ACTOR);
    await lifecycle.apply(job.id, "START_INSPECTION", ACTOR);

    // Walking UNDER_INSPECTION -> APPROVED_FOR_WORK without recording
    // anything was how a job could reach "authorized" having been
    // inspected only in name.
    await expect(lifecycle.apply(job.id, "APPROVE", ACTOR)).rejects.toMatchObject({
      response: { code: "gate_blocked" },
    });
  });

  it("does not accept an inspection completed after the first task started", async () => {
    const job = await newWorkOrder();
    await authorize(job.id);
    const task = await techWork.createTask(job.id, "Replace pads", ACTOR);
    await techWork.startTask(task.id, ACTOR);

    // Rewrite history the way a backfill would: the only inspection on
    // this job now finished an hour AFTER the repair began.
    const startedAt = (await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).startedAt as Date;
    await prisma.inspection.updateMany({
      where: { workOrderId: job.id },
      data: { completedAt: new Date(startedAt.getTime() + 3_600_000) },
    });

    const result = await gates.evaluate(
      job.id,
      ["inspection_completed"],
      await capabilities.resolveCurrent(tenantId),
      "FINISH",
    );
    expect(result.passed).toBe(false);
  });

  it("accepts an inspection completed before the first task started", async () => {
    const job = await newWorkOrder();
    await authorize(job.id);
    const task = await techWork.createTask(job.id, "Replace pads", ACTOR);
    await techWork.startTask(task.id, ACTOR);

    const result = await gates.evaluate(
      job.id,
      ["inspection_completed"],
      await capabilities.resolveCurrent(tenantId),
      "FINISH",
    );
    expect(result.passed).toBe(true);
  });
});

describe("the policy branches the boundary must not break", () => {
  it("lets a declined inspection authorize work with no inspection at all", async () => {
    // CUSTOMER_MAY_DECLINE is this tenant's default. A customer who names
    // one service and refuses a diagnostic must not be blocked by the step
    // they refused -- the same rule the finish gate has always honoured.
    const job = await newWorkOrder(true);
    await lifecycle.apply(job.id, "REGISTER", ACTOR);
    await lifecycle.apply(job.id, "REQUEST_APPROVAL", ACTOR);
    await lifecycle.apply(job.id, "APPROVE", ACTOR);

    const task = await techWork.createTask(job.id, "Oil change, as asked for", ACTOR);
    expect(task.id).toBeTruthy();

    expect(await prisma.inspection.count({ where: { workOrderId: job.id } })).toBe(0);
  });

  it("closes the walk-in route entirely under ALWAYS_INSPECT", async () => {
    await policiesForTest.set(
      tenantId,
      "INSPECTION_REQUIRED",
      "ALWAYS_INSPECT",
      ACTOR,
      "PLATFORM",
      "Integration test: every job is inspected.",
    );

    try {
      // Declared declined at intake, but this workshop does not offer that
      // route -- the edge is dark, so the refusal comes from the graph.
      const job = await newWorkOrder(true);
      await lifecycle.apply(job.id, "REGISTER", ACTOR);

      await expect(lifecycle.apply(job.id, "REQUEST_APPROVAL", ACTOR)).rejects.toMatchObject({
        response: { code: "transition_not_allowed" },
      });
      await expect(techWork.createTask(job.id, "Oil change", ACTOR)).rejects.toMatchObject({
        response: { code: "work_not_authorized" },
      });
    } finally {
      await policiesForTest.set(
        tenantId,
        "INSPECTION_REQUIRED",
        "CUSTOMER_MAY_DECLINE",
        ACTOR,
        "PLATFORM",
        "Integration test: restoring the default.",
      );
    }
  });

  it("never requires a decision item for work under BEYOND_INITIAL_SCOPE", async () => {
    // The invariant that must NOT be enforced: "every task carries an
    // approved recommendation". Two shipped approval scopes allow real
    // work with no CustomerDecisionItem, and requiring one would forbid
    // legitimate jobs in a valid profile.
    const job = await newWorkOrder();
    await authorize(job.id);

    const task = await techWork.createTask(job.id, "Ad-hoc work nobody quoted", ACTOR);

    expect(task.decisionItemId).toBeNull();
    expect(await prisma.customerDecisionItem.count({ where: { decisionRequest: { workOrderId: job.id } } })).toBe(0);
  });
});
