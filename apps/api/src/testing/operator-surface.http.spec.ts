/**
 * The operator's reception surface, over real HTTP against real Postgres.
 *
 * Two things this file exists to hold down, both of which every existing
 * operator test missed because it called the service directly:
 *
 * 1. AUTHORIZATION. The controller used to gate all fourteen routes with one
 *    hardcoded `Set` of four role names. Nothing below the controller ever saw
 *    a permission, so the eleven-layer resolver, the capability engine and the
 *    workshop's own delegation settings had no say in who could dispatch a
 *    repair. A service-level test cannot notice that, because it never passes
 *    through a controller.
 *
 * 2. BRANCH SCOPE. `overview` and `inspection-reports` filtered by the
 *    session's branch scope; the three per-work-order routes did not. So the
 *    list an operator was shown was scoped and the ids were not -- an operator
 *    at one branch could read another branch's inspection report, reprice its
 *    quote, and dispatch its repair, by holding an id the product itself hands
 *    out on other pages.
 *
 * The payload shapes below are the ones `apps/web`'s operator home sends. That
 * matters here too: both write endpoints returned 400 in a browser for months
 * while the service tests stayed green, because the DTO declared `notes` and
 * `tasksToCreate` where the page sends `note` and `tasks`, and the global pipe
 * runs with `forbidNonWhitelisted`.
 */
import { bootApp, expectCode, http, loginAs, LAUNCH_PROFILE, type BootedApp, type Session } from "./http-kit";
import { hashPassword } from "../identity/auth/password.util";

const SUFFIX = `op-${Date.now()}`;
const PLATFORM_PASSWORD = "platform-password-123";
const OWNER_PASSWORD = "owner-password-123";
const STAFF_PASSWORD = "staff-password-123";

