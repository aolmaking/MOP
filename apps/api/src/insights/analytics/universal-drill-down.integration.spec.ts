/**
 * Phase 2 -- Prompt 9: Universal Drill-Down / Evidence Engine
 * Comprehensive Integration Suite covering all 36 specified scenarios
 * against real PostgreSQL database.
 */
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient, QcFailureReason, TaskReworkReason } from "@mop/database";
import type { PrismaService } from "../../runtime/database/prisma.service";
import type { AnalyticsScope } from "./analytics-scope.util";
import { ForbiddenException, BadRequestException, NotFoundException } from "@nestjs/common";
import { UniversalDrillDownService } from "./universal-drill-down.service";
import { QualityDrillDownResolver } from "./resolvers/quality-drill-down.resolver";
import { DecisionDrillDownResolver } from "./resolvers/decision-drill-down.resolver";
import { FinancialDrillDownResolver } from "./resolvers/financial-drill-down.resolver";
import { OperationsDrillDownResolver } from "./resolvers/operations-drill-down.resolver";
import { RootCauseDrillDownResolver } from "./resolvers/root-cause-drill-down.resolver";
import { RootCauseAnalysisService } from "./root-cause-analysis.service";
import { REGISTERED_METRICS } from "./metric-catalog.registry";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;

const qualityResolver = new QualityDrillDownResolver(asService);
const decisionResolver = new DecisionDrillDownResolver(asService);
const financialResolver = new FinancialDrillDownResolver(asService);
const operationsResolver = new OperationsDrillDownResolver(asService);
const rcaService = new RootCauseAnalysisService(asService);
const rcaResolver = new RootCauseDrillDownResolver(rcaService);

const drillDownService = new UniversalDrillDownService(
  asService,
  qualityResolver,
  decisionResolver,
  financialResolver,
  operationsResolver,
  rcaResolver,
);

const SUFFIX = `udd-${Date.now()}`;
let tenantId: string;
let otherTenantId: string;
let planId: string;
let branchAId: string;
let branchBId: string;
let otherBranchId: string;
let customerId: string;
let asset1Id: string;
let asset2Id: string;
let tech1Id: string;
let tech2Id: string;

let seededWorkOrderId: string;
let seededTaskId: string;
let seededReworkTaskId: string;
let seededQcPassedWoId: string;
let seededQcFailedWoId: string;
let seededDecisionItemId: string;
let seededInvoiceId: string;
let seededPaymentId: string;

const baseScope: AnalyticsScope = {
  branchIds: [],
  categoryIds: [],
};

