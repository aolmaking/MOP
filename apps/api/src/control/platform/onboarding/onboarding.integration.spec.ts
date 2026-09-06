/**
 * Three materially different workshops, created through the real HTTP
 * stack against real Postgres -- and then *entered*, to prove the
 * resulting workshop is the one that was configured.
 *
 * The acceptance test this file exists for is not "the request returned
 * 201". It is:
 *
 *   configure -> validate -> publish -> read the tenant back
 *   -> assert its capabilities, policies, structure, permissions,
 *      specialization library and *runtime gate behaviour* match
 *
 * Before this pass, workshop creation wrote a Tenant, a configuration
 * blob, an owner and a permission baseline -- and nothing else. Every
 * workshop the product had ever created was implicitly the full
 * twelve-capability product with no policies and no structure, whatever
 * the operator had been shown. These tests are what stop that returning.
 */
process.env.DATABASE_URL ??=
  "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { PrismaClient } from "@mop/database";
import { AuthModule } from "../../../identity/auth/auth.module";
import { PlatformModule } from "../platform.module";
import { DatabaseModule } from "../../../runtime/database/database.module";
import { PrismaService } from "../../../runtime/database/prisma.service";
import { ApiExceptionFilter } from "../../../runtime/http/filters/api-exception.filter";
import { validationExceptionFactory } from "../../../runtime/http/validation/validation-exception-factory";
import { hashPassword } from "../../../identity/auth/password.util";

