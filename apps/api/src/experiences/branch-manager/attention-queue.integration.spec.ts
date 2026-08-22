/**
 * The branch manager's queue, against a real database.
 *
 * The assertions that matter here are about ORDER and SCOPE. Order,
 * because a queue that ranks wrong is worse than no queue -- the manager
 * trusts the top row. Scope, because a manager covering one branch seeing
 * another's work is a tenant-isolation failure wearing a UI costume.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { AttentionQueueService } from "./attention-queue.service";
import { PolicyResolutionService } from "../../control/policies/policy-resolution.service";
import { CapabilityResolutionService } from "../../control/capabilities/capability-resolution.service";
import { AuditService } from "../../audit/audit.service";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const policiesForTest = new PolicyResolutionService(asService, new AuditService(asService), new CapabilityResolutionService(asService));
const service = new AttentionQueueService(asService, policiesForTest);

const SUFFIX = `aq-${Date.now()}`;
const NOW = new Date();
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

let tenantId: string;
let otherTenantId: string;
let planId: string;
let mainBranchId: string;
let secondBranchId: string;
let customerId: string;
let counter = 0;

async function makeTenant(slug: string) {
  const tenant = await prisma.tenant.create({
    data: {
      name: `AQ ${slug}`,
      nameNormalized: `aq ${slug}`,
      slug,
      customerRegistrationCode: slug.toUpperCase().slice(0, 20),
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
  return tenant.id;
}

async function makeWorkOrder(options: {
  tenant?: string;
  branch?: string;
  status?: "IN_PROGRESS" | "WAITING_PARTS" | "QC_FAILED" | "READY_FOR_DELIVERY";
  updatedAt?: Date;
  plate?: string;
  expectedDurationMinutes?: number;
}) {
  counter += 1;
  const tenant = options.tenant ?? tenantId;
  const asset = await prisma.asset.create({
    data: { tenantId: tenant, category: "CARS", plateNumber: options.plate ?? `PL-${SUFFIX}-${counter}` },
  });
  const customer =
    tenant === tenantId
      ? customerId
      : (await prisma.customer.create({ data: { tenantId: tenant, fullName: "Other", phone: `099${counter}` } })).id;

  const workOrder = await prisma.workOrder.create({
    data: {
      tenantId: tenant,
      branchId: options.branch ?? mainBranchId,
      assetId: asset.id,
      customerId: customer,
      status: options.status ?? "IN_PROGRESS",
      expectedDurationMinutes: options.expectedDurationMinutes,
    },
  });

  if (options.updatedAt) {
    // updatedAt is @updatedAt, so it must be forced with raw SQL to
    // simulate a work order that entered its state hours ago.
    await prisma.$executeRaw`UPDATE work_orders SET "updatedAt" = ${options.updatedAt} WHERE id = ${workOrder.id}`;
  }

  return workOrder;
}

beforeAll(async () => {
  planId = (
    await prisma.plan.create({
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
    })
  ).id;

  tenantId = await makeTenant(`aq-main-${SUFFIX}`);
  otherTenantId = await makeTenant(`aq-other-${SUFFIX}`);

  // This file proves ORDER, TIER and SCOPE, all built on `hoursAgo(NOW)`
  // against the real clock -- deliberately unrelated to WORKING_WEEK,
  // which has its own dedicated, deterministic-date coverage in
  // attention-ranking.spec.ts. Left on the FROM_COUNTRY default, this
  // file's pass/fail would depend on which real weekday it happened to
  // run on for a Friday-Saturday-weekend country (EG, below) -- so it is
  // pinned to SEVEN_DAY here to keep those two concerns apart.
  const setupActor = { accountId: "test-setup", displayName: "Test setup", actorType: "PLATFORM" as const };
  for (const id of [tenantId, otherTenantId]) {
    await policiesForTest.set(id, "WORKING_WEEK", "SEVEN_DAY", setupActor, "PLATFORM", "Deterministic test setup.");
  }

  mainBranchId = (await prisma.branch.create({ data: { tenantId, name: "Main", code: "MAIN" } })).id;
  secondBranchId = (await prisma.branch.create({ data: { tenantId, name: "Second", code: "SEC" } })).id;
  customerId = (await prisma.customer.create({ data: { tenantId, fullName: "Ahmed Salah", phone: "01000000000" } })).id;
}, 120_000);

afterAll(async () => {
  for (const id of [tenantId, otherTenantId]) {
    const where = { tenantId: id };
    await prisma.customerDecisionItem.deleteMany({ where });
    await prisma.customerDecisionRequest.deleteMany({ where });
    await prisma.taskBlocker.deleteMany({ where });
    await prisma.task.deleteMany({ where });
    await prisma.invoice.deleteMany({ where });
    await prisma.workOrder.deleteMany({ where });
    await prisma.asset.deleteMany({ where });
    await prisma.customer.deleteMany({ where });
    await prisma.branch.deleteMany({ where });
    await prisma.tenant.deleteMany({ where: { id } });
  }
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

afterEach(async () => {
  for (const id of [tenantId, otherTenantId]) {
    const where = { tenantId: id };
    await prisma.customerDecisionItem.deleteMany({ where });
    await prisma.customerDecisionRequest.deleteMany({ where });
    await prisma.taskBlocker.deleteMany({ where });
    await prisma.task.deleteMany({ where });
    await prisma.invoice.deleteMany({ where });
    await prisma.workOrder.deleteMany({ where });
    await prisma.asset.deleteMany({ where });
  }
});

describe("what appears in the queue", () => {
  it("surfaces a work order waiting on parts, with the wait in words", async () => {
    await makeWorkOrder({ status: "WAITING_PARTS", updatedAt: hoursAgo(30) });

    const queue = await service.build({ tenantId, branchScope: [] }, NOW);

    expect(queue).toHaveLength(1);
    expect(queue[0]?.kind).toBe("WAITING_PARTS");
    expect(queue[0]?.reason).toContain("1 day");
    expect(queue[0]?.primaryAction).toBe("CHECK_PARTS");
  }, 120_000);

  it("surfaces a blocked technician", async () => {
    const workOrder = await makeWorkOrder({});
    const task = await prisma.task.create({
      data: { tenantId, workOrderId: workOrder.id, title: "Fit pads", status: "BLOCKED" },
    });
    await prisma.taskBlocker.create({
      data: { tenantId, taskId: task.id, reason: "TOOL_MISSING", reportedBy: "tech-1", status: "OPEN" },
    });

    const queue = await service.build({ tenantId, branchScope: [] }, NOW);

    expect(queue[0]?.kind).toBe("TECHNICIAN_BLOCKED");
    expect(queue[0]?.primaryAction).toBe("RESOLVE_BLOCKER");
  }, 120_000);

  it("shows the identifier a human uses to find the car in the yard", async () => {
    await makeWorkOrder({ status: "WAITING_PARTS", plate: `FIND-${SUFFIX}` });

    const queue = await service.build({ tenantId, branchScope: [] }, NOW);

    expect(queue[0]?.identifier).toBe(`FIND-${SUFFIX}`);
    expect(queue[0]?.customerName).toBe("Ahmed Salah");
  }, 120_000);

  it("carries no pricing or internal data on a queue row", async () => {
    // Absent, not hidden. A row the manager scans should not ship data
    // they did not ask for.
    await makeWorkOrder({ status: "WAITING_PARTS" });

    const [row] = await service.build({ tenantId, branchScope: [] }, NOW);
    const keys = Object.keys(row ?? {});

    expect(keys).not.toContain("cost");
    expect(keys).not.toContain("total");
    expect(keys).not.toContain("notes");
  }, 120_000);

  it("returns an empty queue when nothing is stuck", async () => {
    await makeWorkOrder({ status: "IN_PROGRESS" });

    // "Nothing needs you" is a real and desirable state, not an error.
    expect(await service.build({ tenantId, branchScope: [] }, NOW)).toEqual([]);
  }, 120_000);
});

describe("SLA overrun (Phase 16.A/16.E)", () => {
  it("surfaces a job past its promised duration", async () => {
    // 90 minutes elapsed against a 60-minute expectation.
    await makeWorkOrder({ status: "IN_PROGRESS", expectedDurationMinutes: 60, updatedAt: hoursAgo(1.5) });

    const queue = await service.build({ tenantId, branchScope: [] }, NOW);

    expect(queue).toHaveLength(1);
    expect(queue[0]?.kind).toBe("SLA_OVERRUN");
    expect(queue[0]?.primaryAction).toBe("REVIEW_OVERRUN");
  }, 120_000);

  it("does not flag a job still within its promised duration", async () => {
    // 10 minutes elapsed against a 60-minute expectation.
    await makeWorkOrder({ status: "IN_PROGRESS", expectedDurationMinutes: 60, updatedAt: hoursAgo(1 / 6) });

    expect(await service.build({ tenantId, branchScope: [] }, NOW)).toEqual([]);
  }, 120_000);

  it("never flags a job with no SLA declared, no matter how long it has run", async () => {
    await makeWorkOrder({ status: "IN_PROGRESS", updatedAt: hoursAgo(72) });

    expect(await service.build({ tenantId, branchScope: [] }, NOW)).toEqual([]);
  }, 120_000);

  it("does not flag an overrun on a job that is not actively in progress", async () => {
    await makeWorkOrder({ status: "WAITING_PARTS", expectedDurationMinutes: 60, updatedAt: hoursAgo(3) });

    const queue = await service.build({ tenantId, branchScope: [] }, NOW);
    expect(queue.every((item) => item.kind !== "SLA_OVERRUN")).toBe(true);
  }, 120_000);
});

describe("order — the thing the manager actually trusts", () => {
  it("puts an unacknowledged critical rejection above everything", async () => {
    const partsOrder = await makeWorkOrder({ status: "WAITING_PARTS", updatedAt: hoursAgo(200) });
    const criticalOrder = await makeWorkOrder({});

    const request = await prisma.customerDecisionRequest.create({
      data: {
        tenantId,
        workOrderId: criticalOrder.id,
        customerId,
        status: "RESOLVED",
        secureToken: `tok-${SUFFIX}-crit`,
        createdById: "staff-1",
      },
    });
    await prisma.customerDecisionItem.create({
      data: {
        tenantId,
        decisionRequestId: request.id,
        name: "Brake pads",
        explanation: "Below minimum",
        importance: "CRITICAL",
        price: 0,
        total: 0,
        decision: "REJECTED",
        warningAcknowledged: false,
        decidedAt: hoursAgo(1),
      },
    });

    const queue = await service.build({ tenantId, branchScope: [] }, NOW);

    // Even against a 200-hour parts wait, safety comes first and does not
    // decay.
    expect(queue[0]?.kind).toBe("CRITICAL_REJECTION_UNACKNOWLEDGED");
    expect(queue.some((item) => item.workOrderId === partsOrder.id)).toBe(true);
  }, 120_000);

  it("lifts a customer waiting over a day above a freshly blocked technician", async () => {
    const blockedOrder = await makeWorkOrder({});
    const task = await prisma.task.create({
      data: { tenantId, workOrderId: blockedOrder.id, title: "T", status: "BLOCKED" },
    });
    await prisma.taskBlocker.create({
      data: { tenantId, taskId: task.id, reason: "TOOL_MISSING", reportedBy: "t", status: "OPEN" },
    });

    const waitingOrder = await makeWorkOrder({});
    await prisma.customerDecisionRequest.create({
      data: {
        tenantId,
        workOrderId: waitingOrder.id,
        customerId,
        status: "SENT",
        secureToken: `tok-${SUFFIX}-wait`,
        createdById: "staff-1",
        sentAt: hoursAgo(30),
      },
    });

    const queue = await service.build({ tenantId, branchScope: [] }, NOW);

    // At a day, the risk is losing the customer rather than losing an hour.
    expect(queue[0]?.kind).toBe("CUSTOMER_APPROVAL_WAITING");
    expect(queue[0]?.rank.escalated).toBe(true);
    expect(queue[1]?.kind).toBe("TECHNICIAN_BLOCKED");
  }, 120_000);

  it("starts the customer clock when they were asked, not when the request was drafted", async () => {
    // A request sitting unsent is the branch's delay; charging it to the
    // customer would hide our own.
    const workOrder = await makeWorkOrder({});
    const created = await prisma.customerDecisionRequest.create({
      data: {
        tenantId,
        workOrderId: workOrder.id,
        customerId,
        status: "SENT",
        secureToken: `tok-${SUFFIX}-clock`,
        createdById: "staff-1",
        sentAt: hoursAgo(2),
      },
    });
    await prisma.$executeRaw`UPDATE customer_decision_requests SET "createdAt" = ${hoursAgo(100)} WHERE id = ${created.id}`;

    const queue = await service.build({ tenantId, branchScope: [] }, NOW);

    expect(queue[0]?.rank.waitingHours).toBeLessThan(3);
    expect(queue[0]?.rank.escalated).toBe(false);
  }, 120_000);
});

describe("scope", () => {
  it("never shows another workshop's work", async () => {
    await makeWorkOrder({ tenant: otherTenantId, branch: undefined, status: "WAITING_PARTS" });

    // The other tenant's work order was created against this tenant's
    // branch id, which is the worst case: a join that forgets tenantId
    // would return it.
    expect(await service.build({ tenantId, branchScope: [] }, NOW)).toEqual([]);
  }, 120_000);

  it("respects a manager scoped to one branch", async () => {
    await makeWorkOrder({ branch: mainBranchId, status: "WAITING_PARTS" });
    await makeWorkOrder({ branch: secondBranchId, status: "WAITING_PARTS" });

    const scoped = await service.build({ tenantId, branchScope: [mainBranchId] }, NOW);
    const all = await service.build({ tenantId, branchScope: [] }, NOW);

    expect(scoped).toHaveLength(1);
    expect(scoped[0]?.branchId).toBe(mainBranchId);
    expect(all).toHaveLength(2);
  }, 120_000);
});

/**
 * WORKING_WEEK, proved through the real service and real Postgres --
 * attention-ranking.spec.ts already proves the pure arithmetic
 * exhaustively; this is the other half, that AttentionQueueService.
 * weekendDaysFor actually reads the tenant's own country (EG, FRI_SAT)
 * and the stored policy row, not a value handed to it by a test double.
 *
 * Fixed dates, deliberately not `NOW`/`hoursAgo` above (the real clock):
 * FIXED_THU is a Thursday and FIXED_SUN a Sunday 72 raw hours later, so
 * the FRI_SAT weekend in between is entirely skipped under FROM_COUNTRY
 * regardless of which real weekday this suite happens to run on.
 */
