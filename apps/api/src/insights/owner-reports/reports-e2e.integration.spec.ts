/**
 * Full End-to-End Test for the Owner Reporting System over Real HTTP.
 *
 * Boots the Nest application, establishes an authenticated Owner session,
 * seeds real operational, labor, inventory, and financial records, and verifies
 * all 9 reporting endpoints, query parameter handling, and data integrity.
 */
process.env.DATABASE_URL ??=
  "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { PrismaClient } from "@mop/database";
import { AuthModule } from "../../identity/auth/auth.module";
import { AccessModule } from "../../identity/access/access.module";
import { DatabaseModule } from "../../runtime/database/database.module";
import { ReportsModule } from "./reports.module";
import { PrismaService } from "../../runtime/database/prisma.service";
import { ApiExceptionFilter } from "../../runtime/http/filters/api-exception.filter";
import { validationExceptionFactory } from "../../runtime/http/validation/validation-exception-factory";
import { hashPassword } from "../../identity/auth/password.util";

describe("Owner Reports & Analytics End-to-End (Real HTTP)", () => {
  const prisma = new PrismaClient();
  let app: INestApplication;

  const SUFFIX = `rep-e2e-${Date.now()}`;
  let tenantId: string;
  let branchId: string;
  let planId: string;
  let customerId: string;
  let assetId: string;
  let staffUserId: string;

  const email = `owner-${SUFFIX}@example.com`;
  const password = "ValidPassword123!";

  async function getAuthCookie(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);

    const cookies = res.headers["set-cookie"] as unknown as string[];
    return cookies.map((c) => c.split(";")[0]).join("; ");
  }

  beforeAll(async () => {
    await prisma.$connect();

    // 1. Plan & Tenant
    const plan = await prisma.plan.create({
      data: {
        code: `PLAN-${SUFFIX}`,
        name: "E2E Reports Plan",
        maxBranches: 5,
        maxUsers: 50,
        maxWarehouses: 5,
        allowedCategories: ["CARS"],
        allowedModules: ["REPORTS"],
        allowedFeatures: [],
        allowedReports: ["ALL"],
        monthlyPrice: 0,
      },
    });
    planId = plan.id;

    const tenant = await prisma.tenant.create({
      data: {
        name: `E2E Workshop ${SUFFIX}`,
        nameNormalized: `e2e workshop ${SUFFIX}`.toLowerCase(),
        slug: `e2e-ws-${SUFFIX}`.toLowerCase(),
        customerRegistrationCode: `E${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000)}`,
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

    // Tenant configuration & permissions
    await prisma.tenantConfiguration.create({
      data: {
        tenantId,
        theme: {},
        pageLayouts: {},
        roleExperience: {},
        workflowPolicy: {},
        featureFlags: {},
        enabledModules: ["REPORTS"],
        enabledFeatures: [],
        forms: {},
        messageTemplates: {},
      },
    });

    await prisma.rolePermission.create({
      data: { tenantId, role: "TENANT_OWNER", permissionKey: "reports.owner.view", allowed: true },
    });

    // 2. Branch
    const branch = await prisma.branch.create({
      data: {
        tenantId,
        code: `B-${SUFFIX}`.slice(0, 8),
        name: "E2E Main Branch",
        city: "Cairo",
        address: "Industrial Zone 1",
      },
    });
    branchId = branch.id;

    // 3. User & Staff Accounts
    const account = await prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId,
        email,
        passwordHash: hashPassword(password),
        status: "ACTIVE",
      },
    });

    const staffUser = await prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId,
        fullName: "Owner E2E",
        role: "TENANT_OWNER",
        branchScope: [branchId],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });
    staffUserId = staffUser.id;

    const techAccount = await prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId,
        email: `tech-${SUFFIX}@example.com`,
        passwordHash: hashPassword(password),
        status: "ACTIVE",
      },
    });

    const techUser = await prisma.staffUser.create({
      data: {
        accountId: techAccount.id,
        tenantId,
        fullName: "Tech Ahmed",
        role: "TECHNICIAN",
        branchScope: [branchId],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });

    // 4. Customer & Asset
    const customer = await prisma.customer.create({
      data: {
        tenantId,
        fullName: "Karim Farouk",
        email: `karim-${SUFFIX}@example.com`,
        phone: "+201000000099",
      },
    });
    customerId = customer.id;

    const asset = await prisma.asset.create({
      data: {
        tenantId,
        currentOwnerCustomerId: customer.id,
        category: "CARS",
        plateNumber: "ABC 1234",
        vinOrChassisNumber: `VIN-${SUFFIX}`.slice(0, 17),
      },
    });
    assetId = asset.id;

    // 5. WorkOrders & Events
    const now = new Date();
    const woActive = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId,
        customerId,
        assetId,
        status: "IN_PROGRESS",
        expectedDurationMinutes: 180,
        createdAt: now,
      },
    });

    const woClosed = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId,
        customerId,
        assetId,
        status: "CLOSED",
        createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        closedAt: now,
      },
    });

    // Operation events for status dwell times
    await prisma.operationEvent.createMany({
      data: [
        {
          tenantId,
          eventKey: "work_order.status_changed",
          payload: { workOrderId: woClosed.id, from: "DRAFT", to: "IN_PROGRESS" },
          actorType: "TENANT_STAFF",
          actorId: staffUserId,
          createdAt: new Date(now.getTime() - 12 * 60 * 60 * 1000),
        },
        {
          tenantId,
          eventKey: "work_order.status_changed",
          payload: { workOrderId: woClosed.id, from: "IN_PROGRESS", to: "CLOSED" },
          actorType: "TENANT_STAFF",
          actorId: staffUserId,
          createdAt: now,
        },
      ],
    });

    // 6. Invoices & Tasks
    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        workOrderId: woClosed.id,
        invoiceNumber: `INV-${SUFFIX}`.slice(0, 16),
        subtotal: 500,
        total: 500,
        paid: 500,
        balance: 0,
        issuedById: staffUserId,
        issuedAt: now,
      },
    });

    await prisma.invoiceLine.create({
      data: {
        tenantId,
        invoiceId: invoice.id,
        name: "Brake Service",
        itemType: "LABOR",
        quantity: 1,
        lockedUnitPrice: 300,
        lockedLaborPrice: 300,
        total: 300,
      },
    });

    const task = await prisma.task.create({
      data: {
        tenantId,
        workOrderId: woClosed.id,
        title: "Brake Pad Replacement",
        status: "DONE",
        actualMinutes: 90,
      },
    });

    await prisma.taskAssignment.create({
      data: {
        tenantId,
        taskId: task.id,
        staffUserId: techUser.id,
        assignedAt: new Date(now.getTime() - 5 * 60 * 60 * 1000),
      },
    });

    // 7. Customer Decisions (Sales Conversion)
    const decisionReq = await prisma.customerDecisionRequest.create({
      data: {
        tenantId,
        workOrderId: woActive.id,
        customerId,
        secureToken: `tok-${SUFFIX}`,
        status: "RESOLVED",
        createdById: staffUserId,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      },
    });

    await prisma.customerDecisionItem.createMany({
      data: [
        {
          tenantId,
          decisionRequestId: decisionReq.id,
          name: "Front Ceramic Brake Pads",
          explanation: "Critical braking safety item",
          importance: "CRITICAL",
          price: 350,
          laborPrice: 0,
          total: 350,
          decision: "APPROVED",
          decidedAt: now,
        },
        {
          tenantId,
          decisionRequestId: decisionReq.id,
          name: "Cabin Air Filter",
          explanation: "Optional replacement",
          importance: "LOW",
          price: 120,
          laborPrice: 0,
          total: 120,
          decision: "REJECTED",
          decidedAt: now,
        },
      ],
    });

    // 8. Bootstrap Nest Application
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule, AuthModule, AccessModule, ReportsModule],
    })
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
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await prisma.$disconnect();
  });

  // ==========================================
  // E2E TESTS FOR ALL 9 REPORTING FEATURES
  // ==========================================

  it("1. GET /api/v1/organization/reports/home-pulse (Owner Home Pulse)", async () => {
    const cookie = await getAuthCookie();

    const res = await request(app.getHttpServer())
      .get("/api/v1/organization/reports/home-pulse")
      .set("Cookie", cookie)
      .expect(200);

    expect(res.body).toBeDefined();
    expect(res.body.mtdRevenue).toBeDefined();
    expect(res.body.blendedGrossMarginPct).toBeGreaterThanOrEqual(0);
    expect(res.body.effectiveLaborRate).toBeDefined();
    expect(res.body.doorLaborRate).toBeDefined();
    expect(res.body.activeShopPulse).toBeDefined();
    expect(res.body.activeShopPulse.activeVehiclesCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.actionDeck)).toBe(true);
  });

  it("2. GET /api/v1/organization/reports/overview (Executive Overview)", async () => {
    const cookie = await getAuthCookie();

    const res = await request(app.getHttpServer())
      .get("/api/v1/organization/reports/overview?from=2026-01-01&to=2026-12-31&groupBy=day")
      .set("Cookie", cookie)
      .expect(200);

    expect(res.body).toBeDefined();
    expect(res.body.revenue).toBeDefined();
    expect(res.body.collected).toBeDefined();
    expect(res.body.workOrdersCreated).toBeDefined();
    expect(res.body.workOrdersClosed).toBeDefined();
    expect(Array.isArray(res.body.alerts)).toBe(true);
  });

  it("3. GET /api/v1/organization/reports/operations (Operations Throughput)", async () => {
    const cookie = await getAuthCookie();

    const res = await request(app.getHttpServer())
      .get("/api/v1/organization/reports/operations?from=2026-01-01&to=2026-12-31")
      .set("Cookie", cookie)
      .expect(200);

    expect(res.body).toBeDefined();
    expect(res.body.volumeTotals).toBeDefined();
    expect(res.body.volumeTotals.created).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.volume)).toBe(true);
    expect(Array.isArray(res.body.statusDistribution)).toBe(true);
  });

  it("4. GET /api/v1/organization/reports/financial (Financial & Profitability)", async () => {
    const cookie = await getAuthCookie();

    const res = await request(app.getHttpServer())
      .get("/api/v1/organization/reports/financial?from=2026-01-01&to=2026-12-31")
      .set("Cookie", cookie)
      .expect(200);

    expect(res.body).toBeDefined();
    expect(res.body.laborRevenue).toBeDefined();
    expect(res.body.partsRevenue).toBeDefined();
    expect(Array.isArray(res.body.trend)).toBe(true);
    expect(Array.isArray(res.body.branchRevenue)).toBe(true);
  });

  it("5. GET /api/v1/organization/reports/inventory (Inventory Velocity & Dead Stock)", async () => {
    const cookie = await getAuthCookie();

    const res = await request(app.getHttpServer())
      .get("/api/v1/organization/reports/inventory?from=2026-01-01&to=2026-12-31")
      .set("Cookie", cookie)
      .expect(200);

    expect(res.body).toBeDefined();
    expect(res.body.totalInventoryValue).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(res.body.partProfitability)).toBe(true);
    expect(Array.isArray(res.body.deadStock)).toBe(true);
  });

  it("6. GET /api/v1/organization/reports/customers (Customer Retention & Accounts)", async () => {
    const cookie = await getAuthCookie();

    const res = await request(app.getHttpServer())
      .get("/api/v1/organization/reports/customers?from=2026-01-01&to=2026-12-31")
      .set("Cookie", cookie)
      .expect(200);

    expect(res.body).toBeDefined();
    expect(res.body.activeCustomers).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(res.body.topCustomersByValue)).toBe(true);
  });

  it("7. GET /api/v1/organization/reports/labor (Labor Triad & Technician Quadrants)", async () => {
    const cookie = await getAuthCookie();

    const res = await request(app.getHttpServer())
      .get("/api/v1/organization/reports/labor?from=2026-01-01&to=2026-12-31")
      .set("Cookie", cookie)
      .expect(200);

    expect(res.body).toBeDefined();
    expect(res.body.averageProductivityPct).toBeGreaterThanOrEqual(0);
    expect(res.body.averageEfficiencyPct).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(res.body.technicians)).toBe(true);

    const tech = res.body.technicians.find((t: any) => t.displayName === "Tech Ahmed");
    expect(tech).toBeDefined();
    expect(tech.clockedTaskHours).toBeGreaterThan(0);
    expect(tech.performanceQuadrant).toBeDefined();
  });

  it("8. GET /api/v1/organization/reports/pipeline (Pipeline Sankey & Bay Gantt)", async () => {
    const cookie = await getAuthCookie();

    const res = await request(app.getHttpServer())
      .get("/api/v1/organization/reports/pipeline?from=2026-01-01&to=2026-12-31")
      .set("Cookie", cookie)
      .expect(200);

    expect(res.body).toBeDefined();
    expect(Array.isArray(res.body.nodes)).toBe(true);
    expect(res.body.nodes.length).toBe(7); // INTAKE, INSPECTION, ESTIMATE_SENT, REPAIR_IN_BAY, QUALITY_CONTROL, DELIVERY, DECLINED
    expect(Array.isArray(res.body.bayOccupancy)).toBe(true);
    expect(res.body.bayOccupancy.length).toBeGreaterThanOrEqual(2);

    // Assert bay slot reflects active vehicle
    const activeBay = res.body.bayOccupancy.find((b: any) => b.utilizationPct > 0);
    expect(activeBay).toBeDefined();
  });

  it("9. GET /api/v1/organization/reports/sales-conversion (Estimate Waterfall & Advisor Scorecards)", async () => {
    const cookie = await getAuthCookie();

    const res = await request(app.getHttpServer())
      .get("/api/v1/organization/reports/sales-conversion?from=2026-01-01&to=2026-12-31")
      .set("Cookie", cookie)
      .expect(200);

    expect(res.body).toBeDefined();
    expect(res.body.totalEstimatesIdentified).toBe("470.00"); // 350 + 120
    expect(res.body.totalRealizedRevenue).toBe("350.00");
    expect(res.body.unrealizedRevenueGap).toBe("120.00");
    expect(res.body.totalConversionPct).toBe(74.5); // 350 / 470 = 74.46% -> 74.5%

    expect(Array.isArray(res.body.advisorScorecards)).toBe(true);
    const advisor = res.body.advisorScorecards[0];
    expect(advisor).toBeDefined();
    expect(advisor.workOrdersCount).toBe(1);
    expect(advisor.totalSold).toBe("350.00");
  });

  it("10. Date-range validation returns 400 Bad Request on reversed bounds", async () => {
    const cookie = await getAuthCookie();

    const res = await request(app.getHttpServer())
      .get("/api/v1/organization/reports/overview?from=2026-12-31&to=2026-01-01")
      .set("Cookie", cookie)
      .expect(400);

    expect(res.body.code).toBe("date_range_reversed");
  });

  it("11. Rejects unauthenticated requests with 401 Unauthorized", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/organization/reports/overview")
      .expect(401);
  });
});