describe("Operator surface (real HTTP, real Postgres)", () => {
  let booted: BootedApp;
  let platformEmail: string;
  let tenantId: string;
  let northBranchId: string;
  let southBranchId: string;
  let ownerEmail: string;

  let northOperator: Session;
  let technician: Session;
  let inspectingTechnicianStaffId: string;
  let ownerSession: Session;

  /** A job at a named branch, booked in the way the product books one in. */
  async function bookJobAt(branchId: string, plate: string): Promise<string> {
    const customer = await booted.prisma.customer.create({
      data: { tenantId, fullName: `Owner of ${plate}`, phone: `+2011${Date.now() % 100000000}` },
    });
    const asset = await booted.prisma.asset.create({
      data: { tenantId, category: "CARS", plateNumber: plate, currentOwnerCustomerId: customer.id },
    });
    const order = await booted.prisma.workOrder.create({
      data: { tenantId, branchId, customerId: customer.id, assetId: asset.id, status: "UNDER_INSPECTION" },
    });
    await booted.prisma.inspection.create({
      data: {
        tenantId,
        workOrderId: order.id,
        technicianId: inspectingTechnicianStaffId,
        type: "FULL",
        fields: {
          state: "SUBMITTED",
          inspectionReportSubmitted: true,
          findings: [{ id: "f1", description: "Brake pads worn", severity: "CRITICAL" }],
          parts: [{ sku: "BP-1", name: "Front brake pads", quantity: 2, unitPrice: 350 }],
          services: [{ serviceName: "Front brake service", laborPrice: 200 }],
          pricing: { partsTotal: 700, laborTotal: 200, grandTotal: 900 },
        },
      },
    });
    return order.id;
  }

  async function staffAt(role: string, name: string, branchScope: string[]): Promise<Session> {
    const email = `${role.toLowerCase()}-${name.replace(/\W/g, "")}-${SUFFIX}@mop.local`;
    const account = await booted.prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId,
        email,
        passwordHash: hashPassword(STAFF_PASSWORD),
        status: "ACTIVE",
      },
    });
    await booted.prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId,
        fullName: name,
        role: role as never,
        branchScope,
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });
    return loginAs(booted, email, STAFF_PASSWORD);
  }

  beforeAll(async () => {
    booted = await bootApp();

    const plan = await booted.prisma.plan.create({
      data: {
        code: `OPSURFACE-${SUFFIX}`,
        name: "Operator Surface Plan",
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

    ownerEmail = `owner-${SUFFIX}@mop.local`;
    const created = await http(booted)
      .post("/api/v1/platform/workshops")
      .set("Cookie", platformSession.cookie)
      .send({
        planId: plan.id,
        name: `Operator Surface Motors ${SUFFIX}`,
        slug: `operator-surface-${SUFFIX}`.toLowerCase(),
        country: "EG",
        city: "Cairo",
        businessType: "Franchise / Chain",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
        ownerFullName: "Operator Surface Owner",
        ownerEmail,
        ownerPhone: "+201234567891",
        starterBuilderTemplate: "MINIMAL",
        initialStatus: "ACTIVE",
        // Two branches, because one branch cannot demonstrate a scope leak.
        branches: [
          { name: "North Branch", code: "NORTH", city: "Cairo" },
          { name: "South Branch", code: "SOUTH", city: "Giza" },
        ],
        warehouses: [{ name: "Main Store", code: "STORE", branchCodes: ["NORTH", "SOUTH"] }],
        capabilities: LAUNCH_PROFILE,
      });
    expectCode(created, 201);
    tenantId = created.body.tenant.id;

    await http(booted)
      .post("/api/v1/auth/invite/accept")
      .send({ token: String(created.body.ownerInvitation.link).split("token=")[1], password: OWNER_PASSWORD });
    ownerSession = await loginAs(booted, ownerEmail, OWNER_PASSWORD);

    northBranchId = (await booted.prisma.branch.findFirstOrThrow({ where: { tenantId, code: "NORTH" } })).id;
    southBranchId = (await booted.prisma.branch.findFirstOrThrow({ where: { tenantId, code: "SOUTH" } })).id;

    northOperator = await staffAt("OPERATOR", "North Operator", [northBranchId]);
    technician = await staffAt("TECHNICIAN", "Any Technician", [northBranchId]);
    inspectingTechnicianStaffId = (
      await booted.prisma.staffUser.findFirstOrThrow({ where: { tenantId, role: "TECHNICIAN" }, select: { id: true } })
    ).id;
  }, 180_000);

  afterAll(async () => {
    if (tenantId) {
      await booted.prisma.task.deleteMany({ where: { tenantId } });
      await booted.prisma.fault.deleteMany({ where: { tenantId } });
      await booted.prisma.inspection.deleteMany({ where: { tenantId } });
      await booted.prisma.workOrderPartLine.deleteMany({ where: { tenantId } });
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
  }, 180_000);

  describe("branch scope reaches the ids, not only the lists", () => {
    it("an operator can open an inspection report at their own branch", async () => {
      const own = await bookJobAt(northBranchId, `NORTH-${Date.now() % 10000}`);
      const res = await http(booted)
        .get(`/api/v1/operator/work-orders/${own}/inspection-report`)
        .set("Cookie", northOperator.cookie);

      expectCode(res, 200);
      expect(res.body.workOrderId).toBe(own);
    });

    it("cannot open one at a branch they do not serve", async () => {
      const theirs = await bookJobAt(southBranchId, `SOUTH-${Date.now() % 10000}`);
      const res = await http(booted)
        .get(`/api/v1/operator/work-orders/${theirs}/inspection-report`)
        .set("Cookie", northOperator.cookie);

      // Not 403: a 403 would confirm the job exists, which hands the other
      // branch's workload back one id at a time.
      expectCode(res, 404, "work_order_not_found");
    });

    it("cannot reprice a quote at a branch they do not serve", async () => {
      const theirs = await bookJobAt(southBranchId, `SOUTHQ-${Date.now() % 10000}`);
      const res = await http(booted)
        .post(`/api/v1/operator/work-orders/${theirs}/update-quote`)
        .set("Cookie", northOperator.cookie)
        .send({ services: [{ serviceName: "Free of charge", laborPrice: 0 }], note: "not mine" });

      expectCode(res, 404, "work_order_not_found");

      const untouched = await booted.prisma.inspection.findFirstOrThrow({ where: { workOrderId: theirs } });
      expect((untouched.fields as Record<string, unknown>).pricing).toMatchObject({ grandTotal: 900 });
    });

    it("cannot dispatch a repair at a branch they do not serve", async () => {
      const theirs = await bookJobAt(southBranchId, `SOUTHD-${Date.now() % 10000}`);
      const res = await http(booted)
        .post(`/api/v1/operator/work-orders/${theirs}/approve-repair`)
        .set("Cookie", northOperator.cookie)
        .send({ approvedServiceIds: ["Front brake service"], operatorNote: "not mine" });

      expectCode(res, 404, "work_order_not_found");

      const order = await booted.prisma.workOrder.findFirstOrThrow({ where: { id: theirs } });
      expect(order.status).toBe("UNDER_INSPECTION");
      expect(await booted.prisma.task.count({ where: { workOrderId: theirs } })).toBe(0);
    });
  });

  describe("authorization comes from the permission, not from the role name", () => {
    it("a technician cannot dispatch a repair", async () => {
      const job = await bookJobAt(northBranchId, `TECH-${Date.now() % 10000}`);
      const res = await http(booted)
        .post(`/api/v1/operator/work-orders/${job}/approve-repair`)
        .set("Cookie", technician.cookie)
        .send({ approvedServiceIds: ["Front brake service"] });

      expectCode(res, 403, "forbidden");
    });

    it("the owner cannot dispatch a repair either, until it is delegated", async () => {
      // The old `Set` handed TENANT_OWNER every write on this surface.
      // default-role-permissions.ts says the opposite in as many words:
      // the owner gets read-only operational visibility, because "actually
      // working a Work Order is Branch Manager/Technician territory".
      const job = await bookJobAt(northBranchId, `OWNER-${Date.now() % 10000}`);
      const res = await http(booted)
        .post(`/api/v1/operator/work-orders/${job}/approve-repair`)
        .set("Cookie", ownerSession.cookie)
        .send({ approvedServiceIds: ["Front brake service"] });

      expectCode(res, 403, "forbidden");
    });

    it("the owner can still read the report -- the read key is one they hold", async () => {
      const job = await bookJobAt(northBranchId, `OWNERR-${Date.now() % 10000}`);
      const res = await http(booted)
        .get(`/api/v1/operator/work-orders/${job}/inspection-report`)
        .set("Cookie", ownerSession.cookie);

      expectCode(res, 200);
    });
  });

  describe("the two write endpoints accept what the page sends", () => {
    it("saves a quote sent in the operator page's own shape", async () => {
      const job = await bookJobAt(northBranchId, `QUOTE-${Date.now() % 10000}`);
      const res = await http(booted)
        .post(`/api/v1/operator/work-orders/${job}/update-quote`)
        .set("Cookie", northOperator.cookie)
        .send({
          findings: [{ id: "f1", description: "Brake pads worn", severity: "CRITICAL" }],
          parts: [{ sku: "BP-1", name: "Front brake pads", quantity: 2, unitPrice: 350 }],
          services: [{ serviceName: "Front brake service", laborPrice: 250 }],
          note: "Customer agreed at the counter",
        });

      // The exact request that used to come back
      // `400 property note should not exist`.
      expectCode(res, 201);

      const stored = await booted.prisma.inspection.findFirstOrThrow({ where: { workOrderId: job } });
      const fields = stored.fields as Record<string, any>;
      expect(fields.note).toBe("Customer agreed at the counter");
      expect(fields.pricing.laborTotal).toBe(250);
      // The key survives the round trip under the name both pages read.
      expect(fields.services[0].serviceName).toBe("Front brake service");
    });

    it("dispatches a repair sent in the operator page's own shape, and plans the named work", async () => {
      const job = await bookJobAt(northBranchId, `DISP-${Date.now() % 10000}`);
      const res = await http(booted)
        .post(`/api/v1/operator/work-orders/${job}/approve-repair`)
        .set("Cookie", northOperator.cookie)
        .send({
          approvedFindingIds: ["f1"],
          approvedPartIds: ["BP-1"],
          approvedServiceIds: ["Front brake service"],
          approvedFindings: [{ id: "f1", description: "Brake pads worn", severity: "CRITICAL" }],
          approvedServices: [{ serviceName: "Front brake service", laborPrice: 200 }],
          operatorNote: "Approved at the counter",
          tasks: [{ title: "Front brake service", estimatedMinutes: 60 }],
          note: "Quote approved. Dispatched to repair floor.",
        });

      // The exact request that used to come back
      // `400 property tasks should not exist`.
      expectCode(res, 201);

      const tasks = await booted.prisma.task.findMany({ where: { workOrderId: job }, select: { title: true } });
      // Not "Perform Vehicle Repair" -- the title the operator actually typed.
      expect(tasks.map((task) => task.title)).toEqual(["Front brake service"]);

      const order = await booted.prisma.workOrder.findFirstOrThrow({ where: { id: job } });
      expect(order.status).toBe(res.body.newStatus);
    });
  });
});
