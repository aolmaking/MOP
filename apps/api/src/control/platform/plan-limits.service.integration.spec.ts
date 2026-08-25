/**
 * `Plan.maxBranches`/`maxWarehouses`/`maxUsers` used to be checked exactly
 * once, at workshop creation, never again -- a Super Admin's ceiling was
 * decorative for the rest of a workshop's life. This proves the ongoing
 * enforcement against real Postgres: a plan capped at 1 of each resource
 * accepts exactly one, then refuses the next with a real 403, and a
 * deactivated row frees the seat it was occupying.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { PlanLimitsService } from "./plan-limits.service";
import { AuditService } from "../../audit/audit.service";
import { BranchWarehouseService } from "../../systems/people/organization/branch-warehouse.service";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const planLimits = new PlanLimitsService(asService);
const audit = new AuditService(asService);
const infra = new BranchWarehouseService(asService, audit, planLimits);
const actor = { accountId: "owner-account-id", displayName: "Test Owner" };

const SUFFIX = `plan-limits-${Date.now()}`;
let tenantId: string;
let planId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-LIMITS-${SUFFIX}`,
      name: "Plan Limits Test",
      maxBranches: 1,
      maxUsers: 1,
      maxWarehouses: 1,
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
      name: `Plan Limits WS ${SUFFIX}`,
      nameNormalized: `plan limits ws ${SUFFIX}`,
      slug: `plan-limits-ws-${SUFFIX}`,
      customerRegistrationCode: `PL-${SUFFIX}`,
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
}, 120_000);

afterAll(async () => {
  await prisma.staffUser.deleteMany({ where: { tenantId } });
  await prisma.account.deleteMany({ where: { tenantId } });
  await prisma.warehouse.deleteMany({ where: { tenantId } });
  await prisma.branch.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
  await prisma.plan.delete({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("PlanLimitsService", () => {
  it("accepts the first branch, then refuses the second against a plan capped at 1", async () => {
    await expect(planLimits.assertBranchCapacity(tenantId)).resolves.toBeUndefined();
    await prisma.branch.create({ data: { tenantId, name: "Only Branch", code: `ONLY-${SUFFIX}` } });

    await expect(planLimits.assertBranchCapacity(tenantId)).rejects.toMatchObject({
      status: 403,
      response: { code: "plan_branches_limit_reached" },
    });
  });

  it("refuses through the real BranchWarehouseService.createBranch caller, with the same error shape a controller would return", async () => {
    await expect(infra.createBranch(tenantId, { name: "One Too Many" }, actor)).rejects.toMatchObject({
      status: 403,
      response: { code: "plan_branches_limit_reached" },
    });
  });

  it("frees the seat when the occupying branch is deactivated", async () => {
    const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId, code: `ONLY-${SUFFIX}` } });
    await prisma.branch.update({ where: { id: branch.id }, data: { isActive: false } });

    await expect(planLimits.assertBranchCapacity(tenantId)).resolves.toBeUndefined();

    await prisma.branch.update({ where: { id: branch.id }, data: { isActive: true } });
  });

  it("accepts the first warehouse, then refuses the second against a plan capped at 1", async () => {
    await expect(planLimits.assertWarehouseCapacity(tenantId)).resolves.toBeUndefined();
    await prisma.warehouse.create({ data: { tenantId, name: "Only Warehouse", code: `ONLYWH-${SUFFIX}` } });

    await expect(planLimits.assertWarehouseCapacity(tenantId)).rejects.toMatchObject({
      status: 403,
      response: { code: "plan_warehouses_limit_reached" },
    });
  });

  it("accepts the first staff user, then refuses the second against a plan capped at 1", async () => {
    await expect(planLimits.assertUserCapacity(tenantId)).resolves.toBeUndefined();

    const account = await prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId, email: `only-${SUFFIX}@example.com`, passwordHash: null, status: "INVITED" },
    });
    await prisma.staffUser.create({
      data: { accountId: account.id, tenantId, fullName: "Only Staff", role: "DATA_ANALYST", branchScope: [], warehouseScope: [], categoryScope: [] },
    });

    await expect(planLimits.assertUserCapacity(tenantId)).rejects.toMatchObject({
      status: 403,
      response: { code: "plan_users_limit_reached" },
    });
  });
});
