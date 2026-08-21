/**
 * Phase 18's minimum bar: 18.A (stakeholder), 18.D (archive lifecycle,
 * two clocks never conflated), and 18.E (summary-only tenant group),
 * each proven end-to-end against a real database.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { TenantLifecycleService } from "./tenant-lifecycle.service";
import { TenantStakeholderService } from "./tenant-stakeholder.service";
import { TenantGroupService } from "./tenant-group.service";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const lifecycle = new TenantLifecycleService(prisma as unknown as PrismaService);
const stakeholders = new TenantStakeholderService(prisma as unknown as PrismaService);
const groups = new TenantGroupService(prisma as unknown as PrismaService);

const SUFFIX = `tr-${Date.now()}`;
let planId: string;
let tenantAId: string;
let tenantBId: string;
let stakeholderAccountId: string;

async function makeTenant(slug: string): Promise<string> {
  const tenant = await prisma.tenant.create({
    data: {
      name: `TR ${slug}`,
      nameNormalized: `tr ${slug}`,
      slug,
      customerRegistrationCode: slug.toUpperCase().slice(0, 20),
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
  return tenant.id;
}

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "TenantRelationships",
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

  tenantAId = await makeTenant(`tr-a-${SUFFIX}`);
  tenantBId = await makeTenant(`tr-b-${SUFFIX}`);

  const stakeholderAccount = await prisma.account.create({
    data: { accountType: "TENANT_STAFF", email: `stakeholder-${SUFFIX}@example.com`, status: "ACTIVE" },
  });
  stakeholderAccountId = stakeholderAccount.id;
}, 120_000);

afterAll(async () => {
  await prisma.tenantGroupMember.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await prisma.tenantGroup.deleteMany({ where: { createdById: "creator-1" } });
  await prisma.tenantStakeholder.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await prisma.account.deleteMany({ where: { id: stakeholderAccountId } });
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("18.A -- tenant stakeholder", () => {
  it("grants a narrow, explicit permission set, independent of any StaffRole", async () => {
    const grant = await stakeholders.grant(
      tenantAId,
      stakeholderAccountId,
      "Investor",
      ["finance.summary.view_only"],
      "owner-1",
    );

    expect(grant.isActive).toBe(true);
    expect(grant.permissions).toEqual(["finance.summary.view_only"]);

    const active = await stakeholders.activeGrantsFor(stakeholderAccountId);
    expect(active.map((g) => g.id)).toContain(grant.id);
  });

  it("a revoked grant no longer appears as active", async () => {
    const grant = await stakeholders.grant(tenantAId, stakeholderAccountId, "Temp Investor", ["finance.summary.view_only"], "owner-1");
    await stakeholders.revoke(grant.id);

    const active = await stakeholders.activeGrantsFor(stakeholderAccountId);
    expect(active.map((g) => g.id)).not.toContain(grant.id);

    const all = await stakeholders.listFor(tenantAId);
    const found = all.find((g) => g.id === grant.id);
    expect(found?.isActive).toBe(false);
  });
});

describe("18.D -- archive lifecycle, two clocks", () => {
  it("archiving sets both archivedAt and a retentionUntil years in the future", async () => {
    const result = await lifecycle.archive(tenantBId, 5);

    expect(result.status).toBe("ARCHIVED");
    expect(result.archivedAt).not.toBeNull();
    expect(result.retentionUntil).not.toBeNull();
    expect(new Date(result.retentionUntil!).getFullYear()).toBe(new Date().getFullYear() + 5);
  });

  it("refuses to archive an already-archived tenant", async () => {
    await expect(lifecycle.archive(tenantBId)).rejects.toThrow();
  });

  it("reactivating clears archivedAt but keeps retentionUntil as a retained legal fact", async () => {
    const before = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantBId } });
    const result = await lifecycle.reactivate(tenantBId);

    expect(result.status).toBe("READ_ONLY");
    expect(result.archivedAt).toBeNull();
    expect(result.retentionUntil).toBe(before.retentionUntil!.toISOString());
  });
});

describe("18.D -- archiving retains data (TenantStatusLayer's own unit tests cover the read-only enforcement)", () => {
  it("an archived tenant's row and name survive, untouched -- archiving is a status change, never a delete", async () => {
    const nameBefore = (await prisma.tenant.findUniqueOrThrow({ where: { id: tenantAId } })).name;

    await lifecycle.archive(tenantAId);
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantAId } });

    expect(tenant.status).toBe("ARCHIVED");
    expect(tenant.name).toBe(nameBefore);
  });
});

describe("18.E -- tenant group, summary-only", () => {
  it("aggregates open work orders per member tenant, never drilling into row-level detail", async () => {
    const group = await groups.create("Test Portfolio", "creator-1");
    await groups.addMember(group.id, tenantAId);
    await groups.addMember(group.id, tenantBId);

    const summary = await groups.summary(group.id);

    expect(summary).toHaveLength(2);
    expect(summary.every((row) => typeof row.openWorkOrders === "number")).toBe(true);
    // Summary-only: no field here carries a work order id, invoice, or
    // any row-level handle a caller could use to drill into one tenant.
    for (const row of summary) {
      expect(Object.keys(row)).toEqual(["tenantId", "tenantName", "openWorkOrders"]);
    }
  });
});
