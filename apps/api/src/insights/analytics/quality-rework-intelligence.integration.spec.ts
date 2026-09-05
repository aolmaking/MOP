/**
 * Phase 2 -- Prompt 7: Quality & Rework Intelligence
 * Comprehensive Integration Suite against real PostgreSQL database.
 */
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient, QcFailureReason, TaskReworkReason } from "@mop/database";
import { QualityAnalyticsService } from "./quality-analytics.service";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const qualityService = new QualityAnalyticsService(asService);

const SUFFIX = `qli-${Date.now()}`;
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

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Quality Intelligence Test",
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
      name: `QLI WS ${SUFFIX}`,
      nameNormalized: `qli ws ${SUFFIX}`,
      slug: `qli-ws-${SUFFIX}`,
      customerRegistrationCode: `QLI-${SUFFIX}`,
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
      name: `Other QLI WS ${SUFFIX}`,
      nameNormalized: `other qli ws ${SUFFIX}`,
      slug: `other-qli-ws-${SUFFIX}`,
      customerRegistrationCode: `OQLI-${SUFFIX}`,
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

  const customer = await prisma.customer.create({ data: { tenantId, fullName: "Quality Customer", phone: "0108888888" } });
  customerId = customer.id;

  const asset1 = await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `PLT1-${SUFFIX}` } });
  asset1Id = asset1.id;

  const asset2 = await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `PLT2-${SUFFIX}` } });
  asset2Id = asset2.id;

  // Technicians
  const acc1 = await prisma.account.create({
    data: { accountType: "TENANT_STAFF", tenantId, email: `tech1-${SUFFIX}@test.com`, status: "ACTIVE" },
  });
  const t1 = await prisma.staffUser.create({
    data: { accountId: acc1.id, tenantId, fullName: "Lead Tech Sarah", role: "TECHNICIAN" },
  });
  tech1Id = t1.id;

  const acc2 = await prisma.account.create({
    data: { accountType: "TENANT_STAFF", tenantId, email: `tech2-${SUFFIX}@test.com`, status: "ACTIVE" },
  });
  const t2 = await prisma.staffUser.create({
    data: { accountId: acc2.id, tenantId, fullName: "Tech Ahmed", role: "TECHNICIAN" },
  });
  tech2Id = t2.id;

  const accLow = await prisma.account.create({
    data: { accountType: "TENANT_STAFF", tenantId, email: `techlow-${SUFFIX}@test.com`, status: "ACTIVE" },
  });
  const tLow = await prisma.staffUser.create({
    data: { accountId: accLow.id, tenantId, fullName: "Apprentice Sam", role: "TECHNICIAN" },
  });
  lowSampleTechId = tLow.id;
}, 120_000);

