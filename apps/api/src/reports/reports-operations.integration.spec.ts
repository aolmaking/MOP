/**
 * Reports & Analytics -- Operations, against a real database. Exercises
 * the historical-duration path against real OperationEvent rows shaped
 * exactly like work-order-lifecycle.service.ts's own emit() call
 * (payload: { workOrderId, from, to }), rather than re-driving the full
 * lifecycle machinery (that has its own dedicated tests).
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { ReportsOperationsService } from "./reports-operations.service";
import type { PrismaService } from "../database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const operations = new ReportsOperationsService(asService);

const SUFFIX = `rops-${Date.now()}`;
let tenantId: string;
let planId: string;
let branchId: string;
let customerId: string;
let assetId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Ops Test",
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
      name: `ROp WS ${SUFFIX}`,
      nameNormalized: `rop ws ${SUFFIX}`,
      slug: `rop-ws-${SUFFIX}`,
      customerRegistrationCode: `ROP-${SUFFIX}`,
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
  const customer = await prisma.customer.create({ data: { tenantId, fullName: "Youssef", phone: "0100000002" } });
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

describe("ReportsOperationsService -- historical duration from real event history", () => {
  it("computes average time in WAITING_PARTS from the status-change event trail, not the current snapshot", async () => {
    const wo = await prisma.workOrder.create({
      data: { tenantId, branchId, assetId, customerId, status: "IN_PROGRESS" },
    });

    const t0 = new Date("2026-01-01T00:00:00Z");
    await emitStatusChange(wo.id, "DRAFT", "IN_PROGRESS", t0);
    await emitStatusChange(wo.id, "IN_PROGRESS", "WAITING_PARTS", new Date(t0.getTime() + 1 * 60 * 60 * 1000));
    await emitStatusChange(wo.id, "WAITING_PARTS", "IN_PROGRESS", new Date(t0.getTime() + 5 * 60 * 60 * 1000));

    const report = await operations.build(tenantId, {
      from: t0.toISOString(),
      to: new Date(t0.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    });

    const waitingParts = report.averageTimeInStatus.find((r) => r.status === "WAITING_PARTS");
    expect(waitingParts).toBeDefined();
    expect(waitingParts!.averageHours).toBeGreaterThan(3.9);
    expect(waitingParts!.averageHours).toBeLessThan(4.1);
  });

  it("reflects the current status distribution regardless of date range (a snapshot, not history)", async () => {
    await prisma.workOrder.create({ data: { tenantId, branchId, assetId, customerId, status: "CLOSED" } });

    const report = await operations.build(tenantId, {});
    const closed = report.statusDistribution.find((r) => r.status === "CLOSED");
    expect(closed).toBeDefined();
    expect(closed!.count).toBeGreaterThanOrEqual(1);
  });

  it("counts a non-terminal work order past its promisedAt as delayed", async () => {
    await prisma.workOrder.create({
      data: {
        tenantId,
        branchId,
        assetId,
        customerId,
        status: "IN_PROGRESS",
        promisedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });

    const report = await operations.build(tenantId, {});
    expect(report.delayedJobs).toBeGreaterThanOrEqual(1);
  });

  it("handles a workshop with no status-change history at all", async () => {
    const emptyTenant = await prisma.tenant.create({
      data: {
        name: `ROp Empty ${SUFFIX}`,
        nameNormalized: `rop empty ${SUFFIX}`,
        slug: `rop-empty-${SUFFIX}`,
        customerRegistrationCode: `ROPE-${SUFFIX}`,
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

    const report = await operations.build(emptyTenant.id, {});
    expect(report.averageTimeInStatus).toEqual([]);
    expect(report.statusDistribution).toEqual([]);
    expect(report.cancellationRate).toBe(0);

    await prisma.tenant.delete({ where: { id: emptyTenant.id } });
  });
});
