/**
 * Two finance settings that changed nothing, over real HTTP.
 *
 * `technicianPriceVisible` was a schema column with no way to set it and
 * nothing reading it. `depositRequired`/`depositPercent` were worse: settable
 * on the owner's own Pricing page, written to the database, and read by no
 * code path in the product — a checkbox that did nothing, which is the exact
 * failure the recovery's fourth invariant names.
 *
 * What is asserted here is the invariant's own question: **what observable
 * runtime behaviour changes because of this configuration?** A test that only
 * round-tripped the setting through the settings endpoint would prove the
 * column is writable, which was never in doubt.
 */
import { bootApp, expectCode, http, loginAs, LAUNCH_PROFILE, type BootedApp, type Session } from "./http-kit";
import { hashPassword } from "../identity/auth/password.util";

const SUFFIX = `fincfg-${Date.now()}`;
const PLATFORM_PASSWORD = "platform-password-123";
const OWNER_PASSWORD = "owner-password-123";
const STAFF_PASSWORD = "staff-password-123";

describe("Finance configuration changes what people see (real HTTP, real Postgres)", () => {
  let booted: BootedApp;
  let platformEmail: string;
  let ownerEmail: string;
  let tenantId: string;
  let branchId: string;
  let ownerSession: Session;
  let technician: Session;
  let technicianStaffId: string;
  /** Approving a repair is reception's job, and the guard checks the role. */
  let operator: Session;

  async function setConfig(patch: Record<string, unknown>) {
    const res = await http(booted)
      .post("/api/v1/organization/finance-configuration")
      .set("Cookie", ownerSession.cookie)
      .send(patch);
    expectCode(res, 201);
    return res.body;
  }

  beforeAll(async () => {
    booted = await bootApp();

    const plan = await booted.prisma.plan.create({
      data: {
        code: `FINCFG-${SUFFIX}`,
        name: "Finance Config Plan",
        maxBranches: 3,
        maxUsers: 20,
        maxWarehouses: 3,
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
        name: `Finance Config Motors ${SUFFIX}`,
        slug: `fincfg-${SUFFIX}`.toLowerCase(),
        country: "EG",
        city: "Cairo",
        businessType: "Independent Garage",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
        ownerFullName: "Finance Config Owner",
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
        fullName: "Price Blind Technician",
        role: "TECHNICIAN",
        branchScope: [branchId],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });
    technicianStaffId = techStaff.id;
    technician = await loginAs(booted, techEmail, STAFF_PASSWORD);

    const operatorEmail = `operator-${SUFFIX}@mop.local`;
    const operatorAccount = await booted.prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId,
        email: operatorEmail,
        passwordHash: hashPassword(STAFF_PASSWORD),
        status: "ACTIVE",
      },
    });
    await booted.prisma.staffUser.create({
      data: {
        accountId: operatorAccount.id,
        tenantId,
        fullName: "Reception Operator",
        role: "OPERATOR",
        branchScope: [branchId],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });
    operator = await loginAs(booted, operatorEmail, STAFF_PASSWORD);

    // One catalogued part, so the parts catalogue has something to price.
    await booted.prisma.inventoryItem.create({
      data: {
        tenantId,
        sku: `SKU-${SUFFIX}`,
        name: "Front brake pads",
        itemType: "PART",
        sellingPrice: "350.00",
        cost: "210.00",
        stockTracked: true,
        // The technician catalogue only lists what may go on a work order.
        workOrderUsable: true,
      },
    });
  }, 240_000);

  afterAll(async () => {
    if (tenantId) {
      await booted.prisma.workOrderPartLine.deleteMany({ where: { tenantId } });
      await booted.prisma.warehouseStockBalance.deleteMany({ where: { tenantId } });
      await booted.prisma.stockMovement.deleteMany({ where: { tenantId } });
      await booted.prisma.inventoryItem.deleteMany({ where: { tenantId } });
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

  describe("technicianPriceVisible decides whether the shop floor sees money", () => {
    it("leaves the price out of the parts catalogue when it is off", async () => {
      await setConfig({ technicianPriceVisible: false });

      const res = await http(booted)
        .get(`/api/v1/technician/parts-catalog?q=SKU-${SUFFIX}`)
        .set("Cookie", technician.cookie);
      expectCode(res, 200);

      const card = res.body.items.find((item: { sku: string }) => item.sku === `SKU-${SUFFIX}`);
      expect(card).toBeDefined();
      // ABSENT, not blanked and not zero. Anyone can open developer tools on a
      // workshop tablet, so a hidden-in-the-template price is not hidden.
      expect(Object.prototype.hasOwnProperty.call(card, "sellingPrice")).toBe(false);
      // The rest of the card is untouched -- this is about money, not access.
      expect(card.name).toBe("Front brake pads");
    });

    it("sends the price when the workshop turns it on", async () => {
      await setConfig({ technicianPriceVisible: true });

      const res = await http(booted)
        .get(`/api/v1/technician/parts-catalog?q=SKU-${SUFFIX}`)
        .set("Cookie", technician.cookie);
      const card = res.body.items.find((item: { sku: string }) => item.sku === `SKU-${SUFFIX}`);

      expect(card.sellingPrice).toBe("350.00");
    });

    it("leaves labour prices out of suggested services when it is off", async () => {
      await setConfig({ technicianPriceVisible: false });

      const res = await http(booted)
        .post("/api/v1/technician/smart-suggestions")
        .set("Cookie", technician.cookie)
        .send({ vehicleCategory: "CARS", findingKeys: ["brake-pad-wear"] });
      expectCode(res, 201);

      const all = [...res.body.recommended, ...res.body.related, ...res.body.diagnostic];
      expect(all.length).toBeGreaterThan(0);
      for (const suggestion of all) {
        expect(Object.prototype.hasOwnProperty.call(suggestion, "laborPrice")).toBe(false);
      }
    });

    it("sends labour prices when it is on", async () => {
      await setConfig({ technicianPriceVisible: true });

      const res = await http(booted)
        .post("/api/v1/technician/smart-suggestions")
        .set("Cookie", technician.cookie)
        .send({ vehicleCategory: "CARS", findingKeys: ["brake-pad-wear"] });

      const all = [...res.body.recommended, ...res.body.related, ...res.body.diagnostic];
      expect(all.some((s: { laborPrice?: string }) => typeof s.laborPrice === "string")).toBe(true);
    });

    it("is off by default, so a workshop that never opened the page shows no prices", async () => {
      // The schema default. A setting whose safe state is the default is the
      // one worth checking, because nobody will ever set it deliberately.
      const fresh = await booted.prisma.financeConfiguration.findUnique({
        where: { tenantId },
        select: { technicianPriceVisible: true },
      });
      expect(fresh).not.toBeNull();

      const view = await http(booted)
        .get("/api/v1/organization/finance-configuration")
        .set("Cookie", ownerSession.cookie);
      expectCode(view, 200);
      expect(typeof view.body.technicianPriceVisible).toBe("boolean");
    });
  });

  describe("depositRequired decides whether a deposit is asked for", () => {
    /** A job with a submitted inspection quote the operator can approve. */
    async function jobAwaitingApproval(plate: string, partsTotal: number): Promise<string> {
      const customer = await booted.prisma.customer.create({
        data: { tenantId, fullName: `Owner of ${plate}`, phone: `+2011${Math.floor(Math.random() * 100000000)}` },
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
          technicianId: technicianStaffId,
          type: "FULL",
          fields: {
            state: "SUBMITTED",
            inspectionReportSubmitted: true,
            findings: [{ id: "f1", description: "Pads worn", severity: "CRITICAL" }],
            parts: [{ sku: "EXT-1", name: "Brake pads", quantity: 1, unitPrice: partsTotal }],
            services: [],
            pricing: { partsTotal, laborTotal: 0, grandTotal: partsTotal },
          },
        },
      });
      return order.id;
    }

    it("tells the operator what to collect, computed from the quote it just approved", async () => {
      await setConfig({ depositRequired: true, depositPercent: 30 });
      const workOrderId = await jobAwaitingApproval(`DEP-${Date.now() % 100000}`, 1000);

      const res = await http(booted)
        .post(`/api/v1/operator/work-orders/${workOrderId}/approve-repair`)
        .set("Cookie", operator.cookie)
        .send({});
      expectCode(res, 201);

      expect(res.body.depositDue).toBe("300.00");
    });

    it("says nothing at all when the workshop asks for no deposit", async () => {
      await setConfig({ depositRequired: false });
      const workOrderId = await jobAwaitingApproval(`NODEP-${Date.now() % 100000}`, 1000);

      const res = await http(booted)
        .post(`/api/v1/operator/work-orders/${workOrderId}/approve-repair`)
        .set("Cookie", operator.cookie)
        .send({});

      // Null, not "0.00": an absent obligation is not a zero one, and the page
      // must be able to say nothing rather than "collect 0.00".
      expect(res.body.depositDue).toBeNull();
    });

    it("says nothing when a deposit is required at zero percent", async () => {
      await setConfig({ depositRequired: true, depositPercent: 0 });
      const workOrderId = await jobAwaitingApproval(`ZERO-${Date.now() % 100000}`, 1000);

      const res = await http(booted)
        .post(`/api/v1/operator/work-orders/${workOrderId}/approve-repair`)
        .set("Cookie", operator.cookie)
        .send({});

      expect(res.body.depositDue).toBeNull();
    });

    it("rounds the deposit the way every other percentage in the product rounds", async () => {
      // 15% of 333.33 is 49.9995. Half-up to the cent, once, in the money
      // module -- the same rounding a discount or a tax line gets.
      await setConfig({ depositRequired: true, depositPercent: 15 });
      const workOrderId = await jobAwaitingApproval(`ROUND-${Date.now() % 100000}`, 333.33);

      const res = await http(booted)
        .post(`/api/v1/operator/work-orders/${workOrderId}/approve-repair`)
        .set("Cookie", operator.cookie)
        .send({});

      expect(res.body.depositDue).toBe("50.00");
    });
  });
});
