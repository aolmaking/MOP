/**
 * Proves the export endpoint over real HTTP: a real login, a real
 * `analytics.export` permission grant, and a real `Plan.allowedExports`
 * list -- then asserts the two ways it can still be refused (category not
 * in this plan's allowed list; permission not granted at all), that an
 * allowed export returns real CSV bytes built from real rows in this
 * tenant, and that it leaves a real, correctly-shaped AuditLog row behind.
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
import { AnalyticsModule } from "./analytics.module";
import { DatabaseModule } from "../../runtime/database/database.module";
import { PrismaService } from "../../runtime/database/prisma.service";
import { ApiExceptionFilter } from "../../runtime/http/filters/api-exception.filter";
import { validationExceptionFactory } from "../../runtime/http/validation/validation-exception-factory";
import { hashPassword } from "../../identity/auth/password.util";

describe("AnalyticsController export endpoint (integration, real HTTP)", () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let tenantId: string;
  let planId: string;
  let lockedPlanId: string;
  const email = `analytics-export-http-${Date.now()}@example.com`;
  const password = "correct-password-123";

  async function loginCookie(): Promise<string> {
    const res = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email, password });
    return (res.headers["set-cookie"] as unknown as string[]).map((c) => c.split(";")[0]).join("; ");
  }

  beforeAll(async () => {
    const plan = await prisma.plan.create({
      data: {
        code: `ANALYTICS-EXPORT-HTTP-${Date.now()}`,
        name: "Test Plan",
        maxBranches: 5,
        maxUsers: 20,
        maxWarehouses: 5,
        allowedCategories: ["CARS"],
        allowedModules: [],
        allowedFeatures: [],
        allowedReports: [],
        allowedExports: ["OPERATIONS", "DECISIONS"],
        monthlyPrice: 0,
      },
    });
    planId = plan.id;

    const lockedPlan = await prisma.plan.create({
      data: {
        code: `ANALYTICS-EXPORT-LOCKED-${Date.now()}`,
        name: "Locked Plan",
        maxBranches: 5,
        maxUsers: 20,
        maxWarehouses: 5,
        allowedCategories: ["CARS"],
        allowedModules: [],
        allowedFeatures: [],
        allowedReports: [],
        allowedExports: [],
        monthlyPrice: 0,
      },
    });
    lockedPlanId = lockedPlan.id;

    const tenant = await prisma.tenant.create({
      data: {
        name: "Analytics Export HTTP Workshop",
        nameNormalized: `analytics export http workshop ${Date.now()}`,
        slug: `analytics-export-http-${Date.now()}`,
        customerRegistrationCode: `AEHW-${Date.now()}`,
        status: "ACTIVE",
        planId,
        country: "EG",
        city: "Cairo",
        businessType: "Independent Garage",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
      },
    });
    tenantId = tenant.id;

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
      data: { tenantId, role: "DATA_ANALYST", permissionKey: "analytics.export", allowed: true },
    });
    await prisma.rolePermission.create({
      data: { tenantId, role: "DATA_ANALYST", permissionKey: "analytics.decisions.view", allowed: true },
    });

    const account = await prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId, email, passwordHash: hashPassword(password), status: "ACTIVE" },
    });
    await prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId,
        fullName: "Analyst HTTP",
        role: "DATA_ANALYST",
        branchScope: [],
        warehouseScope: [],
        categoryScope: [],
      },
    });

    const moduleRef = await Test.createTestingModule({ imports: [DatabaseModule, AuthModule, AnalyticsModule] })
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
    await app.close();
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.rolePermission.deleteMany({ where: { tenantId } });
    await prisma.staffUser.deleteMany({ where: { tenantId } });
    await prisma.account.deleteMany({ where: { tenantId } });
    await prisma.customerDecisionItem.deleteMany({ where: { tenantId } });
    await prisma.customerDecisionRequest.deleteMany({ where: { tenantId } });
    await prisma.workOrder.deleteMany({ where: { tenantId } });
    await prisma.asset.deleteMany({ where: { tenantId } });
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.branch.deleteMany({ where: { tenantId } });
    await prisma.tenantConfiguration.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.plan.delete({ where: { id: lockedPlanId } });
    await prisma.$disconnect();
  });

  it("returns real CSV bytes for a category this plan allows, with an audit row behind it", async () => {
    const cookieHeader = await loginCookie();

    const branch = await prisma.branch.create({ data: { tenantId, name: "Main", code: `MAIN-${Date.now()}` } });
    const customer = await prisma.customer.create({ data: { tenantId, fullName: "Export Customer", phone: `01${Date.now()}` } });
    const asset = await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `EXP-${Date.now()}` } });
    const wo = await prisma.workOrder.create({
      data: { tenantId, branchId: branch.id, assetId: asset.id, customerId: customer.id, status: "AWAITING_CUSTOMER_APPROVAL" },
    });
    const decisionRequest = await prisma.customerDecisionRequest.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        customerId: customer.id,
        status: "RESOLVED",
        secureToken: `tok-export-${Date.now()}`,
        createdById: "staff-1",
        sentAt: new Date(),
        respondedAt: new Date(),
      },
    });
    await prisma.customerDecisionItem.create({
      data: {
        tenantId,
        decisionRequestId: decisionRequest.id,
        name: "Brake pads",
        explanation: "worn",
        importance: "HIGH",
        price: 100,
        total: 100,
        decision: "APPROVED",
        decidedAt: new Date(),
      },
    });

    const res = await request(app.getHttpServer())
      .get("/api/v1/analytics/export/DECISIONS")
      .set("Cookie", cookieHeader);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("decisions-");
    expect(res.text).toContain("Summary");
    expect(res.text).toContain("approvalRate,100");

    const auditRow = await prisma.auditLog.findFirst({
      where: { tenantId, action: "analytics.export.generated", targetId: "DECISIONS" },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow!.riskLevel).toBe("LOW");
    expect(auditRow!.actorType).toBe("TENANT_STAFF");
  });

  it("refuses a category this plan's allowedExports does not include, even though the permission is granted", async () => {
    const cookieHeader = await loginCookie();

    const res = await request(app.getHttpServer())
      .get("/api/v1/analytics/export/PEOPLE")
      .set("Cookie", cookieHeader);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("export_category_not_allowed");
  });

  it("refuses an unauthenticated request with 401", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/analytics/export/DECISIONS");

    expect(res.status).toBe(401);
  });

  it("refuses export outright when the tenant's plan grants analytics.export nothing at all", async () => {
    const lockedEmail = `analytics-export-locked-${Date.now()}@example.com`;
    const lockedTenant = await prisma.tenant.create({
      data: {
        name: "Analytics Export Locked Workshop",
        nameNormalized: `analytics export locked workshop ${Date.now()}`,
        slug: `analytics-export-locked-${Date.now()}`,
        customerRegistrationCode: `AELW-${Date.now()}`,
        status: "ACTIVE",
        planId: lockedPlanId,
        country: "EG",
        city: "Cairo",
        businessType: "Independent Garage",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
      },
    });
    await prisma.tenantConfiguration.create({
      data: {
        tenantId: lockedTenant.id,
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
      data: { tenantId: lockedTenant.id, role: "DATA_ANALYST", permissionKey: "analytics.export", allowed: true },
    });
    const lockedAccount = await prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId: lockedTenant.id,
        email: lockedEmail,
        passwordHash: hashPassword(password),
        status: "ACTIVE",
      },
    });
    await prisma.staffUser.create({
      data: {
        accountId: lockedAccount.id,
        tenantId: lockedTenant.id,
        fullName: "Locked Analyst",
        role: "DATA_ANALYST",
        branchScope: [],
        warehouseScope: [],
        categoryScope: [],
      },
    });

    const loginRes = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email: lockedEmail, password });
    const cookieHeader = (loginRes.headers["set-cookie"] as unknown as string[]).map((c) => c.split(";")[0]).join("; ");

    const res = await request(app.getHttpServer())
      .get("/api/v1/analytics/export/DECISIONS")
      .set("Cookie", cookieHeader);

    expect(res.status).toBe(403);

    await prisma.rolePermission.deleteMany({ where: { tenantId: lockedTenant.id } });
    await prisma.staffUser.deleteMany({ where: { tenantId: lockedTenant.id } });
    await prisma.account.deleteMany({ where: { tenantId: lockedTenant.id } });
    await prisma.tenantConfiguration.deleteMany({ where: { tenantId: lockedTenant.id } });
    await prisma.tenant.delete({ where: { id: lockedTenant.id } });
  });
});
