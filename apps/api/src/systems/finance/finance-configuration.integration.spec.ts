/**
 * Pricing & Financial Configuration, against a real database.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { AuditService } from "../../audit/audit.service";
import { FinanceConfigurationService } from "./finance-configuration.service";
import { PriceCatalogService } from "./price-catalog.service";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const config = new FinanceConfigurationService(asService, audit);
const catalog = new PriceCatalogService(asService, audit);

const SUFFIX = `fin-${Date.now()}`;
let tenantId: string;
let planId: string;
const actor = { accountId: "owner-account-id", displayName: "Test Owner" };

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Fin Test",
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
      name: `Fin WS ${SUFFIX}`,
      nameNormalized: `fin ws ${SUFFIX}`,
      slug: `fin-ws-${SUFFIX}`,
      customerRegistrationCode: `FIN-${SUFFIX}`,
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
  await prisma.priceCatalogEntry.deleteMany({ where: { tenantId } });
  await prisma.financeConfiguration.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("FinanceConfigurationService", () => {
  it("get() upserts a real row with this tenant's own currency, not a hardcoded one", async () => {
    const view = await config.get(tenantId);
    expect(view.currency).toBe("EGP");
    expect(view.allowUnpaidDelivery).toBe(false);
  });

  it("update() is what gate-evaluator.service.ts and decision.service.ts actually read afterward", async () => {
    const updated = await config.update(
      tenantId,
      { allowUnpaidDelivery: true, maxDiscountPercent: 20, discountApprovalThreshold: 500 },
      actor,
    );
    expect(updated.allowUnpaidDelivery).toBe(true);

    const raw = await prisma.financeConfiguration.findUniqueOrThrow({ where: { tenantId } });
    expect(raw.allowUnpaidDelivery).toBe(true);
    expect(Number(raw.discountApprovalThreshold)).toBe(500);
  });

  it("refuses a branch discount ceiling above the workshop-wide ceiling", async () => {
    await expect(
      config.update(tenantId, { maxDiscountPercent: 10, maxBranchDiscountPercent: 25 }, actor),
    ).rejects.toMatchObject({ status: 400, response: { code: "branch_ceiling_exceeds_workshop_ceiling" } });
  });
});

describe("PriceCatalogService -- effective-dated, never a retroactive rewrite", () => {
  it("setPrice closes the previous open row and opens a new one, both readable", async () => {
    const v1 = await catalog.setPrice(tenantId, { itemKey: "oil-change", itemType: "SERVICE", unitPrice: 100 }, actor);

    const v2 = await catalog.setPrice(tenantId, { itemKey: "oil-change", itemType: "SERVICE", unitPrice: 120 }, actor);
    expect(v2.unitPrice).toBe("120");

    const closed = await prisma.priceCatalogEntry.findUniqueOrThrow({ where: { id: v1.id } });
    expect(closed.effectiveTo).not.toBeNull();

    const list = await catalog.list(tenantId);
    const current = list.find((i) => i.itemKey === "oil-change");
    expect(current?.id).toBe(v2.id);
    expect(current?.unitPrice).toBe("120");
  });
});
