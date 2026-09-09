/**
 * Forms & Fields, against a real database. Includes the spec's own
 * worked example: adding "Battery Voltage" to Quick Inspection,
 * category-scoped, required, and validating a captured value against it.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { AuditService } from "../../audit/audit.service";
import { CustomFieldsService } from "./custom-fields.service";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const fields = new CustomFieldsService(asService, audit);

const SUFFIX = `cf-${Date.now()}`;
let tenantId: string;
let planId: string;
const actor = { accountId: "owner-account-id", displayName: "Test Owner" };

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "CF Test",
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
      name: `CF WS ${SUFFIX}`,
      nameNormalized: `cf ws ${SUFFIX}`,
      slug: `cf-ws-${SUFFIX}`,
      customerRegistrationCode: `CF-${SUFFIX}`,
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
  await prisma.customFieldDefinition.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("CustomFieldsService -- the spec's worked example", () => {
  it("adds Battery Voltage to Quick Inspection, category-scoped to Cars/Motorcycles, required", async () => {
    const field = await fields.addField(
      tenantId,
      "QUICK_INSPECTION",
      { label: "Battery Voltage", fieldType: "NUMBER", categoryScope: ["CARS", "MOTORCYCLES"], required: true },
      actor,
    );
    expect(field.fieldKey).toBe("battery_voltage");

    const form = await fields.list(tenantId, "QUICK_INSPECTION");
    expect(form.customFields.map((f) => f.fieldKey)).toContain("battery_voltage");
    // Core fields are reference-only, never editable here -- still present, just not the concern of this test.
    expect(form.coreFields.length).toBeGreaterThan(0);
  });

  it("refuses a duplicate field name on the same form", async () => {
    await fields.addField(tenantId, "FULL_INSPECTION", { label: "Supplier Note", fieldType: "TEXT" }, actor);
    await expect(
      fields.addField(tenantId, "FULL_INSPECTION", { label: "Supplier Note", fieldType: "TEXTAREA" }, actor),
    ).rejects.toMatchObject({ status: 409, response: { code: "field_key_taken" } });
  });

  it("validateValues enforces required-ness only for Cars/Motorcycles, never for Heavy Equipment", async () => {
    const validCars = await fields.validateValues(tenantId, "QUICK_INSPECTION", "CARS", { battery_voltage: 12.6 });
    expect(validCars).toEqual({ battery_voltage: 12.6 });

    await expect(fields.validateValues(tenantId, "QUICK_INSPECTION", "CARS", {})).rejects.toMatchObject({
      status: 400,
      response: { code: "field_required" },
    });

    // Heavy Equipment is out of this field's categoryScope -- not required, not even accepted.
    const heavyEquipment = await fields.validateValues(tenantId, "QUICK_INSPECTION", "HEAVY_EQUIPMENT", {});
    expect(heavyEquipment).toEqual({});
  });

  it("archiving removes a field from the live form but keeps it findable, and restore brings it back", async () => {
    const field = await fields.addField(tenantId, "QUICK_INSPECTION", { label: "Restocking Fee", fieldType: "NUMBER" }, actor);

    await fields.setArchived(tenantId, field.id, true, actor);
    let form = await fields.list(tenantId, "QUICK_INSPECTION");
    expect(form.customFields.find((f) => f.id === field.id)?.isArchived).toBe(true);

    // Archived fields are excluded from validation against new records --
    // the live form genuinely no longer collects them.
    const validated = await fields.validateValues(tenantId, "QUICK_INSPECTION", null, { restocking_fee: 10 });
    expect(validated).toEqual({});

    await fields.setArchived(tenantId, field.id, false, actor);
    form = await fields.list(tenantId, "QUICK_INSPECTION");
    expect(form.customFields.find((f) => f.id === field.id)?.isArchived).toBe(false);
  });
});

/**
 * The precondition that was missing for as long as this feature has existed.
 *
 * Eight of the nine forms write to models with no bucket for an extra value,
 * so a field added to them could be defined, listed, archived and restored --
 * and never filled in by anybody, because no page asked it and no column held
 * it. The definition was accepted in silence, which is how an owner discovers
 * months later that the field they built their intake around was never real.
 */
describe("a form that cannot hold an answer says so", () => {
  it("refuses a field on Customer Intake, and says why", async () => {
    await expect(
      fields.addField(tenantId, "CUSTOMER_INTAKE", { label: "Referred By", fieldType: "TEXT" }, actor),
    ).rejects.toMatchObject({ response: { code: "form_cannot_capture" } });
  });

  it("writes nothing when it refuses", async () => {
    await fields
      .addField(tenantId, "WORK_ORDER", { label: "Fleet Code", fieldType: "TEXT" }, actor)
      .catch(() => null);

    const form = await fields.list(tenantId, "WORK_ORDER");
    expect(form.customFields).toHaveLength(0);
  });

  it("tells the owner which forms accept fields, and why the others do not", async () => {
    const inspection = await fields.list(tenantId, "FULL_INSPECTION");
    const intake = await fields.list(tenantId, "CUSTOMER_INTAKE");

    expect(inspection.acceptsCustomFields).toBe(true);
    expect(inspection.captureNote).toBeUndefined();
    expect(intake.acceptsCustomFields).toBe(false);
    expect(intake.captureNote).toContain("nowhere to keep");
  });

  it("still accepts one on an inspection form", async () => {
    const field = await fields.addField(
      tenantId,
      "FULL_INSPECTION",
      { label: "Coolant Colour", fieldType: "TEXT" },
      actor,
    );

    expect(field.fieldKey).toBe("coolant_colour");
  });
});
