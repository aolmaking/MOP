/**
 * Phase 15's exit bar: at least one real service card, one measurement
 * form, and one credential proven end-to-end (created as data, filled in
 * by a technician, stored, read back) against a seeded scenario
 * workshop. This tenant is seeded in the shape of Nafath (Cars) needing
 * an oil-change service card and Delta (Heavy Equipment) needing a
 * hydraulic diagnostic form, per docs/phases/PHASE_15.md's named cases.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { SpecializationService } from "./specialization.service";
import { CredentialService } from "./credential.service";
import { PositionTaxonomyService } from "./position-taxonomy.service";
import type { PrismaService } from "../runtime/database/prisma.service";

const prisma = new PrismaClient();
const specialization = new SpecializationService(prisma as unknown as PrismaService);
const credentials = new CredentialService(prisma as unknown as PrismaService);
const positions = new PositionTaxonomyService(prisma as unknown as PrismaService);

const SUFFIX = `spec-${Date.now()}`;
let planId: string;
let tenantId: string;
let technicianStaffId: string;

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
      name: "Nafath",
      maxBranches: 5,
      maxUsers: 50,
      maxWarehouses: 5,
      allowedCategories: ["CARS", "HEAVY_EQUIPMENT"],
      allowedModules: [],
      allowedFeatures: [],
      allowedReports: [],
      monthlyPrice: 0,
    },
  });
  planId = plan.id;

  const tenant = await prisma.tenant.create({
    data: {
      name: `Nafath ${SUFFIX}`,
      nameNormalized: `nafath ${SUFFIX}`,
      slug: `nafath-${SUFFIX}`,
      customerRegistrationCode: `NAF-${SUFFIX}`,
      status: "ACTIVE",
      planId,
      country: "SA",
      city: "Riyadh",
      businessType: "Garage",
      primaryCategory: "CARS",
      currency: "SAR",
      timezone: "Asia/Riyadh",
    },
  });
  tenantId = tenant.id;

  const acc = await account();
  const staff = await prisma.staffUser.create({
    data: { accountId: acc, tenantId, fullName: "Technician", role: "TECHNICIAN" },
  });
  technicianStaffId = staff.id;
}, 180_000);

afterAll(async () => {
  await prisma.specializationEntry.deleteMany({ where: { tenantId } });
  await prisma.specializationDefinition.deleteMany({ where: { tenantId } });
  await prisma.staffCredential.deleteMany({ where: { tenantId } });
  await prisma.credentialDefinition.deleteMany({ where: { tenantId } });
  await prisma.positionTaxonomyEntry.deleteMany({ where: { tenantId } });
  // `tenantId: null` rows are the platform default -- not scoped to this
  // tenant, so the query above never touches them. Postgres treats NULL
  // as distinct from NULL for uniqueness, so a leaked row here would
  // silently accumulate duplicates on every future run rather than erroring.
  await prisma.positionTaxonomyEntry.deleteMany({
    where: { tenantId: null, category: "CARS", code: { in: ["FL", "FR"] } },
  });
  await prisma.staffUser.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 180_000);

describe("service card -- Nafath's oil change", () => {
  it("is created, filled by a technician, and read back with real values", async () => {
    const definition = await specialization.defineCard(tenantId, "CARS", "SERVICE_CARD", "Oil Change", [
      { key: "viscosity", label: "Viscosity", type: "ENUM", enumOptions: ["5W-30", "5W-40", "10W-40"], required: true },
      { key: "litres", label: "Litres", type: "DECIMAL", unit: "L", required: true },
      { key: "filterType", label: "Filter type", type: "TEXT" },
    ]);

    expect(definition.version).toBe(1);

    const entry = await specialization.fillEntry(tenantId, definition.id, technicianStaffId, {
      viscosity: "5W-30",
      litres: 4.5,
      filterType: "Standard cartridge",
    });

    expect(entry.definitionVersion).toBe(1);
    expect(entry.values.viscosity).toBe("5W-30");

    const [readBack] = await specialization.entriesFor(tenantId, "");
    void readBack;
    const found = (await prisma.specializationEntry.findUnique({ where: { id: entry.id } }))!;
    expect(found.values).toEqual({ viscosity: "5W-30", litres: 4.5, filterType: "Standard cartridge" });
  });

  it("refuses a value outside the declared enum options", async () => {
    const definition = await specialization.defineCard(tenantId, "CARS", "SERVICE_CARD", "Oil Change Strict", [
      { key: "viscosity", label: "Viscosity", type: "ENUM", enumOptions: ["5W-30"], required: true },
    ]);

    await expect(
      specialization.fillEntry(tenantId, definition.id, technicianStaffId, { viscosity: "NOT-A-REAL-GRADE" }),
    ).rejects.toThrow();
  });

  it("refuses a missing required field", async () => {
    const definition = await specialization.defineCard(tenantId, "CARS", "SERVICE_CARD", "Oil Change Required", [
      { key: "litres", label: "Litres", type: "DECIMAL", required: true },
    ]);

    await expect(specialization.fillEntry(tenantId, definition.id, technicianStaffId, {})).rejects.toThrow();
  });

  it("pins the version an entry was filled against when the definition is later revised", async () => {
    const definition = await specialization.defineCard(tenantId, "CARS", "SERVICE_CARD", "Versioned Card", [
      { key: "note", label: "Note", type: "TEXT" },
    ]);

    const oldEntry = await specialization.fillEntry(tenantId, definition.id, technicianStaffId, { note: "before" });
    expect(oldEntry.definitionVersion).toBe(1);

    const revised = await specialization.reviseFields(definition.id, [
      { key: "note", label: "Note", type: "TEXT" },
      { key: "extra", label: "Extra", type: "TEXT", required: true },
    ]);
    expect(revised.version).toBe(2);

    // The old entry's stored version never changes -- it still means
    // what it meant when it was filled against version 1.
    const stillPinned = await prisma.specializationEntry.findUnique({ where: { id: oldEntry.id } });
    expect(stillPinned?.definitionVersion).toBe(1);
  });
});

describe("measurement form -- Delta's hydraulic diagnostic", () => {
  it("stores six real test points with units, filled by a technician", async () => {
    const definition = await specialization.defineCard(
      tenantId,
      "HEAVY_EQUIPMENT",
      "MEASUREMENT_FORM",
      "Hydraulic Pressure Diagnostic",
      [
        { key: "main_pump", label: "Main pump", type: "DECIMAL", unit: "bar", required: true },
        { key: "return_line", label: "Return line", type: "DECIMAL", unit: "bar", required: true },
        { key: "boom_cylinder", label: "Boom cylinder", type: "DECIMAL", unit: "bar", required: true },
        { key: "arm_cylinder", label: "Arm cylinder", type: "DECIMAL", unit: "bar", required: true },
        { key: "bucket_cylinder", label: "Bucket cylinder", type: "DECIMAL", unit: "bar", required: true },
        { key: "within_spec", label: "Within spec", type: "BOOLEAN", required: true },
      ],
    );

    expect(definition.fields).toHaveLength(6);

    const entry = await specialization.fillEntry(tenantId, definition.id, technicianStaffId, {
      main_pump: 210.5,
      return_line: 12.0,
      boom_cylinder: 180.0,
      arm_cylinder: 175.5,
      bucket_cylinder: 165.0,
      within_spec: true,
    });

    const stored = await prisma.specializationEntry.findUnique({ where: { id: entry.id } });
    expect(stored?.values).toMatchObject({ main_pump: 210.5, within_spec: true });
  });
});

describe("credential", () => {
  it("is defined, granted to a technician, and read back", async () => {
    const definition = await credentials.define(tenantId, "Hydraulic Systems Certified", "HEAVY_EQUIPMENT");

    const granted = await credentials.grant(tenantId, technicianStaffId, definition.id);
    expect(granted.isExpired).toBe(false);

    const held = await credentials.forTechnician(tenantId, technicianStaffId);
    expect(held.map((c) => c.name)).toContain("Hydraulic Systems Certified");
  });

  it("reports an expired credential as expired", async () => {
    const definition = await credentials.define(tenantId, "Lapsed Cert");
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const granted = await credentials.grant(tenantId, technicianStaffId, definition.id, past);
    expect(granted.isExpired).toBe(true);
  });
});

describe("position taxonomy", () => {
  it("falls back to the platform default when the workshop has no override", async () => {
    await prisma.positionTaxonomyEntry.createMany({
      data: [
        { tenantId: null, category: "CARS", code: "FL", label: "Front Left", sortOrder: 1 },
        { tenantId: null, category: "CARS", code: "FR", label: "Front Right", sortOrder: 2 },
      ],
    });

    const rows = await positions.forCategory(tenantId, "CARS");
    expect(rows.map((r) => r.code)).toEqual(["FL", "FR"]);
  });

  it("a workshop override replaces the platform list entirely, not merges with it", async () => {
    await prisma.positionTaxonomyEntry.create({
      data: { tenantId, category: "HEAVY_EQUIPMENT", code: "CYL-1", label: "Cylinder 1", sortOrder: 1 },
    });

    const rows = await positions.forCategory(tenantId, "HEAVY_EQUIPMENT");
    expect(rows.map((r) => r.code)).toEqual(["CYL-1"]);
  });
});