describe("WORKING_WEEK changes how old a wait is reported to be", () => {
  const FIXED_THU = new Date("2026-08-06T12:00:00.000Z");
  const FIXED_SUN = new Date("2026-08-09T12:00:00.000Z");

  afterEach(async () => {
    const setupActor = { accountId: "test-setup", displayName: "Test setup", actorType: "PLATFORM" as const };
    await policiesForTest.set(tenantId, "WORKING_WEEK", "SEVEN_DAY", setupActor, "PLATFORM", "Restored after WORKING_WEEK test.");
  });

  it("FROM_COUNTRY skips the FRI_SAT weekend for an EG tenant: 72 raw hours reads as 1 day, not 3", async () => {
    const setupActor = { accountId: "test-setup", displayName: "Test setup", actorType: "PLATFORM" as const };
    await policiesForTest.set(tenantId, "WORKING_WEEK", "FROM_COUNTRY", setupActor, "PLATFORM", "Integration test setup.");

    await makeWorkOrder({ status: "WAITING_PARTS", updatedAt: FIXED_THU });

    const queue = await service.build({ tenantId, branchScope: [] }, FIXED_SUN);

    expect(queue).toHaveLength(1);
    expect(queue[0]?.rank.waitingHours).toBeCloseTo(24, 6);
    expect(queue[0]?.reason).toContain("1 day");
  }, 120_000);

  it("SEVEN_DAY reads the same 72 raw hours as 3 days -- nothing skipped", async () => {
    const setupActor = { accountId: "test-setup", displayName: "Test setup", actorType: "PLATFORM" as const };
    await policiesForTest.set(tenantId, "WORKING_WEEK", "SEVEN_DAY", setupActor, "PLATFORM", "Integration test setup.");

    await makeWorkOrder({ status: "WAITING_PARTS", updatedAt: FIXED_THU });

    const queue = await service.build({ tenantId, branchScope: [] }, FIXED_SUN);

    expect(queue).toHaveLength(1);
    expect(queue[0]?.rank.waitingHours).toBeCloseTo(72, 6);
    expect(queue[0]?.reason).toContain("3 days");
  }, 120_000);
});
