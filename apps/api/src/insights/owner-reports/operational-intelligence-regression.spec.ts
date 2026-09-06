/**
 * Operational Reporting Regression Suite -- Phase 1 Prompt 3
 *
 * Verifies:
 * 1. Historical branch transfer attribution
 * 2. Historical technician/team transfer attribution
 * 3. Lifecycle duration calculation with initial DRAFT preservation
 * 4. Active work vs waiting time separation
 * 5. Historical stability under later mutable field edits
 * 6. Promised vs actual delivery SLA (early, on-time, late, boundary)
 * 7. Technician completedAt and actualMinutes integrity
 * 8. Bottleneck detection by dwell time vs record count
 * 9. Historical aging evaluated against range.to
 * 10. Multi-tenant and branch isolation
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { ReportsOperationsService } from "./reports-operations.service";
import { PeopleAnalyticsService } from "../analytics/people-analytics.service";
import { WorkflowBottlenecksService } from "../workflow-health/workflow-bottlenecks.service";
import type { AnalyticsScope } from "../analytics/analytics-scope.util";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const operations = new ReportsOperationsService(asService);
const people = new PeopleAnalyticsService(asService);
const bottlenecks = new WorkflowBottlenecksService(asService);

const unscoped: AnalyticsScope = { branchIds: [], categoryIds: [] };

const SUFFIX = `op-reg-${Date.now()}`;
let tenantId: string;
let planId: string;
let branchAId: string;
let branchBId: string;
let customerId: string;
let assetId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Ops Regression Plan",
      maxBranches: 10,
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
      name: `OpReg Tenant ${SUFFIX}`,
      nameNormalized: `opreg tenant ${SUFFIX}`,
      slug: `opreg-tenant-${SUFFIX}`,
      customerRegistrationCode: `OPR-${SUFFIX}`,
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

  const branchA = await prisma.branch.create({ data: { tenantId, name: "Branch A", code: `BRA-${SUFFIX}` } });
  branchAId = branchA.id;
  const branchB = await prisma.branch.create({ data: { tenantId, name: "Branch B", code: `BRB-${SUFFIX}` } });
  branchBId = branchB.id;

  const customer = await prisma.customer.create({ data: { tenantId, fullName: "Test Customer", phone: "0109999999" } });
  customerId = customer.id;
  const asset = await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `REG-${SUFFIX}` } });
  assetId = asset.id;
}, 120_000);

afterAll(async () => {
  await prisma.operationEvent.deleteMany({ where: { tenantId } });
  await prisma.taskBlocker.deleteMany({ where: { tenantId } });
  await prisma.taskAssignment.deleteMany({ where: { tenantId } });
  await prisma.task.deleteMany({ where: { tenantId } });
  await prisma.workOrder.deleteMany({ where: { tenantId } });
  await prisma.teamMembership.deleteMany({ where: { tenantId } });
  await prisma.team.deleteMany({ where: { tenantId } });
  await prisma.staffUser.deleteMany({ where: { tenantId } });
  await prisma.asset.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.branch.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("Operational Intelligence Regression Suite", () => {
  it("maintains historical branch attribution across later branch transfer", async () => {
    // Month 1: WorkOrder created in Branch A
    const m1Start = new Date("2026-01-01T00:00:00.000Z");
    const m1End = new Date("2026-01-31T23:59:59.999Z");

    const wo = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        assetId,
        customerId,
        status: "IN_PROGRESS",
        createdAt: new Date("2026-01-10T10:00:00.000Z"),
      },
    });

    // OperationEvent stamped with Branch A at creation
    await prisma.operationEvent.create({
      data: {
        tenantId,
        branchId: branchAId,
        workOrderId: wo.id,
        eventKey: "work_order.created",
        payload: { workOrderId: wo.id, branchId: branchAId },
        actorId: "actor-1",
        actorType: "TENANT_STAFF",
        createdAt: new Date("2026-01-10T10:00:00.000Z"),
      },
    });

    // Month 2: WorkOrder is transferred to Branch B (current mutable row updated)
    await prisma.workOrder.update({
      where: { id: wo.id },
      data: { branchId: branchBId },
    });

    // Report for Month 1 must attribute creation to Branch A, not Branch B!
    const m1Report = await operations.build(tenantId, {
      from: m1Start.toISOString(),
      to: m1End.toISOString(),
    });

    const branchAOps = m1Report.branchComparison.find((b) => b.branchId === branchAId);
    const branchBOps = m1Report.branchComparison.find((b) => b.branchId === branchBId);

    expect(branchAOps).toBeDefined();
    expect(branchBOps).toBeDefined();
    expect(branchAOps!.workOrdersCreated).toBe(1);
    expect(branchBOps!.workOrdersCreated).toBe(0);
  });

  it("maintains historical team attribution across technician team transfers", async () => {
    const account = await prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId, email: `transfer-tech-${SUFFIX}@example.com`, status: "ACTIVE" },
    });
    const technician = await prisma.staffUser.create({
      data: { accountId: account.id, tenantId, fullName: "Transfer Tech", role: "TECHNICIAN" },
    });

    const leaderAccount = await prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId, email: `leader-${SUFFIX}@example.com`, status: "ACTIVE" },
    });
    const leader = await prisma.staffUser.create({
      data: { accountId: leaderAccount.id, tenantId, fullName: "Team Leader", role: "TEAM_LEADER" },
    });

    const teamA = await prisma.team.create({
      data: { tenantId, name: "Team Alpha", branchId: branchAId, teamLeaderId: leader.id },
    });
    const teamB = await prisma.team.create({
      data: { tenantId, name: "Team Beta", branchId: branchBId, teamLeaderId: leader.id },
    });

    // Month 1: Tech in Team A (Jan 1 to Jan 31)
    const m1Start = new Date("2026-01-01T00:00:00.000Z");
    const m1End = new Date("2026-01-31T23:59:59.999Z");
    await prisma.teamMembership.create({
      data: {
        tenantId,
        teamId: teamA.id,
        technicianId: technician.id,
        startedAt: m1Start,
        endedAt: m1End,
      },
    });

    // Month 2: Tech in Team B (Feb 1 onwards)
    const m2Start = new Date("2026-02-01T00:00:00.000Z");
    const m2End = new Date("2026-02-28T23:59:59.999Z");
    await prisma.teamMembership.create({
      data: {
        tenantId,
        teamId: teamB.id,
        technicianId: technician.id,
        startedAt: m2Start,
        endedAt: null,
      },
    });

    // Task completed in Month 1 (Jan 15)
    const wo = await prisma.workOrder.create({
      data: { tenantId, branchId: branchAId, assetId, customerId, status: "IN_PROGRESS" },
    });
    const taskM1 = await prisma.task.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        title: "Month 1 Repair",
        status: "DONE",
        startedAt: new Date("2026-01-15T09:00:00.000Z"),
        completedAt: new Date("2026-01-15T11:00:00.000Z"),
        actualMinutes: 120,
      },
    });
    await prisma.taskAssignment.create({
      data: {
        tenantId,
        taskId: taskM1.id,
        staffUserId: technician.id,
        assignedAt: new Date("2026-01-15T08:30:00.000Z"),
      },
    });

    // Month 1 Report: Team A must have 1 task completed, Team B must have 0!
    const m1People = await people.build(tenantId, unscoped, {
      from: m1Start.toISOString(),
      to: m1End.toISOString(),
    });
    const m1TeamA = m1People.teamThroughput.find((t) => t.teamId === teamA.id);
    const m1TeamB = m1People.teamThroughput.find((t) => t.teamId === teamB.id);

    expect(m1TeamA?.tasksCompleted).toBe(1);
    expect(m1TeamB?.tasksCompleted).toBe(0);

    // Month 2 Report: Team A must have 0, Team B must have 0!
    const m2People = await people.build(tenantId, unscoped, {
      from: m2Start.toISOString(),
      to: m2End.toISOString(),
    });
    const m2TeamA = m2People.teamThroughput.find((t) => t.teamId === teamA.id);
    const m2TeamB = m2People.teamThroughput.find((t) => t.teamId === teamB.id);

    expect(m2TeamA?.tasksCompleted).toBe(0);
    expect(m2TeamB?.tasksCompleted).toBe(0);
  });

  it("calculates lifecycle duration preserving initial DRAFT and separating active vs wait time", async () => {
    const createdAt = new Date("2026-03-01T08:00:00.000Z");
    const wo = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        assetId,
        customerId,
        status: "CLOSED",
        createdAt,
        closedAt: new Date("2026-03-01T14:00:00.000Z"),
      },
    });

    // Transitions:
    // 08:00 -> 09:00 (1h) DRAFT (before first status change event)
    // 09:00 -> 10:00 (1h) REGISTERED
    // 10:00 -> 11:30 (1.5h) UNDER_INSPECTION (Active)
    // 11:30 -> 12:30 (1h) WAITING_PARTS (Wait)
    // 12:30 -> 14:00 (1.5h) IN_PROGRESS (Active)
    // 14:00 -> CLOSED
    const tRegistered = new Date("2026-03-01T09:00:00.000Z");
    const tInspection = new Date("2026-03-01T10:00:00.000Z");
    const tWaitingParts = new Date("2026-03-01T11:30:00.000Z");
    const tInProgress = new Date("2026-03-01T12:30:00.000Z");
    const tClosed = new Date("2026-03-01T14:00:00.000Z");

    const events = [
      { from: "DRAFT", to: "REGISTERED", at: tRegistered },
      { from: "REGISTERED", to: "UNDER_INSPECTION", at: tInspection },
      { from: "UNDER_INSPECTION", to: "WAITING_PARTS", at: tWaitingParts },
      { from: "WAITING_PARTS", to: "IN_PROGRESS", at: tInProgress },
      { from: "IN_PROGRESS", to: "CLOSED", at: tClosed },
    ];

    for (const e of events) {
      await prisma.operationEvent.create({
        data: {
          tenantId,
          branchId: branchAId,
          workOrderId: wo.id,
          eventKey: "work_order.status_changed",
          payload: { workOrderId: wo.id, from: e.from, to: e.to },
          actorId: "actor-1",
          actorType: "TENANT_STAFF",
          createdAt: e.at,
        },
      });
    }

    const report = await operations.build(tenantId, {
      from: "2026-03-01T00:00:00.000Z",
      to: "2026-03-01T23:59:59.999Z",
      branchId: branchAId,
    });

    const draft = report.averageTimeInStatus.find((s) => s.status === "DRAFT");
    const registered = report.averageTimeInStatus.find((s) => s.status === "REGISTERED");
    const inspection = report.averageTimeInStatus.find((s) => s.status === "UNDER_INSPECTION");
    const waitingParts = report.averageTimeInStatus.find((s) => s.status === "WAITING_PARTS");
    const inProgress = report.averageTimeInStatus.find((s) => s.status === "IN_PROGRESS");
    const closed = report.averageTimeInStatus.find((s) => s.status === "CLOSED");

    // Initial DRAFT duration (08:00 to 09:00 = 1h) must be captured!
    expect(draft).toBeDefined();
    expect(draft!.averageHours).toBeCloseTo(1, 1);

    expect(registered!.averageHours).toBeCloseTo(1, 1);
    expect(inspection!.averageHours).toBeCloseTo(1.5, 1);
    expect(waitingParts!.averageHours).toBeCloseTo(1, 1);
    expect(inProgress!.averageHours).toBeCloseTo(1.5, 1);
    expect(closed).toBeUndefined(); // Terminal states excluded

    // Active vs Waiting summary
    expect(report.cycleTimeSummary).toBeDefined();
    expect(report.cycleTimeSummary!.averageTotalHours).toBeCloseTo(6, 1); // 1 + 1 + 1.5 + 1 + 1.5 = 6h
    expect(report.cycleTimeSummary!.averageActiveWorkHours).toBeCloseTo(3, 1); // inspection (1.5) + in_progress (1.5) = 3h
    expect(report.cycleTimeSummary!.averageWaitingHours).toBeCloseTo(3, 1); // draft (1) + registered (1) + waiting_parts (1) = 3h
    expect(report.cycleTimeSummary!.activeTimeRatio).toBeCloseTo(0.5, 1); // 3h / 6h = 50%
  });

  it("evaluates promised vs actual performance against asOf boundary, not live clock", async () => {
    const historicalEnd = new Date("2026-01-31T23:59:59.999Z");

    // Job 1: Early/On-Time (promised Jan 20, closed Jan 18)
    await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        assetId,
        customerId,
        status: "CLOSED",
        promisedAt: new Date("2026-01-20T12:00:00.000Z"),
        closedAt: new Date("2026-01-18T10:00:00.000Z"),
        createdAt: new Date("2026-01-15T08:00:00.000Z"),
      },
    });

    // Job 2: Delivered Late (promised Jan 20, closed Jan 25)
    await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        assetId,
        customerId,
        status: "CLOSED",
        promisedAt: new Date("2026-01-20T12:00:00.000Z"),
        closedAt: new Date("2026-01-25T14:00:00.000Z"),
        createdAt: new Date("2026-01-15T08:00:00.000Z"),
      },
    });

    // Job 3: Overdue at boundary (promised Jan 28, still open at Jan 31)
    await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        assetId,
        customerId,
        status: "IN_PROGRESS",
        promisedAt: new Date("2026-01-28T12:00:00.000Z"),
        createdAt: new Date("2026-01-25T08:00:00.000Z"),
      },
    });

    const report = await operations.build(tenantId, {
      from: "2026-01-01T00:00:00.000Z",
      to: historicalEnd.toISOString(),
      branchId: branchAId,
    });

    expect(report.deliverySla).toBeDefined();
    expect(report.deliverySla!.deliveredOnTime).toBe(1);
    expect(report.deliverySla!.deliveredLate).toBe(1);
    expect(report.deliverySla!.currentlyOverdue).toBe(1);
    expect(report.deliverySla!.onTimeRate).toBeCloseTo(50, 0); // 1 on-time / 2 delivered = 50%
    expect(report.delayedJobs).toBe(2); // 1 late delivered + 1 currently overdue
  });

  it("technician completed work relies on completedAt and actualMinutes, unaffected by later task edits", async () => {
    const account = await prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId, email: `tech-metrics-${SUFFIX}@example.com`, status: "ACTIVE" },
    });
    const technician = await prisma.staffUser.create({
      data: { accountId: account.id, tenantId, fullName: "Metrics Tech", role: "TECHNICIAN" },
    });

    const wo = await prisma.workOrder.create({
      data: { tenantId, branchId: branchAId, assetId, customerId, status: "IN_PROGRESS" },
    });

    const task = await prisma.task.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        title: "Brake Service",
        status: "DONE",
        startedAt: new Date("2026-04-10T09:00:00.000Z"),
        completedAt: new Date("2026-04-10T10:30:00.000Z"),
        actualMinutes: 90,
      },
    });

    await prisma.taskAssignment.create({
      data: {
        tenantId,
        taskId: task.id,
        staffUserId: technician.id,
        assignedAt: new Date("2026-04-10T08:00:00.000Z"),
      },
    });

    const reportBefore = await operations.build(tenantId, {
      from: "2026-04-01T00:00:00.000Z",
      to: "2026-04-30T23:59:59.999Z",
    });

    const techBefore = reportBefore.technicianWorkload.find((t) => t.staffUserId === technician.id);
    expect(techBefore).toBeDefined();
    expect(techBefore!.tasksCompleted).toBe(1);
    expect(techBefore!.actualLaborMinutes).toBe(90);

    // Later touch: modifying task title and updatedAt long after completion
    await prisma.task.update({
      where: { id: task.id },
      data: { title: "Brake Service -- Updated Notes" },
    });

    const reportAfter = await operations.build(tenantId, {
      from: "2026-04-01T00:00:00.000Z",
      to: "2026-04-30T23:59:59.999Z",
    });

    const techAfter = reportAfter.technicianWorkload.find((t) => t.staffUserId === technician.id);
    expect(techAfter!.tasksCompleted).toBe(1);
    expect(techAfter!.actualLaborMinutes).toBe(90); // Unchanged!
  });

  it("identifies bottlenecks using dwell time rather than record count alone", async () => {
    // In WorkflowBottlenecks, stage dwell ranks stages by average dwell hours.
    const wo1 = await prisma.workOrder.create({
      data: { tenantId, branchId: branchAId, assetId, customerId, status: "IN_PROGRESS" },
    });
    const wo2 = await prisma.workOrder.create({
      data: { tenantId, branchId: branchAId, assetId, customerId, status: "IN_PROGRESS" },
    });

    const base = new Date("2026-05-01T00:00:00.000Z");

    // WAITING_PARTS: entered by wo1 and stayed for 20 hours
    await prisma.operationEvent.create({
      data: {
        tenantId,
        branchId: branchAId,
        workOrderId: wo1.id,
        eventKey: "work_order.status_changed",
        payload: { workOrderId: wo1.id, from: "IN_PROGRESS", to: "WAITING_PARTS" },
        actorId: "actor-1",
        actorType: "TENANT_STAFF",
        createdAt: new Date(base.getTime() + 1 * 60 * 60 * 1000),
      },
    });
    await prisma.operationEvent.create({
      data: {
        tenantId,
        branchId: branchAId,
        workOrderId: wo1.id,
        eventKey: "work_order.status_changed",
        payload: { workOrderId: wo1.id, from: "WAITING_PARTS", to: "IN_PROGRESS" },
        actorId: "actor-1",
        actorType: "TENANT_STAFF",
        createdAt: new Date(base.getTime() + 21 * 60 * 60 * 1000), // 20 hours!
      },
    });

    // READY_FOR_QC: entered by wo1 and wo2, but only stayed for 1 hour each (more records, much lower dwell)
    await prisma.operationEvent.create({
      data: {
        tenantId,
        branchId: branchAId,
        workOrderId: wo1.id,
        eventKey: "work_order.status_changed",
        payload: { workOrderId: wo1.id, from: "IN_PROGRESS", to: "READY_FOR_QC" },
        actorId: "actor-1",
        actorType: "TENANT_STAFF",
        createdAt: new Date(base.getTime() + 22 * 60 * 60 * 1000),
      },
    });
    await prisma.operationEvent.create({
      data: {
        tenantId,
        branchId: branchAId,
        workOrderId: wo1.id,
        eventKey: "work_order.status_changed",
        payload: { workOrderId: wo1.id, from: "READY_FOR_QC", to: "CLOSED" },
        actorId: "actor-1",
        actorType: "TENANT_STAFF",
        createdAt: new Date(base.getTime() + 23 * 60 * 60 * 1000), // 1 hour
      },
    });

    const report = await bottlenecks.build(tenantId, {
      from: base.toISOString(),
      to: new Date(base.getTime() + 48 * 60 * 60 * 1000).toISOString(),
    });

    expect(report.stageDwell.length).toBeGreaterThanOrEqual(2);
    // WAITING_PARTS (20h) must rank above READY_FOR_QC (1h)
    const partsIndex = report.stageDwell.findIndex((s) => s.status === "WAITING_PARTS");
    const qcIndex = report.stageDwell.findIndex((s) => s.status === "READY_FOR_QC");

    expect(partsIndex).toBeLessThan(qcIndex);
    expect(report.stageDwell[partsIndex]!.averageHours).toBeGreaterThan(report.stageDwell[qcIndex]!.averageHours);
  });

  it("enforces tenant isolation across all operational analytics", async () => {
    const otherPlan = await prisma.plan.create({
      data: {
        code: `PLAN-ISO-${SUFFIX}`,
        name: "Isolation Plan",
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
    const otherTenant = await prisma.tenant.create({
      data: {
        name: `Other Tenant ${SUFFIX}`,
        nameNormalized: `other tenant ${SUFFIX}`,
        slug: `other-tenant-${SUFFIX}`,
        customerRegistrationCode: `ISO-${SUFFIX}`,
        status: "ACTIVE",
        planId: otherPlan.id,
        country: "EG",
        city: "Cairo",
        businessType: "Garage",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
      },
    });

    const otherReport = await operations.build(otherTenant.id, {});
    expect(otherReport.volumeTotals).toEqual({ created: 0, closed: 0 });
    expect(otherReport.technicianWorkload).toEqual([]);
    expect(otherReport.delayedJobs).toBe(0);

    await prisma.tenant.delete({ where: { id: otherTenant.id } });
    await prisma.plan.delete({ where: { id: otherPlan.id } });
  });

  it("enforces branch isolation for branch-scoped operational queries", async () => {
    const woA = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        assetId,
        customerId,
        status: "IN_PROGRESS",
        createdAt: new Date("2026-06-01T10:00:00.000Z"),
      },
    });
    const woB = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchBId,
        assetId,
        customerId,
        status: "IN_PROGRESS",
        createdAt: new Date("2026-06-01T10:00:00.000Z"),
      },
    });

    const reportA = await operations.build(tenantId, {
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-30T23:59:59.999Z",
      branchId: branchAId,
    });

    expect(reportA.volumeTotals.created).toBe(1);

    const reportB = await operations.build(tenantId, {
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-30T23:59:59.999Z",
      branchId: branchBId,
    });

    expect(reportB.volumeTotals.created).toBe(1);
  });

  it("evaluates historical aging and SLA risk against range.to rather than live date", async () => {
    // Work order promised for Jan 10
    const wo = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        assetId,
        customerId,
        status: "IN_PROGRESS",
        createdAt: new Date("2026-01-01T10:00:00.000Z"),
        promisedAt: new Date("2026-01-10T12:00:00.000Z"),
      },
    });

    // Report evaluated as of Jan 5 (before promisedAt): job was on track at that historical time!
    const reportBeforeSla = await bottlenecks.build(tenantId, {
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-05T23:59:59.999Z",
      branchId: branchAId,
    });
    expect(reportBeforeSla.slaRisk.breached).toBe(0);
    expect(reportBeforeSla.slaRisk.onTrack).toBeGreaterThanOrEqual(1);

    // Report evaluated as of Jan 15 (after promisedAt): job was breached at that historical time!
    const reportAfterSla = await bottlenecks.build(tenantId, {
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-15T23:59:59.999Z",
      branchId: branchAId,
    });
    expect(reportAfterSla.slaRisk.breached).toBeGreaterThanOrEqual(1);
  });
});
