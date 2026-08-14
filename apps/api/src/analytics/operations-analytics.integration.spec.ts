/**
 * Data Analyst -- Operations Analytics, against a real database.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { OperationsAnalyticsService } from "./operations-analytics.service";
import type { PrismaService } from "../database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const operations = new OperationsAnalyticsService(asService);

const SUFFIX = `aop-${Date.now()}`;
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
      name: "Analytics Ops Test",
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
      name: `AOp WS ${SUFFIX}`,
      nameNormalized: `aop ws ${SUFFIX}`,
      slug: `aop-ws-${SUFFIX}`,
      customerRegistrationCode: `AOP-${SUFFIX}`,
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

  const branchA = await prisma.branch.create({ data: { tenantId, name: "Branch A", code: `BA-${SUFFIX}` } });
  branchAId = branchA.id;
  const branchB = await prisma.branch.create({ data: { tenantId, name: "Branch B", code: `BB-${SUFFIX}` } });
  branchBId = branchB.id;
  const customer = await prisma.customer.create({ data: { tenantId, fullName: "Layla", phone: "0100000006" } });
  customerId = customer.id;
  const asset = await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `P-${SUFFIX}` } });
  assetId = asset.id;
}, 120_000);

afterAll(async () => {
  await prisma.taskBlocker.deleteMany({ where: { tenantId } });
  await prisma.task.deleteMany({ where: { tenantId } });
  await prisma.operationEvent.deleteMany({ where: { tenantId } });
  await prisma.workOrder.deleteMany({ where: { tenantId } });
  await prisma.asset.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.branch.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

const NO_SCOPE = { branchIds: [], categoryIds: [] };

describe("OperationsAnalyticsService", () => {
  it("only renders a branch comparison when scope spans more than one branch", async () => {
    const singleBranchScope = { branchIds: [branchAId], categoryIds: [] };
    const report = await operations.build(tenantId, singleBranchScope, {});
    expect(report.branchComparison).toBeNull();

    const multiReport = await operations.build(tenantId, NO_SCOPE, {});
    expect(multiReport.branchComparison).not.toBeNull();
    expect(multiReport.branchComparison!.length).toBeGreaterThanOrEqual(2);
  });

  it("does not 500 when scoped to a single category -- the categoryIds IN(...) fragment used to cast an array against a scalar column", async () => {
    const wo = await prisma.workOrder.create({ data: { tenantId, branchId: branchAId, assetId, customerId, status: "IN_PROGRESS" } });

    const scoped = await operations.build(tenantId, { branchIds: [], categoryIds: ["CARS"] }, {});
    expect(scoped).toBeDefined();

    const noMatch = await operations.build(tenantId, { branchIds: [], categoryIds: ["MOTORCYCLES"] }, {});
    expect(noMatch).toBeDefined();

    await prisma.workOrder.delete({ where: { id: wo.id } });
  });

  it("counts blockers by reason, scoped to work orders in the analyst's branch scope", async () => {
    const wo = await prisma.workOrder.create({ data: { tenantId, branchId: branchAId, assetId, customerId, status: "IN_PROGRESS" } });
    const task = await prisma.task.create({ data: { tenantId, workOrderId: wo.id, title: "Fix", status: "BLOCKED" } });
    await prisma.taskBlocker.create({
      data: { tenantId, taskId: task.id, reason: "WAITING_PART", reportedBy: "staff-1" },
    });

    const scoped = await operations.build(tenantId, { branchIds: [branchAId], categoryIds: [] }, {});
    expect(scoped.blockers.some((b) => b.reason === "WAITING_PART")).toBe(true);

    const otherBranchScoped = await operations.build(tenantId, { branchIds: [branchBId], categoryIds: [] }, {});
    expect(otherBranchScoped.blockers.some((b) => b.reason === "WAITING_PART")).toBe(false);
  });

  it("computes the delivery funnel gap from READY_FOR_DELIVERY to CLOSED", async () => {
    const wo = await prisma.workOrder.create({
      data: { tenantId, branchId: branchAId, assetId, customerId, status: "CLOSED", closedAt: new Date() },
    });
    const deliveredAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await prisma.operationEvent.create({
      data: {
        tenantId,
        eventKey: "work_order.status_changed",
        payload: { workOrderId: wo.id, from: "PAYMENT_PENDING", to: "READY_FOR_DELIVERY" },
        actorId: "staff-1",
        actorType: "TENANT_STAFF",
        createdAt: deliveredAt,
      },
    });

    const report = await operations.build(tenantId, NO_SCOPE, {
      from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(report.deliveryFunnel.reachedReadyForDelivery).toBeGreaterThanOrEqual(1);
    expect(report.deliveryFunnel.reachedClosed).toBeGreaterThanOrEqual(1);
    expect(report.deliveryFunnel.averageGapHours).not.toBeNull();
  });

  it("handles an empty scope with no work orders at all", async () => {
    const emptyTenant = await prisma.tenant.create({
      data: {
        name: `AOp Empty ${SUFFIX}`,
        nameNormalized: `aop empty ${SUFFIX}`,
        slug: `aop-empty-${SUFFIX}`,
        customerRegistrationCode: `AOPE-${SUFFIX}`,
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

    const report = await operations.build(emptyTenant.id, NO_SCOPE, {});
    expect(report.volume).toEqual([]);
    expect(report.blockers).toEqual([]);
    expect(report.deliveryFunnel.averageGapHours).toBeNull();

    await prisma.tenant.delete({ where: { id: emptyTenant.id } });
  });
});
