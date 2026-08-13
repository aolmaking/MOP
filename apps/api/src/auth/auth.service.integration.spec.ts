/**
 * Proves the Phase 1 DoD claim for real: login -> session (cookie) ->
 * protected request -> refresh rotation -> logout, against the real test
 * database, plus lockout and the tenant-frozen block. No mocks for any of
 * this -- password hashes are real scrypt, sessions are real rows.
 */
process.env.DATABASE_URL ??=
  "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import { scryptSync } from "node:crypto";
import { PrismaClient } from "@mop/database";
import type { PrismaService } from "../database/prisma.service";
import { AuthService, LOCKOUT_THRESHOLD, MultipleAccountsError, TenantUnavailableError } from "./auth.service";
import { hashPassword } from "./password.util";
import { parseToken } from "./token.util";

describe("AuthService (integration)", () => {
  const prisma = new PrismaClient();
  let service: AuthService;
  let tenantId: string;
  let planId: string;

  beforeAll(async () => {
    service = new AuthService(prisma as unknown as PrismaService);

    const plan = await prisma.plan.create({
      data: {
        code: `AUTH-TEST-${Date.now()}`,
        name: "Test Plan",
        maxBranches: 5,
        maxUsers: 20,
        maxWarehouses: 5,
        allowedCategories: ["CARS"],
        allowedModules: ["INVENTORY"],
        allowedFeatures: ["QUICK_INSPECTION"],
        allowedReports: [],
        monthlyPrice: 0,
      },
    });
    planId = plan.id;

    const tenant = await prisma.tenant.create({
      data: {
        name: "Auth Integration Workshop",
        nameNormalized: `auth integration workshop ${Date.now()}`,
        slug: `auth-integration-${Date.now()}`,
        customerRegistrationCode: `AIC-${Date.now()}`,
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
        enabledFeatures: ["QUICK_INSPECTION"],
        forms: {},
        messageTemplates: {},
      },
    });
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { tenantId } });
    await prisma.teamMembership.deleteMany({ where: { tenantId } });
    await prisma.team.deleteMany({ where: { tenantId } });
    await prisma.staffUser.deleteMany({ where: { tenantId } });
    await prisma.account.deleteMany({ where: { tenantId } });
    await prisma.tenantConfiguration.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  async function createStaffAccount(email: string, password: string, role: "BRANCH_MANAGER" | "TEAM_LEADER" = "BRANCH_MANAGER") {
    const account = await prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId,
        email,
        passwordHash: hashPassword(password),
        status: "ACTIVE",
      },
    });
    await prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId,
        fullName: "Test Branch Manager",
        role,
        branchScope: ["branch-1"],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });
    return account;
  }

  it("logs in with correct credentials and resolves a real session context", async () => {
    const email = `bm-${Date.now()}@example.com`;
    await createStaffAccount(email, "correct-password-123");

    const { context, cookies } = await service.login(email, "correct-password-123");

    expect(context.accountType).toBe("TENANT_STAFF");
    expect(context.tenantId).toBe(tenantId);
    expect(context.role).toBe("BRANCH_MANAGER");
    expect(context.branchScope).toEqual(["branch-1"]);
    expect(context.enabledModules).toEqual(["INVENTORY"]);
    expect(context.landingPage).toBe("branch-home");
    expect(parseToken(cookies.accessToken.value)).not.toBeNull();
    expect(parseToken(cookies.refreshToken.value)).not.toBeNull();

    const session = await prisma.session.findUnique({ where: { id: parseToken(cookies.accessToken.value)!.sessionId } });
    expect(session).not.toBeNull();
    expect(session!.revokedAt).toBeNull();
  });

  // P-62 (E18): the one integration proof that matters -- a real login
  // against a real stored legacy-format hash actually rewrites the row,
  // not just that the pure function says it should.
  it("P-62/E18 -- upgrades a legacy-format password hash on successful login", async () => {
    const email = `legacy-${Date.now()}@example.com`;
    const password = "legacy-format-password-123";
    const legacySalt = "aabbccddeeff00112233445566778899";
    // Reconstructed by hand to match exactly what hashPassword() used to
    // write before P-62, with no version encoded.
    const legacyHashHex = scryptSync(password, legacySalt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }).toString(
      "hex",
    );
    const legacyHash = `scrypt$${legacySalt}$${legacyHashHex}`;

    const account = await prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId, email, passwordHash: legacyHash, status: "ACTIVE" },
    });
    await prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId,
        fullName: "Legacy Hash Account",
        role: "BRANCH_MANAGER",
        branchScope: ["branch-1"],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });

    const before = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
    expect(before.passwordHash).toBe(legacyHash);

    await service.login(email, password);

    const after = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
    expect(after.passwordHash).not.toBe(legacyHash);
    expect(after.passwordHash!.split("$")).toHaveLength(6); // upgraded to the versioned format

    // And the new hash still authenticates the same password correctly.
    await expect(service.login(email, password)).resolves.toBeDefined();
    // A second successful login does not need to rehash again -- the
    // stored hash should now be stable.
    const stable = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
    expect(stable.passwordHash).toBe(after.passwordHash);
  });

  it("rejects an incorrect password with a generic message", async () => {
    const email = `bm-${Date.now()}-2@example.com`;
    await createStaffAccount(email, "correct-password-123");

    await expect(service.login(email, "totally-wrong")).rejects.toThrow("Incorrect email or password");
  });

  it("rejects a login for an email that doesn't exist with the identical generic message", async () => {
    await expect(service.login("does-not-exist@example.com", "anything")).rejects.toThrow(
      "Incorrect email or password",
    );
  });

  it("a resolved access token grants a protected request (getSessionContext) and an unrelated/garbage token does not", async () => {
    const email = `bm-${Date.now()}-3@example.com`;
    await createStaffAccount(email, "correct-password-123");
    const { cookies } = await service.login(email, "correct-password-123");

    const resolved = await service.getSessionContext(cookies.accessToken.value);
    expect(resolved.role).toBe("BRANCH_MANAGER");

    await expect(service.getSessionContext("not-a-real-session.deadbeef")).rejects.toThrow();
    await expect(service.getSessionContext(undefined)).rejects.toThrow();
  });

  it("refresh rotates both tokens -- the old access token stops working, the new one works", async () => {
    const email = `bm-${Date.now()}-4@example.com`;
    await createStaffAccount(email, "correct-password-123");
    const { cookies: original } = await service.login(email, "correct-password-123");

    const { cookies: rotated } = await service.refresh(original.refreshToken.value);

    expect(rotated.accessToken.value).not.toBe(original.accessToken.value);
    expect(rotated.refreshToken.value).not.toBe(original.refreshToken.value);

    // Old access token (pre-rotation) must no longer resolve.
    await expect(service.getSessionContext(original.accessToken.value)).rejects.toThrow();
    // New access token resolves fine.
    const resolved = await service.getSessionContext(rotated.accessToken.value);
    expect(resolved.role).toBe("BRANCH_MANAGER");

    // Old refresh token is also single-use -- replaying it must fail.
    await expect(service.refresh(original.refreshToken.value)).rejects.toThrow();
  });

  it("logout revokes the session -- the access token stops working afterward", async () => {
    const email = `bm-${Date.now()}-5@example.com`;
    await createStaffAccount(email, "correct-password-123");
    const { cookies } = await service.login(email, "correct-password-123");

    await service.getSessionContext(cookies.accessToken.value); // still valid before logout
    await service.logout(cookies.accessToken.value);

    await expect(service.getSessionContext(cookies.accessToken.value)).rejects.toThrow();
  });

  it(
    "locks the account after repeated failed attempts, and a correct password doesn't help while locked",
    async () => {
      const email = `bm-${Date.now()}-6@example.com`;
      await createStaffAccount(email, "correct-password-123");

      for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
        await expect(service.login(email, "wrong")).rejects.toThrow();
      }

      // Even the correct password is now rejected -- with a distinctly
      // different message (locked, not "incorrect").
      await expect(service.login(email, "correct-password-123")).rejects.toThrow(/temporarily locked/);
    },
    // LOCKOUT_THRESHOLD+1 real scrypt verifications in one test, deliberately
    // expensive (N=131072 per password.util.ts) -- the default 5000ms budget
    // is tuned for single-hash tests and this one genuinely needs more room.
    20000,
  );

  it("blocks login for a frozen tenant with a distinct error, after credentials already checked out", async () => {
    const email = `bm-${Date.now()}-7@example.com`;
    await createStaffAccount(email, "correct-password-123");
    await prisma.tenant.update({ where: { id: tenantId }, data: { status: "FROZEN" } });

    await expect(service.login(email, "correct-password-123")).rejects.toBeInstanceOf(TenantUnavailableError);

    await prisma.tenant.update({ where: { id: tenantId }, data: { status: "ACTIVE" } });
  });

  it("resolves managedTechnicianIds for a Team Leader from real TeamMembership rows", async () => {
    const leaderEmail = `tl-${Date.now()}@example.com`;
    const leaderAccount = await createStaffAccount(leaderEmail, "correct-password-123", "TEAM_LEADER");
    const leaderStaff = await prisma.staffUser.findUniqueOrThrow({ where: { accountId: leaderAccount.id } });

    const technicianAccount = await createStaffAccount(`tech-${Date.now()}@example.com`, "irrelevant", "BRANCH_MANAGER");
    const technicianStaff = await prisma.staffUser.findUniqueOrThrow({ where: { accountId: technicianAccount.id } });

    const team = await prisma.team.create({
      data: { tenantId, name: "Test Team", teamLeaderId: leaderStaff.id },
    });
    await prisma.teamMembership.create({ data: { tenantId, teamId: team.id, technicianId: technicianStaff.id } });

    const { context } = await service.login(leaderEmail, "correct-password-123");
    expect(context.managedTechnicianIds).toEqual([technicianStaff.id]);
  });

  it("surfaces MultipleAccountsError rather than guessing when the same email/password matches accounts at two tenants", async () => {
    const sharedEmail = `shared-${Date.now()}@example.com`;
    const sharedPassword = "same-password-both-tenants";
    await createStaffAccount(sharedEmail, sharedPassword);

    const otherPlan = await prisma.plan.create({
      data: {
        code: `AUTH-TEST-2-${Date.now()}`,
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
        name: "Second Workshop",
        nameNormalized: `second workshop ${Date.now()}`,
        slug: `second-workshop-${Date.now()}`,
        customerRegistrationCode: `SW-${Date.now()}`,
        planId: otherPlan.id,
        country: "EG",
        city: "Giza",
        businessType: "Independent Garage",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
      },
    });
    const otherAccount = await prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId: otherTenant.id,
        email: sharedEmail,
        passwordHash: hashPassword(sharedPassword),
        status: "ACTIVE",
      },
    });
    await prisma.staffUser.create({
      data: {
        accountId: otherAccount.id,
        tenantId: otherTenant.id,
        fullName: "Same Person, Other Workshop",
        role: "BRANCH_MANAGER",
        branchScope: ["branch-x"],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });

    await expect(service.login(sharedEmail, sharedPassword)).rejects.toBeInstanceOf(MultipleAccountsError);

    // cleanup this test's extra tenant
    await prisma.staffUser.deleteMany({ where: { tenantId: otherTenant.id } });
    await prisma.account.deleteMany({ where: { tenantId: otherTenant.id } });
    await prisma.tenant.delete({ where: { id: otherTenant.id } });
    await prisma.plan.delete({ where: { id: otherPlan.id } });
  });
});
