/**
 * T0/T1 Technician Inspection Lifecycle -- integration tests.
 *
 * Pins the exact behavior introduced in Phase T0/T1:
 *
 *   - startInspection() is atomic (WorkOrder lock + Inspection row +
 *     lifecycle transition in one Postgres transaction).
 *   - startInspection() is idempotent: a double-tap returns the existing
 *     open Inspection row without creating a second one.
 *   - recordInspection() finds and completes the open row; falls back to
 *     creating a completed row for backward-compat jobs.
 *   - Policy-aware post-inspection APPROVE:
 *       BEYOND_INITIAL_SCOPE -> always attempt APPROVE
 *       CRITICAL_ONLY        -> per-fault lineage check governs whether to attempt
 *       ALL_WORK             -> never attempt APPROVE
 *   - createFault() refuses an inspectionId from another job.
 *
 * These are integration tests because the answer comes from stored
 * policies, capabilities and real Postgres rows. A mocked lifecycle
 * would only prove the mock was called.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { WorkOrderLifecycleService } from "./work-order-lifecycle.service";
import { GateEvaluatorService } from "./gate-evaluator.service";
import { OperationEventsService } from "./operation-events.service";
import { CustomerSafeProjectionService } from "./customer-safe-projection.service";
import { TechnicianWorkService } from "./technician-work.service";
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

const ACTOR = { accountId: "tech-t01", displayName: "Technician T01", actorType: "TENANT_STAFF" as const };
const SUFFIX = `t01-${Date.now()}`;

let tenantId: string;
let planId: string;
let branchId: string;
let customerId: string;
let assetId: string;

async function newWorkOrder() {
  return prisma.workOrder.create({
    data: { tenantId, branchId, assetId, customerId, status: "DRAFT" },
  });
}

/** Bring a work order to UNDER_INSPECTION via the canonical path. */
async function toUnderInspection(workOrderId: string) {
  await lifecycle.apply(workOrderId, "REGISTER", ACTOR);
  return techWork.startInspection(workOrderId, ACTOR);
}

/** Full authorize path -- used by tests that need a job past the boundary. */
async function fullAuthorize(workOrderId: string) {
  await toUnderInspection(workOrderId);
  return techWork.recordInspection(
    { workOrderId, technicianId: ACTOR.accountId, type: "QUICK", fields: {}, note: "OK" },
    ACTOR,
  );
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

  branchId = (await prisma.branch.create({ data: { tenantId, name: "Main", code: `MN-${SUFFIX}` } })).id;
  customerId = (await prisma.customer.create({ data: { tenantId, fullName: "Customer", phone: "0100000001" } })).id;
  assetId = (await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `P-${SUFFIX}` } })).id;
}, 180_000);

afterAll(async () => {
  const where = { tenantId };
  await prisma.customerDecisionItem.deleteMany({ where });
  await prisma.customerDecisionRequest.deleteMany({ where });
  await prisma.fault.deleteMany({ where });
  await prisma.inspection.deleteMany({ where });
  await prisma.task.deleteMany({ where });
  await prisma.operationEvent.deleteMany({ where });
  await prisma.auditLog.deleteMany({ where });
  await prisma.customerTimelineEvent.deleteMany({ where });
  await prisma.workOrder.deleteMany({ where });
  await prisma.asset.deleteMany({ where });
  await prisma.customer.deleteMany({ where });
  await prisma.branch.deleteMany({ where });
  await prisma.workshopPolicy.deleteMany({ where });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 180_000);

// ---------------------------------------------------------------------------
// startInspection() -- atomicity and idempotency
// ---------------------------------------------------------------------------

describe("startInspection() -- atomicity", () => {
  it("creates exactly one open Inspection row and moves the WorkOrder atomically", async () => {
    const job = await newWorkOrder();
    const result = await toUnderInspection(job.id) as { inspectionId: string };

    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: job.id }, select: { status: true } });
    expect(wo.status).toBe("UNDER_INSPECTION");

    const inspections = await prisma.inspection.findMany({ where: { workOrderId: job.id } });
    expect(inspections).toHaveLength(1);
    expect(inspections[0].completedAt).toBeNull();
    expect(result.inspectionId).toBe(inspections[0].id);
  });

  it("is idempotent: double-tap returns the same inspectionId and no duplicate row", async () => {
    const job = await newWorkOrder();
    const first = (await toUnderInspection(job.id)) as { inspectionId: string };
    const second = (await techWork.startInspection(job.id, ACTOR)) as { inspectionId: string };

    expect(second.inspectionId).toBe(first.inspectionId);

    const count = await prisma.inspection.count({ where: { workOrderId: job.id, completedAt: null } });
    expect(count).toBe(1);
  });

  it("refuses to start inspection from DRAFT (graph does not allow it)", async () => {
    const job = await newWorkOrder();
    await expect(techWork.startInspection(job.id, ACTOR)).rejects.toMatchObject({
      response: { code: "transition_not_allowed" },
    });
    expect(await prisma.inspection.count({ where: { workOrderId: job.id } })).toBe(0);
    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: job.id }, select: { status: true } });
    expect(wo.status).toBe("DRAFT");
  });
});

