/**
 * Owner Home -- every card is a link, never an action; this proves each
 * of the six shipped cards computes from real data, and that none of the
 * three deliberately-deferred cards (Configuration warnings, Builder
 * draft status, Workflow health alerts) appear in any form.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { OwnerHomeService } from "./owner-home.service";
import type { PrismaService } from "../database/prisma.service";

const prisma = new PrismaClient();
const service = new OwnerHomeService(prisma as unknown as PrismaService);

const SUFFIX = `oh-${Date.now()}`;
let planId: string;
let tenantId: string;

async function account(): Promise<string> {
  const acc = await prisma.account.create({
    data: { accountType: "TENANT_STAFF", email: `${Math.random()}@example.com`, status: "ACTIVE" },
  });
  return acc.id;
}

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "OwnerHome",
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
      name: `OH ${SUFFIX}`,
      nameNormalized: `oh ${SUFFIX}`,
      slug: `oh-${SUFFIX}`,
      customerRegistrationCode: `OH-${SUFFIX}`,
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

  const [active, inactive] = await Promise.all([
    prisma.branch.create({ data: { tenantId, name: "Active Branch", code: `AB-${SUFFIX}`, isActive: true } }),
    prisma.branch.create({ data: { tenantId, name: "Closed Branch", code: `CB-${SUFFIX}`, isActive: false } }),
  ]);

  const acc = await account();
  await prisma.staffUser.create({ data: { accountId: acc, tenantId, fullName: "Owner", role: "TENANT_OWNER" } });

  const customer = await prisma.customer.create({ data: { tenantId, fullName: "Customer", phone: "0100000001" } });
  const asset = await prisma.asset.create({ data: { tenantId, category: "CARS" } });

  await Promise.all([
    prisma.workOrder.create({ data: { tenantId, branchId: active.id, assetId: asset.id, customerId: customer.id, status: "IN_PROGRESS" } }),
    prisma.workOrder.create({ data: { tenantId, branchId: active.id, assetId: asset.id, customerId: customer.id, status: "AWAITING_CUSTOMER_APPROVAL" } }),
    prisma.workOrder.create({ data: { tenantId, branchId: active.id, assetId: asset.id, customerId: customer.id, status: "PAYMENT_PENDING" } }),
    prisma.workOrder.create({ data: { tenantId, branchId: active.id, assetId: asset.id, customerId: customer.id, status: "CLOSED" } }),
  ]);

  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: "owner-actor",
      actorType: "TENANT_STAFF",
      actorName: "Owner",
      targetType: "WorkOrder",
      targetId: "wo-1",
      action: "work_order.created",
      riskLevel: "LOW",
    },
  });

  void inactive;
}, 180_000);

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { tenantId } });
  await prisma.workOrder.deleteMany({ where: { tenantId } });
  await prisma.asset.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.staffUser.deleteMany({ where: { tenantId } });
  await prisma.branch.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 180_000);

describe("the six cards", () => {
  it("computes workshop status from real branch/user rows", async () => {
    const home = await service.build(tenantId);
    expect(home.workshopStatus.activeBranches).toBe(1);
    expect(home.workshopStatus.totalBranches).toBe(2);
    expect(home.workshopStatus.activeUsers).toBe(1);
  });

  it("counts open work orders, excluding CLOSED", async () => {
    const home = await service.build(tenantId);
    expect(home.openWorkOrders).toBe(3);
  });

  it("separates waiting-approval, waiting-parts and waiting-payment", async () => {
    const home = await service.build(tenantId);
    expect(home.waitingCustomerApproval).toBe(1);
    expect(home.waitingParts).toBe(0);
    expect(home.waitingPayment).toBe(1);
  });

  it("shows recent audit rows", async () => {
    const home = await service.build(tenantId);
    expect(home.recentChanges.length).toBeGreaterThan(0);
    expect(home.recentChanges[0].action).toBe("work_order.created");
  });

  it("never surfaces the three deferred cards in any form", async () => {
    const home = await service.build(tenantId);
    expect(home).not.toHaveProperty("configurationWarnings");
    expect(home).not.toHaveProperty("builderDraftStatus");
    expect(home).not.toHaveProperty("workflowHealthAlerts");
  });
});
