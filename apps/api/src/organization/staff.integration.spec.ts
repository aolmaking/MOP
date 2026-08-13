/**
 * Organization & Access -- Staff tab, against a real database.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { AuditService } from "../audit/audit.service";
import { StaffService } from "./staff.service";
import type { PrismaService } from "../database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const staff = new StaffService(asService, audit);

const SUFFIX = `org-${Date.now()}`;
let tenantId: string;
let planId: string;
const actor = { accountId: "owner-account-id", displayName: "Test Owner" };

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Org Test",
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
      name: `Org WS ${SUFFIX}`,
      nameNormalized: `org ws ${SUFFIX}`,
      slug: `org-ws-${SUFFIX}`,
      customerRegistrationCode: `ORG-${SUFFIX}`,
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
}, 120_000);

afterAll(async () => {
  await prisma.staffUser.deleteMany({ where: { tenantId } });
  await prisma.account.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("StaffService.invite", () => {
  it("creates a real, linked Account + StaffUser pair, invite-token-only", async () => {
    const result = await staff.invite(
      tenantId,
      {
        fullName: "Nadia Fathi",
        email: `nadia-${SUFFIX}@example.com`,
        phone: "+201000001001",
        role: "BRANCH_MANAGER",
        branchScope: ["branch-1"],
      },
      actor,
    );

    const row = await prisma.staffUser.findUniqueOrThrow({
      where: { id: result.staffId },
      include: { account: true },
    });
    expect(row.role).toBe("BRANCH_MANAGER");
    expect(row.account.status).toBe("INVITED");
    expect(row.account.passwordHash).toBeNull();
    expect(row.account.inviteTokenHash).not.toBeNull();
  });

  it("refuses Branch Manager with no branch scope", async () => {
    await expect(
      staff.invite(
        tenantId,
        { fullName: "No Branch", email: `nb-${SUFFIX}@example.com`, phone: "+201000001002", role: "BRANCH_MANAGER" },
        actor,
      ),
    ).rejects.toMatchObject({ status: 400, response: { code: "branch_scope_required" } });
  });

  it("refuses a duplicate email within the same tenant", async () => {
    const email = `dup-${SUFFIX}@example.com`;
    await staff.invite(tenantId, { fullName: "First", email, phone: "+201000001003", role: "DATA_ANALYST" }, actor);
    await expect(
      staff.invite(tenantId, { fullName: "Second", email, phone: "+201000001004", role: "DATA_ANALYST" }, actor),
    ).rejects.toMatchObject({ status: 409, response: { code: "email_taken" } });
  });
});

describe("StaffService.setActive / setLocked -- what AuthService.login actually enforces", () => {
  it("deactivate flips both StaffUser.isActive and Account.status, and is reversible", async () => {
    const { staffId } = await staff.invite(
      tenantId,
      { fullName: "Karim Deactivate", email: `deact-${SUFFIX}@example.com`, phone: "+201000001005", role: "DATA_ANALYST" },
      actor,
    );

    await staff.setActive(tenantId, staffId, false, actor);
    let row = await prisma.staffUser.findUniqueOrThrow({ where: { id: staffId }, include: { account: true } });
    expect(row.isActive).toBe(false);
    expect(row.account.status).toBe("INACTIVE");

    await staff.setActive(tenantId, staffId, true, actor);
    row = await prisma.staffUser.findUniqueOrThrow({ where: { id: staffId }, include: { account: true } });
    expect(row.isActive).toBe(true);
    expect(row.account.status).toBe("ACTIVE");
  });

  it("lock sets StaffUser.lockedAt and Account.status = LOCKED, distinct from deactivate", async () => {
    const { staffId } = await staff.invite(
      tenantId,
      { fullName: "Sara Lock", email: `lock-${SUFFIX}@example.com`, phone: "+201000001006", role: "DATA_ANALYST" },
      actor,
    );

    await staff.setLocked(tenantId, staffId, true, actor);
    const row = await prisma.staffUser.findUniqueOrThrow({ where: { id: staffId }, include: { account: true } });
    expect(row.lockedAt).not.toBeNull();
    expect(row.account.status).toBe("LOCKED");
    // Still active -- lock and deactivate are deliberately independent axes.
    expect(row.isActive).toBe(true);
  });
});

describe("StaffService.updateScope", () => {
  it("updates branch/warehouse/category scope and records before/after in the audit trail", async () => {
    const { staffId } = await staff.invite(
      tenantId,
      { fullName: "Scope Test", email: `scope-${SUFFIX}@example.com`, phone: "+201000001007", role: "TECHNICIAN" },
      actor,
    );

    await staff.updateScope(tenantId, staffId, { branchScope: ["branch-2"] }, actor);
    const row = await prisma.staffUser.findUniqueOrThrow({ where: { id: staffId } });
    expect(row.branchScope).toEqual(["branch-2"]);

    const entry = await prisma.auditLog.findFirst({
      where: { tenantId, targetId: staffId, action: "staff.scope_updated" },
      orderBy: { createdAt: "desc" },
    });
    expect(entry).not.toBeNull();
  });
});
