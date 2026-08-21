/**
 * Proves the full SessionGuard -> EffectiveAccessService chain over real
 * HTTP: a real allow (from a seeded RolePermission row) and a real deny
 * (an absent one, falling through to deny-by-default) for the same
 * logged-in session.
 */
process.env.DATABASE_URL ??=
  "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { PrismaClient } from "@mop/database";
import { AuthModule } from "../auth/auth.module";
import { AccessModule } from "./access.module";
import { DatabaseModule } from "../../runtime/database/database.module";
import { PrismaService } from "../../runtime/database/prisma.service";
import { ApiExceptionFilter } from "../../runtime/http/filters/api-exception.filter";
import { validationExceptionFactory } from "../../runtime/http/validation/validation-exception-factory";
import { hashPassword } from "../auth/password.util";

describe("AccessController (integration, real HTTP)", () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let tenantId: string;
  let planId: string;
  const email = `access-http-${Date.now()}@example.com`;
  const password = "correct-password-123";

  beforeAll(async () => {
    const plan = await prisma.plan.create({
      data: {
        code: `ACCESS-HTTP-TEST-${Date.now()}`,
        name: "Test Plan",
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
    planId = plan.id;

    const tenant = await prisma.tenant.create({
      data: {
        name: "Access HTTP Workshop",
        nameNormalized: `access http workshop ${Date.now()}`,
        slug: `access-http-${Date.now()}`,
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
        // Both keys used below belong to modules that must be enabled here,
        // or ModuleEnabledLayer (layer 4) denies+locks before the role
        // template (layer 7) is ever reached -- this test wants the
        // allow/deny split to come specifically from the role template.
        enabledModules: ["ORGANIZATION", "FINANCE"],
        enabledFeatures: [],
        forms: {},
        messageTemplates: {},
      },
    });

    // The one real ALLOW path: the tenant's role template explicitly grants
    // this key to TENANT_OWNER. finance.invoice.view is deliberately left
    // unseeded so it correctly denies via DEFAULT_DECISION -- the DENY path.
    await prisma.rolePermission.create({
      data: { tenantId, role: "TENANT_OWNER", permissionKey: "organization.access.manage", allowed: true },
    });

    const account = await prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId, email, passwordHash: hashPassword(password), status: "ACTIVE" },
    });
    await prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId,
        fullName: "Access Test Owner",
        role: "TENANT_OWNER",
        branchScope: [],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });

    const moduleRef = await Test.createTestingModule({ imports: [DatabaseModule, AuthModule, AccessModule] })
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
    await prisma.rolePermission.deleteMany({ where: { tenantId } });
    await prisma.staffUser.deleteMany({ where: { tenantId } });
    await prisma.account.deleteMany({ where: { tenantId } });
    await prisma.tenantConfiguration.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  async function loginCookie(): Promise<string> {
    const res = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email, password });
    return (res.headers["set-cookie"] as unknown as string[]).map((c) => c.split(";")[0]).join("; ");
  }

  it("resolves a real ALLOW for a key this tenant's role template grants", async () => {
    const cookieHeader = await loginCookie();

    const res = await request(app.getHttpServer())
      .get("/api/v1/access/check")
      .query({ key: "organization.access.manage" })
      .set("Cookie", cookieHeader);

    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(true);
  });

  it("resolves a real DENY (deny-by-default) for a registered key nothing has granted", async () => {
    const cookieHeader = await loginCookie();

    const res = await request(app.getHttpServer())
      .get("/api/v1/access/check")
      .query({ key: "finance.invoice.view" })
      .set("Cookie", cookieHeader);

    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
  });

  it("rejects an unregistered key with 400", async () => {
    const cookieHeader = await loginCookie();

    const res = await request(app.getHttpServer())
      .get("/api/v1/access/check")
      .query({ key: "not.a.real.key" })
      .set("Cookie", cookieHeader);

    expect(res.status).toBe(400);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/access/check").query({ key: "organization.access.manage" });

    expect(res.status).toBe(401);
  });
});
