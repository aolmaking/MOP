/**
 * Proves PlatformController's real guard chain over real HTTP: a real
 * login, a real cookie, SessionGuard resolving a real session, then
 * PlatformGuard actually enforcing "platform accounts only" -- and that a
 * successful call leaves a real, correctly-shaped AuditLog row behind.
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
import { PlatformModule } from "./platform.module";
import { DatabaseModule } from "../database/database.module";
import { PrismaService } from "../database/prisma.service";
import { ApiExceptionFilter } from "../common/filters/api-exception.filter";
import { validationExceptionFactory } from "../common/validation/validation-exception-factory";
import { hashPassword } from "../auth/password.util";

describe("PlatformController (integration, real HTTP)", () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let planId: string;
  const tenantIdsToClean: string[] = [];

  async function login(email: string, password: string): Promise<string> {
    const res = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email, password });
    return (res.headers["set-cookie"] as unknown as string[]).map((c) => c.split(";")[0]).join("; ");
  }

  beforeAll(async () => {
    const plan = await prisma.plan.create({
      data: {
        code: `PLATFORM-HTTP-TEST-${Date.now()}`,
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

    await prisma.account.create({
      data: {
        accountType: "PLATFORM",
        email: `platform-http-${Date.now()}@example.com`,
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
  });

  afterAll(async () => {
    await app.close();
    if (tenantIdsToClean.length > 0) {
      await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIdsToClean } } });
      await prisma.tenantConfiguration.deleteMany({ where: { tenantId: { in: tenantIdsToClean } } });
      await prisma.staffUser.deleteMany({ where: { tenantId: { in: tenantIdsToClean } } });
      await prisma.account.deleteMany({ where: { tenantId: { in: tenantIdsToClean } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIdsToClean } } });
    }
    await prisma.account.deleteMany({ where: { accountType: "PLATFORM", email: { contains: "platform-http-" } } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  function workshopPayload(suffix: string) {
    return {
      planId,
      name: `HTTP Test Workshop ${suffix}`,
      slug: `http-test-workshop-${suffix}`,
      country: "EG",
      city: "Cairo",
      businessType: "Independent Garage",
      primaryCategory: "CARS",
      currency: "EGP",
      timezone: "Africa/Cairo",
      ownerFullName: "New Owner",
      ownerEmail: `new-owner-${suffix}@example.com`,
      ownerPhone: "+201234567890",
      allowedBranchesStart: 1,
      allowedUsersStart: 5,
      allowedWarehousesStart: 1,
      starterBuilderTemplate: "DEFAULT",
      initialStatus: "ACTIVE",
    };
  }

  it("a platform session can create a workshop, and it leaves a real audit row behind", async () => {
    const platformAccount = await prisma.account.findFirstOrThrow({ where: { accountType: "PLATFORM" } });
    const cookieHeader = await login(platformAccount.email!, "platform-password-123");
    const suffix = `${Date.now()}-1`;

    const res = await request(app.getHttpServer())
      .post("/api/v1/platform/workshops")
      .set("Cookie", cookieHeader)
      .send(workshopPayload(suffix));

    expect(res.status).toBe(201);
    expect(res.body.tenant.name).toBe(`HTTP Test Workshop ${suffix}`);
    expect(res.body.inviteLink).toContain("/invite/accept?token=");
    tenantIdsToClean.push(res.body.tenant.id);

    const auditRow = await prisma.auditLog.findFirst({
      where: { targetType: "Tenant", targetId: res.body.tenant.id, action: "platform.workshop.created" },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow!.riskLevel).toBe("HIGH");
    expect(auditRow!.actorType).toBe("PLATFORM");

    // No password is ever set here -- the owner sets their own via the
    // invite link, per the spec's explicit "password is never set here" rule.
    const ownerAccount = await prisma.account.findFirst({ where: { email: `new-owner-${suffix}@example.com` } });
    expect(ownerAccount).not.toBeNull();
    expect(ownerAccount!.status).toBe("INVITED");
    expect(ownerAccount!.passwordHash).toBeNull();
    expect(ownerAccount!.inviteTokenHash).not.toBeNull();

    const seededPermission = await prisma.rolePermission.findFirst({
      where: { tenantId: res.body.tenant.id, role: "TENANT_OWNER", permissionKey: "organization.access.manage" },
    });
    expect(seededPermission?.allowed).toBe(true);
  });

  it("a non-platform session is rejected with 403, not allowed through", async () => {
    const suffix = `${Date.now()}-2`;
    const seedTenant = await prisma.tenant.create({
      data: {
        name: "Seed Tenant For Deny Test",
        nameNormalized: `seed tenant for deny test ${suffix}`,
        slug: `seed-deny-${suffix}`,
        customerRegistrationCode: `SDT-${suffix}`,
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
    tenantIdsToClean.push(seedTenant.id);
    const staffEmail = `deny-staff-${suffix}@example.com`;
    const staffAccount = await prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId: seedTenant.id,
        email: staffEmail,
        passwordHash: hashPassword("staff-password-123"),
        status: "ACTIVE",
      },
    });
    await prisma.staffUser.create({
      data: {
        accountId: staffAccount.id,
        tenantId: seedTenant.id,
        fullName: "Deny Test Staff",
        role: "TENANT_OWNER",
        branchScope: [],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });

    const cookieHeader = await login(staffEmail, "staff-password-123");

    const res = await request(app.getHttpServer())
      .post("/api/v1/platform/workshops")
      .set("Cookie", cookieHeader)
      .send(workshopPayload(suffix));

    expect(res.status).toBe(403);
  });

  it("rejects an unauthenticated request with 401 before ever reaching PlatformGuard", async () => {
    const res = await request(app.getHttpServer()).post("/api/v1/platform/workshops").send(workshopPayload(`${Date.now()}-3`));

    expect(res.status).toBe(401);
  });
});