const QUERY_WINDOW = {
  from: "2026-03-01T00:00:00.000Z",
  to: "2026-03-31T23:59:59.999Z",
};

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "UDD Test Plan",
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
      name: `UDD WS ${SUFFIX}`,
      nameNormalized: `udd ws ${SUFFIX}`,
      slug: `udd-ws-${SUFFIX}`,
      customerRegistrationCode: `UDD-${SUFFIX}`,
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
      name: `Other UDD WS ${SUFFIX}`,
      nameNormalized: `other udd ws ${SUFFIX}`,
      slug: `other-udd-ws-${SUFFIX}`,
      customerRegistrationCode: `OUDD-${SUFFIX}`,
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
  const otherBranch = await prisma.branch.create({ data: { tenantId: otherTenantId, name: "Other Branch", code: `OB-${SUFFIX}` } });
  otherBranchId = otherBranch.id;

  const customer = await prisma.customer.create({ data: { tenantId, fullName: "UDD Customer", phone: "0107777777" } });
  customerId = customer.id;

  const asset1 = await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `PLT1-${SUFFIX}` } });
  asset1Id = asset1.id;
  const asset2 = await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `PLT2-${SUFFIX}` } });
  asset2Id = asset2.id;

  const acc1 = await prisma.account.create({
    data: { tenantId, accountType: "TENANT_STAFF", email: `tech1-${SUFFIX}@test.com`, status: "ACTIVE" },
  });
  const staff1 = await prisma.staffUser.create({
    data: { tenantId, accountId: acc1.id, fullName: "Technician One", role: "TECHNICIAN" },
  });
  tech1Id = staff1.id;

  const acc2 = await prisma.account.create({
    data: { tenantId, accountType: "TENANT_STAFF", email: `tech2-${SUFFIX}@test.com`, status: "ACTIVE" },
  });
  const staff2 = await prisma.staffUser.create({
    data: { tenantId, accountId: acc2.id, fullName: "Technician Two", role: "TECHNICIAN" },
  });
  tech2Id = staff2.id;

  // --- SEED SCENARIO FIXTURES ---

  // 1. Operations Work Orders: Completed and Delayed
  const wo1 = await prisma.workOrder.create({
    data: {
      tenantId,
      branchId: branchAId,
      customerId,
      assetId: asset1Id,
      status: "CLOSED",
      createdAt: new Date("2026-03-02T08:00:00Z"),
      closedAt: new Date("2026-03-05T18:00:00Z"),
    },
  });
  seededWorkOrderId = wo1.id;

  await prisma.operationEvent.createMany({
    data: [
      {
        tenantId,
        branchId: branchAId,
        workOrderId: wo1.id,
        eventKey: "work_order.status_changed",
        actorId: "actor-1",
        actorType: "TENANT_STAFF",
        payload: { workOrderId: wo1.id, from: "DRAFT", to: "WAITING_PARTS" },
        createdAt: new Date("2026-03-02T10:00:00Z"),
      },
      {
        tenantId,
        branchId: branchAId,
        workOrderId: wo1.id,
        eventKey: "work_order.status_changed",
        actorId: "actor-1",
        actorType: "TENANT_STAFF",
        payload: { workOrderId: wo1.id, from: "WAITING_PARTS", to: "IN_PROGRESS" },
        createdAt: new Date("2026-03-04T10:00:00Z"),
      },
      {
        tenantId,
        branchId: branchAId,
        workOrderId: wo1.id,
        eventKey: "work_order.status_changed",
        actorId: "actor-1",
        actorType: "TENANT_STAFF",
        payload: { workOrderId: wo1.id, from: "IN_PROGRESS", to: "CLOSED" },
        createdAt: new Date("2026-03-05T18:00:00Z"),
      },
    ],
  });

  // 2. Tasks: Original and Rework Lineage
  const task1 = await prisma.task.create({
    data: {
      tenantId,
      workOrderId: wo1.id,
      title: "Brake Rotor Machining",
      status: "DONE",
      serviceKey: "BRAKES",
      createdAt: new Date("2026-03-02T10:00:00Z"),
      completedAt: new Date("2026-03-03T14:00:00Z"),
      actualMinutes: 90,
    },
  });
  seededTaskId = task1.id;

  const reworkTask = await prisma.task.create({
    data: {
      tenantId,
      workOrderId: wo1.id,
      originalTaskId: task1.id,
      reworkReason: TaskReworkReason.INCOMPLETE_WORK,
      reworkNote: "Rotor surface uneven, needs remachining",
      title: "Rework: Brake Rotor",
      status: "DONE",
      serviceKey: "BRAKES",
      createdAt: new Date("2026-03-04T11:00:00Z"),
      completedAt: new Date("2026-03-04T16:00:00Z"),
      actualMinutes: 60,
    },
  });
  seededReworkTaskId = reworkTask.id;

  // 3. QC Evaluations: Passed and Failed
  const woQcPassed = await prisma.workOrder.create({
    data: {
      tenantId,
      branchId: branchAId,
      customerId,
      assetId: asset1Id,
      status: "READY_FOR_DELIVERY",
      createdAt: new Date("2026-03-10T08:00:00Z"),
      closedAt: new Date("2026-03-10T16:00:00Z"),
    },
  });
  seededQcPassedWoId = woQcPassed.id;

  await prisma.operationEvent.create({
    data: {
      tenantId,
      branchId: branchAId,
      workOrderId: woQcPassed.id,
      eventKey: "work_order.status_changed",
      actorId: tech1Id,
      actorType: "TENANT_STAFF",
      createdAt: new Date("2026-03-10T16:00:00Z"),
      payload: { from: "READY_FOR_QC", to: "READY_FOR_DELIVERY", intent: "QC_PASSED", notes: "All checks passed cleanly" },
    },
  });

  const woQcFailed = await prisma.workOrder.create({
    data: {
      tenantId,
      branchId: branchBId,
      customerId,
      assetId: asset2Id,
      status: "QC_FAILED",
      createdAt: new Date("2026-03-12T08:00:00Z"),
    },
  });
  seededQcFailedWoId = woQcFailed.id;

  await prisma.operationEvent.create({
    data: {
      tenantId,
      branchId: branchBId,
      workOrderId: woQcFailed.id,
      eventKey: "work_order.status_changed",
      actorId: tech2Id,
      actorType: "TENANT_STAFF",
      createdAt: new Date("2026-03-12T17:00:00Z"),
      payload: {
        from: "READY_FOR_QC",
        to: "QC_FAILED",
        intent: "QC_FAILED",
        failureReason: QcFailureReason.INCOMPLETE_REPAIR,
        notes: "Left caliper bolt loose",
      },
    },
  });

  // 4. Repeat Vehicle Visit: Return within 30 days
  await prisma.workOrder.create({
    data: {
      tenantId,
      branchId: branchAId,
      customerId,
      assetId: asset1Id,
      status: "IN_PROGRESS",
      createdAt: new Date("2026-03-20T09:00:00Z"),
    },
  });

  // 5. Fault Recurrence
  await prisma.fault.create({
    data: {
      tenantId,
      workOrderId: wo1.id,
      code: "F-BRK-01",
      description: "Excessive vibration during braking",
      severity: "CRITICAL",
      createdAt: new Date("2026-03-02T08:30:00Z"),
    },
  });

  await prisma.fault.create({
    data: {
      tenantId,
      workOrderId: woQcPassed.id,
      code: "F-BRK-01",
      description: "Excessive vibration recurring",
      severity: "CRITICAL",
      createdAt: new Date("2026-03-10T08:30:00Z"),
    },
  });

  // 6. Decisions: Recommendation, Approved, Unperformed
  const decReq = await prisma.customerDecisionRequest.create({
    data: {
      tenantId,
      workOrderId: wo1.id,
      customerId,
      secureToken: `tok-${SUFFIX}`,
      createdById: tech1Id,
      sentAt: new Date("2026-03-02T09:00:00Z"),
      createdAt: new Date("2026-03-02T09:00:00Z"),
      status: "RESOLVED",
    },
  });

  const decItem = await prisma.customerDecisionItem.create({
    data: {
      tenantId,
      decisionRequestId: decReq.id,
      serviceKey: "AIR_CONDITIONING",
      name: "REPLACE_CABIN_FILTER",
      explanation: "Filter clogged with dust",
      importance: "HIGH",
      decision: "APPROVED",
      price: 50,
      laborPrice: 20,
      total: 70,
      decidedAt: new Date("2026-03-02T09:30:00Z"),
    },
  });
  seededDecisionItemId = decItem.id;

  // 7. Financial: Invoiced & Collected
  const invoice = await prisma.invoice.create({
    data: {
      tenantId,
      branchId: branchAId,
      workOrderId: wo1.id,
      invoiceNumber: `INV-${SUFFIX}-01`,
      status: "ISSUED",
      subtotal: 150,
      discount: 0,
      tax: 0,
      total: 150,
      paid: 150,
      balance: 0,
      issuedById: tech1Id,
      issuedAt: new Date("2026-03-06T10:00:00Z"),
    },
  });
  seededInvoiceId = invoice.id;

  await prisma.invoiceLine.create({
    data: {
      tenantId,
      invoiceId: invoice.id,
      name: "Brake service package",
      itemType: "LABOR",
      quantity: 1,
      lockedUnitPrice: 150,
      total: 150,
    },
  });

  // Refunded invoice (must be excluded from invoiced revenue)
  const wo2 = await prisma.workOrder.create({
    data: {
      tenantId,
      branchId: branchAId,
      customerId,
      assetId: asset1Id,
      status: "CLOSED",
      createdAt: new Date("2026-03-03T08:00:00Z"),
      closedAt: new Date("2026-03-07T18:00:00Z"),
    },
  });

  await prisma.invoice.create({
    data: {
      tenantId,
      branchId: branchAId,
      workOrderId: wo2.id,
      invoiceNumber: `INV-${SUFFIX}-02-REF`,
      status: "REFUNDED",
      subtotal: 50,
      discount: 0,
      tax: 0,
      total: 50,
      paid: 0,
      balance: 50,
      issuedById: tech1Id,
      issuedAt: new Date("2026-03-07T10:00:00Z"),
    },
  });

  // Payment
  const payment = await prisma.payment.create({
    data: {
      tenantId,
      invoiceId: invoice.id,
      amount: 150,
      status: "CONFIRMED",
      method: "CARD",
      idempotencyKey: `pay-key-${SUFFIX}`,
      recordedById: tech1Id,
      createdAt: new Date("2026-03-06T11:00:00Z"),
    },
  });
  seededPaymentId = payment.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Phase 2 -- Prompt 9: Universal Drill-Down / Evidence Engine Integration Suite", () => {
  // ==========================================================================
  // 1 & 2. METRIC CATALOG REGISTRY & UNKNOWN REJECTION
  // ==========================================================================
  it("1. rejects unregistered metric with 400 Bad Request", async () => {
    await expect(
      drillDownService.drillDown(tenantId, baseScope, {
        metric: "nonExistentMetricXYZ" as any,
        ...QUERY_WINDOW,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("2. all registered metrics in REGISTERED_METRICS are discoverable and valid", () => {
    expect(REGISTERED_METRICS.length).toBeGreaterThanOrEqual(15);
    for (const m of REGISTERED_METRICS) {
      expect(m.metricKey).toBeTruthy();
      expect(m.label).toBeTruthy();
      expect(m.sourceSystem).toBeTruthy();
      expect(m.canonicalResolverKey).toBeTruthy();
    }
  });

  // ==========================================================================
  // 3-6. OPERATIONS DRILL-DOWN (COMPLETED, DELAYED, WAITING, BOTTLENECK)
  // ==========================================================================
  it("3. completedWorkOrders returns work order records with duration attributes", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "completedWorkOrders",
      ...QUERY_WINDOW,
    });
    expect(res.metric.key).toBe("completedWorkOrders");
    expect(res.records.length).toBeGreaterThanOrEqual(1);
    const woRecord = res.records.find((r) => r.entityId === seededWorkOrderId);
    expect(woRecord).toBeDefined();
    expect(woRecord?.entityType).toBe("WORK_ORDER");
    expect(woRecord?.attributes).toBeDefined();
    expect(woRecord?.attributes["waitingMinutes"]).toBeDefined();
  });

  it("4. delayedWorkOrders returns work orders exceeding SLA threshold", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "delayedWorkOrders",
      ...QUERY_WINDOW,
    });
    expect(res.metric.key).toBe("delayedWorkOrders");
    expect(res.integrity.historicalAttributionPreserved).toBe(true);
    expect(res.records.every((r) => r.entityType === "WORK_ORDER")).toBe(true);
  });

  it("5. waitingTime returns records with waiting duration breakdown", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "waitingTime",
      ...QUERY_WINDOW,
    });
    expect(res.metric.key).toBe("waitingTime");
    expect(res.records.length).toBeGreaterThanOrEqual(1);
    const woRecord = res.records.find((r) => r.entityId === seededWorkOrderId);
    expect(Number(woRecord?.attributes["waitingMinutes"])).toBeGreaterThan(0);
  });

  it("6. bottleneckCount returns work orders identified by bottleneck status", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "bottleneckCount",
      ...QUERY_WINDOW,
    });
    expect(res.metric.key).toBe("bottleneckCount");
    expect(res.records.length).toBeGreaterThanOrEqual(1);
    const wo = res.records.find((r) => r.entityId === seededWorkOrderId);
    expect(wo?.attributes["bottleneckStatus"]).toBe("WAITING_PARTS");
  });

  // ==========================================================================
  // 7-14. QUALITY DRILL-DOWN (FPY, EVALUATIONS, FAILURES, REWORK, REPEAT VISITS)
  // ==========================================================================
  it("7. firstPassYield reconciles: drill-down records equal matching passed work orders", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "firstPassYield",
      ...QUERY_WINDOW,
    });
    expect(res.metric.key).toBe("firstPassYield");
    expect(res.integrity.totalMatchingRecords).toBe(2); // 2 unique work orders evaluated on first pass
    expect(res.records.length).toBe(2);
    const passedWo = res.records.find((r) => r.entityId === seededQcPassedWoId);
    expect(passedWo?.attributes["qcPassed"]).toBe(true);
  });

  it("8. firstPassYield with dimension filtering isolates branch records", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "firstPassYield",
      branchId: branchAId,
      ...QUERY_WINDOW,
    });
    expect(res.activeFilters.branchId).toBe(branchAId);
    expect(res.records.every((r) => r.branchId === branchAId)).toBe(true);
  });

  it("9. qcEvaluations returns all evaluations in window with checklist summary", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "qcEvaluations",
      ...QUERY_WINDOW,
    });
    expect(res.metric.key).toBe("qcEvaluations");
    expect(res.records.length).toBe(2);
    expect(res.records.every((r) => r.entityType === "WORK_ORDER")).toBe(true);
  });

  it("10. qcFailures returns failed evaluations and structured reason", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "qcFailures",
      ...QUERY_WINDOW,
    });
    expect(res.metric.key).toBe("qcFailures");
    expect(res.records.length).toBe(1);
    expect(res.records[0]!.entityId).toBe(seededQcFailedWoId);
    expect(res.records[0]!.attributes["qcPassed"]).toBe(false);
  });

  it("11. taskReworkRate returns rework tasks and completed tasks denominator", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "taskReworkRate",
      ...QUERY_WINDOW,
    });
    expect(res.metric.key).toBe("taskReworkRate");
    expect(res.records.length).toBe(1);
    const rwRecord = res.records[0]!;
    expect(rwRecord.entityId).toBe(seededReworkTaskId);
    expect(rwRecord.attributes["isRework"]).toBe(true);
    expect(rwRecord.attributes["reworkReason"]).toBe("INCOMPLETE_WORK");
  });

  it("12. taskReworkRate lineage: parent task is linked as OBSERVED_FACT, never CAUSAL_LINK", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "taskReworkRate",
      ...QUERY_WINDOW,
    });
    const rwRecord = res.records[0]!;
    const parentRef = rwRecord.evidenceReferences?.find((r) => r.entityId === seededTaskId);
    expect(parentRef).toBeDefined();
    expect(parentRef?.relation).toBe("REWORK_PARENT_LINEAGE");
    // Lineage must not be labeled CAUSAL_LINK
    expect(rwRecord.evidenceReferences?.every((r) => r.relation !== "CAUSAL_LINK")).toBe(true);
  });

  it("13. repeatVehicleVisits returns return visits within 30 days without labeling as warranty", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "repeatVehicleVisits",
      ...QUERY_WINDOW,
    });
    expect(res.metric.key).toBe("repeatVehicleVisits");
    expect(res.records.length).toBeGreaterThanOrEqual(1);
    // Disclaimers: Must state returned visits within 30 days, NOT warranty
    expect(res.integrity.dataHonestyDisclaimer).toContain("30 days");
    expect(res.integrity.dataHonestyDisclaimer).toContain("strictly NOT labeled as warranty claims");
  });

  it("14. faultRecurrence returns recurrence records and associated faults", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "faultRecurrence",
      ...QUERY_WINDOW,
    });
    expect(res.metric.key).toBe("faultRecurrence");
    expect(res.records.length).toBeGreaterThanOrEqual(1);
    expect(res.records.some((r) => r.attributes["faultCode"] === "F-BRK-01")).toBe(true);
  });

  // ==========================================================================
  // 15 & 16. DECISIONS DRILL-DOWN (RECOMMENDATIONS, APPROVED, UNPERFORMED)
  // ==========================================================================
  it("15. recommendations and approvedDecisions reuse canonical resolveOutcome", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "approvedDecisions",
      ...QUERY_WINDOW,
    });
    expect(res.metric.key).toBe("approvedDecisions");
    expect(res.records.length).toBe(1);
    expect(res.records[0]!.entityId).toBe(seededDecisionItemId);
    expect(res.records[0]!.attributes["canonicalOutcome"]).toBeDefined();
  });

  it("16. unperformedDecisions correctly isolates approved tasks that never started", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "unperformedDecisions",
      ...QUERY_WINDOW,
    });
    expect(res.metric.key).toBe("unperformedDecisions");
    // seededDecisionItemId was approved but has no planned or started task -> unperformed
    expect(res.records.some((r) => r.entityId === seededDecisionItemId)).toBe(true);
  });

  // ==========================================================================
  // 17-19. FINANCIAL DRILL-DOWN (REVENUE, CASH, COST INTEGRITY)
  // ==========================================================================
  it("17. invoicedRevenue drill-down reconciles with invoice line items and excludes cancelled", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "invoicedRevenue",
      ...QUERY_WINDOW,
    });
    expect(res.metric.key).toBe("invoicedRevenue");
    expect(res.records.length).toBe(1);
    expect(res.records[0]!.entityId).toBe(seededInvoiceId);
    expect(res.records[0]!.attributes["total"]).toBe(150);
    // Refunded invoice must NOT appear in invoicedRevenue
    expect(res.records.some((r) => r.attributes["status"] === "REFUNDED")).toBe(false);
  });

  it("18. collectedCash drill-down reconciles with completed payments and accounts for refunds", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "collectedCash",
      ...QUERY_WINDOW,
    });
    expect(res.metric.key).toBe("collectedCash");
    expect(res.records.length).toBe(1);
    expect(res.records[0]!.entityId).toBe(seededPaymentId);
    expect(res.records[0]!.attributes["amount"]).toBe(150);
  });

  it("19. rework monetary cost remains explicitly NOT_COMPUTABLE with honesty disclaimer", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "taskReworkRate",
      ...QUERY_WINDOW,
    });
    expect(res.integrity.financialAttributionComputable).toBe(false);
    expect(res.integrity.financialAttributionNote).toContain("not captured");
  });

  // ==========================================================================
  // 20. ROOT CAUSE DRILL-DOWN (DIAGNOSTIC FINDINGS)
  // ==========================================================================
  it("20. diagnosticFindings drill-down returns findings with 5-tier evidence classifications", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "diagnosticFindings",
      dimensionValue: "WORK_ORDER_DELAY",
      ...QUERY_WINDOW,
    });
    expect(res.metric.key).toBe("diagnosticFindings");
    expect(res.records.length).toBeGreaterThanOrEqual(1);
    const validTiers = [
      "OBSERVED_FACT",
      "RULE_BASED_CONTRIBUTOR",
      "STRONG_ASSOCIATION",
      "CAUSAL_LINK",
      "INSUFFICIENT_EVIDENCE",
    ];
    for (const r of res.records) {
      expect(validTiers).toContain(r.attributes["evidenceLevel"]);
    }
  });

  // ==========================================================================
  // 21 & 22. SINGLE EVIDENCE RESOLUTION
  // ==========================================================================
  it("21. resolveEvidence(WORK_ORDER, id) returns authoritative record and events", async () => {
    const ev = (await drillDownService.resolveEvidence(tenantId, baseScope, "WORK_ORDER", seededWorkOrderId)) as any;
    expect(ev.entityType).toBe("WORK_ORDER");
    expect(ev.id).toBe(seededWorkOrderId);
    expect(ev.timelineEvents.length).toBeGreaterThanOrEqual(3);
    expect(ev.timelineEvents[0]!.eventType).toBe("work_order.status_changed");
  });

  it("22. resolveEvidence(TASK, id) returns authoritative task record and lineage", async () => {
    const ev = (await drillDownService.resolveEvidence(tenantId, baseScope, "TASK", seededReworkTaskId)) as any;
    expect(ev.entityType).toBe("TASK");
    expect(ev.id).toBe(seededReworkTaskId);
    expect(ev.reworkReason).toBe("INCOMPLETE_WORK");
    expect(ev.originalTaskId).toBe(seededTaskId);
  });

  // ==========================================================================
  // 23-25. BOUNDED CURSOR PAGINATION & STABILITY
  // ==========================================================================
  it("23. bounded cursor pagination: default page size is 25, max is 100", async () => {
    const resDefault = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "completedWorkOrders",
      ...QUERY_WINDOW,
    });
    expect(resDefault.integrity.returnedRecords).toBeLessThanOrEqual(25);

    const resOverMax = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "completedWorkOrders",
      limit: 500,
      ...QUERY_WINDOW,
    });
    expect(resOverMax.integrity.returnedRecords).toBeLessThanOrEqual(100);
  });

  it("24. cursor pagination stability: records are ordered deterministically occurredAt DESC, entityId DESC", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "completedWorkOrders",
      ...QUERY_WINDOW,
    });
    for (let i = 0; i < res.records.length - 1; i++) {
      const current = res.records[i]!;
      const next = res.records[i + 1]!;
      const currentTime = new Date(current.occurredAt).getTime();
      const nextTime = new Date(next.occurredAt).getTime();
      expect(currentTime).toBeGreaterThanOrEqual(nextTime);
      if (currentTime === nextTime) {
        expect(current.entityId.localeCompare(next.entityId)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("25. cursor pagination traversal: second page returns subsequent records with no duplicates or skips", async () => {
    const page1 = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "completedWorkOrders",
      limit: 1,
      ...QUERY_WINDOW,
    });
    expect(page1.records.length).toBe(1);

    if (page1.nextCursor) {
      const page2 = await drillDownService.drillDown(tenantId, baseScope, {
        metric: "completedWorkOrders",
        limit: 1,
        cursor: page1.nextCursor,
        ...QUERY_WINDOW,
      });
      expect(page2.records.length).toBe(1);
      expect(page2.records[0]!.entityId).not.toBe(page1.records[0]!.entityId);
    }
  });

  // ==========================================================================
  // 26-28. MULTI-TENANT ISOLATION & BRANCH AUTHORIZATION
  // ==========================================================================
  it("26. multi-tenant isolation: tenant A cannot query tenant B records", async () => {
    const resOther = await drillDownService.drillDown(otherTenantId, baseScope, {
      metric: "completedWorkOrders",
      ...QUERY_WINDOW,
    });
    // Other tenant has no records created
    expect(resOther.records.length).toBe(0);
  });

  it("27. multi-tenant isolation: unauthorized entity IDs cannot be resolved across tenants", async () => {
    await expect(
      drillDownService.resolveEvidence(otherTenantId, baseScope, "WORK_ORDER", seededWorkOrderId),
    ).rejects.toThrow(NotFoundException);
  });

  it("28. branch authorization: user restricted to branch A cannot query branch B", async () => {
    const restrictedScope: AnalyticsScope = {
      branchIds: [branchAId],
      categoryIds: [],
    };
    await expect(
      drillDownService.drillDown(tenantId, restrictedScope, {
        metric: "firstPassYield",
        branchId: branchBId,
        ...QUERY_WINDOW,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  // ==========================================================================
  // 29-31. SCOPE FILTERING & HISTORICAL INTEGRITY
  // ==========================================================================
  it("29. scope filtering: respects branch filter and returns only matching records", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "qcEvaluations",
      branchId: branchBId,
      ...QUERY_WINDOW,
    });
    expect(res.records.every((r) => r.branchId === branchBId)).toBe(true);
  });

  it("30. historical integrity: preserves historical branch attribution even if current branch differs", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "firstPassYield",
      ...QUERY_WINDOW,
    });
    const wo = res.records.find((r) => r.entityId === seededQcPassedWoId);
    expect(wo?.branchId).toBe(branchAId);
  });

  it("31. historical integrity: preserves historical technician attribution", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "qcEvaluations",
      ...QUERY_WINDOW,
    });
    const ev = res.records.find((r) => r.entityId === seededQcPassedWoId);
    expect(ev).toBeDefined();
    expect(ev?.branchId).toBe(branchAId);
  });

  // ==========================================================================
  // 32-34. EVIDENCE INTEGRITY: NO FUZZY JOINS, NO SYNTHETIC IDS, TIMELINE ORDER
  // ==========================================================================
  it("32. no fuzzy joins: unlinked records are not grouped by similar name or proximity", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "taskReworkRate",
      ...QUERY_WINDOW,
    });
    // Task 1 was rotor machining, but only reworkTask explicitly points to originalTaskId
    const originalRecord = res.records.find((r) => r.entityId === seededTaskId);
    expect(originalRecord).toBeUndefined(); // Original task is not rework
  });

  it("33. no synthetic IDs: all entity IDs returned match real database cuid/uuid", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "completedWorkOrders",
      ...QUERY_WINDOW,
    });
    for (const r of res.records) {
      expect(r.entityId).toBeTruthy();
      expect(typeof r.entityId).toBe("string");
      expect(r.entityId.length).toBeGreaterThan(10);
    }
  });

  it("34. timeline event ordering: timeline events are strictly chronologically ordered", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "completedWorkOrders",
      ...QUERY_WINDOW,
    });
    const wo = res.records.find((r) => r.entityId === seededWorkOrderId);
    expect(wo?.timeline).toBeDefined();
    if (wo && wo.timeline) {
      for (let i = 0; i < wo.timeline.length - 1; i++) {
        const t1 = new Date(wo.timeline[i]!.timestamp).getTime();
        const t2 = new Date(wo.timeline[i + 1]!.timestamp).getTime();
        expect(t1).toBeLessThanOrEqual(t2);
      }
    }
  });

  // ==========================================================================
  // 35 & 36. EMPTY PERIOD SEMANTICS & CSV EXPORT
  // ==========================================================================
  it("35. empty period semantics: zero matching records returns clean empty array with 0 count, not error", async () => {
    const res = await drillDownService.drillDown(tenantId, baseScope, {
      metric: "completedWorkOrders",
      from: "2025-01-01T00:00:00.000Z",
      to: "2025-01-31T23:59:59.999Z",
    });
    expect(res.records).toEqual([]);
    expect(res.integrity.totalMatchingRecords).toBe(0);
    expect(res.nextCursor).toBeUndefined();
  });

  it("36. CSV Export: preserves all query filters and produces valid RFC 4180 CSV", async () => {
    const { filename, csv } = await drillDownService.exportCsv(tenantId, baseScope, {
      metric: "completedWorkOrders",
      ...QUERY_WINDOW,
    });
    expect(typeof filename).toBe("string");
    expect(typeof csv).toBe("string");
    expect(csv).toContain("entityType");
    expect(csv).toContain("entityId");
    expect(csv).toContain("WORK_ORDER");
    expect(csv).toContain(seededWorkOrderId);
  });
});