describe("startInspection() -- concurrency safety", () => {
  it(
    "concurrent calls produce exactly one Inspection row and resolve to the same inspectionId",
    async () => {
      const job = await newWorkOrder();
      await lifecycle.apply(job.id, "REGISTER", ACTOR);

      const [r1, r2] = await Promise.allSettled([
        techWork.startInspection(job.id, ACTOR),
        techWork.startInspection(job.id, ACTOR),
      ]);

      const successes = [r1, r2].filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ inspectionId: string }>[];
      expect(successes.length).toBeGreaterThanOrEqual(1);

      const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: job.id }, select: { status: true } });
      expect(wo.status).toBe("UNDER_INSPECTION");

      const rows = await prisma.inspection.findMany({ where: { workOrderId: job.id, completedAt: null } });
      expect(rows).toHaveLength(1);

      const ids = successes.map((r) => r.value.inspectionId);
      expect(new Set(ids).size).toBe(1);
      expect(ids[0]).toBe(rows[0].id);
    },
    60_000,
  );
});

// ---------------------------------------------------------------------------
// recordInspection() -- open-row completion and backward-compat
// ---------------------------------------------------------------------------

describe("recordInspection() -- open-row completion", () => {
  it("completes the open Inspection row (does not create a second row)", async () => {
    const job = await newWorkOrder();
    const { inspectionId } = await toUnderInspection(job.id) as { inspectionId: string };

    await techWork.recordInspection(
      { workOrderId: job.id, technicianId: ACTOR.accountId, type: "FULL", fields: { mileage: 42000 }, note: "All good" },
      ACTOR,
    );

    const inspections = await prisma.inspection.findMany({ where: { workOrderId: job.id } });
    expect(inspections).toHaveLength(1);
    expect(inspections[0].id).toBe(inspectionId);
    expect(inspections[0].completedAt).not.toBeNull();
    expect(inspections[0].type).toBe("FULL");
  });

  it("backward-compat: creates a completed row if no open row exists (pre-T0 job)", async () => {
    const job = await newWorkOrder();
    // Reach UNDER_INSPECTION via lifecycle directly -- no open row (old path).
    await lifecycle.apply(job.id, "REGISTER", ACTOR);
    await lifecycle.apply(job.id, "START_INSPECTION", ACTOR);

    expect(await prisma.inspection.count({ where: { workOrderId: job.id } })).toBe(0);

    await techWork.recordInspection(
      { workOrderId: job.id, technicianId: ACTOR.accountId, type: "QUICK", fields: {} },
      ACTOR,
    );

    const inspections = await prisma.inspection.findMany({ where: { workOrderId: job.id } });
    expect(inspections).toHaveLength(1);
    expect(inspections[0].completedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Policy-aware post-inspection progression
// ---------------------------------------------------------------------------

describe("BEYOND_INITIAL_SCOPE -- inspection completes -> auto-approved", () => {
  it("moves the WorkOrder to APPROVED_FOR_WORK after a completed inspection", async () => {
    const job = await newWorkOrder();
    await fullAuthorize(job.id);

    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: job.id }, select: { status: true } });
    expect(wo.status).toBe("APPROVED_FOR_WORK");
  });
});

describe("ALL_WORK -- inspection completion does not bypass customer approval", () => {
  it("leaves the WorkOrder at UNDER_INSPECTION after recordInspection", async () => {
    await policiesForTest.set(tenantId, "APPROVAL_REQUIRED_SCOPE", "ALL_WORK", ACTOR, "PLATFORM", "T01 test: verify policy behavior");
    try {
      const job = await newWorkOrder();
      const result = await fullAuthorize(job.id) as { pendingCriticalDecisions: boolean };

      const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: job.id }, select: { status: true } });
      expect(wo.status).toBe("UNDER_INSPECTION");
      expect(result.pendingCriticalDecisions).toBe(false);
    } finally {
      await policiesForTest.set(tenantId, "APPROVAL_REQUIRED_SCOPE", "BEYOND_INITIAL_SCOPE", ACTOR, "PLATFORM", "T01 test: restore");
    }
  });
});