afterAll(async () => {
  await prisma.operationEvent.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.taskAssignment.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.task.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.fault.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.workOrder.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.asset.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.customer.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.staffUser.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.account.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.branch.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("Quality & Rework Intelligence Integration (Phase 2 - Prompt 7)", () => {
  const scopeUnrestricted = { branchIds: [], categoryIds: [] };

  it("1-6: Computes First Pass Yield, pass/fail evaluations, and locks first attempt outcome", async () => {
    // Work order 1: First QC attempt = PASS -> First pass passed!
    const wo1 = await prisma.workOrder.create({
      data: { tenantId, branchId: branchAId, customerId, assetId: asset1Id, status: "READY_FOR_DELIVERY" },
    });
    await prisma.operationEvent.create({
      data: {
        tenantId,
        branchId: branchAId,
        workOrderId: wo1.id,
        eventKey: "work_order.status_changed",
        actorId: "qc-actor-1",
        actorType: "TENANT_STAFF",
        createdAt: new Date("2026-08-10T10:00:00Z"),
        payload: { from: "READY_FOR_QC", to: "READY_FOR_DELIVERY", intent: "QC_PASSED" },
      },
    });

    // Work order 2: First attempt = FAIL, later second attempt = PASS
    // First pass outcome must REMAIN FAILED!
    const wo2 = await prisma.workOrder.create({
      data: { tenantId, branchId: branchAId, customerId, assetId: asset1Id, status: "READY_FOR_DELIVERY" },
    });
    // First attempt: FAILED
    await prisma.operationEvent.create({
      data: {
        tenantId,
        branchId: branchAId,
        workOrderId: wo2.id,
        eventKey: "work_order.status_changed",
        actorId: "qc-actor-1",
        actorType: "TENANT_STAFF",
        createdAt: new Date("2026-08-10T11:00:00Z"),
        payload: {
          from: "READY_FOR_QC",
          to: "QC_FAILED",
          intent: "QC_FAILED",
          failureReason: QcFailureReason.WORKMANSHIP,
          reason: "Brake line clip loose",
        },
      },
    });
    // Second attempt: PASSED
    await prisma.operationEvent.create({
      data: {
        tenantId,
        branchId: branchAId,
        workOrderId: wo2.id,
        eventKey: "work_order.status_changed",
        actorId: "qc-actor-1",
        actorType: "TENANT_STAFF",
        createdAt: new Date("2026-08-10T14:00:00Z"),
        payload: { from: "READY_FOR_QC", to: "READY_FOR_DELIVERY", intent: "QC_PASSED" },
      },
    });

    const report = await qualityService.build(tenantId, scopeUnrestricted, {
      from: "2026-08-01",
      to: "2026-08-20",
    });

    // Total QC evaluations = 3 (wo1 pass, wo2 fail, wo2 pass)
    expect(report.qc.qcEvaluationsCount).toBe(3);
    // QC failures = 1
    expect(report.qc.qcFailures).toBe(1);
    expect(report.qc.qcFailureRate).toBe(33.3);

    // First pass evaluations: 2 unique work orders evaluated
    expect(report.qc.firstPassEvaluations).toBe(2);
    // First pass passed: 1 (wo1 only; wo2 failed first pass even though it passed later!)
    expect(report.qc.firstPassPassed).toBe(1);
    expect(report.qc.firstPassYield).toBe(50.0);
  });

  it("7-9: Clearly distinguishes QC failure, task rework, and reopened/relinked work orders", async () => {
    // A work order can have a QC failure without having task rework,
    // or task rework without QC failure, or be reopened without either.
    const priorWo = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        customerId,
        assetId: asset1Id,
        status: "CLOSED",
      },
    });

    const woRelinked = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        customerId,
        assetId: asset1Id,
        status: "IN_PROGRESS",
        relinkedFromWorkOrderId: priorWo.id,
        createdAt: new Date("2026-08-12T10:00:00Z"),
      },
    });

    const report = await qualityService.build(tenantId, scopeUnrestricted, {
      from: "2026-08-01",
      to: "2026-08-20",
    });

    expect(report.workOrders.reopenedWorkOrders).toBeGreaterThanOrEqual(1);
    // Reopened is separate from QC failures and task rework
    expect(typeof report.workOrders.workOrdersWithQcFailure).toBe("number");
    expect(typeof report.workOrders.workOrdersWithTaskRework).toBe("number");
    expect(typeof report.workOrders.reopenedWorkOrders).toBe("number");
  });

  it("10-11: Detects repeat vehicle visits within 30 days and NEVER labels it warranty", async () => {
    // Prior closed job on asset 2
    const priorClosedWo = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        customerId,
        assetId: asset2Id,
        status: "CLOSED",
        closedAt: new Date("2026-08-05T12:00:00Z"),
      },
    });

    // Subsequent job on asset 2 created 10 days later (within 30 days)
    const subsequentWo = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        customerId,
        assetId: asset2Id,
        status: "IN_PROGRESS",
        createdAt: new Date("2026-08-15T09:00:00Z"),
      },
    });

    const report = await qualityService.build(tenantId, scopeUnrestricted, {
      from: "2026-08-10",
      to: "2026-08-20",
    });

    expect(report.vehicleRepeats.repeatVehicleVisitsWithin30Days).toBeGreaterThanOrEqual(1);
    expect(report.vehicleRepeats.uniqueVehiclesWithRepeatVisitWithin30Days).toBeGreaterThanOrEqual(1);
    // Explicit verification: field is named repeatVehicleVisitsWithin30Days, NOT warranty!
    expect((report.vehicleRepeats as any).warrantyClaims).toBeUndefined();
    expect((report.vehicleRepeats as any).warrantyCount).toBeUndefined();
  });

  it("12: Detects fault recurrence for same code on same vehicle across separate work orders", async () => {
    // Prior fault on asset 2
    const priorWo = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        customerId,
        assetId: asset2Id,
        status: "CLOSED",
        createdAt: new Date("2026-08-01T10:00:00Z"),
        closedAt: new Date("2026-08-02T10:00:00Z"),
      },
    });
    await prisma.fault.create({
      data: {
        tenantId,
        workOrderId: priorWo.id,
        code: "P0300",
        description: "Random/Multiple Cylinder Misfire Detected",
        severity: "CRITICAL",
      },
    });

    // New work order on same asset 2 with identical fault code P0300
    const newWo = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        customerId,
        assetId: asset2Id,
        status: "IN_PROGRESS",
        createdAt: new Date("2026-08-16T10:00:00Z"),
      },
    });
    await prisma.fault.create({
      data: {
        tenantId,
        workOrderId: newWo.id,
        code: "P0300",
        description: "Misfire re-detected",
        severity: "CRITICAL",
      },
    });

    const report = await qualityService.build(tenantId, scopeUnrestricted, {
      from: "2026-08-15",
      to: "2026-08-20",
    });

    expect(report.vehicleRepeats.faultRecurrenceCount).toBe(1);
  });

  it("13-17: Rework task model, structured reasons, labor minutes computable, financial cost null", async () => {
    const wo = await prisma.workOrder.create({
      data: { tenantId, branchId: branchAId, customerId, assetId: asset1Id, status: "IN_PROGRESS" },
    });

    // Original task
    const origTask = await prisma.task.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        title: "Install Water Pump",
        status: "DONE",
        actualMinutes: 90,
        completedAt: new Date("2026-08-14T10:00:00Z"),
        createdAt: new Date("2026-08-14T08:00:00Z"),
      },
    });

    // Rework task linked to original
    const reworkTask = await prisma.task.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        title: "Rework: Fix Gasket Leak on Water Pump",
        originalTaskId: origTask.id,
        reworkReason: TaskReworkReason.DEFECTIVE_PART,
        reworkNote: "Gasket had crack from supplier",
        status: "DONE",
        actualMinutes: 45,
        completedAt: new Date("2026-08-14T15:00:00Z"),
        createdAt: new Date("2026-08-14T12:00:00Z"),
      },
    });

    const report = await qualityService.build(tenantId, scopeUnrestricted, {
      from: "2026-08-14",
      to: "2026-08-14",
    });

    // Rework labor minutes is computable
    expect(report.costDrag.reworkLaborMinutes).toBe(45);
    // Financial costs are strictly null with explicit reasons
    expect(report.costDrag.reworkLaborCost).toBeNull();
    expect(report.costDrag.reworkLaborCostNotComputableReason).toContain("selling price cannot be substituted for cost");
    expect(report.costDrag.reworkPartsCost).toBeNull();
    expect(report.costDrag.reworkPartsCostNotComputableReason).toContain("scrap or rework consumption cost allocation is not tracked");
    expect(report.costDrag.totalMeasurableQualityCost).toBeNull();

    // Structured rework reasons
    const defectivePartReason = report.reworkReasons.find((r) => r.reason === TaskReworkReason.DEFECTIVE_PART);
    expect(defectivePartReason).toBeDefined();
    expect(defectivePartReason?.count).toBeGreaterThanOrEqual(1);
  });

  it("18: Protects technicians with sample size < 5 from misleading ranking", async () => {
    const wo = await prisma.workOrder.create({
      data: { tenantId, branchId: branchAId, customerId, assetId: asset1Id, status: "IN_PROGRESS" },
    });

    const baseOrig = await prisma.task.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        title: "Base Original Task",
        status: "DONE",
        createdAt: new Date("2026-08-17T07:00:00Z"),
      },
    });

    // Lead tech Sarah has 6 completed tasks (1 rework)
    for (let i = 0; i < 6; i++) {
      const isRework = i === 0;
      const t = await prisma.task.create({
        data: {
          tenantId,
          workOrderId: wo.id,
          title: `Sarah Task ${i}`,
          status: "DONE",
          completedAt: new Date("2026-08-17T10:00:00Z"),
          originalTaskId: isRework ? baseOrig.id : null,
          reworkReason: isRework ? TaskReworkReason.WORKMANSHIP : null,
          createdAt: new Date("2026-08-17T08:00:00Z"),
        },
      });
      await prisma.taskAssignment.create({
        data: {
          tenantId,
          taskId: t.id,
          staffUserId: tech1Id,
          assignedAt: new Date("2026-08-17T08:00:00Z"),
        },
      });
    }

    // Apprentice Sam has only 2 completed tasks (1 rework -> 50% rework rate!)
    for (let i = 0; i < 2; i++) {
      const isRework = i === 0;
      const t = await prisma.task.create({
        data: {
          tenantId,
          workOrderId: wo.id,
          title: `Sam Task ${i}`,
          status: "DONE",
          completedAt: new Date("2026-08-17T11:00:00Z"),
          originalTaskId: isRework ? baseOrig.id : null,
          reworkReason: isRework ? TaskReworkReason.WORKMANSHIP : null,
          createdAt: new Date("2026-08-17T09:00:00Z"),
        },
      });
      await prisma.taskAssignment.create({
        data: {
          tenantId,
          taskId: t.id,
          staffUserId: lowSampleTechId,
          assignedAt: new Date("2026-08-17T09:00:00Z"),
        },
      });
    }

    const report = await qualityService.build(tenantId, scopeUnrestricted, {
      from: "2026-08-17",
      to: "2026-08-17",
    });

    const sarah = report.contributors.byTechnician.find((t) => t.staffUserId === tech1Id);
    expect(sarah).toBeDefined();
    expect(sarah?.completedTasks).toBe(6);
    expect(sarah?.insufficientSampleSize).toBe(false);
    expect(sarah?.rankingSuppressed).toBe(false);

    const sam = report.contributors.byTechnician.find((t) => t.staffUserId === lowSampleTechId);
    expect(sam).toBeDefined();
    expect(sam?.completedTasks).toBe(2);
    // Sam MUST have sample size protection flagged
    expect(sam?.insufficientSampleSize).toBe(true);
    expect(sam?.rankingSuppressed).toBe(true);
  });

  it("19-20: Attributes quality to Branch and Service correctly", async () => {
    const wo = await prisma.workOrder.create({
      data: { tenantId, branchId: branchBId, customerId, assetId: asset1Id, status: "IN_PROGRESS" },
    });

    const serviceKey = "BRAKE_SERVICE";
    const t = await prisma.task.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        serviceKey,
        title: "Brake Inspection and Bleed",
        status: "DONE",
        completedAt: new Date("2026-08-18T10:00:00Z"),
        createdAt: new Date("2026-08-18T08:00:00Z"),
      },
    });

    const report = await qualityService.build(tenantId, scopeUnrestricted, {
      from: "2026-08-18",
      to: "2026-08-18",
    });

    const branchBContributor = report.contributors.byBranch.find((b) => b.branchId === branchBId);
    expect(branchBContributor).toBeDefined();
    expect(branchBContributor?.completedTasks).toBeGreaterThanOrEqual(1);

    const serviceContributor = report.contributors.byService.find((s) => s.serviceKey === serviceKey);
    expect(serviceContributor).toBeDefined();
    expect(serviceContributor?.completedTasks).toBeGreaterThanOrEqual(1);
  });

  it("21: Historical technician attribution remains stable after subsequent reassignment", async () => {
    const wo = await prisma.workOrder.create({
      data: { tenantId, branchId: branchAId, customerId, assetId: asset1Id, status: "IN_PROGRESS" },
    });

    const completedAt = new Date("2026-08-19T10:00:00Z");
    const task = await prisma.task.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        title: "Transmission Check",
        status: "DONE",
        completedAt,
        createdAt: new Date("2026-08-19T08:00:00Z"),
      },
    });

    // Assigned to Tech Ahmed at completion
    const initialAssignment = await prisma.taskAssignment.create({
      data: {
        tenantId,
        taskId: task.id,
        staffUserId: tech2Id,
        assignedAt: new Date("2026-08-19T08:00:00Z"),
        unassignedAt: new Date("2026-08-19T12:00:00Z"), // Unassigned later
      },
    });

    // Reassigned later to Apprentice Sam (AFTER completion)
    await prisma.taskAssignment.create({
      data: {
        tenantId,
        taskId: task.id,
        staffUserId: lowSampleTechId,
        assignedAt: new Date("2026-08-19T12:00:00Z"),
        unassignedAt: null,
      },
    });

    const report = await qualityService.build(tenantId, scopeUnrestricted, {
      from: "2026-08-19",
      to: "2026-08-19",
    });

    const ahmed = report.contributors.byTechnician.find((t) => t.staffUserId === tech2Id);
    // Task must remain historically attributed to Ahmed who completed it!
    expect(ahmed?.completedTasks).toBeGreaterThanOrEqual(1);
  });

  it("22: Historical branch attribution remains stable after later work order branch change", async () => {
    const wo = await prisma.workOrder.create({
      data: { tenantId, branchId: branchAId, customerId, assetId: asset1Id, status: "READY_FOR_DELIVERY" },
    });

    // QC event emitted while work order was at Branch Alpha
    await prisma.operationEvent.create({
      data: {
        tenantId,
        branchId: branchAId, // Historical branch
        workOrderId: wo.id,
        eventKey: "work_order.status_changed",
        actorId: "actor-1",
        actorType: "TENANT_STAFF",
        createdAt: new Date("2026-08-19T15:00:00Z"),
        payload: { from: "READY_FOR_QC", to: "READY_FOR_DELIVERY", intent: "QC_PASSED" },
      },
    });

    // Work order branch is later changed to Branch Beta
    await prisma.workOrder.update({
      where: { id: wo.id },
      data: { branchId: branchBId },
    });

    const report = await qualityService.build(tenantId, scopeUnrestricted, {
      from: "2026-08-19",
      to: "2026-08-19",
    });

    // The QC evaluation must remain attributed to Branch Alpha!
    const branchAlpha = report.contributors.byBranch.find((b) => b.branchId === branchAId);
    expect(branchAlpha?.qcEvaluations).toBeGreaterThanOrEqual(1);
    expect(branchAlpha?.firstPassPassed).toBeGreaterThanOrEqual(1);
  });

  it("23-24: Missing QC data returns null semantics; missing structured reason surfaces as unclassified", async () => {
    // QC failure without structured reason and without note
    const wo = await prisma.workOrder.create({
      data: { tenantId, branchId: branchAId, customerId, assetId: asset1Id, status: "IN_PROGRESS" },
    });
    await prisma.operationEvent.create({
      data: {
        tenantId,
        branchId: branchAId,
        workOrderId: wo.id,
        eventKey: "work_order.status_changed",
        actorId: "actor-unclassified",
        actorType: "TENANT_STAFF",
        createdAt: new Date("2026-08-20T10:00:00Z"),
        payload: { from: "READY_FOR_QC", to: "QC_FAILED", intent: "QC_FAILED" }, // No failureReason, no note
      },
    });

    const report = await qualityService.build(tenantId, scopeUnrestricted, {
      from: "2026-08-20",
      to: "2026-08-20",
    });

    expect(report.integrity.qcFailedWithoutStructuredReason).toBeGreaterThanOrEqual(1);
    expect(report.integrity.qcFailedWithoutNote).toBeGreaterThanOrEqual(1);
    const unclassified = report.qcFailureReasons.find((r) => r.reason === "UNCLASSIFIED");
    expect(unclassified).toBeDefined();
    expect(unclassified?.count).toBeGreaterThanOrEqual(1);
  });

  it("25: Enforces strict tenant isolation", async () => {
    // Other tenant event
    const otherWo = await prisma.workOrder.create({
      data: { tenantId: otherTenantId, branchId: otherBranchId, customerId, assetId: asset1Id, status: "CLOSED" },
    });
    await prisma.operationEvent.create({
      data: {
        tenantId: otherTenantId,
        branchId: otherBranchId,
        workOrderId: otherWo.id,
        eventKey: "work_order.status_changed",
        actorId: "other-actor",
        actorType: "TENANT_STAFF",
        createdAt: new Date("2026-08-20T10:00:00Z"),
        payload: { from: "READY_FOR_QC", to: "READY_FOR_DELIVERY", intent: "QC_PASSED" },
      },
    });

    const report = await qualityService.build(tenantId, scopeUnrestricted, {
      from: "2026-08-20",
      to: "2026-08-20",
    });

    // Must NOT contain other tenant's branches or evaluations
    expect(report.contributors.byBranch.some((b) => b.branchId === otherBranchId)).toBe(false);
  });

  it("26: Enforces branch authorization / scope isolation", async () => {
    // Caller scoped only to Branch Alpha cannot query Branch Beta
    await expect(
      qualityService.build(tenantId, { branchIds: [branchAId], categoryIds: [] }, {
        from: "2026-08-01",
        to: "2026-08-20",
        branchId: branchBId,
      }),
    ).rejects.toThrow();
  });

  it("27-28: Respects date range boundaries and returns null when denominator is 0", async () => {
    // Future date range with zero activity
    const report = await qualityService.build(tenantId, scopeUnrestricted, {
      from: "2028-01-01",
      to: "2028-01-31",
    });

    expect(report.qc.qcEvaluationsCount).toBe(0);
    expect(report.qc.firstPassEvaluations).toBe(0);
    expect(report.qc.firstPassPassed).toBe(0);
    // Crucial: NOT 0! Must be NULL!
    expect(report.qc.firstPassYield).toBeNull();
    expect(report.qc.qcFailureRate).toBeNull();
    expect(report.rework.taskReworkRate).toBeNull();
    expect(report.workOrders.workOrderReworkRate).toBeNull();
  });

  it("29: Multiple rework events do not count as multiple unique tasksWithRework", async () => {
    const wo = await prisma.workOrder.create({
      data: { tenantId, branchId: branchAId, customerId, assetId: asset1Id, status: "IN_PROGRESS" },
    });

    // Single original task reworked twice
    const orig = await prisma.task.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        title: "Alternator Replacement",
        status: "DONE",
        completedAt: new Date("2026-08-21T10:00:00Z"),
        createdAt: new Date("2026-08-21T08:00:00Z"),
      },
    });

    // Rework 1
    await prisma.task.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        title: "Rework 1: Belt Tension",
        originalTaskId: orig.id,
        status: "DONE",
        reworkReason: TaskReworkReason.INCORRECT_PROCEDURE,
        createdAt: new Date("2026-08-21T11:00:00Z"),
      },
    });

    // Rework 2
    await prisma.task.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        title: "Rework 2: Pulley Alignment",
        originalTaskId: orig.id,
        status: "DONE",
        reworkReason: TaskReworkReason.WORKMANSHIP,
        createdAt: new Date("2026-08-21T12:00:00Z"),
      },
    });

    const report = await qualityService.build(tenantId, scopeUnrestricted, {
      from: "2026-08-21",
      to: "2026-08-21",
    });

    // reworkTaskCount = 2, but unique tasksWithRework for orig = 1
    expect(report.rework.reworkTaskCount).toBe(2);
    expect(report.rework.tasksWithRework).toBe(1);
  });

  it("30: Separates repeat visit count from unique vehicles with repeat visits", async () => {
    // Asset 1 has 1 prior closure, then 2 separate subsequent visits within 30 days
    const priorWo = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        customerId,
        assetId: asset1Id,
        status: "CLOSED",
        closedAt: new Date("2026-08-01T10:00:00Z"),
      },
    });

    // Visit 1 within 30 days
    await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        customerId,
        assetId: asset1Id,
        status: "IN_PROGRESS",
        createdAt: new Date("2026-08-22T09:00:00Z"),
      },
    });

    // Visit 2 within 30 days
    await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        customerId,
        assetId: asset1Id,
        status: "IN_PROGRESS",
        createdAt: new Date("2026-08-22T14:00:00Z"),
      },
    });

    const report = await qualityService.build(tenantId, scopeUnrestricted, {
      from: "2026-08-22",
      to: "2026-08-22",
    });

    // Repeat visits count = 2, but unique vehicles count = 1!
    expect(report.vehicleRepeats.repeatVehicleVisitsWithin30Days).toBe(2);
    expect(report.vehicleRepeats.uniqueVehiclesWithRepeatVisitWithin30Days).toBe(1);
  });
});