describe("Workshop onboarding (integration, real HTTP, real Postgres)", () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let cookie: string;
  let smallPlanId: string;
  let networkPlanId: string;
  let platformEmail: string;
  const suffix = `onb-${Date.now()}`;
  const tenantIds: string[] = [];

  beforeAll(async () => {
    const [small, network] = await Promise.all([
      prisma.plan.create({
        data: {
          code: `ONB-SMALL-${suffix}`,
          name: "Single Bay",
          maxBranches: 1,
          maxUsers: 5,
          maxWarehouses: 1,
          allowedCategories: ["CARS", "MOTORCYCLES", "HEAVY_EQUIPMENT"],
          allowedModules: [],
          allowedFeatures: [],
          allowedReports: [],
          monthlyPrice: 0,
        },
      }),
      prisma.plan.create({
        data: {
          code: `ONB-NETWORK-${suffix}`,
          name: "Network",
          maxBranches: 12,
          maxUsers: 200,
          maxWarehouses: 12,
          allowedCategories: ["CARS", "MOTORCYCLES", "HEAVY_EQUIPMENT"],
          allowedModules: [],
          allowedFeatures: [],
          allowedReports: [],
          monthlyPrice: 0,
        },
      }),
    ]);
    smallPlanId = small.id;
    networkPlanId = network.id;

    platformEmail = `platform-${suffix}@example.com`;
    await prisma.account.create({
      data: {
        accountType: "PLATFORM",
        email: platformEmail,
        passwordHash: hashPassword("platform-password-123"),
        status: "ACTIVE",
      },
    });

    const moduleRef = await Test.createTestingModule({ imports: [DatabaseModule, AuthModule, PlatformModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    await app.init();

    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: platformEmail, password: "platform-password-123" });
    cookie = (login.headers["set-cookie"] as unknown as string[]).map((c) => c.split(";")[0]).join("; ");
  });

  afterAll(async () => {
    await app.close();
    if (tenantIds.length > 0) {
      const where = { tenantId: { in: tenantIds } };
      await prisma.auditLog.deleteMany({ where });
      await prisma.priceCatalogEntry.deleteMany({ where });
      await prisma.specializationDefinition.deleteMany({ where });
      await prisma.branchWarehouseAccess.deleteMany({ where });
      await prisma.warehouse.deleteMany({ where });
      await prisma.branch.deleteMany({ where });
      await prisma.tenantConfigurationVersion.deleteMany({ where });
      await prisma.workshopPolicy.deleteMany({ where });
      await prisma.tenantCapability.deleteMany({ where });
      await prisma.financeConfiguration.deleteMany({ where });
      await prisma.rolePage.deleteMany({ where });
      await prisma.rolePermission.deleteMany({ where });
      await prisma.tenantConfiguration.deleteMany({ where });
      await prisma.staffUser.deleteMany({ where });
      await prisma.account.deleteMany({ where });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
    await prisma.account.deleteMany({ where: { accountType: "PLATFORM", email: platformEmail } });
    await prisma.plan.deleteMany({ where: { id: { in: [smallPlanId, networkPlanId] } } });
    await prisma.$disconnect();
  });

  function post(path: string, body: Record<string, unknown>) {
    return request(app.getHttpServer()).post(`/api/v1${path}`).set("Cookie", cookie).send(body);
  }

  async function create(payload: Record<string, unknown>) {
    const res = await post("/platform/workshops", payload);
    if (res.status === 201) tenantIds.push(res.body.tenant.id);
    return res;
  }

  // -------------------------------------------------------------------
  // The blueprint the whole experience is built from
  // -------------------------------------------------------------------

  describe("the blueprint", () => {
    it("serves every capability with copy, derived consequences and its real gate words", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/platform/onboarding/blueprint")
        .set("Cookie", cookie);

      expect(res.status).toBe(200);
      expect(res.body.capabilities.length).toBe(12);

      const inventory = res.body.capabilities.find((c: { key: string }) => c.key === "INVENTORY");
      expect(inventory.title).toBe("Parts and stock");
      expect(inventory.consequence.requiredBy.sort()).toEqual(["MULTI_WAREHOUSE", "PART_RETURNS"]);
      expect(inventory.consequence.policiesLostWithout).toContain("PARTS_SEPARATION_OF_DUTIES");
      // The gate's own words, not a paraphrase written for this screen.
      expect(inventory.gateWords[0].blocked).toBe("A received part is neither marked used nor returned.");
    });

    it("serves every policy with its default, its written reason, and whether it is live today", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/platform/onboarding/blueprint")
        .set("Cookie", cookie);

      const delivery = res.body.policies.find((p: { key: string }) => p.key === "DELIVERY_BLOCKED_UNTIL_PAID");
      expect(delivery.default).toBe("NEVER");
      expect(delivery.defaultReason).toContain("same-day operational emergency");
      expect(delivery.enforcement.status).toBe("ENFORCED");
      expect(delivery.group).toBe("MONEY");

      // Every registered policy is ENFORCED now -- see
      // packages/shared/src/policies/validator.spec.ts for the exhaustive
      // list this blueprint's own numbers must agree with.
      const weight = res.body.policies.find((p: { key: string }) => p.key === "APPROVAL_WEIGHT");
      expect(weight.enforcement.status).toBe("ENFORCED");
    });

    it("serves real countries with the currency, timezone and weekend each implies", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/platform/onboarding/blueprint")
        .set("Cookie", cookie);

      const saudi = res.body.countries.find((c: { code: string }) => c.code === "SA");
      expect(saudi).toEqual({ code: "SA", name: "Saudi Arabia", currency: "SAR", timezone: "Asia/Riyadh", weekend: "FRI_SAT" });
    });

    it("requires a platform session", async () => {
      const res = await request(app.getHttpServer()).get("/api/v1/platform/onboarding/blueprint");
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------
  // Workshop A -- one bay, no stock, no supervision, money outside MOP
  // -------------------------------------------------------------------

  describe("Workshop A — single-bay quick service", () => {
    const slug = `a-quick-${suffix}`;
    let tenantId: string;

    it("is created with the shape it was configured with", async () => {
      const res = await create({
        planId: smallPlanId,
        name: `A Quick Service ${suffix}`,
        slug,
        country: "EG",
        city: "Cairo",
        businessType: "Independent Garage",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
        ownerFullName: "Sara Hassan",
        ownerEmail: `a-owner-${suffix}@example.com`,
        ownerPhone: "+201234567890",
        starterBuilderTemplate: "MINIMAL",
        initialStatus: "ACTIVE",
        capabilities: {
          MULTI_BRANCH: "DISABLED",
          MULTI_WAREHOUSE: "DISABLED",
          INVENTORY: "DISABLED",
          PART_RETURNS: "DISABLED",
          TEAMS: "DISABLED",
          TEAM_REVIEW: "DISABLED",
          QC: "DISABLED",
        },
        policies: { TIME_TRACKING: "OFF" },
        specializationPacks: ["QUICK_SERVICE"],
        branches: [{ name: "The bay", code: "BAY", city: "Cairo" }],
        services: [{ name: "Oil change", price: "45000" }],
      });

      expect(res.status).toBe(201);
      tenantId = res.body.tenant.id;

      // Every step reported is a step that really happened, with the
      // count of rows it really wrote.
      const steps = res.body.steps as { key: string; count: number }[];
      expect(steps.map((s) => s.key)).toEqual([
        "TENANT",
        "CONFIGURATION",
        "CAPABILITIES",
        "POLICIES",
        "FINANCE",
        "OWNER",
        "PERMISSIONS",
        "RESPONSIBILITY",
        "STRUCTURE",
        "SPECIALIZATION",
        "SERVICES",
        "VERSION",
        "AUDIT",
      ]);
      expect(steps.find((s) => s.key === "CAPABILITIES")!.count).toBe(7);
    });

    it("has exactly the capabilities that were switched off, and no row for the rest", async () => {
      const rows = await prisma.tenantCapability.findMany({
        where: { tenantId, effectiveTo: null },
        select: { capabilityKey: true, status: true, source: true },
      });

      expect(rows.map((r) => r.capabilityKey).sort()).toEqual([
        "INVENTORY",
        "MULTI_BRANCH",
        "MULTI_WAREHOUSE",
        "PART_RETURNS",
        "QC",
        "TEAMS",
        "TEAM_REVIEW",
      ]);
      expect(rows.every((r) => r.status === "DISABLED")).toBe(true);
      expect(rows.every((r) => r.source === "PLATFORM")).toBe(true);
      // An untouched capability gets no row: absent means enabled, and a
      // stored ENABLED row would look like a decision nobody made.
      expect(rows.find((r) => r.capabilityKey === "FINANCE_CORE")).toBeUndefined();
    });

    it("stores only the policy answers that differ from the recommended one", async () => {
      const rows = await prisma.workshopPolicy.findMany({
        where: { tenantId, effectiveTo: null },
        select: { policyKey: true, value: true },
      });

      // TIME_TRACKING was answered OFF against a default of OPTIONAL, so
      // it is stored. Nothing else was answered, so nothing else is --
      // the registry default is a real answer with a written reason.
      expect(rows).toEqual([{ policyKey: "TIME_TRACKING", value: "OFF" }]);
    });

    it("gives a MINIMAL-template workshop the FINANCE module its live capability needs", async () => {
      // The contradiction this test exists for: `enabledModules` used to
      // come from the chosen starter template, so a workshop with pricing
      // ON and a MINIMAL template got a live FINANCE_CORE capability and
      // no FINANCE module -- and `ModuleEnabledLayer` denied every finance
      // permission with "this module is not enabled for your workshop".
      // Found by logging in as a created workshop's owner, not by a test.
      const config = await prisma.tenantConfiguration.findUnique({
        where: { tenantId },
        select: { enabledModules: true },
      });
      expect(config!.enabledModules).toContain("FINANCE");
      // And nothing it does not have.
      expect(config!.enabledModules).not.toContain("INVENTORY");
      expect(config!.enabledModules).not.toContain("TEAM_MANAGEMENT");
    });

    it("has the branch it declared, and no store", async () => {
      const [branches, warehouses] = await Promise.all([
        prisma.branch.findMany({ where: { tenantId }, select: { name: true, code: true } }),
        prisma.warehouse.count({ where: { tenantId } }),
      ]);

      expect(branches).toEqual([{ name: "The bay", code: "BAY" }]);
      expect(warehouses).toBe(0);
    });

    it("has the service cards its specialisation pack promised, and can charge its service", async () => {
      const [definitions, prices] = await Promise.all([
        prisma.specializationDefinition.findMany({ where: { tenantId }, select: { name: true, kind: true } }),
        prisma.priceCatalogEntry.findMany({ where: { tenantId }, select: { itemKey: true, unitPrice: true } }),
      ]);

      expect(definitions.map((d) => d.name).sort()).toEqual(["Fluid Top-Up", "Oil Change"]);
      expect(prices).toHaveLength(1);
      expect(prices[0].itemKey).toBe("Oil change");
      // 45000 minor units -> 450.00 major. Money is exact all the way
      // through: no float ever touches this number.
      expect(prices[0].unitPrice.toFixed(2)).toBe("450.00");
    });

    it("delivers unpaid, because that is the recommended answer it inherited", async () => {
      const finance = await prisma.financeConfiguration.findUnique({
        where: { tenantId },
        select: { allowUnpaidDelivery: true },
      });
      expect(finance?.allowUnpaidDelivery).toBe(true);
    });

    it("shows the customer prices by default, having answered nothing on the question", async () => {
      const finance = await prisma.financeConfiguration.findUnique({
        where: { tenantId },
        select: { customerInvoiceVisible: true },
      });
      expect(finance?.customerInvoiceVisible).toBe(true);
    });

    it("snapshots what was decided, so a year from now it is still readable", async () => {
      const version = await prisma.tenantConfigurationVersion.findFirst({
        where: { tenantId, version: 1 },
        select: { snapshot: true, riskLevel: true },
      });

      const snapshot = version!.snapshot as Record<string, unknown>;
      expect(version!.riskLevel).toBe("HIGH");
      expect((snapshot.capabilities as Record<string, string>).INVENTORY).toBe("DISABLED");
      expect(snapshot.specializationPacks).toEqual(["QUICK_SERVICE"]);
    });
  });

  // -------------------------------------------------------------------
  // Workshop B -- four branches, two stores, stock discipline, teams
  // -------------------------------------------------------------------

  describe("Workshop B — multi-branch full service", () => {
    const slug = `b-network-${suffix}`;
    let tenantId: string;

    it("is created with branches, stores and the grants between them", async () => {
      const res = await create({
        planId: networkPlanId,
        name: `B Dealership Network ${suffix}`,
        slug,
        country: "SA",
        city: "Riyadh",
        businessType: "Dealership Service Center",
        primaryCategory: "CARS",
        currency: "SAR",
        timezone: "Asia/Riyadh",
        ownerFullName: "Khalid Al-Otaibi",
        ownerEmail: `b-owner-${suffix}@example.com`,
        ownerPhone: "+966512345678",
        starterBuilderTemplate: "HIGH_VOLUME_BRANCH_NETWORK",
        initialStatus: "ACTIVE",
        // Everything on -- so no capability rows at all, which is itself
        // the thing to prove: a complete workshop stores no deviations.
        capabilities: {},
        policies: {
          DELIVERY_BLOCKED_UNTIL_PAID: "ALWAYS",
          PARTS_SEPARATION_OF_DUTIES: "DIFFERENT_PERSON",
          RETURN_UNUSED_BEFORE_FINISH: "REQUIRED",
          CUSTOMER_INVOICE_VISIBILITY: "HIDDEN",
        },
        responsibilities: { INVENTORY: "DEDICATED", TEAMS: "DEDICATED", MULTI_BRANCH: "DEDICATED" },
        specializationPacks: ["BRAKES_AND_SUSPENSION", "DIAGNOSTICS"],
        branches: [
          { name: "Riyadh North", code: "RYD-N", city: "Riyadh" },
          { name: "Riyadh South", code: "RYD-S", city: "Riyadh" },
          { name: "Jeddah", code: "JED", city: "Jeddah" },
          { name: "Dammam", code: "DMM", city: "Dammam" },
        ],
        warehouses: [
          { name: "Central store", code: "CENTRAL", branchCodes: ["RYD-N", "RYD-S"] },
          { name: "Western store", code: "WEST", branchCodes: ["JED"] },
        ],
        services: [
          { name: "Brake service", price: "120000" },
          { name: "Diagnostic scan", price: "35000" },
        ],
      });

      expect(res.status).toBe(201);
      tenantId = res.body.tenant.id;

      const [branches, warehouses, grants] = await Promise.all([
        prisma.branch.count({ where: { tenantId } }),
        prisma.warehouse.count({ where: { tenantId } }),
        prisma.branchWarehouseAccess.count({ where: { tenantId } }),
      ]);

      expect(branches).toBe(4);
      expect(warehouses).toBe(2);
      // Central serves two branches, Western serves one. Dammam draws
      // from neither, which is a real configuration, not an omission.
      expect(grants).toBe(3);
    });

    it("enables every module its capabilities require, whatever template was named", async () => {
      const config = await prisma.tenantConfiguration.findUnique({
        where: { tenantId },
        select: { enabledModules: true },
      });
      expect([...config!.enabledModules].sort()).toEqual([
        "AUDIT",
        "CUSTOMER_PORTAL",
        "FINANCE",
        "INVENTORY",
        "OPERATIONS",
        "ORGANIZATION",
        "REPORTS",
        "TEAM_MANAGEMENT",
      ]);
    });

    it("stores no capability rows at all, because nothing was removed", async () => {
      const count = await prisma.tenantCapability.count({ where: { tenantId } });
      expect(count).toBe(0);
    });

    it("blocks delivery on an outstanding balance, because it asked to", async () => {
      const finance = await prisma.financeConfiguration.findUnique({
        where: { tenantId },
        select: { allowUnpaidDelivery: true, allowPartialPaidDelivery: true },
      });
      expect(finance?.allowUnpaidDelivery).toBe(false);
      expect(finance?.allowPartialPaidDelivery).toBe(false);
    });

    it("withholds prices from the customer decision page, because it asked to", async () => {
      const finance = await prisma.financeConfiguration.findUnique({
        where: { tenantId },
        select: { customerInvoiceVisible: true },
      });
      expect(finance?.customerInvoiceVisible).toBe(false);
    });

    it("grants no extra permissions, because every role will be staffed", async () => {
      // Each capability keeps its dedicated operator, so the baseline
      // seeding is exactly right and nothing is added on top.
      const ownerInventory = await prisma.rolePermission.findFirst({
        where: { tenantId, role: "TENANT_OWNER", permissionKey: "inventory.request.approve" },
      });
      expect(ownerInventory).toBeNull();
    });
  });

  // -------------------------------------------------------------------
  // Workshop C -- field service, heavy equipment, owner runs the store
  // -------------------------------------------------------------------

  describe("Workshop C — heavy-equipment field service", () => {
    const slug = `c-field-${suffix}`;
    let tenantId: string;

    it("is created with a different specialisation surface and different relevant policies", async () => {
      const res = await create({
        planId: smallPlanId,
        name: `C Field Service ${suffix}`,
        slug,
        country: "EG",
        city: "Suez",
        businessType: "Fleet Maintenance Operation",
        primaryCategory: "HEAVY_EQUIPMENT",
        currency: "EGP",
        timezone: "Africa/Cairo",
        ownerFullName: "Delta Operations",
        ownerEmail: `c-owner-${suffix}@example.com`,
        ownerPhone: "+201112223334",
        starterBuilderTemplate: "DEFAULT",
        initialStatus: "TRIAL",
        capabilities: {
          MULTI_BRANCH: "DISABLED",
          TEAM_REVIEW: "DISABLED",
          CUSTOMER_PORTAL: "DISABLED",
          // The Billing/Finance split earning its keep: legal invoices
          // come from separate accounting software.
          BILLING: "EXTERNAL",
        },
        policies: { DELIVERY_BLOCKED_UNTIL_PAID: "NEVER", TIME_TRACKING: "REQUIRED" },
        // The owner runs the store personally. This is the case that had
        // no answer before: Inventory on, no storekeeper, part requests
        // nobody could approve.
        responsibilities: { INVENTORY: "TENANT_OWNER", TEAMS: "DEDICATED" },
        specializationPacks: ["FIELD_SERVICE", "DIAGNOSTICS"],
        branches: [{ name: "Suez depot", code: "SUEZ", city: "Suez" }],
        warehouses: [{ name: "Van stock", code: "VAN", branchCodes: [] }],
      });

      expect(res.status).toBe(201);
      tenantId = res.body.tenant.id;

      const definitions = await prisma.specializationDefinition.findMany({
        where: { tenantId },
        select: { name: true, category: true },
      });
      expect(definitions.map((d) => d.name).sort()).toEqual([
        "Diagnostic Scan",
        "Hydraulic Pressure Diagnostic",
        "Scheduled Machine Service",
      ]);
      expect(definitions.every((d) => d.category === "HEAVY_EQUIPMENT")).toBe(true);
    });

    it("gives the owner the inventory permissions the dedicated role would have held", async () => {
      // The whole point of the responsibility stage. Without these rows,
      // this workshop's first part request could be raised by a
      // technician and approved by nobody.
      const granted = await prisma.rolePermission.findMany({
        where: {
          tenantId,
          role: "TENANT_OWNER",
          permissionKey: { in: ["inventory.request.approve", "inventory.request.issue", "inventory.stock.view"] },
        },
        select: { permissionKey: true, allowed: true },
      });

      expect(granted).toHaveLength(3);
      expect(granted.every((row) => row.allowed)).toBe(true);
    });

    it("does not launder a permission the dedicated role was explicitly denied", async () => {
      // inventory.cost.view is `false` for INVENTORY_MANAGER on purpose:
      // managing the catalogue does not imply seeing margin. Picking the
      // job up must not quietly pick that up too.
      const cost = await prisma.rolePermission.findFirst({
        where: { tenantId, role: "TENANT_OWNER", permissionKey: "inventory.cost.view" },
      });
      expect(cost).toBeNull();
    });

    it("grants its single store to the only branch it has", async () => {
      // An empty branch list means "every branch" -- granting it to
      // nothing would leave a store no branch may draw from, which is
      // the same trap as no store at all.
      const grants = await prisma.branchWarehouseAccess.count({ where: { tenantId } });
      expect(grants).toBe(1);
    });

    it("runs external billing, and still keeps MOP's own pricing", async () => {
      const finance = await prisma.financeConfiguration.findUnique({
        where: { tenantId },
        select: { externalBillingEnabled: true, allowUnpaidDelivery: true },
      });
      expect(finance?.externalBillingEnabled).toBe(true);
      expect(finance?.allowUnpaidDelivery).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // Invalid configurations are refused, with words someone can act on
  // -------------------------------------------------------------------

  describe("invalid configurations", () => {
    function base(tag: string) {
      return {
        planId: smallPlanId,
        name: `Invalid ${tag} ${suffix}`,
        slug: `invalid-${tag}-${suffix}`,
        country: "EG",
        city: "Cairo",
        businessType: "Independent Garage",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
        ownerFullName: "Test Owner",
        ownerEmail: `invalid-${tag}-${suffix}@example.com`,
        ownerPhone: "+201234567890",
        starterBuilderTemplate: "DEFAULT",
        initialStatus: "ACTIVE",
        branches: [{ name: "Main", code: "MAIN" }],
      };
    }

    it("refuses a capability whose dependency is off, in the engine's own words", async () => {
      const res = await create({
        ...base("dep"),
        capabilities: { INVENTORY: "DISABLED", PART_RETURNS: "ENABLED" },
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("configuration_invalid");
      const findings = res.body.details.findings as { code: string; stage: string }[];
      expect(findings.some((f) => f.code === "CAPABILITY_INVALID" && f.stage === "CAPABILITIES")).toBe(true);
    });

    it("refuses stock with nowhere to hold it, and says where to fix it", async () => {
      const res = await create({ ...base("nostore"), capabilities: {}, warehouses: [] });

      expect(res.status).toBe(400);
      const findings = res.body.details.findings as { code: string; stage: string; message: string }[];
      const finding = findings.find((f) => f.code === "NO_WAREHOUSE");
      expect(finding?.stage).toBe("STRUCTURE");
      expect(finding?.message).toContain("has to come out of somewhere");
    });

    it("refuses an answer to a question this workshop is never asked", async () => {
      const res = await create({
        ...base("stale"),
        capabilities: { QC: "DISABLED" },
        warehouses: [{ name: "Store", code: "WH1", branchCodes: [] }],
        policies: { QC_MANDATORY: "MANDATORY_ALWAYS" },
      });

      expect(res.status).toBe(400);
      const findings = res.body.details.findings as { code: string }[];
      expect(findings.some((f) => f.code === "POLICY_NOT_APPLICABLE")).toBe(true);
    });

    it("refuses a capability handed to a role that may not hold it", async () => {
      const res = await create({
        ...base("orphan"),
        capabilities: {},
        warehouses: [{ name: "Store", code: "WH1", branchCodes: [] }],
        responsibilities: { INVENTORY: "TECHNICIAN" },
      });

      expect(res.status).toBe(400);
      const findings = res.body.details.findings as { code: string }[];
      expect(findings.some((f) => f.code === "CAPABILITY_HAS_NO_OPERATOR")).toBe(true);
    });

    it("refuses more branches than the plan allows", async () => {
      const res = await create({
        ...base("plan"),
        capabilities: {},
        warehouses: [{ name: "Store", code: "WH1", branchCodes: [] }],
        branches: [
          { name: "One", code: "ONE" },
          { name: "Two", code: "TWO" },
        ],
      });

      // 400 with a finding, not 409: the soft "allowed branches" target
      // is within the plan, and what actually exceeds it is the declared
      // structure -- which is a configuration problem the operator fixes
      // on a named stage, so it is reported the same way every other one is.
      expect(res.status).toBe(400);
      const findings = res.body.details.findings as { code: string; stage: string }[];
      expect(findings.some((f) => f.code === "BRANCH_EXCEEDS_PLAN" && f.stage === "STRUCTURE")).toBe(true);
    });

    it("writes nothing at all when it refuses", async () => {
      const orphaned = await prisma.tenant.findFirst({ where: { slug: `invalid-dep-${suffix}` } });
      expect(orphaned).toBeNull();
    });
  });

  // -------------------------------------------------------------------
  // The verdict, before the publish
  // -------------------------------------------------------------------

  describe("validate, before publishing", () => {
    it("gives the same verdict the publish would, on a half-finished draft", async () => {
      const res = await post("/platform/onboarding/validate", {
        name: "Half Done",
        capabilities: { INVENTORY: "DISABLED", PART_RETURNS: "ENABLED" },
      });

      expect(res.status).toBe(201);
      expect(res.body.publishable).toBe(false);
      const codes = res.body.findings.map((f: { code: string }) => f.code);
      expect(codes).toContain("CAPABILITY_INVALID");
      expect(codes).toContain("IDENTITY_INCOMPLETE");
      // Every finding names the stage that fixes it, so the review screen
      // can offer to jump there rather than saying "something is wrong".
      expect(res.body.findings.every((f: { stage: string }) => typeof f.stage === "string")).toBe(true);
    });

    it("catches a name already taken — the one check a browser cannot make", async () => {
      const res = await post("/platform/onboarding/validate", { name: `A Quick Service ${suffix}` });
      const messages = res.body.findings.map((f: { message: string }) => f.message);
      expect(messages).toContain("A workshop with this name already exists. Names are unique across the platform.");
    });

    it("passes a complete, coherent draft", async () => {
      const res = await post("/platform/onboarding/validate", {
        planId: smallPlanId,
        name: `Fresh Workshop ${suffix}`,
        slug: `fresh-workshop-${suffix}`,
        country: "EG",
        city: "Cairo",
        currency: "EGP",
        timezone: "Africa/Cairo",
        businessType: "Independent Garage",
        primaryCategory: "CARS",
        ownerFullName: "Fresh Owner",
        ownerEmail: `fresh-${suffix}@example.com`,
        ownerPhone: "+201234567890",
        initialStatus: "ACTIVE",
        capabilities: { MULTI_BRANCH: "DISABLED", MULTI_WAREHOUSE: "DISABLED" },
        responsibilities: { INVENTORY: "TENANT_OWNER", TEAMS: "DEDICATED" },
        branches: [{ name: "Main", code: "MAIN" }],
        warehouses: [{ name: "Store", code: "WH1", branchCodes: ["MAIN"] }],
        specializationPacks: ["QUICK_SERVICE"],
      });

      expect(res.body.blockerCount).toBe(0);
      expect(res.body.publishable).toBe(true);
    });
  });
});
