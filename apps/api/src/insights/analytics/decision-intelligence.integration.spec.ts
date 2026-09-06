/**
 * Phase 2 -- Prompt 6: Customer Decision -> Execution -> Revenue Intelligence
 * Comprehensive Integration Suite against real PostgreSQL database.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { DecisionsAnalyticsService } from "./decisions-analytics.service";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const decisionsService = new DecisionsAnalyticsService(asService);

const SUFFIX = `dci-${Date.now()}`;
let tenantId: string;
let otherTenantId: string;
let planId: string;
let branchAId: string;
let branchBId: string;
let customerId: string;
let assetId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Decision Intelligence Test",
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
      name: `DCI WS ${SUFFIX}`,
      nameNormalized: `dci ws ${SUFFIX}`,
      slug: `dci-ws-${SUFFIX}`,
      customerRegistrationCode: `DCI-${SUFFIX}`,
      status: "ACTIVE",
      planId,
      country: "EG",
      city: "Cairo",
      businessType: "Garage",
      primaryCategory: "CARS",
      currency: "USD",
      timezone: "UTC",
    },
  });
  tenantId = tenant.id;

  const otherTenant = await prisma.tenant.create({
    data: {
      name: `Other DCI WS ${SUFFIX}`,
      nameNormalized: `other dci ws ${SUFFIX}`,
      slug: `other-dci-ws-${SUFFIX}`,
      customerRegistrationCode: `ODCI-${SUFFIX}`,
      status: "ACTIVE",
      planId,
      country: "EG",
      city: "Cairo",
      businessType: "Garage",
      primaryCategory: "CARS",
      currency: "USD",
      timezone: "UTC",
    },
  });
  otherTenantId = otherTenant.id;

  const branchA = await prisma.branch.create({ data: { tenantId, name: "Branch Alpha", code: `BA-${SUFFIX}` } });
  branchAId = branchA.id;
  const branchB = await prisma.branch.create({ data: { tenantId, name: "Branch Beta", code: `BB-${SUFFIX}` } });
  branchBId = branchB.id;

  const customer = await prisma.customer.create({ data: { tenantId, fullName: "Test Customer", phone: "0109999999" } });
  customerId = customer.id;

  const asset = await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `PLT-${SUFFIX}` } });
  assetId = asset.id;
}, 120_000);

afterAll(async () => {
  await prisma.task.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.customerDecisionItem.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.customerDecisionRequest.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.workOrder.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.asset.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.customer.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.branch.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

let reqCount = 0;

async function createWorkOrderWithRequest(opts: {
  tenantId?: string;
  branchId?: string;
  woStatus?: string;
  woClosedAt?: Date | null;
  requestStatus?: string;
  sentAt?: Date | null;
  respondedAt?: Date | null;
  expiresAt?: Date | null;
}) {
  reqCount += 1;
  const tId = opts.tenantId ?? tenantId;
  const bId = opts.branchId ?? branchAId;
  const wo = await prisma.workOrder.create({
    data: {
      tenantId: tId,
      branchId: bId,
      assetId,
      customerId,
      status: (opts.woStatus ?? "IN_PROGRESS") as never,
      closedAt: opts.woClosedAt ?? null,
    },
  });

  const request = await prisma.customerDecisionRequest.create({
    data: {
      tenantId: tId,
      workOrderId: wo.id,
      customerId,
      status: (opts.requestStatus ?? "RESOLVED") as never,
      secureToken: `tok-${SUFFIX}-${reqCount}`,
      createdById: "staff-1",
      sentAt: opts.sentAt ?? new Date("2026-08-10T10:00:00.000Z"),
      respondedAt: opts.respondedAt ?? new Date("2026-08-10T12:00:00.000Z"),
      expiresAt: opts.expiresAt ?? null,
      createdAt: new Date("2026-08-10T09:00:00.000Z"),
    },
  });

  return { wo, request };
}

describe("Decision Intelligence Integration (Phase 2 - Prompt 6)", () => {
  it("enforces canonical outcome resolution: approval is NOT execution", async () => {
    // 1. Approved but NO task created -> APPROVED_NO_WORK_LINKED
    const { request: req1 } = await createWorkOrderWithRequest({});
    await prisma.customerDecisionItem.create({
      data: {
        tenantId,
        decisionRequestId: req1.id,
        name: "Brake Pads",
        explanation: "Worn down",
        importance: "HIGH",
        price: 200,
        total: 200,
        decision: "APPROVED",
        decidedAt: new Date("2026-08-10T12:00:00.000Z"),
      },
    });

    // 2. Approved with task planned (ASSIGNED) -> APPROVED_PLANNED
    const { request: req2 } = await createWorkOrderWithRequest({});
    const itemPlanned = await prisma.customerDecisionItem.create({
      data: {
        tenantId,
        decisionRequestId: req2.id,
        name: "Spark Plugs",
        explanation: "Old plugs",
        importance: "MEDIUM",
        price: 150,
        total: 150,
        decision: "APPROVED",
        decidedAt: new Date("2026-08-10T12:00:00.000Z"),
      },
    });
    await prisma.task.create({
      data: {
        tenantId,
        workOrderId: req2.workOrderId,
        decisionItemId: itemPlanned.id,
        title: "Replace Spark Plugs",
        status: "ASSIGNED",
        createdAt: new Date("2026-08-10T13:00:00.000Z"),
      },
    });

    // 3. Approved with task IN_PROGRESS -> APPROVED_IN_PROGRESS
    const { request: req3 } = await createWorkOrderWithRequest({});
    const itemInProgress = await prisma.customerDecisionItem.create({
      data: {
        tenantId,
        decisionRequestId: req3.id,
        name: "Timing Belt",
        explanation: "Cracking",
        importance: "CRITICAL",
        price: 500,
        total: 500,
        decision: "APPROVED",
        decidedAt: new Date("2026-08-10T12:00:00.000Z"),
      },
    });
    await prisma.task.create({
      data: {
        tenantId,
        workOrderId: req3.workOrderId,
        decisionItemId: itemInProgress.id,
        title: "Replace Timing Belt",
        status: "IN_PROGRESS",
        startedAt: new Date("2026-08-10T14:00:00.000Z"),
        createdAt: new Date("2026-08-10T13:00:00.000Z"),
      },
    });

    // 4. Approved with 2 tasks: 1 DONE, 1 ASSIGNED -> PARTIALLY_PERFORMED
    const { request: req4 } = await createWorkOrderWithRequest({});
    const itemPartial = await prisma.customerDecisionItem.create({
      data: {
        tenantId,
        decisionRequestId: req4.id,
        name: "Front & Rear Shocks",
        explanation: "Leaking",
        importance: "HIGH",
        price: 800,
        total: 800,
        decision: "APPROVED",
        decidedAt: new Date("2026-08-10T12:00:00.000Z"),
      },
    });
    await prisma.task.create({
      data: {
        tenantId,
        workOrderId: req4.workOrderId,
        decisionItemId: itemPartial.id,
        title: "Front Shocks",
        status: "DONE",
        startedAt: new Date("2026-08-10T14:00:00.000Z"),
        completedAt: new Date("2026-08-10T16:00:00.000Z"),
        createdAt: new Date("2026-08-10T13:00:00.000Z"),
      },
    });
    await prisma.task.create({
      data: {
        tenantId,
        workOrderId: req4.workOrderId,
        decisionItemId: itemPartial.id,
        title: "Rear Shocks",
        status: "ASSIGNED",
        createdAt: new Date("2026-08-10T13:00:00.000Z"),
      },
    });

    // 5. Approved with all tasks DONE -> PERFORMED
    const { request: req5 } = await createWorkOrderWithRequest({});
    const itemPerformed = await prisma.customerDecisionItem.create({
      data: {
        tenantId,
        decisionRequestId: req5.id,
        name: "Oil Change",
        explanation: "Routine",
        importance: "LOW",
        price: 100,
        total: 100,
        decision: "APPROVED",
        decidedAt: new Date("2026-08-10T12:00:00.000Z"),
      },
    });
    await prisma.task.create({
      data: {
        tenantId,
        workOrderId: req5.workOrderId,
        decisionItemId: itemPerformed.id,
        title: "Oil Change Task",
        status: "DONE",
        startedAt: new Date("2026-08-10T13:00:00.000Z"),
        completedAt: new Date("2026-08-10T14:00:00.000Z"),
        createdAt: new Date("2026-08-10T12:30:00.000Z"),
      },
    });

    // 6. Approved, task was never finished and job closed -> NOT_PERFORMED
    const { request: req6 } = await createWorkOrderWithRequest({
      woStatus: "CLOSED",
      woClosedAt: new Date("2026-08-11T18:00:00.000Z"),
    });
    const itemAbandoned = await prisma.customerDecisionItem.create({
      data: {
        tenantId,
        decisionRequestId: req6.id,
        name: "Cabin Filter",
        explanation: "Dusty",
        importance: "LOW",
        price: 50,
        total: 50,
        decision: "APPROVED",
        decidedAt: new Date("2026-08-10T12:00:00.000Z"),
      },
    });
    await prisma.task.create({
      data: {
        tenantId,
        workOrderId: req6.workOrderId,
        decisionItemId: itemAbandoned.id,
        title: "Change Cabin Filter",
        status: "ASSIGNED",
        createdAt: new Date("2026-08-10T13:00:00.000Z"),
      },
    });

    // 7. Customer declined -> DECLINED
    const { request: req7 } = await createWorkOrderWithRequest({});
    await prisma.customerDecisionItem.create({
      data: {
        tenantId,
        decisionRequestId: req7.id,
        name: "Engine Flush",
        explanation: "Optional",
        importance: "LOW",
        price: 80,
        total: 80,
        decision: "REJECTED",
        decidedAt: new Date("2026-08-10T12:00:00.000Z"),
      },
    });

    const report = await decisionsService.build(tenantId, { branchIds: [branchAId], categoryIds: [] }, {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-31T23:59:59.999Z",
    });

    // Verification of canonical outcomes
    const outcomeMap = new Map(report.outcomes.map((o) => [o.outcome, o]));
    expect(outcomeMap.get("APPROVED_NO_WORK_LINKED")?.count).toBe(1);
    expect(outcomeMap.get("APPROVED_NO_WORK_LINKED")?.totalValue).toBe(200);

    expect(outcomeMap.get("APPROVED_PLANNED")?.count).toBe(1);
    expect(outcomeMap.get("APPROVED_PLANNED")?.totalValue).toBe(150);

    expect(outcomeMap.get("APPROVED_IN_PROGRESS")?.count).toBe(1);
    expect(outcomeMap.get("APPROVED_IN_PROGRESS")?.totalValue).toBe(500);

    expect(outcomeMap.get("PARTIALLY_PERFORMED")?.count).toBe(1);
    expect(outcomeMap.get("PARTIALLY_PERFORMED")?.totalValue).toBe(800);

    expect(outcomeMap.get("PERFORMED")?.count).toBe(1);
    expect(outcomeMap.get("PERFORMED")?.totalValue).toBe(100);

    expect(outcomeMap.get("NOT_PERFORMED")?.count).toBe(1);
    expect(outcomeMap.get("NOT_PERFORMED")?.totalValue).toBe(50);

    expect(outcomeMap.get("DECLINED")?.count).toBe(1);
    expect(outcomeMap.get("DECLINED")?.totalValue).toBe(80);

    // Financial Value Integrity
    const expectedApprovedValue = 200 + 150 + 500 + 800 + 100 + 50; // 1800
    const expectedPerformedValue = 100;
    const expectedUnperformedApprovedValue = 1800 - 100; // 1700

    expect(report.value.approvedValue).toBe(expectedApprovedValue);
    expect(report.value.performedValue).toBe(expectedPerformedValue);
    expect(report.value.unperformedApprovedValue).toBe(expectedUnperformedApprovedValue);

    // Strict invariant: performedValue + unperformedApprovedValue === approvedValue
    expect(report.value.performedValue + report.value.unperformedApprovedValue).toBe(report.value.approvedValue);

    // Unperformed Breakdown
    expect(report.unperformedBreakdown.noWorkLinked.count).toBe(1);
    expect(report.unperformedBreakdown.noWorkLinked.value).toBe(200);
    expect(report.unperformedBreakdown.plannedNotStarted.count).toBe(1);
    expect(report.unperformedBreakdown.plannedNotStarted.value).toBe(150);
    expect(report.unperformedBreakdown.inProgress.count).toBe(1);
    expect(report.unperformedBreakdown.inProgress.value).toBe(500);
    expect(report.unperformedBreakdown.partiallyPerformed.count).toBe(1);
    expect(report.unperformedBreakdown.partiallyPerformed.value).toBe(800);
    expect(report.unperformedBreakdown.abandonedTerminal.count).toBe(1);
    expect(report.unperformedBreakdown.abandonedTerminal.value).toBe(50);

    const breakdownSum =
      report.unperformedBreakdown.noWorkLinked.value +
      report.unperformedBreakdown.plannedNotStarted.value +
      report.unperformedBreakdown.inProgress.value +
      report.unperformedBreakdown.partiallyPerformed.value +
      report.unperformedBreakdown.abandonedTerminal.value;
    expect(breakdownSum).toBe(report.value.unperformedApprovedValue);

    // Strict financial attribution boundaries: invoices and collections are NOT COMPUTABLE
    expect(report.funnel.invoiced).toBeNull();
    expect(report.funnel.invoicedNotComputableReason).toContain("direct foreign key");
    expect(report.funnel.collected).toBeNull();
    expect(report.funnel.collectedNotComputableReason).toContain("collected against the invoice balance as a whole");

    expect(report.value.invoicedValue).toBeNull();
    expect(report.value.invoicedValueNotComputableReason).toContain("direct foreign key");
    expect(report.value.collectedValue).toBeNull();
    expect(report.value.collectedValueNotComputableReason).toContain("collected against the invoice balance as a whole");

    // Funnel Counts
    expect(report.funnel.recommendationsCreated).toBe(7);
    expect(report.funnel.approved).toBe(6);
    expect(report.funnel.planned).toBe(5); // items 2, 3, 4, 5, 6 have tasks
    expect(report.funnel.started).toBe(3); // items 3, 4, 5 started
    expect(report.funnel.performed).toBe(1); // item 5

    // Conversion Rates
    expect(report.rates.approvalRate).toBeCloseTo((6 / 7) * 100, 1);
    expect(report.rates.rejectionRate).toBeCloseTo((1 / 7) * 100, 1);
    expect(report.rates.planningRate).toBeCloseTo((5 / 6) * 100, 1);
    expect(report.rates.executionRate).toBeCloseTo((3 / 6) * 100, 1);
    expect(report.rates.fulfillmentRate).toBeCloseTo((1 / 6) * 100, 1);
    expect(report.rates.dropOffRate).toBeCloseTo((5 / 6) * 100, 1);

    // Integrity anomalies
    expect(report.integrity.approvedWithoutTasks).toBe(1);
    expect(report.integrity.terminalWithoutExecution).toBe(1);
  });

  it("strictly scopes data by tenant and branch", async () => {
    // Create work order and item in otherTenant
    const { request: otherReq } = await createWorkOrderWithRequest({
      tenantId: otherTenantId,
    });
    await prisma.customerDecisionItem.create({
      data: {
        tenantId: otherTenantId,
        decisionRequestId: otherReq.id,
        name: "Foreign Repair",
        explanation: "other tenant",
        importance: "HIGH",
        price: 9999,
        total: 9999,
        decision: "APPROVED",
        decidedAt: new Date("2026-08-10T12:00:00.000Z"),
      },
    });

    // Create work order and item in branch B of tenantId
    const { request: branchBReq } = await createWorkOrderWithRequest({
      tenantId,
      branchId: branchBId,
    });
    await prisma.customerDecisionItem.create({
      data: {
        tenantId,
        decisionRequestId: branchBReq.id,
        name: "Branch B Repair",
        explanation: "branch B",
        importance: "HIGH",
        price: 450,
        total: 450,
        decision: "APPROVED",
        decidedAt: new Date("2026-08-10T12:00:00.000Z"),
      },
    });

    // Query Branch A only
    const branchAReport = await decisionsService.build(tenantId, { branchIds: [branchAId], categoryIds: [] }, {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-31T23:59:59.999Z",
    });

    // Query Branch B only
    const branchBReport = await decisionsService.build(tenantId, { branchIds: [branchBId], categoryIds: [] }, {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-31T23:59:59.999Z",
    });

    // Foreign tenant data is nowhere
    expect(branchAReport.value.totalRecommendedValue).not.toBeGreaterThanOrEqual(9999);
    expect(branchBReport.value.totalRecommendedValue).toBe(450);

    // Branch A does not contain Branch B's 450
    expect(branchBReport.funnel.recommendationsCreated).toBe(1);
    expect(branchBReport.funnel.approved).toBe(1);
  });

  it("measures planning and execution cycle times accurately", async () => {
    const { request } = await createWorkOrderWithRequest({});
    const decidedAt = new Date("2026-08-10T12:00:00.000Z");
    const taskCreatedAt = new Date("2026-08-10T14:30:00.000Z"); // 2.5 hours planning
    const taskStartedAt = new Date("2026-08-10T15:00:00.000Z");
    const taskCompletedAt = new Date("2026-08-10T17:00:00.000Z"); // 2.0 hours execution

    const item = await prisma.customerDecisionItem.create({
      data: {
        tenantId,
        decisionRequestId: request.id,
        name: "Cycle Time Service",
        explanation: "timing test",
        importance: "MEDIUM",
        price: 300,
        total: 300,
        decision: "APPROVED",
        decidedAt,
      },
    });

    await prisma.task.create({
      data: {
        tenantId,
        workOrderId: request.workOrderId,
        decisionItemId: item.id,
        title: "Timed Task",
        status: "DONE",
        startedAt: taskStartedAt,
        completedAt: taskCompletedAt,
        createdAt: taskCreatedAt,
      },
    });

    const report = await decisionsService.build(tenantId, { branchIds: [branchAId], categoryIds: [] }, {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-31T23:59:59.999Z",
    });

    expect(report.timing.averagePlanningHours).not.toBeNull();
    expect(report.timing.averagePlanningHours).toBeGreaterThan(0);
    expect(report.timing.averageExecutionHours).not.toBeNull();
    expect(report.timing.averageExecutionHours).toBeGreaterThan(0);
  });
});
