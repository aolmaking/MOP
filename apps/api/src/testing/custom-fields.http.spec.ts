/**
 * A custom field the owner defines is asked, checked and kept.
 *
 * Forms & Fields shipped as an authoring surface with no consumer. An owner
 * could define a field, list it, archive it and restore it; no page ever asked
 * it, no write path ever validated one, and no record ever held an answer.
 * `CustomFieldsService.validateValues` — the documented validation link in the
 * chain — had no caller anywhere in the product, and its own doc comment said
 * so, waiting for an inspection-recording page that has since been built.
 *
 * This is that chain, end to end and over real HTTP: define on the owner's
 * page, read on the technician's work card, submit with the inspection,
 * validated against the definition, stored on the record, and read back.
 */
import { bootApp, expectCode, http, loginAs, LAUNCH_PROFILE, type BootedApp, type Session } from "./http-kit";
import { hashPassword } from "../identity/auth/password.util";

const SUFFIX = `cfld-${Date.now()}`;
const PLATFORM_PASSWORD = "platform-password-123";
const OWNER_PASSWORD = "owner-password-123";
const STAFF_PASSWORD = "staff-password-123";

describe("Custom inspection fields (real HTTP, real Postgres)", () => {
  let booted: BootedApp;
  let platformEmail: string;
  let tenantId: string;
  let branchId: string;
  let ownerSession: Session;
  let technician: Session;
  let technicianStaffId: string;

  async function addField(body: Record<string, unknown>, formKey = "FULL_INSPECTION") {
    return http(booted)
      .post(`/api/v1/organization/forms/${formKey}`)
      .set("Cookie", ownerSession.cookie)
      .send(body);
  }

  /** A job under inspection, assigned to our technician. */
  async function jobUnderInspection(plate: string): Promise<string> {
    const customer = await booted.prisma.customer.create({
      data: { tenantId, fullName: `Owner of ${plate}`, phone: `+2011${Math.floor(Math.random() * 100000000)}` },
    });
    const asset = await booted.prisma.asset.create({
      data: { tenantId, category: "CARS", plateNumber: plate, currentOwnerCustomerId: customer.id },
    });
    const order = await booted.prisma.workOrder.create({
      data: { tenantId, branchId, customerId: customer.id, assetId: asset.id, status: "UNDER_INSPECTION" },
    });
    await booted.prisma.workOrderAssignment.create({
      data: { tenantId, workOrderId: order.id, staffUserId: technicianStaffId },
    });
    await booted.prisma.inspection.create({
      data: { tenantId, workOrderId: order.id, technicianId: technicianStaffId, type: "FULL", fields: {} },
    });
    return order.id;
  }

  function recordInspection(workOrderId: string, customFields: Record<string, unknown>) {
    return http(booted)
      .post(`/api/v1/technician/work-orders/${workOrderId}/inspection`)
      .set("Cookie", technician.cookie)
      .send({ type: "FULL", odometerOrHours: 84000, customFields });
  }

  beforeAll(async () => {
    booted = await bootApp();

    const plan = await booted.prisma.plan.create({
      data: {
        code: `CFLD-${SUFFIX}`,
        name: "Custom Fields Plan",
        maxBranches: 3,
        maxUsers: 20,
        maxWarehouses: 3,
        allowedCategories: ["CARS", "MOTORCYCLES"],
        allowedModules: [],
        allowedFeatures: [],
        allowedReports: [],
        monthlyPrice: 0,
      },
    });

    platformEmail = `platform-${SUFFIX}@mop.local`;
    await booted.prisma.account.create({
      data: {
        accountType: "PLATFORM",
        email: platformEmail,
        passwordHash: hashPassword(PLATFORM_PASSWORD),
        status: "ACTIVE",
      },
    });
    const platformSession = await loginAs(booted, platformEmail, PLATFORM_PASSWORD);

    const ownerEmail = `owner-${SUFFIX}@mop.local`;
    const created = await http(booted)
      .post("/api/v1/platform/workshops")
      .set("Cookie", platformSession.cookie)
      .send({
        planId: plan.id,
        name: `Custom Fields Motors ${SUFFIX}`,
        slug: `custom-fields-${SUFFIX}`.toLowerCase(),
        country: "EG",
        city: "Cairo",
        businessType: "Independent Garage",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
        ownerFullName: "Custom Fields Owner",
        ownerEmail,
        ownerPhone: "+201234567891",
        starterBuilderTemplate: "MINIMAL",
        initialStatus: "ACTIVE",
        branches: [{ name: "Main Branch", code: "MAIN", city: "Cairo" }],
        warehouses: [{ name: "Main Store", code: "STORE", branchCodes: ["MAIN"] }],
        capabilities: LAUNCH_PROFILE,
      });
    expectCode(created, 201);
    tenantId = created.body.tenant.id;

    await http(booted)
      .post("/api/v1/auth/invite/accept")
      .send({ token: String(created.body.ownerInvitation.link).split("token=")[1], password: OWNER_PASSWORD });
    ownerSession = await loginAs(booted, ownerEmail, OWNER_PASSWORD);

    branchId = (await booted.prisma.branch.findFirstOrThrow({ where: { tenantId, code: "MAIN" } })).id;

    const techEmail = `tech-${SUFFIX}@mop.local`;
    const techAccount = await booted.prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId,
        email: techEmail,
        passwordHash: hashPassword(STAFF_PASSWORD),
        status: "ACTIVE",
      },
    });
    const techStaff = await booted.prisma.staffUser.create({
      data: {
        accountId: techAccount.id,
        tenantId,
        fullName: "Custom Fields Technician",
        role: "TECHNICIAN",
        branchScope: [branchId],
        warehouseScope: [],
        categoryScope: ["CARS", "MOTORCYCLES"],
      },
    });
    technicianStaffId = techStaff.id;
    technician = await loginAs(booted, techEmail, STAFF_PASSWORD);
  }, 240_000);

  afterAll(async () => {
    if (tenantId) {
      await booted.prisma.customFieldDefinition.deleteMany({ where: { tenantId } });
      await booted.prisma.workOrderAssignment.deleteMany({ where: { tenantId } });
      await booted.prisma.fault.deleteMany({ where: { tenantId } });
      await booted.prisma.inspection.deleteMany({ where: { tenantId } });
      await booted.prisma.operationEvent.deleteMany({ where: { tenantId } });
      await booted.prisma.workOrder.deleteMany({ where: { tenantId } });
      await booted.prisma.assetOwnershipHistory.deleteMany({ where: { tenantId } });
      await booted.prisma.asset.deleteMany({ where: { tenantId } });
      await booted.prisma.customer.deleteMany({ where: { tenantId } });
      await booted.prisma.session.deleteMany({ where: { tenantId } });
      await booted.prisma.staffUser.deleteMany({ where: { tenantId } });
      await booted.prisma.account.deleteMany({ where: { tenantId } });
    }
    await booted.prisma.account.deleteMany({ where: { email: platformEmail } });
    await booted.close();
  }, 240_000);

  it("puts a defined field on the technician's card", async () => {
    const created = await addField({ label: "Coolant Colour", fieldType: "TEXT" });
    expectCode(created, 201);

    const card = await http(booted)
      .get(`/api/v1/technician/work-orders/${await jobUnderInspection(`CF1-${Date.now() % 100000}`)}`)
      .set("Cookie", technician.cookie);
    expectCode(card, 200);

    const field = card.body.customInspectionFields.find(
      (f: { fieldKey: string }) => f.fieldKey === "coolant_colour",
    );
    expect(field).toBeDefined();
    expect(field.label).toBe("Coolant Colour");
  });

  it("keeps the answer on the inspection record", async () => {
    await addField({ label: "Tyre Brand", fieldType: "TEXT" });
    const workOrderId = await jobUnderInspection(`CF2-${Date.now() % 100000}`);

    const recorded = await recordInspection(workOrderId, { tyre_brand: "Michelin" });
    expectCode(recorded, 201);

    // The database, not the response: this is the link that never existed.
    const row = await booted.prisma.inspection.findFirstOrThrow({
      where: { tenantId, workOrderId },
      orderBy: { startedAt: "desc" },
    });
    expect((row.fields as { customFields?: Record<string, unknown> }).customFields).toMatchObject({
      tyre_brand: "Michelin",
    });
  });

  it("reads the answer back onto the card", async () => {
    await addField({ label: "Wiper Condition", fieldType: "TEXT" });
    const workOrderId = await jobUnderInspection(`CF3-${Date.now() % 100000}`);
    expectCode(await recordInspection(workOrderId, { wiper_condition: "Streaking" }), 201);

    const card = await http(booted)
      .get(`/api/v1/technician/work-orders/${workOrderId}`)
      .set("Cookie", technician.cookie);

    expect(card.body.customInspectionValues).toMatchObject({ wiper_condition: "Streaking" });
  });

  it("refuses to record an inspection missing a required field", async () => {
    const created = await addField({ label: "Battery Voltage", fieldType: "NUMBER", required: true });
    expectCode(created, 201);
    const workOrderId = await jobUnderInspection(`CF4-${Date.now() % 100000}`);

    const refused = await recordInspection(workOrderId, {});

    expectCode(refused, 400, "field_required");
    // And nothing was written: a refused inspection is not a half-recorded one.
    const row = await booted.prisma.inspection.findFirstOrThrow({
      where: { tenantId, workOrderId },
      orderBy: { startedAt: "desc" },
    });
    expect(row.completedAt).toBeNull();
  });

  it("refuses a value that is not one of the options the owner offered", async () => {
    expectCode(
      await addField({
        label: "Coolant Type",
        fieldType: "SELECT",
        options: [
          { key: "long_life", label: "Long life" },
          { key: "standard", label: "Standard" },
        ],
      }),
      201,
    );
    const workOrderId = await jobUnderInspection(`CF5-${Date.now() % 100000}`);

    // A hand-built request, which is the only way this value could arrive.
    const refused = await recordInspection(workOrderId, {
      battery_voltage: 12.6,
      coolant_type: "whatever_the_client_sent",
    });

    expectCode(refused, 400, "invalid_field_value");
  });

  it("drops a key nobody defined rather than storing it forever", async () => {
    const workOrderId = await jobUnderInspection(`CF6-${Date.now() % 100000}`);

    expectCode(await recordInspection(workOrderId, { battery_voltage: 12.6, not_a_field: "junk" }), 201);

    const row = await booted.prisma.inspection.findFirstOrThrow({
      where: { tenantId, workOrderId },
      orderBy: { startedAt: "desc" },
    });
    const stored = (row.fields as { customFields?: Record<string, unknown> }).customFields ?? {};
    expect(stored).not.toHaveProperty("not_a_field");
    expect(stored).toHaveProperty("battery_voltage");
  });

  it("does not ask a car about a question the owner asked only of motorcycles", async () => {
    const created = await addField({
      label: "Chain Slack",
      fieldType: "TEXT",
      categoryScope: ["MOTORCYCLES"],
    });
    expectCode(created, 201);

    const card = await http(booted)
      .get(`/api/v1/technician/work-orders/${await jobUnderInspection(`CF7-${Date.now() % 100000}`)}`)
      .set("Cookie", technician.cookie);

    const keys = card.body.customInspectionFields.map((f: { fieldKey: string }) => f.fieldKey);
    expect(keys).not.toContain("chain_slack");
    expect(keys).toContain("coolant_colour");
  });

  it("stops asking an archived field", async () => {
    const created = await addField({ label: "Old Question", fieldType: "TEXT" });
    expectCode(created, 201);

    const archived = await http(booted)
      .patch(`/api/v1/organization/forms/fields/${created.body.id}/archived`)
      .set("Cookie", ownerSession.cookie)
      .send({ archived: true });
    expectCode(archived, 200);

    const card = await http(booted)
      .get(`/api/v1/technician/work-orders/${await jobUnderInspection(`CF8-${Date.now() % 100000}`)}`)
      .set("Cookie", technician.cookie);

    const keys = card.body.customInspectionFields.map((f: { fieldKey: string }) => f.fieldKey);
    expect(keys).not.toContain("old_question");
  });
});
