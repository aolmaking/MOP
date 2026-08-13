/**
 * Register as Customer -- the only public self-registration path in the
 * whole product (docs/detailed-specs/shared-system-pages.md) -- against
 * a real database.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { RegisterCustomerService } from "./register.service";
import { verifyPassword } from "../auth/password.util";
import type { PrismaService } from "../database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const register = new RegisterCustomerService(asService);

const SUFFIX = `reg-${Date.now()}`;
let tenantId: string;
let planId: string;
let frozenTenantId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Register Test",
      maxBranches: 5,
      maxUsers: 50,
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
      name: `Register WS ${SUFFIX}`,
      nameNormalized: `register ws ${SUFFIX}`,
      slug: `register-ws-${SUFFIX}`,
      customerRegistrationCode: `REG-${SUFFIX}`,
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

  const frozen = await prisma.tenant.create({
    data: {
      name: `Frozen WS ${SUFFIX}`,
      nameNormalized: `frozen ws ${SUFFIX}`,
      slug: `frozen-ws-${SUFFIX}`,
      customerRegistrationCode: `FRZ-${SUFFIX}`,
      status: "FROZEN",
      planId,
      country: "EG",
      city: "Cairo",
      businessType: "Garage",
      primaryCategory: "CARS",
      currency: "EGP",
      timezone: "Africa/Cairo",
    },
  });
  frozenTenantId = frozen.id;
}, 120_000);

afterAll(async () => {
  for (const id of [tenantId, frozenTenantId]) {
    const where = { tenantId: id };
    await prisma.customer.deleteMany({ where });
    await prisma.account.deleteMany({ where });
    await prisma.tenant.deleteMany({ where: { id } });
  }
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("resolveWorkshop", () => {
  it("resolves by slug", async () => {
    const found = await register.resolveWorkshop(`register-ws-${SUFFIX}`);
    expect(found.tenantId).toBe(tenantId);
  });

  it("resolves by customerRegistrationCode, case-insensitively", async () => {
    const found = await register.resolveWorkshop(`reg-${SUFFIX}`.toUpperCase());
    expect(found.tenantId).toBe(tenantId);
  });

  it("refuses an unresolvable code with a generic not-found, not a different error shape", async () => {
    await expect(register.resolveWorkshop("no-such-workshop-code")).rejects.toMatchObject({
      status: 404,
      response: { code: "workshop_not_found" },
    });
  });

  it("refuses a frozen tenant's code the same way as one that doesn't exist -- no path onto a dead workspace", async () => {
    await expect(register.resolveWorkshop(`frozen-ws-${SUFFIX}`)).rejects.toMatchObject({
      status: 404,
      response: { code: "workshop_not_found" },
    });
  });
});

describe("register -- the one outcome: a CUSTOMER account scoped to the resolved tenant", () => {
  it("creates a real, linked Account + Customer pair", async () => {
    const result = await register.register({
      workshopCode: `register-ws-${SUFFIX}`,
      fullName: "Mona Adel",
      phone: "+201000000001",
      email: `mona-${SUFFIX}@example.com`,
      password: "a-real-password-123",
    });

    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: result.customerId } });
    expect(customer.tenantId).toBe(tenantId);
    expect(customer.accountId).not.toBeNull();
    expect(customer.portalStatus).toBe("ENABLED");

    const account = await prisma.account.findUniqueOrThrow({ where: { id: customer.accountId! } });
    expect(account.accountType).toBe("CUSTOMER");
    expect(account.tenantId).toBe(tenantId);
    expect(account.status).toBe("ACTIVE");
    // A real password, not a placeholder -- the person can actually log in.
    expect(verifyPassword("a-real-password-123", account.passwordHash!)).toBe(true);
  });

  it("succeeds without an email -- it's optional per the spec", async () => {
    const result = await register.register({
      workshopCode: `register-ws-${SUFFIX}`,
      fullName: "Karim Nour",
      phone: "+201000000002",
      password: "another-real-password",
    });
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: result.customerId } });
    expect(customer.email).toBeNull();
  });

  it("refuses an email already used by another account, platform-wide", async () => {
    const email = `dup-${SUFFIX}@example.com`;
    await register.register({
      workshopCode: `register-ws-${SUFFIX}`,
      fullName: "First Person",
      phone: "+201000000003",
      email,
      password: "first-password-123",
    });

    await expect(
      register.register({
        workshopCode: `register-ws-${SUFFIX}`,
        fullName: "Second Person",
        phone: "+201000000004",
        email,
        password: "second-password-123",
      }),
    ).rejects.toMatchObject({ status: 409, response: { code: "email_taken" } });
  });

  it("refuses a password shorter than 12 characters", async () => {
    await expect(
      register.register({
        workshopCode: `register-ws-${SUFFIX}`,
        fullName: "Short Password",
        phone: "+201000000005",
        password: "short",
      }),
    ).rejects.toMatchObject({ status: 400, response: { code: "password_too_short" } });
  });

  it("refuses to create anything against an unresolvable workshop code -- no floating customer account", async () => {
    await expect(
      register.register({
        workshopCode: "no-such-workshop-code",
        fullName: "Nobody",
        phone: "+201000000006",
        password: "a-real-password-123",
      }),
    ).rejects.toMatchObject({ status: 404, response: { code: "workshop_not_found" } });

    const orphan = await prisma.customer.findFirst({ where: { fullName: "Nobody" } });
    expect(orphan).toBeNull();
  });
});
