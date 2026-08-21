/**
 * The capability change pipeline against a real database.
 *
 * Integration rather than unit, because everything interesting here is
 * database behaviour: real counts of in-flight records, the one-open-row
 * invariant, and whether the whole change lands atomically. A mocked
 * Prisma would prove none of it.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { CapabilityChangeService } from "./capability-change.service";
import { CapabilityResolutionService } from "./capability-resolution.service";
import { AuditService } from "../../audit/audit.service";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;

const resolution = new CapabilityResolutionService(asService);
const audit = new AuditService(asService);
const service = new CapabilityChangeService(asService, audit, resolution);

const ACTOR = { accountId: "platform-account", displayName: "Platform Admin", isPlatform: true };
const SUFFIX = `cap-${Date.now()}`;

let tenantId: string;
let planId: string;

async function seedTenant() {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Test Plan",
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
      name: `Capability Test ${SUFFIX}`,
      nameNormalized: `capability test ${SUFFIX}`,
      slug: `capability-test-${SUFFIX}`,
      customerRegistrationCode: `CAP-${SUFFIX}`,
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
}

beforeAll(async () => {
  await seedTenant();
}, 60_000);

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { tenantId } });
  await prisma.tenantCapability.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 60_000);

describe("CapabilityChangeService.preview", () => {
  it("reports no blockers for a coherent change", async () => {
    const preview = await service.preview(tenantId, [
      { capabilityKey: "TEAM_REVIEW", status: "DISABLED" },
    ]);

    expect(preview.blockers).toEqual([]);
    expect(preview.validation.valid).toBe(true);
  });

  it("blocks a change that would leave a dependent capability stranded", async () => {
    // PART_RETURNS depends on INVENTORY; removing only the dependency is
    // incoherent and must be refused rather than silently accepted.
    const preview = await service.preview(tenantId, [{ capabilityKey: "INVENTORY", status: "DISABLED" }]);

    expect(preview.blockers.length).toBeGreaterThan(0);
    expect(preview.blockers.join(" ")).toContain("INVENTORY");
  });

  it("reports the gates a change would drop", async () => {
    const preview = await service.preview(tenantId, [{ capabilityKey: "QC", status: "DISABLED" }]);

    expect(preview.droppedGates).toContain("qc.passed");
  });

  it("names the roles a change would orphan", async () => {
    const preview = await service.preview(tenantId, [
      { capabilityKey: "TEAM_REVIEW", status: "DISABLED" },
    ]);

    expect(preview.orphanedRoles).toContain("TEAM_LEADER");
  });

  it("counts real in-flight records the change would strand", async () => {
    // The number an operator actually needs: a configuration can be
    // structurally valid and still require moving live jobs.
    const branch = await prisma.branch.create({
      data: { tenantId, name: "Main", code: `MAIN-${SUFFIX}` },
    });
    const customer = await prisma.customer.create({
      data: { tenantId, fullName: "Test Customer", phone: "0100000000" },
    });
    const asset = await prisma.asset.create({
      data: { tenantId, category: "CARS", plateNumber: `T-${SUFFIX}` },
    });
    await prisma.workOrder.createMany({
      data: [
        { tenantId, branchId: branch.id, assetId: asset.id, customerId: customer.id, status: "READY_FOR_TEAM_REVIEW" },
        { tenantId, branchId: branch.id, assetId: asset.id, customerId: customer.id, status: "READY_FOR_TEAM_REVIEW" },
        { tenantId, branchId: branch.id, assetId: asset.id, customerId: customer.id, status: "IN_PROGRESS" },
      ],
    });

    const preview = await service.preview(tenantId, [{ capabilityKey: "TEAM_REVIEW", status: "DISABLED" }]);
    const affected = preview.affectedRecords.find((record) => record.entity === "WorkOrder");

    expect(affected?.count).toBe(2); // not the IN_PROGRESS one
    expect(affected?.states).toContain("READY_FOR_TEAM_REVIEW");

    await prisma.workOrder.deleteMany({ where: { tenantId } });
    await prisma.asset.deleteMany({ where: { tenantId } });
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.branch.deleteMany({ where: { tenantId } });
  }, 60_000);
});

describe("CapabilityChangeService.apply", () => {
  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.tenantCapability.deleteMany({ where: { tenantId } });
  });

  it("stores the new status and makes it resolve", async () => {
    await service.apply(tenantId, [{ capabilityKey: "QC", status: "DISABLED" }], ACTOR, "Workshop has no QC step");

    const profile = await resolution.resolveCurrent(tenantId);
    expect(profile.QC).toBe("DISABLED");
  }, 60_000);

  it("keeps exactly one open row per capability", async () => {
    // The invariant the resolver depends on: superseding closes the old
    // row and opens a new one, never leaving two open or none.
    await service.apply(tenantId, [{ capabilityKey: "QC", status: "DISABLED" }], ACTOR, "first");
    await service.apply(tenantId, [{ capabilityKey: "QC", status: "ENABLED" }], ACTOR, "second");

    const open = await prisma.tenantCapability.findMany({
      where: { tenantId, capabilityKey: "QC", effectiveTo: null },
    });
    const all = await prisma.tenantCapability.findMany({ where: { tenantId, capabilityKey: "QC" } });

    expect(open).toHaveLength(1);
    expect(open[0]?.status).toBe("ENABLED");
    expect(all).toHaveLength(2); // history preserved, not overwritten
  }, 60_000);

  it("lets history be read under the capabilities in force at the time", async () => {
    // A work order from the disabled period must not read as corrupt just
    // because the capability was later turned back on.
    await service.apply(tenantId, [{ capabilityKey: "QC", status: "DISABLED" }], ACTOR, "off");
    const whileDisabled = new Date();

    await new Promise((resolve) => setTimeout(resolve, 25));
    await service.apply(tenantId, [{ capabilityKey: "QC", status: "ENABLED" }], ACTOR, "back on");

    expect((await resolution.resolveAsOf(tenantId, whileDisabled)).QC).toBe("DISABLED");
    expect((await resolution.resolveCurrent(tenantId)).QC).toBe("ENABLED");
  }, 60_000);

  it("writes a HIGH-risk audit entry with before and after", async () => {
    await service.apply(tenantId, [{ capabilityKey: "QC", status: "DISABLED" }], ACTOR, "no QC step here");

    const entry = await prisma.auditLog.findFirst({
      where: { tenantId, action: "capability.changed" },
      orderBy: { createdAt: "desc" },
    });

    expect(entry).not.toBeNull();
    expect(entry?.riskLevel).toBe("HIGH");
    expect(entry?.reason).toBe("no QC step here");
    expect(entry?.actorType).toBe("PLATFORM");
  }, 60_000);

  it("refuses an incoherent change and writes nothing", async () => {
    await expect(
      service.apply(tenantId, [{ capabilityKey: "INVENTORY", status: "DISABLED" }], ACTOR, "break it"),
    ).rejects.toThrow();

    // Nothing partial: no capability row, no audit entry.
    expect(await prisma.tenantCapability.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { tenantId, action: "capability.changed" } })).toBe(0);
  }, 60_000);

  it("applies a multi-capability change atomically", async () => {
    await service.apply(
      tenantId,
      [
        { capabilityKey: "INVENTORY", status: "DISABLED" },
        { capabilityKey: "PART_RETURNS", status: "DISABLED" },
        { capabilityKey: "MULTI_WAREHOUSE", status: "DISABLED" },
      ],
      ACTOR,
      "workshop carries no stock",
    );

    const profile = await resolution.resolveCurrent(tenantId);
    expect(profile.INVENTORY).toBe("DISABLED");
    expect(profile.PART_RETURNS).toBe("DISABLED");
    expect(profile.MULTI_WAREHOUSE).toBe("DISABLED");
  }, 60_000);
});
