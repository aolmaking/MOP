/**
 * The one place that actually boots AuthController behind the real
 * ApiExceptionFilter/ValidationPipe over real HTTP (supertest), rather than
 * calling AuthService directly. auth.service.integration.spec.ts already
 * proves the service's own logic against a real database; this file exists
 * because that alone let a real bug through: TenantUnavailableError and
 * MultipleAccountsError are plain Error subclasses, not HttpExceptions, so
 * without a controller-level translation they fall into
 * ApiExceptionFilter's catch-all and come back as a generic 500 --
 * silently discarding the 403/409 the controller intended. Nothing short
 * of an actual HTTP round trip through the filter would have caught that.
 */
process.env.DATABASE_URL ??=
  "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { PrismaClient } from "@mop/database";
import { AuthModule } from "./auth.module";
import { DatabaseModule } from "../../runtime/database/database.module";
import { PrismaService } from "../../runtime/database/prisma.service";
import { ApiExceptionFilter } from "../../runtime/http/filters/api-exception.filter";
import { validationExceptionFactory } from "../../runtime/http/validation/validation-exception-factory";
import { hashPassword } from "./password.util";

describe("AuthController (integration, real HTTP)", () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let tenantId: string;
  let planId: string;

  beforeAll(async () => {
    const plan = await prisma.plan.create({
      data: {
        code: `AUTH-HTTP-TEST-${Date.now()}`,
        name: "Test Plan",
        maxBranches: 5,
        maxUsers: 20,
        maxWarehouses: 5,
        allowedCategories: ["CARS"],
        allowedModules: ["INVENTORY"],
        allowedFeatures: [],
        allowedReports: [],
        monthlyPrice: 0,
      },
    });
    planId = plan.id;

    const tenant = await prisma.tenant.create({
      data: {
        name: "Auth HTTP Workshop",
        nameNormalized: `auth http workshop ${Date.now()}`,
        slug: `auth-http-${Date.now()}`,
        customerRegistrationCode: `AHW-${Date.now()}`,
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
        enabledModules: ["INVENTORY"],
        enabledFeatures: [],
        forms: {},
        messageTemplates: {},
      },
    });

    // DatabaseModule is @Global() in the real app (registered once via
    // AppModule), so it must be imported explicitly here too -- this test
    // builds AuthModule in isolation, not through AppModule.
    const moduleRef = await Test.createTestingModule({ imports: [DatabaseModule, AuthModule] })
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
    await prisma.session.deleteMany({ where: { tenantId } });
    await prisma.staffUser.deleteMany({ where: { tenantId } });
    await prisma.account.deleteMany({ where: { tenantId } });
    await prisma.tenantConfiguration.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  async function createStaffAccount(email: string, password: string, forTenantId = tenantId) {
    const account = await prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId: forTenantId,
        email,
        passwordHash: hashPassword(password),
        status: "ACTIVE",
      },
    });
    await prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId: forTenantId,
        fullName: "Test Branch Manager",
        role: "BRANCH_MANAGER",
        branchScope: ["branch-1"],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });
    return account;
  }

  it("POST /auth/login succeeds with 200, the real session context, and both session cookies set", async () => {
    const email = `http-${Date.now()}@example.com`;
    await createStaffAccount(email, "correct-password-123");

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password: "correct-password-123" });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("BRANCH_MANAGER");
    expect(res.body.tenantId).toBe(tenantId);

    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("mop_access="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("mop_refresh="))).toBe(true);
    expect(cookies.find((c) => c.startsWith("mop_access="))).toMatch(/HttpOnly/i);
  });

  it("POST /auth/login returns a real 401 (not the raw class-validator/service internals) for a wrong password", async () => {
    const email = `http-${Date.now()}-2@example.com`;
    await createStaffAccount(email, "correct-password-123");

    const res = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email, password: "wrong" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: "unauthorized", message: "Incorrect email/phone or password" });
  });

  it("POST /auth/login returns 400 validation_error for a malformed body, never reaching AuthService", async () => {
    const res = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email: "ab", password: "" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_error");
  });

  it("POST /auth/login returns 403 tenant_unavailable for a frozen tenant -- not the generic 500 a plain Error would fall into", async () => {
    const email = `http-${Date.now()}-3@example.com`;
    await createStaffAccount(email, "correct-password-123");
    await prisma.tenant.update({ where: { id: tenantId }, data: { status: "FROZEN" } });

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password: "correct-password-123" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("tenant_unavailable");

    await prisma.tenant.update({ where: { id: tenantId }, data: { status: "ACTIVE" } });
  });

  it("POST /auth/login returns 409 multiple_accounts_found -- not the generic 500 -- when the same email/password matches two tenants", async () => {
    const sharedEmail = `http-shared-${Date.now()}@example.com`;
    const sharedPassword = "same-password-both-tenants";
    await createStaffAccount(sharedEmail, sharedPassword);

    const otherPlan = await prisma.plan.create({
      data: {
        code: `AUTH-HTTP-TEST-2-${Date.now()}`,
        name: "Test Plan 2",
        maxBranches: 1,
        maxUsers: 5,
        maxWarehouses: 1,
        allowedCategories: ["CARS"],
        allowedModules: [],
        allowedFeatures: [],
        allowedReports: [],
        monthlyPrice: 0,
      },
    });
    const otherTenant = await prisma.tenant.create({
      data: {
        name: "Second HTTP Workshop",
        nameNormalized: `second http workshop ${Date.now()}`,
        slug: `second-http-workshop-${Date.now()}`,
        customerRegistrationCode: `SHW-${Date.now()}`,
        planId: otherPlan.id,
        status: "ACTIVE",
        country: "EG",
        city: "Giza",
        businessType: "Independent Garage",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
      },
    });
    await createStaffAccount(sharedEmail, sharedPassword, otherTenant.id);

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: sharedEmail, password: sharedPassword });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("multiple_accounts_found");

    await prisma.staffUser.deleteMany({ where: { tenantId: otherTenant.id } });
    await prisma.account.deleteMany({ where: { tenantId: otherTenant.id } });
    await prisma.tenant.delete({ where: { id: otherTenant.id } });
    await prisma.plan.delete({ where: { id: otherPlan.id } });
  });

  it("GET /auth/me returns 401 with no session cookie", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("GET /auth/me returns the real session context when the login cookie is replayed", async () => {
    const email = `http-${Date.now()}-4@example.com`;
    await createStaffAccount(email, "correct-password-123");

    const loginRes = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password: "correct-password-123" });
    const cookieHeader = (loginRes.headers["set-cookie"] as unknown as string[])
      .map((c) => c.split(";")[0])
      .join("; ");

    const meRes = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookieHeader);

    expect(meRes.status).toBe(200);
    expect(meRes.body.role).toBe("BRANCH_MANAGER");
  });
});
