/**
 * Organization & Access -- Branches/Warehouses/matrix, against a real
 * database.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { AuditService } from "../audit/audit.service";
import { BranchWarehouseService } from "./branch-warehouse.service";
import type { PrismaService } from "../database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const infra = new BranchWarehouseService(asService, audit);

const SUFFIX = `bw-${Date.now()}`;
let tenantId: string;
let planId: string;
let assetId: string;
let customerId: string;
const actor = { accountId: "owner-account-id", displayName: "Test Owner" };

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "BW Test",
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
      name: `BW WS ${SUFFIX}`,
      nameNormalized: `bw ws ${SUFFIX}`,
      slug: `bw-ws-${SUFFIX}`,
      customerRegistrationCode: `BW-${SUFFIX}`,
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

  const customer = await prisma.customer.create({ data: { tenantId, fullName: "Customer", phone: "0100000000" } });
  customerId = customer.id;
  const asset = await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `P-${SUFFIX}` } });
  assetId = asset.id;
}, 120_000);

afterAll(async () => {
  await prisma.workOrder.deleteMany({ where: { tenantId } });
  await prisma.branchWarehouseAccess.deleteMany({ where: { tenantId } });
  await prisma.warehouse.deleteMany({ where: { tenantId } });
  await prisma.branch.deleteMany({ where: { tenantId } });
  await prisma.asset.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("BranchWarehouseService", () => {
  it("creates a branch and a warehouse, auto-suggesting a code when none is given", async () => {
    const branch = await infra.createBranch(tenantId, { name: "Downtown Branch" }, actor);
    const warehouse = await infra.createWarehouse(tenantId, { name: "Central Warehouse" }, actor);

    const page = await infra.page(tenantId);
    expect(page.branches.find((b) => b.id === branch.id)?.code).toBe("DOWNTOWN-BRANCH");
    expect(page.warehouses.find((w) => w.id === warehouse.id)?.code).toBe("CENTRAL-WAREHOUSE");
  });

  it("refuses a duplicate branch code", async () => {
    await infra.createBranch(tenantId, { name: "Dup", code: "DUP-1" }, actor);
    await expect(infra.createBranch(tenantId, { name: "Dup Again", code: "DUP-1" }, actor)).rejects.toMatchObject({
      status: 409,
      response: { code: "branch_code_taken" },
    });
  });

  it("links and unlinks a branch to a warehouse, populating BranchWarehouseAccess", async () => {
    const branch = await infra.createBranch(tenantId, { name: "Link Branch", code: `LB-${SUFFIX}` }, actor);
    const warehouse = await infra.createWarehouse(tenantId, { name: "Link Warehouse", code: `LW-${SUFFIX}` }, actor);

    await infra.setLink(tenantId, branch.id, warehouse.id, true, actor);
    let page = await infra.page(tenantId);
    expect(page.links).toContainEqual({ branchId: branch.id, warehouseId: warehouse.id });

    await infra.setLink(tenantId, branch.id, warehouse.id, false, actor);
    page = await infra.page(tenantId);
    expect(page.links).not.toContainEqual({ branchId: branch.id, warehouseId: warehouse.id });
  });

  it("refuses to deactivate a branch with open work orders, and succeeds once none remain", async () => {
    const branch = await infra.createBranch(tenantId, { name: "Busy Branch", code: `BUSY-${SUFFIX}` }, actor);

    const workOrder = await prisma.workOrder.create({
      data: { tenantId, branchId: branch.id, assetId, customerId, status: "DRAFT" },
    });

    await expect(infra.setBranchActive(tenantId, branch.id, false, actor)).rejects.toMatchObject({
      status: 409,
      response: { code: "branch_has_open_work_orders" },
    });

    await prisma.workOrder.update({ where: { id: workOrder.id }, data: { status: "CLOSED" } });

    await infra.setBranchActive(tenantId, branch.id, false, actor);
    const page = await infra.page(tenantId);
    expect(page.branches.find((b) => b.id === branch.id)?.isActive).toBe(false);
  });
});