describe("CRITICAL_ONLY -- no CRITICAL faults -> auto-approved", () => {
  it("moves the WorkOrder to APPROVED_FOR_WORK when only non-CRITICAL faults exist", async () => {
    await policiesForTest.set(tenantId, "APPROVAL_REQUIRED_SCOPE", "CRITICAL_ONLY", ACTOR, "PLATFORM", "T01 test: verify policy behavior");
    try {
      const job = await newWorkOrder();
      await toUnderInspection(job.id);

      await techWork.createFault({ workOrderId: job.id, description: "Worn pads", severity: "HIGH" }, ACTOR);

      const result = await techWork.recordInspection(
        { workOrderId: job.id, technicianId: ACTOR.accountId, type: "QUICK", fields: {} },
        ACTOR,
      ) as { pendingCriticalDecisions: boolean };

      const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: job.id }, select: { status: true } });
      expect(wo.status).toBe("APPROVED_FOR_WORK");
      expect(result.pendingCriticalDecisions).toBe(false);
    } finally {
      await policiesForTest.set(tenantId, "APPROVAL_REQUIRED_SCOPE", "BEYOND_INITIAL_SCOPE", ACTOR, "PLATFORM", "T01 test: restore");
    }
  });
});

describe("CRITICAL_ONLY -- CRITICAL fault without CustomerDecisionItem -> remains UNDER_INSPECTION", () => {
  it("does not attempt APPROVE and returns pendingCriticalDecisions: true", async () => {
    await policiesForTest.set(tenantId, "APPROVAL_REQUIRED_SCOPE", "CRITICAL_ONLY", ACTOR, "PLATFORM", "T01 test: verify policy behavior");
    try {
      const job = await newWorkOrder();
      const { inspectionId } = await toUnderInspection(job.id) as { inspectionId: string };

      await techWork.createFault(
        { workOrderId: job.id, inspectionId, description: "Brake failure", severity: "CRITICAL" },
        ACTOR,
      );

      const result = await techWork.recordInspection(
        { workOrderId: job.id, technicianId: ACTOR.accountId, type: "QUICK", fields: {} },
        ACTOR,
      ) as { pendingCriticalDecisions: boolean };

      const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: job.id }, select: { status: true } });
      expect(wo.status).toBe("UNDER_INSPECTION");
      expect(result.pendingCriticalDecisions).toBe(true);
    } finally {
      await policiesForTest.set(tenantId, "APPROVAL_REQUIRED_SCOPE", "BEYOND_INITIAL_SCOPE", ACTOR, "PLATFORM", "T01 test: restore");
    }
  });
});

describe("CRITICAL_ONLY -- CRITICAL fault with CustomerDecisionItem -> CustomerDecisionService owns APPROVE", () => {
  it("recordInspection does not move job to APPROVED_FOR_WORK; pendingCriticalDecisions is false", async () => {
    await policiesForTest.set(tenantId, "APPROVAL_REQUIRED_SCOPE", "CRITICAL_ONLY", ACTOR, "PLATFORM", "T01 test: verify policy behavior");
    try {
      const job = await newWorkOrder();
      const { inspectionId } = await toUnderInspection(job.id) as { inspectionId: string };

      const fault = await techWork.createFault(
        { workOrderId: job.id, inspectionId, description: "Structural crack", severity: "CRITICAL" },
        ACTOR,
      );

      // Wire up the lineage: CustomerDecisionItem.faultId = fault.id
      const req = await prisma.customerDecisionRequest.create({
        data: { tenantId, workOrderId: job.id, customerId, secureToken: `tok-${job.id}`, createdById: ACTOR.accountId, status: "SENT", sentAt: new Date() },
      });
      await prisma.customerDecisionItem.create({
        data: { tenantId, decisionRequestId: req.id, faultId: fault.id, name: "Fix crack", explanation: "Must fix.", importance: "CRITICAL", price: "5000.00", laborPrice: "0.00", total: "5000.00" },
      });

      const result = await techWork.recordInspection(
        { workOrderId: job.id, technicianId: ACTOR.accountId, type: "QUICK", fields: {} },
        ACTOR,
      ) as { pendingCriticalDecisions: boolean };

      const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: job.id }, select: { status: true } });
      expect(wo.status).not.toBe("APPROVED_FOR_WORK");
      expect(result.pendingCriticalDecisions).toBe(false);
    } finally {
      await policiesForTest.set(tenantId, "APPROVAL_REQUIRED_SCOPE", "BEYOND_INITIAL_SCOPE", ACTOR, "PLATFORM", "T01 test: restore");
    }
  });
});

