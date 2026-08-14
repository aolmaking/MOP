/**
 * Workflow Health -- bottleneck/SLA diagnostics, against a real database.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { WorkflowBottlenecksService } from "./workflow-bottlenecks.service";
import type { PrismaService } from "../database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const bottlenecks = new WorkflowBottlenecksService(asService);

const SUFFIX = `wbot-${Date.now()}`;
let tenantId: string;
let planId: string;
let branchId: string;
let customerId: string;
let assetId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Bottlenecks Test",
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
      name: `WBot WS ${SUFFIX}`,
      nameNormalized: `wbot ws ${SUFFIX}`,
      slug: `wbot-ws-${SUFFIX}`,
      customerRegistrationCode: `WBOT-${SUFFIX}`,
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

  const branch = await prisma.branch.create({ data: { tenantId, name: "Main", code: `MAIN-${SUFFIX}` } });
  branchId = branch.id;
  const customer = await prisma.customer.create({ data: { tenantId, fullName: "Tarek", phone: "0100000005" } });
  customerId = customer.id;
  const asset = await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `P-${SUFFIX}` } });
  assetId = asset.id;
}, 120_000);

afterAll(async () => {
  await prisma.operationEvent.deleteMany({ where: { tenantId } });
  await prisma.workOrder.deleteMany({ where: { tenantId } });
  await prisma.asset.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.branch.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

async function emitStatusChange(workOrderId: string, from: string, to: string, at: Date) {
  return prisma.operationEvent.create({
    data: {
      tenantId,
      eventKey: "work_order.status_changed",
      payload: { workOrderId, from, to },
      actorId: "staff-1",
      actorType: "TENANT_STAFF",
      createdAt: at,
    },
  });
}

describe("WorkflowBottlenecksService", () => {
  it("attributes WAITING_PARTS dwell time to the INVENTORY cause bucket", async () => {
    const wo = await prisma.workOrder.create({ data: { tenantId, branchId, assetId, customerId, status: "WAITING_PARTS" } });
    const t0 = new Date("2026-02-01T00:00:00Z");
    await emitStatusChange(wo.id, "IN_PROGRESS", "WAITING_PARTS", t0);

    const report = await bottlenecks.build(tenantId, {
      from: t0.toISOString(),
      to: new Date(t0.getTime() + 10 * 60 * 60 * 1000).toISOString(),
    });

    const inventory = report.waitingCauseBreakdown.find((r) => r.cause === "INVENTORY");
    expect(inventory).toBeDefined();
    expect(inventory!.totalHours).toBeGreaterThan(9);
  });

  it("detects a rework loop when a work order re-enters a status it already left", async () => {
    const wo = await prisma.workOrder.create({ data: { tenantId, branchId, assetId, customerId, status: "IN_PROGRESS" } });
    const t0 = new Date("2026-02-02T00:00:00Z");
    await emitStatusChange(wo.id, "APPROVED_FOR_WORK", "IN_PROGRESS", t0);
    await emitStatusChange(wo.id, "IN_PROGRESS", "READY_FOR_QC", new Date(t0.getTime() + 1 * 60 * 60 * 1000));
    await emitStatusChange(wo.id, "READY_FOR_QC", "QC_FAILED", new Date(t0.getTime() + 2 * 60 * 60 * 1000));
    await emitStatusChange(wo.id, "QC_FAILED", "IN_PROGRESS", new Date(t0.getTime() + 3 * 60 * 60 * 1000));

    const report = await bottlenecks.build(tenantId, {
      from: t0.toISOString(),
      to: new Date(t0.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    });

    const loop = report.reworkLoops.find((l) => l.status === "IN_PROGRESS");
    expect(loop).toBeDefined();
    expect(loop!.workOrderCount).toBeGreaterThanOrEqual(1);
  });

  it("classifies SLA risk into breached / at-risk / on-track / untracked buckets", async () => {
    await prisma.workOrder.create({
      data: { tenantId, branchId, assetId, customerId, status: "IN_PROGRESS", promisedAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    await prisma.workOrder.create({
      data: {
        tenantId,
        branchId,
        assetId,
        customerId,
        status: "IN_PROGRESS",
        promisedAt: new Date(Date.now() + 10 * 60 * 60 * 1000),
      },
    });
    await prisma.workOrder.create({ data: { tenantId, branchId, assetId, customerId, status: "IN_PROGRESS", promisedAt: null } });

    const report = await bottlenecks.build(tenantId, {});
    expect(report.slaRisk.breached).toBeGreaterThanOrEqual(1);
    expect(report.slaRisk.atRiskWithin24h).toBeGreaterThanOrEqual(1);
    expect(report.slaRisk.untracked).toBeGreaterThanOrEqual(1);
  });

  it("does not count a terminal (CLOSED) work order's overdue promise as SLA risk", async () => {
    await prisma.workOrder.create({
      data: {
        tenantId,
        branchId,
        assetId,
        customerId,
        status: "CLOSED",
        promisedAt: new Date(Date.now() - 100 * 60 * 60 * 1000),
        closedAt: new Date(),
      },
    });

    const before = await bottlenecks.build(tenantId, {});
    // Sanity: closed work orders are simply excluded from every SLA bucket, not double-counted anywhere.
    const total = before.slaRisk.breached + before.slaRisk.atRiskWithin24h + before.slaRisk.onTrack + before.slaRisk.untracked;
    const nonTerminalCount = await prisma.workOrder.count({ where: { tenantId, status: { notIn: ["CLOSED", "CANCELLED"] } } });
    expect(total).toBe(nonTerminalCount);
  });

  it("handles a workshop with no status history at all", async () => {
    const emptyTenant = await prisma.tenant.create({
      data: {
        name: `WBot Empty ${SUFFIX}`,
        nameNormalized: `wbot empty ${SUFFIX}`,
        slug: `wbot-empty-${SUFFIX}`,
        customerRegistrationCode: `WBOTE-${SUFFIX}`,
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

    const report = await bottlenecks.build(emptyTenant.id, {});
    expect(report.stageDwell).toEqual([]);
    expect(report.waitingCauseBreakdown).toEqual([]);
    expect(report.reworkLoops).toEqual([]);
    expect(report.reopenedWorkOrders).toBe(0);

    await prisma.tenant.delete({ where: { id: emptyTenant.id } });
  });
});
