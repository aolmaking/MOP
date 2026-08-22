/**
 * E14 (`docs/scenarios3/EDGE_CASE_REGISTER.md`): two opposite platform
 * actions -- freeze and reactivate -- racing the same tenant.
 *
 * `WorkshopsService.freeze()`/`reactivate()`'s own equality check only
 * catches a caller whose target already matches what it read. Starting
 * from a THIRD status (e.g. SUSPENDED), a concurrent freeze (targeting
 * FROZEN) and a concurrent reactivate (targeting ACTIVE) both pass that
 * check, so what actually decides the outcome is whether the write
 * underneath is conditional on the status just read.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { WorkshopsService } from "./workshops.service";
import { WorkshopHealthService } from "./workshop-health.service";
import { AuditService } from "../../../audit/audit.service";
import { TenantEntitlementsService } from "../../entitlements/tenant-entitlements.service";
import type { PrismaService } from "../../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const workshops = new WorkshopsService(asService, audit, new WorkshopHealthService(), new TenantEntitlementsService(asService, audit));

const ACTOR = { accountId: "platform-1", displayName: "Platform Admin" };
const SUFFIX = `wsrace-${Date.now()}`;

let planId: string;

async function suspendedTenant(): Promise<string> {
  const tenant = await prisma.tenant.create({
    data: {
      name: `Race WS ${SUFFIX}-${Math.random()}`,
      nameNormalized: `race ws ${SUFFIX}-${Math.random()}`,
      slug: `race-ws-${SUFFIX}-${Math.random().toString(36).slice(2)}`,
      customerRegistrationCode: `RW-${SUFFIX}-${Math.random().toString(36).slice(2, 8)}`,
      status: "SUSPENDED",
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
      name: "Race",
      maxBranches: 5,
      maxUsers: 20,
      maxWarehouses: 5,
      allowedCategories: ["CARS"],
      allowedModules: [],
      allowedFeatures: [],
      allowedReports: [],
      monthlyPrice: 0,
    },
  });
  planId = plan.id;
}, 120_000);

afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { planId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("E14 -- freeze and reactivate racing the same tenant", () => {
  it("from a third starting status, exactly one of two opposite actions wins -- never a silently overwritten result", async () => {
    const tenantId = await suspendedTenant();

    const results = await Promise.allSettled([
      workshops.freeze(tenantId, "Compliance review pending", ACTOR),
      workshops.reactivate(tenantId, "Payment received, restore access", ACTOR),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly one action actually applied; the other must get a real
    // conflict, not silently appear to succeed while being overwritten.
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      status: 409,
      response: { code: "concurrent_status_change" },
    });

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    expect(["FROZEN", "ACTIVE"]).toContain(tenant.status);

    // Exactly one audit row -- the loser's action never happened, so it
    // must not be recorded as though it had.
    const auditRows = await prisma.auditLog.findMany({
      where: { tenantId, action: { in: ["platform.workshop.frozen", "platform.workshop.reactivated"] } },
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]?.after).toEqual({ status: tenant.status });
  });
});