describe("CRITICAL_ONLY -- mixed faults: non-CRITICAL without item does NOT block", () => {
  it("only CRITICAL faults matter; LOW without an item is irrelevant", async () => {
    await policiesForTest.set(tenantId, "APPROVAL_REQUIRED_SCOPE", "CRITICAL_ONLY", ACTOR, "PLATFORM", "T01 test: verify policy behavior");
    try {
      const job = await newWorkOrder();
      const { inspectionId } = await toUnderInspection(job.id) as { inspectionId: string };

      // CRITICAL with a linked item.
      const criticalFault = await techWork.createFault(
        { workOrderId: job.id, inspectionId, description: "Seized caliper", severity: "CRITICAL" },
        ACTOR,
      );
      const req = await prisma.customerDecisionRequest.create({
        data: { tenantId, workOrderId: job.id, customerId, secureToken: `tok3-${job.id}`, createdById: ACTOR.accountId, status: "SENT", sentAt: new Date() },
      });
      await prisma.customerDecisionItem.create({
        data: { tenantId, decisionRequestId: req.id, faultId: criticalFault.id, name: "Caliper replacement", explanation: "Safety.", importance: "CRITICAL", price: "800.00", laborPrice: "200.00", total: "1000.00" },
      });

      // LOW with NO linked item -- must not block.
      await techWork.createFault({ workOrderId: job.id, inspectionId, description: "Minor scratch", severity: "LOW" }, ACTOR);

      const result = await techWork.recordInspection(
        { workOrderId: job.id, technicianId: ACTOR.accountId, type: "QUICK", fields: {} },
        ACTOR,
      ) as { pendingCriticalDecisions: boolean };

      expect(result.pendingCriticalDecisions).toBe(false);
    } finally {
      await policiesForTest.set(tenantId, "APPROVAL_REQUIRED_SCOPE", "BEYOND_INITIAL_SCOPE", ACTOR, "PLATFORM", "T01 test: restore");
    }
  });
});

// ---------------------------------------------------------------------------
// createFault() -- inspectionId ownership validation
// ---------------------------------------------------------------------------

describe("createFault() -- inspectionId ownership", () => {
  it("refuses an inspectionId belonging to a different job", async () => {
    const jobA = await newWorkOrder();
    const { inspectionId: idFromA } = await toUnderInspection(jobA.id) as { inspectionId: string };

    const jobB = await newWorkOrder();
    await lifecycle.apply(jobB.id, "REGISTER", ACTOR);

    await expect(
      techWork.createFault(
        { workOrderId: jobB.id, inspectionId: idFromA, description: "Wrong vehicle", severity: "LOW" },
        ACTOR,
      ),
    ).rejects.toMatchObject({ response: { code: "inspection_not_on_this_job" } });

    expect(await prisma.fault.count({ where: { workOrderId: jobB.id } })).toBe(0);
  });

  it("accepts a valid inspectionId belonging to the same job", async () => {
    const job = await newWorkOrder();
    const { inspectionId } = await toUnderInspection(job.id) as { inspectionId: string };

    const fault = await techWork.createFault(
      { workOrderId: job.id, inspectionId, description: "Oil leak", severity: "MEDIUM" },
      ACTOR,
    );

    expect(fault.inspectionId).toBe(inspectionId);
  });

  it("accepts a null inspectionId (fault not tied to an inspection)", async () => {
    const job = await newWorkOrder();
    await toUnderInspection(job.id);

    const fault = await techWork.createFault(
      { workOrderId: job.id, description: "Customer complaint: noise", severity: "LOW" },
      ACTOR,
    );

    expect(fault.inspectionId).toBeNull();
  });
});
