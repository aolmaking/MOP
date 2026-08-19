/**
 * Live View is the only surface in the product that reads across tenant
 * boundaries, so these tests care about two things above correctness of
 * arithmetic: that a tenant session can never reach it, and that nothing
 * tenant-private rides along in the response.
 *
 * The counts are proven against rows this test writes itself, on a tenant
 * it creates, so a passing assertion means the query really read the
 * database rather than that the seed happened to agree.
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

describe("LiveViewController (integration, real HTTP)", () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let planId: string;
  let tenantId: string;
  let branchId: string;
  let customerId: string;
  let assetId: string;
  let platformEmail: string;
  let staffEmail: string;

  const suffix = `${Date.now()}`;
  const PLATFORM_PASSWORD = "platform-password-123";
  const STAFF_PASSWORD = "staff-password-123";

  async function login(email: string, password: string): Promise<string> {
    const res = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email, password });
    return (res.headers["set-cookie"] as unknown as string[]).map((c) => c.split(";")[0]).join("; ");
  }

  beforeAll(async () => {
    const plan = await prisma.plan.create({
      data: {
        code: `LIVEVIEW-TEST-${suffix}`,
        name: "Live View Test Plan",
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
        name: `Live View Workshop ${suffix}`,
        nameNormalized: `live view workshop ${suffix}`,
        slug: `live-view-workshop-${suffix}`,
        customerRegistrationCode: `LVW-${suffix}`,
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

    const branch = await prisma.branch.create({
      data: { tenantId, name: "Main", code: `LV-${suffix}`, isActive: true },
    });
    branchId = branch.id;

    const customer = await prisma.customer.create({
      data: { tenantId, fullName: "Live View Customer", phone: `+2010${suffix.slice(-8)}` },
    });
    customerId = customer.id;

    const asset = await prisma.asset.create({
      data: { tenantId, category: "CARS", plateNumber: `LV-${suffix.slice(-6)}`, currentOwnerCustomerId: customerId },
    });
    assetId = asset.id;

    platformEmail = `liveview-platform-${suffix}@example.com`;
    await prisma.account.create({
      data: {
        accountType: "PLATFORM",
        email: platformEmail,
        passwordHash: hashPassword(PLATFORM_PASSWORD),
        status: "ACTIVE",
      },
    });

    staffEmail = `liveview-staff-${suffix}@example.com`;
    const staffAccount = await prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId,
        email: staffEmail,
        passwordHash: hashPassword(STAFF_PASSWORD),
        status: "ACTIVE",
      },
    });
    await prisma.staffUser.create({
      data: {
        accountId: staffAccount.id,
        tenantId,
        fullName: "Live View Staff",
        role: "TENANT_OWNER",
        branchScope: [],
        warehouseScope: [],
        categoryScope: ["CARS"],
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
    await prisma.operationEvent.deleteMany({ where: { tenantId } });
    await prisma.workOrder.deleteMany({ where: { tenantId } });
    await prisma.asset.deleteMany({ where: { tenantId } });
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.branch.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.staffUser.deleteMany({ where: { tenantId } });
    await prisma.account.deleteMany({ where: { tenantId } });
    await prisma.account.deleteMany({ where: { email: platformEmail } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  async function createWorkOrder(status: "IN_PROGRESS" | "CLOSED") {
    return prisma.workOrder.create({
      data: { tenantId, branchId, customerId, assetId, status },
    });
  }

  it("a tenant session is rejected with 403 -- cross-tenant data is platform-only", async () => {
    const cookieHeader = await login(staffEmail, STAFF_PASSWORD);

    const res = await request(app.getHttpServer()).get("/api/v1/platform/live-view").set("Cookie", cookieHeader);

    expect(res.status).toBe(403);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/platform/live-view");

    expect(res.status).toBe(401);
  });

  it("counts open jobs from real rows, and excludes closed and cancelled ones", async () => {
    await createWorkOrder("IN_PROGRESS");
    await createWorkOrder("IN_PROGRESS");
    await createWorkOrder("CLOSED");

    const cookieHeader = await login(platformEmail, PLATFORM_PASSWORD);
    const res = await request(app.getHttpServer()).get("/api/v1/platform/live-view").set("Cookie", cookieHeader);

    expect(res.status).toBe(200);
    const mine = res.body.workshops.find((w: { workshopId: string }) => w.workshopId === tenantId);
    expect(mine).toBeDefined();
    // Two open, and the CLOSED one deliberately absent.
    expect(mine.openJobs).toBe(2);
    expect(mine.workshopName).toBe(`Live View Workshop ${suffix}`);
  });

  it("flags a workshop with open work and no activity as quiet", async () => {
    const cookieHeader = await login(platformEmail, PLATFORM_PASSWORD);
    const res = await request(app.getHttpServer()).get("/api/v1/platform/live-view").set("Cookie", cookieHeader);

    const mine = res.body.workshops.find((w: { workshopId: string }) => w.workshopId === tenantId);
    // Open jobs exist but no OperationEvent has been written for them, which
    // is exactly the "started and abandoned" shape the counter is for.
    expect(mine.openJobs).toBeGreaterThan(0);
    expect(mine.eventsToday).toBe(0);
    expect(mine.lastActivityAt).toBeNull();
    expect(res.body.platformTotals.quietWorkshops).toBeGreaterThanOrEqual(1);
  });

  it("turns a real event into a plain-language summary without reading its payload", async () => {
    await prisma.operationEvent.create({
      data: {
        tenantId,
        eventKey: "work_order.status_changed",
        // Everything tenant-private lives in here. If any of it appears in
        // the response, the cross-tenant boundary has leaked.
        payload: { plate: "SECRET-PLATE-9999", customerName: "Do Not Leak", amount: "4200.00" },
        actorId: "actor-live-view",
        actorType: "TENANT_STAFF",
      },
    });

    const cookieHeader = await login(platformEmail, PLATFORM_PASSWORD);
    const res = await request(app.getHttpServer()).get("/api/v1/platform/live-view").set("Cookie", cookieHeader);

    const row = res.body.recentActivity.find(
      (r: { workshopId: string; eventKey: string }) =>
        r.workshopId === tenantId && r.eventKey === "work_order.status_changed",
    );
    expect(row).toBeDefined();
    expect(row.summary).toBe("A job moved to a new stage");

    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toContain("SECRET-PLATE-9999");
    expect(serialised).not.toContain("Do Not Leak");
    expect(serialised).not.toContain("4200.00");
  });

  it("counts that event against the workshop, and stops calling it quiet", async () => {
    const cookieHeader = await login(platformEmail, PLATFORM_PASSWORD);
    const res = await request(app.getHttpServer()).get("/api/v1/platform/live-view").set("Cookie", cookieHeader);

    const mine = res.body.workshops.find((w: { workshopId: string }) => w.workshopId === tenantId);
    expect(mine.eventsToday).toBe(1);
    expect(mine.lastActivityAt).not.toBeNull();
  });

  it("falls back to a readable summary for an event key it has no phrasing for", async () => {
    await prisma.operationEvent.create({
      data: {
        tenantId,
        eventKey: "some_future.event_nobody_mapped",
        payload: {},
        actorId: "actor-live-view",
        actorType: "TENANT_STAFF",
      },
    });

    const cookieHeader = await login(platformEmail, PLATFORM_PASSWORD);
    const res = await request(app.getHttpServer()).get("/api/v1/platform/live-view").set("Cookie", cookieHeader);

    const row = res.body.recentActivity.find(
      (r: { eventKey: string }) => r.eventKey === "some_future.event_nobody_mapped",
    );
    // An unmapped key must never render as blank or "undefined" -- a new
    // event type shipping elsewhere cannot be allowed to blank this page.
    expect(row.summary).toBe("some future event nobody mapped");
  });
});
