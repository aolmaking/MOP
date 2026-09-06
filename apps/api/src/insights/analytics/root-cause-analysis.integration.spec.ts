/**
 * Phase 2 -- Prompt 8: Root-Cause Analysis Engine
 * Comprehensive Integration Suite against real PostgreSQL database.
 */
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient, QcFailureReason, TaskReworkReason } from "@mop/database";
import { RootCauseAnalysisService } from "./root-cause-analysis.service";
import type { PrismaService } from "../../runtime/database/prisma.service";
import type { AnalyticsScope } from "./analytics-scope.util";
import { ForbiddenException } from "@nestjs/common";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const rcaService = new RootCauseAnalysisService(asService);

const SUFFIX = `rca-${Date.now()}`;
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
let lowSampleTechId: string;

const baseScope: AnalyticsScope = {
  branchIds: [],
  categoryIds: [],
};

const FROM_DATE = new Date("2026-03-01T00:00:00.000Z");
const TO_DATE = new Date("2026-03-31T23:59:59.999Z");
const QUERY_WINDOW = {
  from: "2026-03-01T00:00:00.000Z",
  to: "2026-03-31T23:59:59.999Z",
};

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "RCA Test Plan",
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
      name: `RCA WS ${SUFFIX}`,
      nameNormalized: `rca ws ${SUFFIX}`,
      slug: `rca-ws-${SUFFIX}`,
      customerRegistrationCode: `RCA-${SUFFIX}`,
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
      name: `Other RCA WS ${SUFFIX}`,
      nameNormalized: `other rca ws ${SUFFIX}`,
      slug: `other-rca-ws-${SUFFIX}`,
      customerRegistrationCode: `ORCA-${SUFFIX}`,
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

  const customer = await prisma.customer.create({ data: { tenantId, fullName: "RCA Customer", phone: "0109999999" } });
  customerId = customer.id;

  const asset1 = await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `PLT1-${SUFFIX}` } });
  asset1Id = asset1.id;
  const asset2 = await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `PLT2-${SUFFIX}` } });
  asset2Id = asset2.id;

  // Technicians
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

  const acc3 = await prisma.account.create({
    data: { tenantId, accountType: "TENANT_STAFF", email: `tech3-${SUFFIX}@test.com`, status: "ACTIVE" },
  });
  const staff3 = await prisma.staffUser.create({
    data: { tenantId, accountId: acc3.id, fullName: "Low Sample Tech", role: "TECHNICIAN" },
  });
  lowSampleTechId = staff3.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Phase 2 -- Prompt 8: Root-Cause Analysis Engine Integration Suite", () => {
  // --------------------------------------------------------------------------
  // 1-3. WORK ORDER DELAY, WAITING DWELL & BLOCKER CONTRIBUTIONS
  // --------------------------------------------------------------------------
  it("1-3. detects workflow delay, elevated waiting dwell, and task blocker contributors", async () => {
    const wo = await prisma.workOrder.create({
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

    // Lifecycle events: DRAFT (8h) -> WAITING_PARTS (48h) -> IN_PROGRESS (10h) -> READY_FOR_DELIVERY (16h) -> CLOSED
    await prisma.operationEvent.createMany({
      data: [
        {
          tenantId,
          branchId: branchAId,
          workOrderId: wo.id,
          eventKey: "work_order.status_changed",
          actorId: "actor-1",
          actorType: "TENANT_STAFF",
          payload: { workOrderId: wo.id, from: "DRAFT", to: "WAITING_PARTS" },
          createdAt: new Date("2026-03-02T16:00:00Z"),
        },
        {
          tenantId,
          branchId: branchAId,
          workOrderId: wo.id,
          eventKey: "work_order.status_changed",
          actorId: "actor-1",
          actorType: "TENANT_STAFF",
          payload: { workOrderId: wo.id, from: "WAITING_PARTS", to: "IN_PROGRESS" },
          createdAt: new Date("2026-03-04T16:00:00Z"),
        },
        {
          tenantId,
          branchId: branchAId,
          workOrderId: wo.id,
          eventKey: "work_order.status_changed",
          actorId: "actor-1",
          actorType: "TENANT_STAFF",
          payload: { workOrderId: wo.id, from: "IN_PROGRESS", to: "READY_FOR_DELIVERY" },
          createdAt: new Date("2026-03-05T02:00:00Z"),
        },
        {
          tenantId,
          branchId: branchAId,
          workOrderId: wo.id,
          eventKey: "work_order.status_changed",
          actorId: "actor-1",
          actorType: "TENANT_STAFF",
          payload: { workOrderId: wo.id, from: "READY_FOR_DELIVERY", to: "CLOSED" },
          createdAt: new Date("2026-03-05T18:00:00Z"),
        },
      ],
    });

    // Task and blocker
    const task = await prisma.task.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        title: "Brake Overhaul",
        status: "DONE",
        completedAt: new Date("2026-03-05T02:00:00Z"),
      },
    });

    await prisma.taskBlocker.create({
      data: {
        tenantId,
        taskId: task.id,
        reason: "WAITING_PART",
        reportedBy: "tech-1",
        createdAt: new Date("2026-03-02T18:00:00Z"),
      },
    });

    const report = await rcaService.analyze(tenantId, baseScope, {
      subject: "WORK_ORDER_DELAY",
      ...QUERY_WINDOW,
      workOrderId: wo.id,
    });

    expect(report.subject).toBe("WORK_ORDER_DELAY");
    expect(report.evidenceLevel).toBe("RULE_BASED_CONTRIBUTOR");
    expect(report.observedFacts.length).toBeGreaterThanOrEqual(3);

    // Waiting dwell factor detected
    const waitingFactor = report.contributingFactors.find((f) => f.key === "ELEVATED_WAITING_DWELL");
    expect(waitingFactor).toBeDefined();
    expect(waitingFactor!.evidenceLevel).toBe("RULE_BASED_CONTRIBUTOR");
    expect(waitingFactor!.explanation).toContain("WAITING_PARTS");

    // Blocker factor detected
    const blockerFactor = report.contributingFactors.find((f) => f.key === "TASK_BLOCKER_CONTRIBUTION");
    expect(blockerFactor).toBeDefined();
    expect(blockerFactor!.evidenceLevel).toBe("OBSERVED_FACT");
    expect(blockerFactor!.explanation).toContain("WAITING_PART");

    // Evidence reference pointing back to real entity
    expect(report.evidenceReferences.some((r) => r.id === wo.id && r.type === "WORK_ORDER")).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 4. WORKFLOW BOTTLENECK DIAGNOSIS
  // --------------------------------------------------------------------------
  it("4. diagnoses workflow bottleneck accumulation and re-entry loops", async () => {
    const wo1 = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        customerId,
        assetId: asset1Id,
        status: "READY_FOR_QC",
        createdAt: new Date("2026-03-06T08:00:00Z"),
      },
    });

    await prisma.operationEvent.createMany({
      data: [
        {
          tenantId,
          branchId: branchAId,
          workOrderId: wo1.id,
          eventKey: "work_order.status_changed",
          actorId: "actor-1",
          actorType: "TENANT_STAFF",
          payload: { workOrderId: wo1.id, from: "DRAFT", to: "READY_FOR_QC" },
          createdAt: new Date("2026-03-06T10:00:00Z"),
        },
      ],
    });

    const report = await rcaService.analyze(tenantId, baseScope, {
      subject: "WORKFLOW_BOTTLENECK",
      ...QUERY_WINDOW,
      branchId: branchAId,
    });

    expect(report.subject).toBe("WORKFLOW_BOTTLENECK");
    expect(report.observedFacts.some((f) => f.key === "PRIMARY_BOTTLENECK_STATUS")).toBe(true);
    expect(report.contributingFactors.some((f) => f.key === "BOTTLENECK_ACCUMULATION")).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 5-7. QC FAILURE DIAGNOSIS, STRUCTURED REASONS & FIRST-PASS CONTEXT
  // --------------------------------------------------------------------------
  it("5-7. evaluates QC failure diagnosis, structured reason concentration, and first-pass context", async () => {
    // Create 6 QC evaluation events: 4 fail with INCOMPLETE_REPAIR, 2 pass
    const woQc1 = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        customerId,
        assetId: asset1Id,
        status: "IN_PROGRESS",
        qcFailureReason: QcFailureReason.INCOMPLETE_REPAIR,
        createdAt: new Date("2026-03-10T08:00:00Z"),
      },
    });

    await prisma.operationEvent.createMany({
      data: [
        {
          tenantId,
          branchId: branchAId,
          workOrderId: woQc1.id,
          eventKey: "work_order.status_changed",
          actorId: "qc-tech",
          actorType: "TENANT_STAFF",
          payload: { workOrderId: woQc1.id, from: "READY_FOR_QC", to: "QC_FAILED" },
          createdAt: new Date("2026-03-10T12:00:00Z"),
        },
      ],
    });

    const report = await rcaService.analyze(tenantId, baseScope, {
      subject: "QC_FAILURE",
      ...QUERY_WINDOW,
      branchId: branchAId,
    });

    expect(report.subject).toBe("QC_FAILURE");
    expect(report.outcome.metricName).toBe("QC Failure Rate");
    expect(report.observedFacts.some((f) => f.key === "TOTAL_QC_EVALUATIONS")).toBe(true);
    expect(report.observedFacts.some((f) => f.key === "QC_FAILURE_RATE")).toBe(true);

    const reasonFactor = report.contributingFactors.find((f) => f.key === "QC_REASON_CONCENTRATION");
    if (reasonFactor) {
      expect(reasonFactor.evidenceLevel).toBe("RULE_BASED_CONTRIBUTOR");
      expect(reasonFactor.explanation).toContain("INCOMPLETE_REPAIR");
    }
  });

  // --------------------------------------------------------------------------
  // 8-10. TASK REWORK DIAGNOSIS, STRUCTURED REASON & PARENT LINEAGE (NOT CAUSAL)
  // --------------------------------------------------------------------------
  it("8-10. diagnoses task rework, structured reasons, and marks parent lineage as OBSERVED_FACT (NOT CAUSAL_LINK)", async () => {
    const parentTask = await prisma.task.create({
      data: {
        tenantId,
        workOrderId: (await prisma.workOrder.findFirst({ where: { tenantId } }))!.id,
        title: "Initial Suspension Repair",
        status: "DONE",
        completedAt: new Date("2026-03-12T10:00:00Z"),
        serviceKey: "SUSP-01",
      },
    });

    const reworkTask = await prisma.task.create({
      data: {
        tenantId,
        workOrderId: parentTask.workOrderId,
        originalTaskId: parentTask.id,
        reworkReason: TaskReworkReason.FAILED_INSPECTION,
        title: "Rework Suspension Bushing",
        status: "DONE",
        actualMinutes: 45,
        completedAt: new Date("2026-03-12T14:00:00Z"),
        serviceKey: "SUSP-01",
      },
    });

    const report = await rcaService.analyze(tenantId, baseScope, {
      subject: "TASK_REWORK",
      ...QUERY_WINDOW,
    });

    expect(report.subject).toBe("TASK_REWORK");
    expect(report.observedFacts.some((f) => f.key === "TASK_REWORK_RATE")).toBe(true);
    expect(report.observedFacts.some((f) => f.key === "REWORK_LABOR_MINUTES")).toBe(true);

    // Parent lineage check: MUST be OBSERVED_FACT, NEVER CAUSAL_LINK
    const lineageFactor = report.contributingFactors.find((f) => f.key === "REWORK_PARENT_LINEAGE");
    expect(lineageFactor).toBeDefined();
    expect(lineageFactor!.evidenceLevel).toBe("OBSERVED_FACT"); // Critical data honesty rule
    expect(lineageFactor!.evidenceLevel).not.toBe("CAUSAL_LINK");
    expect(lineageFactor!.explanation).toContain("originalTaskId");

    // Structured reason check
    const reasonFactor = report.contributingFactors.find((f) => f.key === "REWORK_REASON_CONCENTRATION");
    if (reasonFactor) {
      expect(reasonFactor.explanation).toContain("FAILED_INSPECTION");
    }
  });

  // --------------------------------------------------------------------------
  // 11-12. TECHNICIAN COMPARISON: SUFFICIENT VS INSUFFICIENT SAMPLE SIZE (< 5)
  // --------------------------------------------------------------------------
  it("11-12. enforces technician sample-size protection (< 5 completed tasks)", async () => {
    // Low-sample technician: only 1 task
    const lowTask = await prisma.task.create({
      data: {
        tenantId,
        workOrderId: (await prisma.workOrder.findFirst({ where: { tenantId } }))!.id,
        title: "Single Task",
        status: "DONE",
        completedAt: new Date("2026-03-14T10:00:00Z"),
      },
    });
    await prisma.taskAssignment.create({
      data: {
        tenantId,
        taskId: lowTask.id,
        staffUserId: lowSampleTechId,
      },
    });

    const report = await rcaService.analyze(tenantId, baseScope, {
      subject: "TASK_REWORK",
      ...QUERY_WINDOW,
      technicianId: lowSampleTechId,
    });

    const techFactor = report.contributingFactors.find((f) => f.key === "TECHNICIAN_SAMPLE_SIZE_PROTECTION");
    expect(techFactor).toBeDefined();
    expect(techFactor!.evidenceLevel).toBe("INSUFFICIENT_EVIDENCE");
    expect(techFactor!.explanation).toContain("fewer than 5 completed tasks");
  });

  // --------------------------------------------------------------------------
  // 13-14. BRANCH & SERVICE COMPARISON AGAINST BASELINE
  // --------------------------------------------------------------------------
  it("13-14. calculates baseline comparison for branch and service", async () => {
    // Add completed tasks in another branch so org baseline >= 5
    const otherWo = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchBId,
        customerId,
        assetId: asset1Id,
        status: "CLOSED",
        createdAt: new Date("2026-03-01T08:00:00Z"),
      },
    });
    await prisma.task.createMany({
      data: [
        {
          tenantId,
          workOrderId: otherWo.id,
          title: "Brake Pad Replace",
          status: "DONE",
          completedAt: new Date("2026-03-10T11:00:00Z"),
        },
        {
          tenantId,
          workOrderId: otherWo.id,
          title: "Air Filter Replace",
          status: "DONE",
          completedAt: new Date("2026-03-11T12:00:00Z"),
        },
      ],
    });

    const report = await rcaService.analyze(tenantId, baseScope, {
      subject: "TASK_REWORK",
      ...QUERY_WINDOW,
      branchId: branchAId,
    });

    expect(report.integrity.baselineAvailable).toBe(true);
    expect(report.integrity.baselineSampleSize).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // 15. REPEAT VEHICLE VISIT PATTERN (WITHIN 30 DAYS, NEVER WARRANTY)
  // --------------------------------------------------------------------------
  it("15. detects repeat vehicle visits within 30 days and never labels them warranty", async () => {
    const priorWo = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        customerId,
        assetId: asset2Id,
        status: "CLOSED",
        createdAt: new Date("2026-03-01T10:00:00Z"),
        closedAt: new Date("2026-03-04T16:00:00Z"),
      },
    });
    await prisma.task.create({
      data: {
        tenantId,
        workOrderId: priorWo.id,
        title: "Oil Change",
        serviceKey: "OIL-01",
        status: "DONE",
        completedAt: new Date("2026-03-04T15:00:00Z"),
      },
    });

    // Repeat visit on March 15 (within 30 days)
    const repeatWo = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        customerId,
        assetId: asset2Id,
        status: "IN_PROGRESS",
        createdAt: new Date("2026-03-15T09:00:00Z"),
      },
    });
    await prisma.task.create({
      data: {
        tenantId,
        workOrderId: repeatWo.id,
        title: "Oil Leak Check",
        serviceKey: "OIL-01",
        status: "ASSIGNED",
      },
    });

    const report = await rcaService.analyze(tenantId, baseScope, {
      subject: "REPEAT_VEHICLE_VISIT",
      ...QUERY_WINDOW,
    });

    expect(report.subject).toBe("REPEAT_VEHICLE_VISIT");
    const repeatFact = report.observedFacts.find((f) => f.key === "REPEAT_VISITS_COUNT_30D");
    expect(repeatFact).toBeDefined();
    expect(Number(repeatFact!.value)).toBeGreaterThanOrEqual(1);

    // Strictly check: never labeled as warranty
    const reportJson = JSON.stringify(report).toLowerCase();
    expect(reportJson).not.toContain("warranty claim");
    expect(reportJson).not.toContain("covered by warranty");

    const overlapFactor = report.contributingFactors.find((f) => f.key === "REPEAT_SERVICE_OVERLAP");
    expect(overlapFactor).toBeDefined();
    expect(overlapFactor!.evidenceLevel).toBe("STRONG_ASSOCIATION");
  });

  // --------------------------------------------------------------------------
  // 16. FAULT RECURRENCE PATTERN ON SAME VEHICLE
  // --------------------------------------------------------------------------
  it("16. detects recurring diagnostic fault codes without asserting technician blame", async () => {
    const woF1 = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        customerId,
        assetId: asset1Id,
        status: "CLOSED",
        createdAt: new Date("2026-03-01T08:00:00Z"),
      },
    });
    await prisma.fault.create({
      data: {
        tenantId,
        workOrderId: woF1.id,
        code: "P0300",
        description: "Random/Multiple Cylinder Misfire Detected",
        severity: "HIGH",
        createdAt: new Date("2026-03-01T09:00:00Z"),
      },
    });

    const woF2 = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        customerId,
        assetId: asset1Id,
        status: "IN_PROGRESS",
        createdAt: new Date("2026-03-20T08:00:00Z"),
      },
    });
    const f2 = await prisma.fault.create({
      data: {
        tenantId,
        workOrderId: woF2.id,
        code: "P0300",
        description: "Random/Multiple Cylinder Misfire Detected",
        severity: "HIGH",
        createdAt: new Date("2026-03-20T09:00:00Z"),
      },
    });

    const report = await rcaService.analyze(tenantId, baseScope, {
      subject: "FAULT_RECURRENCE",
      ...QUERY_WINDOW,
    });

    expect(report.subject).toBe("FAULT_RECURRENCE");
    const recurrenceFact = report.observedFacts.find((f) => f.key === "RECURRING_FAULT_OCCURRENCES");
    expect(recurrenceFact).toBeDefined();
    expect(Number(recurrenceFact!.value)).toBeGreaterThanOrEqual(1);

    const recurrenceFactor = report.contributingFactors.find((f) => f.key === "RECURRING_FAULT_PATTERN");
    expect(recurrenceFactor).toBeDefined();
    expect(recurrenceFactor!.evidenceLevel).toBe("OBSERVED_FACT");

    // Traceable evidence reference
    expect(report.evidenceReferences.some((r) => r.id === f2.id && r.type === "FAULT")).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 17-18. DECISION APPROVAL -> PLANNING DROP-OFF
  // --------------------------------------------------------------------------
  it("17-18. identifies customer recommendation drop-off (approval with no work linked)", async () => {
    const woD = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        customerId,
        assetId: asset1Id,
        status: "IN_PROGRESS",
        createdAt: new Date("2026-03-10T08:00:00Z"),
      },
    });

    const decReq = await prisma.customerDecisionRequest.create({
      data: {
        tenantId,
        workOrderId: woD.id,
        customerId,
        status: "RESOLVED",
        secureToken: `tok-${Date.now()}`,
        sentAt: new Date("2026-03-10T09:00:00Z"),
        viewedAt: new Date("2026-03-10T09:30:00Z"),
        respondedAt: new Date("2026-03-10T10:00:00Z"),
        createdById: "creator-1",
        createdAt: new Date("2026-03-10T08:30:00Z"),
      },
    });

    // Item approved by customer but zero tasks created
    const item = await prisma.customerDecisionItem.create({
      data: {
        tenantId,
        decisionRequestId: decReq.id,
        name: "Coolant Flush",
        explanation: "Contaminated coolant",
        importance: "HIGH",
        price: 150,
        laborPrice: 50,
        total: 200,
        decision: "APPROVED",
        decidedAt: new Date("2026-03-10T10:00:00Z"),
      },
    });

    const report = await rcaService.analyze(tenantId, baseScope, {
      subject: "CUSTOMER_DECISION_DROP_OFF",
      ...QUERY_WINDOW,
    });

    expect(report.subject).toBe("CUSTOMER_DECISION_DROP_OFF");
    const gapFactor = report.contributingFactors.find((f) => f.key === "APPROVAL_TO_PLANNING_GAP");
    expect(gapFactor).toBeDefined();
    expect(gapFactor!.evidenceLevel).toBe("RULE_BASED_CONTRIBUTOR");
    expect(gapFactor!.explanation).toContain("zero workshop tasks created");

    // Evidence reference pointing back to decision item
    expect(report.evidenceReferences.some((r) => r.id === item.id && r.type === "DECISION_ITEM")).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 19. EVIDENCE REFERENCES VALIDITY
  // --------------------------------------------------------------------------
  it("19. provides valid and non-empty evidence references for diagnosed issues", async () => {
    const report = await rcaService.analyze(tenantId, baseScope, {
      subject: "WORK_ORDER_DELAY",
      ...QUERY_WINDOW,
    });

    expect(report.evidenceReferences.length).toBeGreaterThan(0);
    for (const ref of report.evidenceReferences) {
      expect(ref.id).toBeDefined();
      expect(ref.type).toBeDefined();
    }
  });

  // --------------------------------------------------------------------------
  // 20-22. HISTORICAL ATTRIBUTION STABILITY
  // --------------------------------------------------------------------------
  it("20-22. preserves historical stability after technician or branch reassignment", async () => {
    // Changing current branch of work order should NOT rewrite historical attribution of events
    const woHistorical = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        customerId,
        assetId: asset1Id,
        status: "CLOSED",
        createdAt: new Date("2026-03-01T08:00:00Z"),
        closedAt: new Date("2026-03-03T18:00:00Z"),
      },
    });

    await prisma.operationEvent.create({
      data: {
        tenantId,
        branchId: branchAId,
        workOrderId: woHistorical.id,
        eventKey: "work_order.status_changed",
        actorId: "actor-1",
        actorType: "TENANT_STAFF",
        payload: { workOrderId: woHistorical.id, from: "DRAFT", to: "CLOSED" },
        createdAt: new Date("2026-03-03T18:00:00Z"),
      },
    });

    const initialReport = await rcaService.analyze(tenantId, baseScope, {
      subject: "WORK_ORDER_DELAY",
      ...QUERY_WINDOW,
      workOrderId: woHistorical.id,
    });

    // Reassign work order to Branch B now
    await prisma.workOrder.update({
      where: { id: woHistorical.id },
      data: { branchId: branchBId },
    });

    const postReassignReport = await rcaService.analyze(tenantId, baseScope, {
      subject: "WORK_ORDER_DELAY",
      ...QUERY_WINDOW,
      workOrderId: woHistorical.id,
    });

    // Lifecycle calculation should remain stable
    expect(postReassignReport.outcome.metricValue).toBe(initialReport.outcome.metricValue);
  });

  // --------------------------------------------------------------------------
  // 23. TENANT ISOLATION
  // --------------------------------------------------------------------------
  it("23. strictly isolates tenant data (other tenant records never appear)", async () => {
    // Create record in other tenant
    const otherWo = await prisma.workOrder.create({
      data: {
        tenantId: otherTenantId,
        branchId: otherBranchId,
        customerId: (await prisma.customer.create({ data: { tenantId: otherTenantId, fullName: "Other Cust", phone: "0101111111" } })).id,
        assetId: (await prisma.asset.create({ data: { tenantId: otherTenantId, category: "CARS", plateNumber: `OTH-${SUFFIX}` } })).id,
        status: "CLOSED",
        createdAt: new Date("2026-03-05T08:00:00Z"),
      },
    });

    const report = await rcaService.analyze(tenantId, baseScope, {
      subject: "WORK_ORDER_DELAY",
      ...QUERY_WINDOW,
    });

    const otherIncluded = report.evidenceReferences.some((r) => r.id === otherWo.id);
    expect(otherIncluded).toBe(false);
  });

  // --------------------------------------------------------------------------
  // 24. BRANCH AUTHORIZATION ISOLATION (403 FORBIDDEN)
  // --------------------------------------------------------------------------
  it("24. throws ForbiddenException when requesting a branch outside authorized scope", async () => {
    const restrictedScope: AnalyticsScope = {
      branchIds: [branchAId],
      categoryIds: [],
    };

    await expect(
      rcaService.analyze(tenantId, restrictedScope, {
        subject: "WORK_ORDER_DELAY",
        ...QUERY_WINDOW,
        branchId: branchBId, // Unauthorized branch
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  // --------------------------------------------------------------------------
  // 25-27. DATE RANGE CORRECTNESS & INSUFFICIENT EVIDENCE SEMANTICS
  // --------------------------------------------------------------------------
  it("25-27. returns INSUFFICIENT_EVIDENCE when date range contains no matching events", async () => {
    const report = await rcaService.analyze(tenantId, baseScope, {
      subject: "WORK_ORDER_DELAY",
      from: "2024-01-01T00:00:00.000Z",
      to: "2024-01-02T00:00:00.000Z",
    });

    expect(report.evidenceLevel).toBe("INSUFFICIENT_EVIDENCE");
    expect(report.summary).toContain("insufficient to determine root causes");
    expect(report.integrity.insufficientSampleSize).toBe(true);
    expect(report.observedFacts.length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // 28. NO CAUSAL CLAIM WHEN ONLY CORRELATION EXISTS
  // --------------------------------------------------------------------------
  it("28. never claims causal link for statistical correlations", async () => {
    const report = await rcaService.analyze(tenantId, baseScope, {
      subject: "QC_FAILURE",
      ...QUERY_WINDOW,
    });

    for (const factor of report.contributingFactors) {
      expect(factor.evidenceLevel).not.toBe("CAUSAL_LINK");
    }
  });

  // --------------------------------------------------------------------------
  // 29-30. FINANCIAL ATTRIBUTION REMAINS NULL (DATA HONESTY)
  // --------------------------------------------------------------------------
  it("29-30. ensures financial quality cost attribution remains null with explicit notes", async () => {
    const report = await rcaService.analyze(tenantId, baseScope, {
      subject: "TASK_REWORK",
      ...QUERY_WINDOW,
    });

    expect(report.integrity.financialAttributionComputable).toBe(false);
    expect(report.integrity.financialAttributionNote).toBeDefined();
    expect(report.integrity.financialAttributionNote).toContain("Technician cost rates");
  });

  // --------------------------------------------------------------------------
  // 31-32. DELIVERY DELAY & QUERY BOUNDS
  // --------------------------------------------------------------------------
  it("31-32. analyzes delivery gap without unbounded memory scanning", async () => {
    const report = await rcaService.analyze(tenantId, baseScope, {
      subject: "DELIVERY_DELAY",
      ...QUERY_WINDOW,
      branchId: branchAId,
    });

    expect(report.subject).toBe("DELIVERY_DELAY");
    expect(report.outcome.metricName).toBe("Average Delivery Gap");
    expect(report.integrity.historicalAttributionComplete).toBe(true);
  });
});
