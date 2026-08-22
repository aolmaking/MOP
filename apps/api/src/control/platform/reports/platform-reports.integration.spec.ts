/**
 * Platform Reports -- Level 1 overview and Level 2's Usage Overview
 * section, against a real database.
 *
 * The property under test throughout: every number on this page is
 * derived from a real row somewhere, never invented. `usageScore` is
 * this project's own composite (the source spec doesn't pin a formula),
 * so what's proven here is that it moves the way its own definition
 * says it should, not that it matches some external "correct" value.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { PlatformReportsService } from "./platform-reports.service";
import { WorkshopsService } from "../workshops/workshops.service";
import { WorkshopHealthService } from "../workshops/workshop-health.service";
import { AuditService } from "../../../audit/audit.service";
import { hashPassword } from "../../../identity/auth/password.util";
import { TenantEntitlementsService } from "../../entitlements/tenant-entitlements.service";
import type { PrismaService } from "../../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const health = new WorkshopHealthService();
const audit = new AuditService(asService);
const workshops = new WorkshopsService(asService, audit, health, new TenantEntitlementsService(asService, audit));
const reports = new PlatformReportsService(asService, workshops);

const SUFFIX = `plat-rep-${Date.now()}`;

let tenantId: string;
let planId: string;
let ownerAccountId: string;
let ownerStaffId: string;
let managerAccountId: string;
let managerStaffId: string;
let customerAccountId: string;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function session(accountId: string, tenantIdForSession: string, createdAt: Date) {
  await prisma.session.create({
    data: {
      accountId,
      tenantId: tenantIdForSession,
      accessSecretHash: "test-hash",
      expiresAt: new Date(createdAt.getTime() + 60 * 60 * 1000),
      createdAt,
    },
  });
}

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Reports Test Plan",
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
      name: `Reports WS ${SUFFIX}`,
      nameNormalized: `reports ws ${SUFFIX}`,
      slug: `reports-ws-${SUFFIX}`,
      customerRegistrationCode: `RP-${SUFFIX}`,
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

  const ownerAccount = await prisma.account.create({
    data: { accountType: "TENANT_STAFF", tenantId, email: `owner-${SUFFIX}@example.com`, passwordHash: hashPassword("x"), status: "ACTIVE" },
  });
  ownerAccountId = ownerAccount.id;
  const ownerStaff = await prisma.staffUser.create({
    data: { tenantId, accountId: ownerAccountId, fullName: "Owner Person", role: "TENANT_OWNER", isActive: true },
  });
  ownerStaffId = ownerStaff.id;

  const managerAccount = await prisma.account.create({
    data: { accountType: "TENANT_STAFF", tenantId, email: `manager-${SUFFIX}@example.com`, passwordHash: hashPassword("x"), status: "ACTIVE" },
  });
  managerAccountId = managerAccount.id;
  const managerStaff = await prisma.staffUser.create({
    data: { tenantId, accountId: managerAccountId, fullName: "Manager Person", role: "BRANCH_MANAGER", isActive: true },
  });
  managerStaffId = managerStaff.id;

  const customerAccount = await prisma.account.create({
    data: { accountType: "CUSTOMER", tenantId, email: `customer-${SUFFIX}@example.com`, passwordHash: hashPassword("x"), status: "ACTIVE" },
  });
  customerAccountId = customerAccount.id;
  await prisma.customer.create({
    data: { tenantId, accountId: customerAccountId, fullName: "Test Customer", phone: "0100000000" },
  });

  // Owner logged in recently -- not stale. Manager logged in twice inside
  // the 30-day window (only one distinct account, still counted once).
  await session(ownerAccountId, tenantId, daysAgo(2));
  await session(managerAccountId, tenantId, daysAgo(5));
  await session(managerAccountId, tenantId, daysAgo(3));
  // Outside the 30-day window -- must not count toward the window's totals.
  await session(managerAccountId, tenantId, daysAgo(45));
  await session(customerAccountId, tenantId, daysAgo(4));

  await audit.record({
    tenantId,
    actorId: managerAccountId,
    actorType: "TENANT_STAFF",
    actorName: "Manager Person",
    targetType: "WorkOrder",
    targetId: "wo-1",
    action: "workorder.status.changed",
    riskLevel: "LOW",
  });

  const branch = await prisma.branch.create({ data: { tenantId, name: "Main", code: `MAIN-${SUFFIX}`, city: "Cairo" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { accountId: customerAccountId } });
  const asset = await prisma.asset.create({
    data: { tenantId, category: "CARS", plateNumber: `RPT-${SUFFIX}`, currentOwnerCustomerId: customer.id },
  });
  const wo = await prisma.workOrder.create({
    data: { tenantId, branchId: branch.id, assetId: asset.id, customerId: customer.id, status: "REGISTERED", inspectionDeclined: false },
  });

  await prisma.customerDecisionRequest.create({
    data: {
      tenantId,
      workOrderId: wo.id,
      customerId: customer.id,
      status: "RESOLVED",
      secureToken: `tok-${SUFFIX}-1`,
      respondedAt: daysAgo(1),
      createdById: managerAccountId,
    },
  });
  await prisma.customerDecisionRequest.create({
    data: {
      tenantId,
      workOrderId: wo.id,
      customerId: customer.id,
      status: "PENDING",
      secureToken: `tok-${SUFFIX}-2`,
      createdById: managerAccountId,
    },
  });
}, 180_000);

afterAll(async () => {
  const where = { tenantId };
  await prisma.customerDecisionItem.deleteMany({ where: { decisionRequest: { tenantId } } });
  await prisma.customerDecisionRequest.deleteMany({ where });
  await prisma.workOrder.deleteMany({ where });
  await prisma.asset.deleteMany({ where });
  await prisma.branch.deleteMany({ where });
  await prisma.auditLog.deleteMany({ where });
  await prisma.session.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where });
  await prisma.staffUser.deleteMany({ where });
  await prisma.account.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
  await prisma.plan.delete({ where: { id: planId } });
  await prisma.$disconnect();
}, 60_000);

describe("PlatformReportsService.overview", () => {
  it("counts this tenant into the platform totals", async () => {
    const result = await reports.overview({ page: 1, pageSize: 25, sort: "created_desc" });

    expect(result.totals.totalWorkshops).toBeGreaterThanOrEqual(1);
    expect(result.totals.totalStaffUsers).toBeGreaterThanOrEqual(2);
    expect(result.totals.totalCustomers).toBeGreaterThanOrEqual(1);
    // Not backed by real billing yet -- must stay an explicit null, never a guessed number.
    expect(result.totals.aggregateMrr).toBeNull();
  });

  it("gives this workshop's card real staff and customer counts", async () => {
    const result = await reports.overview({ page: 1, pageSize: 100, sort: "created_desc", search: SUFFIX });

    const card = result.workshops.items.find((w) => w.id === tenantId);
    expect(card).toBeDefined();
    expect(card!.staffUserCount).toBe(2);
    expect(card!.customerCount).toBe(1);
    // lastActivityAt is max(last session, last audit row) -- the audit
    // row recorded in setup() just now outranks the owner's 2-day-old
    // session, landing this in the "<=1 day" bucket.
    expect(card!.usageScore).toBe(100);
  });

  it("scores a workshop with no recorded activity at zero, not a guessed default", async () => {
    const emptyTenant = await prisma.tenant.create({
      data: {
        name: `Empty WS ${SUFFIX}`,
        nameNormalized: `empty ws ${SUFFIX}`,
        slug: `empty-ws-${SUFFIX}`,
        customerRegistrationCode: `EM-${SUFFIX}`,
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

    const result = await reports.overview({ page: 1, pageSize: 100, sort: "created_desc", search: `Empty WS ${SUFFIX}` });
    const card = result.workshops.items.find((w) => w.id === emptyTenant.id);
    expect(card?.usageScore).toBe(0);

    await prisma.tenant.delete({ where: { id: emptyTenant.id } });
  });
});

describe("PlatformReportsService.usageOverview", () => {
  it("splits active users into staff and customer, excluding sessions outside the window", async () => {
    const result = await reports.usageOverview(tenantId, 30);

    // Owner + manager, one distinct account each, despite the manager
    // having two sessions inside the window -- distinct, not a raw count.
    expect(result.activeUsers.staff).toBe(2);
    expect(result.activeUsers.customer).toBe(1);
  });

  it("flags the owner's login as not stale when it happened recently", async () => {
    const result = await reports.usageOverview(tenantId, 30);

    expect(result.ownerLastLogin.at).not.toBeNull();
    expect(result.ownerLastLogin.staleDays).toBe(2);
    expect(result.ownerLastLogin.isStale).toBe(false);
  });

  it("shows each staff member's most recent recorded action", async () => {
    const result = await reports.usageOverview(tenantId, 30);

    const manager = result.staffActivity.find((s) => s.staffUserId === managerStaffId);
    expect(manager?.lastAction).toBe("workorder.status.changed");

    // The owner never wrote an audit row in this test -- must read as
    // "no recent activity", never a fabricated action.
    const owner = result.staffActivity.find((s) => s.staffUserId === ownerStaffId);
    expect(owner?.lastAction).toBeNull();
  });

  it("computes the decision response rate as responded over total, in this window", async () => {
    const result = await reports.usageOverview(tenantId, 30);

    // One APPROVED, one PENDING -> 50%.
    expect(result.customerPortal.decisionResponseRate).toBe(50);
  });

  it("buckets logins per day across the full window, including empty days", async () => {
    const result = await reports.usageOverview(tenantId, 30);

    expect(result.loginsByDay.length).toBe(30);
    const total = result.loginsByDay.reduce((sum, day) => sum + day.count, 0);
    // 5 sessions created in setup minus the one 45 days out (outside a
    // 30-day window) = 4 counted.
    expect(total).toBe(4);
  });
});
