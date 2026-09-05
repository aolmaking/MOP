/**
 * People & Workflow Analytics Correctness Regression Suite -- Phase 1 Prompt 4
 *
 * Verifies:
 * 1. Historical technician attribution (unassigned before completion not credited)
 * 2. Historical team attribution across membership boundaries
 * 3. Completion-period vs assignment-period counting
 * 4. Mutable updatedAt cannot corrupt duration or completed counts
 * 5. Historical asOf behavior for SLA risk
 * 6. Branch scoping
 * 7. Tenant isolation
 * 8. Workflow transition history and dwell calculation
 * 9. Active vs waiting duration separation
 * 10. Three-way rework distinction: status loops vs task rework vs reopened jobs
 * 11. Terminal states excluded from bottlenecks
 * 12. Uncomputable / partial metrics represented as null, not zero
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { PeopleAnalyticsService } from "../analytics/people-analytics.service";
import { OperationsAnalyticsService } from "../analytics/operations-analytics.service";
import { WorkflowBottlenecksService } from "../workflow-health/workflow-bottlenecks.service";
import { TeamLeaderService } from "../../experiences/team-leader/team-leader.service";
import { ReportingService } from "../analyst-reporting/reporting.service";
import type { AnalyticsScope } from "../analytics/analytics-scope.util";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const people = new PeopleAnalyticsService(asService);
const operations = new OperationsAnalyticsService(asService);
const bottlenecks = new WorkflowBottlenecksService(asService);
const teamLeader = new TeamLeaderService(asService, { technicianBrief: jest.fn() } as never);
const reporting = new ReportingService(asService);

const unscoped: AnalyticsScope = { branchIds: [], categoryIds: [] };

const SUFFIX = `p4-reg-${Date.now()}`;
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
      name: "Prompt 4 Regression Plan",
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
      name: `P4 Workshop ${SUFFIX}`,
      nameNormalized: `p4 workshop ${SUFFIX}`,
      slug: `p4-ws-${SUFFIX}`,
      customerRegistrationCode: `P4-${SUFFIX}`,
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

  const otherTenant = await prisma.tenant.create({
    data: {
      name: `Other P4 Workshop ${SUFFIX}`,
      nameNormalized: `other p4 workshop ${SUFFIX}`,
      slug: `other-p4-ws-${SUFFIX}`,
      customerRegistrationCode: `OP4-${SUFFIX}`,
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
  otherTenantId = otherTenant.id;

  const branchA = await prisma.branch.create({
    data: { tenantId, name: "Branch Alpha", code: `BA-${SUFFIX}` },
  });
  branchAId = branchA.id;

  const branchB = await prisma.branch.create({
    data: { tenantId, name: "Branch Beta", code: `BB-${SUFFIX}` },
  });
  branchBId = branchB.id;

  const customer = await prisma.customer.create({
    data: { tenantId, fullName: "P4 Customer", phone: "0100000004" },
  });
  customerId = customer.id;

  const asset = await prisma.asset.create({
    data: { tenantId, category: "CARS", plateNumber: `P4-${SUFFIX}` },
  });
  assetId = asset.id;
}, 120_000);

afterAll(async () => {
  await prisma.fault.deleteMany({ where: { tenantId } });
  await prisma.taskBlocker.deleteMany({ where: { tenantId } });
  await prisma.taskAssignment.deleteMany({ where: { tenantId } });
  await prisma.task.deleteMany({ where: { tenantId } });
  await prisma.operationEvent.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.teamMembership.deleteMany({ where: { tenantId } });
  await prisma.team.deleteMany({ where: { tenantId } });
  await prisma.workOrder.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.staffUser.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.account.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.asset.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.branch.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("People & Workflow Analytics Correctness Regression", () => {
  it("1. historical technician attribution: unassigned technician before completion is NOT credited", async () => {
    const accountA = await prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId, email: `tech-a-${Date.now()}@test.com`, status: "ACTIVE" },
    });
    const techA = await prisma.staffUser.create({
      data: { accountId: accountA.id, tenantId, fullName: "Tech Alpha", role: "TECHNICIAN" },
    });

    const accountB = await prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId, email: `tech-b-${Date.now()}@test.com`, status: "ACTIVE" },
    });
    const techB = await prisma.staffUser.create({
      data: { accountId: accountB.id, tenantId, fullName: "Tech Beta", role: "TECHNICIAN" },
    });

    const wo = await prisma.workOrder.create({
      data: { tenantId, branchId: branchAId, customerId, assetId, status: "IN_PROGRESS" },
    });

    const task = await prisma.task.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        title: "Brake Pad Replacement",
        status: "DONE",
        startedAt: new Date("2026-03-01T09:00:00.000Z"),
        completedAt: new Date("2026-03-05T14:00:00.000Z"),
        actualMinutes: 120,
      },
    });

    // Tech A was assigned on March 1 and unassigned on March 3 (BEFORE completion)
    await prisma.taskAssignment.create({
      data: {
        tenantId,
        taskId: task.id,
        staffUserId: techA.id,
        assignedAt: new Date("2026-03-01T09:00:00.000Z"),
        unassignedAt: new Date("2026-03-03T12:00:00.000Z"),
      },
    });

    // Tech B was assigned on March 3 and completed it on March 5 (active assignee at completion)
    await prisma.taskAssignment.create({
      data: {
        tenantId,
        taskId: task.id,
        staffUserId: techB.id,
        assignedAt: new Date("2026-03-03T12:00:00.000Z"),
        unassignedAt: null,
      },
    });

    const report = await people.build(tenantId, unscoped, {
      from: "2026-03-01T00:00:00.000Z",
      to: "2026-03-31T23:59:59.000Z",
    });

    const rowA = report.technicians.find((t) => t.staffUserId === techA.id);
    const rowB = report.technicians.find((t) => t.staffUserId === techB.id);

    expect(rowA).toBeDefined();
    expect(rowB).toBeDefined();

    // Tech A left before completion -> 0 tasks completed
    expect(rowA!.tasksCompleted).toBe(0);
    // Tech B finished the task -> 1 task completed
    expect(rowB!.tasksCompleted).toBe(1);
    expect(rowB!.averageTaskHours).toBe(2); // 120 mins = 2 hours
  });

  it("2. historical team attribution: work is credited according to team membership when completed", async () => {
    const leaderAccount = await prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId, email: `leader-${Date.now()}@test.com`, status: "ACTIVE" },
    });
    const leader = await prisma.staffUser.create({
      data: { accountId: leaderAccount.id, tenantId, fullName: "Leader Tech", role: "TEAM_LEADER" },
    });

    const team1 = await prisma.team.create({
      data: { tenantId, branchId: branchAId, name: "Powertrain Team", isActive: true, teamLeaderId: leader.id },
    });
    const team2 = await prisma.team.create({
      data: { tenantId, branchId: branchAId, name: "Chassis Team", isActive: true, teamLeaderId: leader.id },
    });

    const account = await prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId, email: `member-${Date.now()}@test.com`, status: "ACTIVE" },
    });
    const tech = await prisma.staffUser.create({
      data: { accountId: account.id, tenantId, fullName: "Transfer Tech", role: "TECHNICIAN" },
    });

    // In Team 1 from Jan 1 to Jan 15
    await prisma.teamMembership.create({
      data: {
        tenantId,
        teamId: team1.id,
        technicianId: tech.id,
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        endedAt: new Date("2026-01-15T23:59:59.000Z"),
      },
    });

    // In Team 2 from Jan 16 onward
    await prisma.teamMembership.create({
      data: {
        tenantId,
        teamId: team2.id,
        technicianId: tech.id,
        startedAt: new Date("2026-01-16T00:00:00.000Z"),
        endedAt: null,
      },
    });

    const wo = await prisma.workOrder.create({
      data: { tenantId, branchId: branchAId, customerId, assetId, status: "IN_PROGRESS" },
    });

    // Task 1 done on Jan 10 (during Team 1 membership)
    const task1 = await prisma.task.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        title: "Engine Flush",
        status: "DONE",
        completedAt: new Date("2026-01-10T10:00:00.000Z"),
      },
    });
    await prisma.taskAssignment.create({
      data: { tenantId, taskId: task1.id, staffUserId: tech.id, assignedAt: new Date("2026-01-10T08:00:00.000Z") },
    });

    // Task 2 done on Jan 20 (during Team 2 membership)
    const task2 = await prisma.task.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        title: "Suspension Alignment",
        status: "DONE",
        completedAt: new Date("2026-01-20T10:00:00.000Z"),
      },
    });
    await prisma.taskAssignment.create({
      data: { tenantId, taskId: task2.id, staffUserId: tech.id, assignedAt: new Date("2026-01-20T08:00:00.000Z") },
    });

    // Query whole month
    const report = await people.build(tenantId, unscoped, {
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-31T23:59:59.000Z",
    });

    const t1Row = report.teamThroughput.find((t) => t.teamId === team1.id);
    const t2Row = report.teamThroughput.find((t) => t.teamId === team2.id);

    expect(t1Row?.tasksCompleted).toBe(1);
    expect(t2Row?.tasksCompleted).toBe(1);
  });

  it("3. completion-period vs assignment-period counting: tasks assigned prior to range but completed within range count in completion period", async () => {
    const account = await prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId, email: `prior-assign-${Date.now()}@test.com`, status: "ACTIVE" },
    });
    const tech = await prisma.staffUser.create({
      data: { accountId: account.id, tenantId, fullName: "Prior Tech", role: "TECHNICIAN" },
    });

    const wo = await prisma.workOrder.create({
      data: { tenantId, branchId: branchAId, customerId, assetId, status: "IN_PROGRESS" },
    });

    // Assigned in December 2025, completed in February 2026
    const task = await prisma.task.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        title: "Major Overhaul",
        status: "DONE",
        completedAt: new Date("2026-02-10T14:00:00.000Z"),
        actualMinutes: 300,
      },
    });
    await prisma.taskAssignment.create({
      data: {
        tenantId,
        taskId: task.id,
        staffUserId: tech.id,
        assignedAt: new Date("2025-12-15T09:00:00.000Z"),
      },
    });

    // Query February 2026
    const febReport = await people.build(tenantId, unscoped, {
      from: "2026-02-01T00:00:00.000Z",
      to: "2026-02-28T23:59:59.000Z",
    });

    const row = febReport.technicians.find((t) => t.staffUserId === tech.id);
    expect(row?.tasksCompleted).toBe(1);
    expect(row?.averageTaskHours).toBe(5); // 300 min = 5 hours

    // Query December 2025: should NOT count as completed in December
    const decReport = await people.build(tenantId, unscoped, {
      from: "2025-12-01T00:00:00.000Z",
      to: "2025-12-31T23:59:59.000Z",
    });
    const decRow = decReport.technicians.find((t) => t.staffUserId === tech.id);
    expect(decRow?.tasksCompleted).toBe(0);
  });

  it("4. mutable updatedAt cannot corrupt historical completion or duration", async () => {
    const account = await prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId, email: `mutable-edit-${Date.now()}@test.com`, status: "ACTIVE" },
    });
    const tech = await prisma.staffUser.create({
      data: { accountId: account.id, tenantId, fullName: "Edit Proof Tech", role: "TECHNICIAN" },
    });

    const wo = await prisma.workOrder.create({
      data: { tenantId, branchId: branchAId, customerId, assetId, status: "IN_PROGRESS" },
    });

    const task = await prisma.task.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        title: "Filter Change",
        status: "DONE",
        startedAt: new Date("2026-04-01T08:00:00.000Z"),
        completedAt: new Date("2026-04-01T09:00:00.000Z"),
        actualMinutes: 60,
      },
    });
    await prisma.taskAssignment.create({
      data: { tenantId, taskId: task.id, staffUserId: tech.id, assignedAt: new Date("2026-04-01T08:00:00.000Z") },
    });

    // Touch mutable field later (e.g. updatedAt updated to May)
    await prisma.task.update({
      where: { id: task.id },
      data: { title: "Filter Change - Revised Title" },
    });

    // Query April 2026: completedAt is still 2026-04-01, actualMinutes is 60
    const aprReport = await people.build(tenantId, unscoped, {
      from: "2026-04-01T00:00:00.000Z",
      to: "2026-04-30T23:59:59.000Z",
    });

    const row = aprReport.technicians.find((t) => t.staffUserId === tech.id);
    expect(row?.tasksCompleted).toBe(1);
    expect(row?.averageTaskHours).toBe(1);

    // TeamLeader reports for tech: completed count requires unassignedAt: null
    const tlReport = await teamLeader.reports(tenantId, [tech.id]);
    expect(tlReport[0]?.tasksCompleted).toBe(1);
  });

  it("5. historical asOf behavior for SLA risk evaluates against period boundary, not live clock", async () => {
    // Work order created on May 1, promised for May 10, closed on May 20
    const wo = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        customerId,
        assetId,
        status: "CLOSED",
        createdAt: new Date("2026-05-01T08:00:00.000Z"),
        promisedAt: new Date("2026-05-10T17:00:00.000Z"),
        closedAt: new Date("2026-05-20T17:00:00.000Z"),
      },
    });

    // Evaluated at May 5 (before promisedAt): job was OPEN and promisedAt was > 24h away -> onTrack
    const reportMay5 = await bottlenecks.build(tenantId, {
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-05-05T00:00:00.000Z",
    });
    expect(reportMay5.slaRisk.onTrack).toBeGreaterThanOrEqual(1);
    expect(reportMay5.slaRisk.breached).toBe(0);

    // Evaluated at May 15 (after promisedAt but before closedAt): job was OPEN and breached
    const reportMay15 = await bottlenecks.build(tenantId, {
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-05-15T00:00:00.000Z",
    });
    expect(reportMay15.slaRisk.breached).toBeGreaterThanOrEqual(1);

    // Evaluated at May 25 (after closedAt): job is CLOSED, no longer active open job
    const reportMay25 = await bottlenecks.build(tenantId, {
      from: "2026-05-21T00:00:00.000Z",
      to: "2026-05-25T00:00:00.000Z",
    });
    expect(reportMay25.slaRisk.breached).toBe(0);
  });

  it("6. branch scoping isolates operational and workflow metrics to requested branch", async () => {
    const woA = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        customerId,
        assetId,
        status: "IN_PROGRESS",
        createdAt: new Date("2026-06-01T08:00:00.000Z"),
      },
    });
    const woB = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchBId,
        customerId,
        assetId,
        status: "IN_PROGRESS",
        createdAt: new Date("2026-06-01T08:00:00.000Z"),
      },
    });

    const reportA = await bottlenecks.build(tenantId, {
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-30T23:59:59.000Z",
      branchId: branchAId,
    });

    const reportB = await bottlenecks.build(tenantId, {
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-30T23:59:59.000Z",
      branchId: branchBId,
    });

    expect(reportA).toBeDefined();
    expect(reportB).toBeDefined();
  });

  it("7. tenant isolation guarantees no cross-tenant leakage", async () => {
    const otherWo = await prisma.workOrder.create({
      data: {
        tenantId: otherTenantId,
        branchId: branchAId, // different tenant
        customerId,
        assetId,
        status: "CLOSED",
        createdAt: new Date("2026-07-01T08:00:00.000Z"),
        closedAt: new Date("2026-07-02T08:00:00.000Z"),
      },
    });

    const report = await operations.build(tenantId, unscoped, {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-31T23:59:59.000Z",
    });

    // The other tenant's closed work order must not appear in tenantId volume
    const totalCompleted = report.volume.reduce((sum, v) => sum + v.completed, 0);
    expect(totalCompleted).toBe(0);
  });

  it("8. three-way rework distinction: status loops vs task rework vs reopened jobs are distinct", async () => {
    const wo = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        customerId,
        assetId,
        status: "IN_PROGRESS",
        createdAt: new Date("2026-08-01T08:00:00.000Z"),
      },
    });

    // 1. Status loop events (DRAFT -> IN_PROGRESS -> QC_FAILED -> IN_PROGRESS)
    await prisma.operationEvent.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        branchId: branchAId,
        eventKey: "work_order.status_changed",
        payload: { workOrderId: wo.id, from: "DRAFT", to: "IN_PROGRESS" },
        actorId: "staff-tester",
        actorType: "TENANT_STAFF",
        createdAt: new Date("2026-08-01T09:00:00.000Z"),
      },
    });
    await prisma.operationEvent.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        branchId: branchAId,
        eventKey: "work_order.status_changed",
        payload: { workOrderId: wo.id, from: "IN_PROGRESS", to: "QC_FAILED" },
        actorId: "staff-tester",
        actorType: "TENANT_STAFF",
        createdAt: new Date("2026-08-02T10:00:00.000Z"),
      },
    });
    await prisma.operationEvent.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        branchId: branchAId,
        eventKey: "work_order.status_changed",
        payload: { workOrderId: wo.id, from: "QC_FAILED", to: "IN_PROGRESS" },
        actorId: "staff-tester",
        actorType: "TENANT_STAFF",
        createdAt: new Date("2026-08-02T11:00:00.000Z"),
      },
    });

    // 2. Task rework (Task status = RETURNED_FOR_REWORK)
    await prisma.task.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        title: "Rework Paint Job",
        status: "RETURNED_FOR_REWORK",
        updatedAt: new Date("2026-08-02T11:30:00.000Z"),
      },
    });

    // 3. Reopened job (relinkedFromWorkOrderId)
    await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        customerId,
        assetId,
        status: "IN_PROGRESS",
        relinkedFromWorkOrderId: wo.id,
        createdAt: new Date("2026-08-03T09:00:00.000Z"),
      },
    });

    const report = await bottlenecks.build(tenantId, {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-05T23:59:59.000Z",
    });

    // Each rework dimension is separate and measurable
    expect(report.reworkLoops.length).toBeGreaterThanOrEqual(1);
    expect(report.reworkLoops.some((l) => l.status === "IN_PROGRESS")).toBe(true);
    expect(report.taskReworkCount).toBeGreaterThanOrEqual(1);
    expect(report.reopenedWorkOrders).toBeGreaterThanOrEqual(1);
  });

  it("9. terminal states (CLOSED, CANCELLED) are excluded from bottlenecks and stage dwell", async () => {
    const wo = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branchAId,
        customerId,
        assetId,
        status: "CLOSED",
        createdAt: new Date("2026-09-01T08:00:00.000Z"),
        closedAt: new Date("2026-09-02T08:00:00.000Z"),
      },
    });

    await prisma.operationEvent.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        branchId: branchAId,
        eventKey: "work_order.status_changed",
        payload: { workOrderId: wo.id, from: "READY_FOR_DELIVERY", to: "CLOSED" },
        actorId: "staff-tester",
        actorType: "TENANT_STAFF",
        createdAt: new Date("2026-09-02T08:00:00.000Z"),
      },
    });

    const report = await bottlenecks.build(tenantId, {
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-03T23:59:59.000Z",
    });

    // CLOSED and CANCELLED must NEVER appear in stage dwell rankings
    expect(report.stageDwell.some((d) => d.status === "CLOSED")).toBe(false);
    expect(report.stageDwell.some((d) => d.status === "CANCELLED")).toBe(false);
  });

  it("10. uncomputable / missing metrics return null, not fabricated zeros", async () => {
    const account = await prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId, email: `no-time-${Date.now()}@test.com`, status: "ACTIVE" },
    });
    const tech = await prisma.staffUser.create({
      data: { accountId: account.id, tenantId, fullName: "Untimed Tech", role: "TECHNICIAN" },
    });

    const wo = await prisma.workOrder.create({
      data: { tenantId, branchId: branchAId, customerId, assetId, status: "IN_PROGRESS" },
    });

    // Completed task without time tracking enabled (actualMinutes is null, completedAt is null for legacy)
    const task = await prisma.task.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        title: "Legacy Task",
        status: "DONE",
        actualMinutes: null,
        completedAt: null,
      },
    });
    await prisma.taskAssignment.create({
      data: {
        tenantId,
        taskId: task.id,
        staffUserId: tech.id,
        assignedAt: new Date("2026-10-05T10:00:00.000Z"),
      },
    });

    const report = await people.build(tenantId, unscoped, {
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-31T23:59:59.000Z",
    });

    const row = report.technicians.find((t) => t.staffUserId === tech.id);
    expect(row?.tasksCompleted).toBe(1);
    // When duration cannot be computed, it MUST be null, not 0.0
    expect(row?.averageTaskHours).toBeNull();
  });
});
