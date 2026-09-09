/**
 * The checkpoints a technician is asked to inspect belong to the vehicle in
 * front of them.
 *
 * They did not. `DEFAULT_SUBSYSTEMS` — a car list, with "A/C & Climate",
 * "Transmission" and "Suspension & Steering" on it — was the only list the
 * work card had ever built its checkpoint grid from, for every job of every
 * category. A motorcycle arrived and its technician was asked to inspect its
 * air conditioning. A wheel loader got the same list.
 *
 * The master catalogue has carried real per-category checkpoint definitions
 * all along — `GET /technician/inspection-checkpoints` serves them, and that
 * route had no caller anywhere in the product. This is the work card reading
 * them.
 */
import { bootApp, expectCode, http, loginAs, LAUNCH_PROFILE, type BootedApp, type Session } from "./http-kit";
import { hashPassword } from "../identity/auth/password.util";

const SUFFIX = `chk-${Date.now()}`;
const PLATFORM_PASSWORD = "platform-password-123";
const OWNER_PASSWORD = "owner-password-123";
const STAFF_PASSWORD = "staff-password-123";

describe("Inspection checkpoints follow the vehicle (real HTTP, real Postgres)", () => {
  let booted: BootedApp;
  let platformEmail: string;
  let tenantId: string;
  let branchId: string;
  let technician: Session;
  let technicianStaffId: string;

  /** A job on a vehicle of the given category, assigned to our technician. */
  async function jobOn(category: "CARS" | "MOTORCYCLES" | "HEAVY_EQUIPMENT", identifier: string): Promise<string> {
    const customer = await booted.prisma.customer.create({
      data: { tenantId, fullName: `Owner of ${identifier}`, phone: `+2011${Math.floor(Math.random() * 100000000)}` },
    });
    const asset = await booted.prisma.asset.create({
      data: {
        tenantId,
        category,
        // A motorcycle and a loader are identified the way each really is.
        ...(category === "CARS" ? { plateNumber: identifier } : { serialNumber: identifier }),
        currentOwnerCustomerId: customer.id,
      },
    });
    const order = await booted.prisma.workOrder.create({
      data: { tenantId, branchId, customerId: customer.id, assetId: asset.id, status: "UNDER_INSPECTION" },
    });
    await booted.prisma.workOrderAssignment.create({
      data: { tenantId, workOrderId: order.id, staffUserId: technicianStaffId },
    });
    return order.id;
  }

  async function checkpointsFor(workOrderId: string): Promise<{ nameEn: string; nameAr: string | null }[]> {
    const res = await http(booted)
      .get(`/api/v1/technician/work-orders/${workOrderId}`)
      .set("Cookie", technician.cookie);
    expectCode(res, 200);
    return res.body.inspectionBoxes;
  }

  beforeAll(async () => {
    booted = await bootApp();

    const plan = await booted.prisma.plan.create({
      data: {
        code: `CHK-${SUFFIX}`,
        name: "Mixed Fleet Plan",
        maxBranches: 3,
        maxUsers: 20,
        maxWarehouses: 3,
        // A workshop that takes bikes and machines as well as cars, which is
        // the whole reason a category-blind checkpoint list is a defect.
        allowedCategories: ["CARS", "MOTORCYCLES", "HEAVY_EQUIPMENT"],
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
        name: `Mixed Fleet Motors ${SUFFIX}`,
        slug: `mixed-fleet-${SUFFIX}`.toLowerCase(),
        country: "EG",
        city: "Cairo",
        businessType: "Independent Garage",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
        ownerFullName: "Mixed Fleet Owner",
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
        fullName: "Mixed Fleet Technician",
        role: "TECHNICIAN",
        branchScope: [branchId],
        warehouseScope: [],
        categoryScope: ["CARS", "MOTORCYCLES", "HEAVY_EQUIPMENT"],
      },
    });
    technicianStaffId = techStaff.id;
    technician = await loginAs(booted, techEmail, STAFF_PASSWORD);
  }, 240_000);

  afterAll(async () => {
    if (tenantId) {
      await booted.prisma.workOrderAssignment.deleteMany({ where: { tenantId } });
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

  it("asks a car technician about the car's systems", async () => {
    const boxes = await checkpointsFor(await jobOn("CARS", `CAR-${Date.now() % 100000}`));

    const names = boxes.map((box) => box.nameEn);
    expect(names).toContain("A/C & Climate");
    // And the car list keeps its Arabic, which is the reason it stays the
    // source for cars rather than being replaced by the master catalogue.
    expect(boxes.every((box) => typeof box.nameAr === "string" && box.nameAr.length > 0)).toBe(true);
  });

  it("does not ask a motorcycle technician about air conditioning", async () => {
    const boxes = await checkpointsFor(await jobOn("MOTORCYCLES", `BIKE-${Date.now() % 100000}`));

    const names = boxes.map((box) => box.nameEn);
    expect(names.length).toBeGreaterThan(0);
    expect(names).not.toContain("A/C & Climate");
    expect(names).not.toContain("Transmission");
  });

  it("asks a motorcycle technician about the chain and sprockets", async () => {
    const boxes = await checkpointsFor(await jobOn("MOTORCYCLES", `BIKE2-${Date.now() % 100000}`));

    const names = boxes.map((box) => box.nameEn);
    expect(names.some((name) => name.toLowerCase().includes("chain"))).toBe(true);
  });

  it("says the Arabic label is missing rather than repeating the English one", async () => {
    // A bilingual shop floor reads the Arabic. A label that claims to be
    // Arabic and is actually the English title is worse than a visible gap.
    const boxes = await checkpointsFor(await jobOn("MOTORCYCLES", `BIKE3-${Date.now() % 100000}`));

    expect(boxes.every((box) => box.nameAr === null)).toBe(true);
  });

  it("gives heavy equipment its own list, not the motorcycle one", async () => {
    const bike = await checkpointsFor(await jobOn("MOTORCYCLES", `BIKE4-${Date.now() % 100000}`));
    const loader = await checkpointsFor(await jobOn("HEAVY_EQUIPMENT", `LOADER-${Date.now() % 100000}`));

    expect(loader.length).toBeGreaterThan(0);
    expect(loader.map((box) => box.nameEn)).not.toEqual(bike.map((box) => box.nameEn));
  });

  it("carries the checkpoint's own targets as what to look at", async () => {
    // The car list carries symptom prompts; the master list carries the
    // targets a checkpoint covers, which is the same job on that screen.
    const res = await http(booted)
      .get(`/api/v1/technician/work-orders/${await jobOn("MOTORCYCLES", `BIKE5-${Date.now() % 100000}`)}`)
      .set("Cookie", technician.cookie);

    const withTargets = res.body.inspectionBoxes.find(
      (box: { symptoms: string[] }) => box.symptoms && box.symptoms.length > 0,
    );
    expect(withTargets).toBeDefined();
  });
});
