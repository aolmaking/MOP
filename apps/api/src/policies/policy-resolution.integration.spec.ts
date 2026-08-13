/**
 * The policy resolution/apply pipeline against a real database.
 *
 * Integration rather than unit, because everything interesting here is
 * database behaviour: the "absent row means registry default" fallback,
 * the one-open-row invariant when a value changes, and whether history
 * resolves under the value that was actually in force at the time --
 * the same discipline capability-change.integration.spec.ts already
 * proves for TenantCapability, mirrored here for WorkshopPolicy.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { PolicyResolutionService } from "./policy-resolution.service";
import { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;

const audit = new AuditService(asService);
const policies = new PolicyResolutionService(asService, audit);

const ACTOR = { accountId: "platform-account", displayName: "Platform Admin", actorType: "PLATFORM" as const };
const SUFFIX = `pol-${Date.now()}`;

let tenantId: string;
let planId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Policy Test Plan",
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
      name: `Policy Test ${SUFFIX}`,
      nameNormalized: `policy test ${SUFFIX}`,
      slug: `policy-test-${SUFFIX}`,
      customerRegistrationCode: `POL-${SUFFIX}`,
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
  await prisma.workshopPolicy.deleteMany({ where: { tenantId } });
  await prisma.auditLog.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("resolveValue -- absent row falls back to the registry default", () => {
  it("returns TIME_TRACKING's declared default when the workshop has never set it", async () => {
    const value = await policies.resolveValue(tenantId, "TIME_TRACKING");
    expect(value).toBe("OPTIONAL");
  });

  it("refuses an unknown policy key rather than guessing", async () => {
    await expect(policies.resolveValue(tenantId, "NOT_A_REAL_POLICY")).rejects.toMatchObject({
      status: 404,
      response: { code: "unknown_policy" },
    });
  });
});

describe("set -- changes a workshop's policy value", () => {
  it("refuses a value that isn't one of the policy's declared options", async () => {
    await expect(
      policies.set(tenantId, "TIME_TRACKING", "SOMETIMES", ACTOR, "PLATFORM", "test"),
    ).rejects.toMatchObject({ status: 400, response: { code: "invalid_policy_value" } });
  });

  it("stores the new value and resolveValue reflects it", async () => {
    await policies.set(tenantId, "TIME_TRACKING", "REQUIRED", ACTOR, "PLATFORM", "This workshop bills by the hour.");

    const value = await policies.resolveValue(tenantId, "TIME_TRACKING");
    expect(value).toBe("REQUIRED");
  });

  it("keeps exactly one open row -- a second set() closes the first, never leaves two", async () => {
    await policies.set(tenantId, "TIME_TRACKING", "OFF", ACTOR, "PLATFORM", "Changed policy again.");

    const openRows = await prisma.workshopPolicy.findMany({
      where: { tenantId, policyKey: "TIME_TRACKING", effectiveTo: null },
    });
    expect(openRows).toHaveLength(1);
    expect(openRows[0]?.value).toBe("OFF");

    const allRows = await prisma.workshopPolicy.findMany({
      where: { tenantId, policyKey: "TIME_TRACKING" },
      orderBy: { effectiveFrom: "asc" },
    });
    // REQUIRED, then OFF -- both real rows, the first one closed.
    expect(allRows).toHaveLength(2);
    expect(allRows[0]?.effectiveTo).not.toBeNull();
    expect(allRows[1]?.effectiveTo).toBeNull();
  });

  it("writes an audit row for every change, at HIGH risk", async () => {
    const rows = await prisma.auditLog.findMany({
      where: { tenantId, action: "policy.changed" },
      orderBy: { createdAt: "asc" },
    });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => r.riskLevel === "HIGH")).toBe(true);
    expect(rows[rows.length - 1]?.after).toMatchObject({ policyKey: "TIME_TRACKING", value: "OFF" });
  });
});

describe("resolveValueAsOf -- history resolves under the value in force at the time", () => {
  it("reads REQUIRED for a moment between the two changes, not the current OFF", async () => {
    // The middle moment: after REQUIRED was set, before OFF replaced it.
    const rows = await prisma.workshopPolicy.findMany({
      where: { tenantId, policyKey: "TIME_TRACKING" },
      orderBy: { effectiveFrom: "asc" },
    });
    const midpoint = new Date(rows[0]!.effectiveFrom.getTime() + 1);

    const value = await policies.resolveValueAsOf(tenantId, "TIME_TRACKING", midpoint);
    expect(value).toBe("REQUIRED");
  });

  it("reads the registry default for a moment before the workshop ever set anything", async () => {
    const beforeAnySet = new Date(Date.now() - 60 * 60 * 1000 * 24 * 365);
    const value = await policies.resolveValueAsOf(tenantId, "TIME_TRACKING", beforeAnySet);
    expect(value).toBe("OPTIONAL");
  });
});

describe("resolveCurrent -- only explicit overrides, not the full registry", () => {
  it("does not include QC_MANDATORY, which this workshop never set", async () => {
    const current = await policies.resolveCurrent(tenantId);
    expect(current.has("TIME_TRACKING")).toBe(true);
    expect(current.has("QC_MANDATORY")).toBe(false);
  });
});
