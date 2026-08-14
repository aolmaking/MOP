/**
 * Data Analyst -- Technician & Team Analytics, against a real database.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { PeopleAnalyticsService } from "./people-analytics.service";
import type { PrismaService } from "../database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const people = new PeopleAnalyticsService(asService);

const SUFFIX = `apeo-${Date.now()}`;
let tenantId: string;
let planId: string;
let branchId: string;
let customerId: string;
let assetId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Analytics People Test",
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
      name: `APeo WS ${SUFFIX}`,
      nameNormalized: `apeo ws ${SUFFIX}`,
      slug: `apeo-ws-${SUFFIX}`,
      customerRegistrationCode: `APEO-${SUFFIX}`,
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
  const customer = await prisma.customer.create({ data: { tenantId, fullName: "Samir", phone: "0100000007" } });
  customerId = customer.id;
  const asset = await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `P-${SUFFIX}` } });
  assetId = asset.id;
}, 120_000);

afterAll(async () => {
  await prisma.fault.deleteMany({ where: { tenantId } });
  await prisma.taskBlocker.deleteMany({ where: { tenantId } });
  await prisma.taskAssignment.deleteMany({ where: { tenantId } });
  await prisma.task.deleteMany({ where: { tenantId } });
  await prisma.workOrder.deleteMany({ where: { tenantId } });
  await prisma.staffUser.deleteMany({ where: { tenantId } });
  await prisma.account.deleteMany({ where: { tenantId } });
  await prisma.asset.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.branch.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

const NO_SCOPE = { branchIds: [], categoryIds: [] };

describe("PeopleAnalyticsService", () => {
  it("never includes a currency amount anywhere in its output shape", async () => {
    const report = await people.build(tenantId, NO_SCOPE, {});
    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/price|amount|revenue|invoice/i);
  });

  it("computes rework rate as reworked / (completed + reworked), across scope", async () => {
    const account = await prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId, email: `tech-${SUFFIX}@example.com`, status: "ACTIVE" },
    });
    const technician = await prisma.staffUser.create({
      data: { accountId: account.id, tenantId, fullName: "Tech Test", role: "TECHNICIAN" },
    });

    const doneTask = await prisma.task.create({ data: { tenantId, workOrderId: (await makeWorkOrder()).id, title: "A", status: "DONE" } });
    await prisma.taskAssignment.create({ data: { tenantId, taskId: doneTask.id, staffUserId: technician.id } });

    const reworkTask = await prisma.task.create({
      data: { tenantId, workOrderId: (await makeWorkOrder()).id, title: "B", status: "RETURNED_FOR_REWORK" },
    });
    await prisma.taskAssignment.create({ data: { tenantId, taskId: reworkTask.id, staffUserId: technician.id } });

    const report = await people.build(tenantId, NO_SCOPE, {});
    const row = report.technicians.find((t) => t.staffUserId === technician.id);
    expect(row).toBeDefined();
    expect(row!.reworkRate).toBeCloseTo(50, 0);
  });

  it("counts diagnostic code activity from Fault.code within scope", async () => {
    const wo = await makeWorkOrder();
    await prisma.fault.create({
      data: { tenantId, workOrderId: wo.id, code: "P0128", description: "Thermostat", severity: "MEDIUM" },
    });

    const report = await people.build(tenantId, NO_SCOPE, {});
    expect(report.diagnosticCodeActivity.some((d) => d.code === "P0128")).toBe(true);
  });

  async function makeWorkOrder() {
    return prisma.workOrder.create({ data: { tenantId, branchId, assetId, customerId, status: "IN_PROGRESS" } });
  }
});
