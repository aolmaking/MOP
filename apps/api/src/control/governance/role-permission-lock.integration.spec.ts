/**
 * The role_permission_lock write path, and the full loop proving it
 * actually reaches PlatformControlLayer -- the read side that has
 * existed since Phase 3 with nothing ever writing to it. This is the
 * 53-page audit's highest-leverage missing subsystem: without this test,
 * "the writer exists" and "the writer actually changes what the
 * permission resolver decides" are two different, unverified claims.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { RolePermissionLockService } from "./role-permission-lock.service";
import { TenantEntitlementsService } from "../entitlements/tenant-entitlements.service";
import { AuditService } from "../../audit/audit.service";
import { PermissionContextService } from "../../identity/access/permission-context.service";
import { PermissionResolverService } from "../../identity/access/permission-resolver.service";
import { PlatformControlLayer } from "../../identity/access/layers/platform-control.layer";
import { PlanEntitlementLayer } from "../../identity/access/layers/plan-entitlement.layer";
import { TenantStatusLayer } from "../../identity/access/layers/tenant-status.layer";
import { StaffRestrictionLayer } from "../../identity/access/layers/staff-restriction.layer";
import { TenantCapabilityLayer } from "../../identity/access/layers/tenant-capability.layer";
import { ModuleEnabledLayer } from "../../identity/access/layers/module-enabled.layer";
import { FeatureEnabledLayer } from "../../identity/access/layers/feature-enabled.layer";
import { WorkshopConfigurationLayer } from "../../identity/access/layers/workshop-configuration.layer";
import { DelegationLayer } from "../../identity/access/layers/delegation.layer";
import { RolePermissionTemplateLayer } from "../../identity/access/layers/role-permission-template.layer";
import { UserOverrideLayer } from "../../identity/access/layers/user-override.layer";
import { CapabilityResolutionService } from "../capabilities/capability-resolution.service";
import { createSession } from "../../identity/access/test-support/session-fixture";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const locks = new RolePermissionLockService(asService, audit);

const capabilities = new CapabilityResolutionService(asService);
const entitlements = new TenantEntitlementsService(asService, audit);
const contextService = new PermissionContextService(asService, capabilities, entitlements);
const resolver = new PermissionResolverService(
  contextService,
  new PlatformControlLayer(),
  new PlanEntitlementLayer(),
  new TenantStatusLayer(),
  new StaffRestrictionLayer(),
  new TenantCapabilityLayer(),
  new ModuleEnabledLayer(),
  new FeatureEnabledLayer(),
  new WorkshopConfigurationLayer(),
  new DelegationLayer(),
  new RolePermissionTemplateLayer(),
  new UserOverrideLayer(),
);

const SUFFIX = `rpl-${Date.now()}`;
let planId: string;
let tenantId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Governance",
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
      name: `RPL ${SUFFIX}`,
      nameNormalized: `rpl ${SUFFIX}`,
      slug: `rpl-${SUFFIX}`,
      customerRegistrationCode: `RPL-${SUFFIX}`,
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
  await prisma.auditLog.deleteMany({ where: { tenantId } });
  await prisma.controlSetting.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("the writer", () => {
  it("locks a role/permission pair and it shows up in listActive", async () => {
    await locks.lock(tenantId, "BRANCH_MANAGER", "inventory.stock.adjust", false, "Investigation ongoing", "platform-1", "Platform Admin");

    const active = await locks.listActive(tenantId);
    const found = active.find((l) => l.role === "BRANCH_MANAGER" && l.permissionKey === "inventory.stock.adjust");
    expect(found?.allowed).toBe(false);
  });

  it("writes a HIGH-risk audit row", async () => {
    await locks.lock(tenantId, "TECHNICIAN", "task.complete", false, "Under review", "platform-1", "Platform Admin");

    const row = await prisma.auditLog.findFirst({
      where: { tenantId, action: "governance.role_permission_lock.set", targetType: "ControlSetting" },
      orderBy: { createdAt: "desc" },
    });
    expect(row?.riskLevel).toBe("HIGH");
    expect(row?.actorType).toBe("PLATFORM");
  });

  it("re-locking the same role/permission closes the old row and keeps history, never deleting it", async () => {
    await locks.lock(tenantId, "INVENTORY_MANAGER", "inventory.request.issue", false, "first", "platform-1", "Admin");
    await locks.lock(tenantId, "INVENTORY_MANAGER", "inventory.request.issue", true, "reversed", "platform-1", "Admin");

    const history = await locks.history(tenantId);
    const rowsForKey = history.filter((h) => h.role === "INVENTORY_MANAGER" && h.permissionKey === "inventory.request.issue");
    expect(rowsForKey.length).toBeGreaterThanOrEqual(2);
    expect(rowsForKey.filter((r) => r.active)).toHaveLength(1);
    expect(rowsForKey.find((r) => r.active)?.allowed).toBe(true);
  });

  it("unlock deactivates rather than deletes", async () => {
    await locks.lock(tenantId, "TEAM_LEADER", "team.home.view", false, "temp", "platform-1", "Admin");
    await locks.unlock(tenantId, "TEAM_LEADER", "team.home.view", "platform-1", "Admin", "Review finished.");

    const active = await locks.listActive(tenantId);
    expect(active.some((l) => l.role === "TEAM_LEADER" && l.permissionKey === "team.home.view")).toBe(false);

    const history = await locks.history(tenantId);
    expect(history.some((l) => l.role === "TEAM_LEADER" && l.permissionKey === "team.home.view")).toBe(true);

    const removedRow = await prisma.auditLog.findFirst({
      where: { tenantId, action: "governance.role_permission_lock.removed" },
    });
    expect(removedRow).not.toBeNull();
  });
});

describe("the full loop -- the writer actually reaches PlatformControlLayer", () => {
  it("locking a permission OFF for a role makes the resolver deny it, even though the role template would otherwise allow it", async () => {
    const session = createSession({
      tenantId,
      role: "BRANCH_MANAGER",
      staffUserId: "staff-x",
      enabledModules: ["OPERATIONS"],
    });

    // A key untouched by any other test in this file -- avoids collision
    // with the "the writer" describe block, which locks
    // BRANCH_MANAGER/inventory.stock.adjust itself.
    const KEY = "workorders.branch.view";

    // Seed the tenant's own role template granting this permission --
    // proves the platform lock overrides a real grant, not merely an
    // absence.
    await prisma.rolePermission.create({
      data: { tenantId, role: "BRANCH_MANAGER", permissionKey: KEY, allowed: true },
    });

    const beforeLock = await resolver.resolve(session, KEY);
    expect(beforeLock.allowed).toBe(true);

    await locks.lock(tenantId, "BRANCH_MANAGER", KEY, false, "Fraud investigation", "platform-1", "Admin");

    const afterLock = await resolver.resolve(session, KEY);
    expect(afterLock.allowed).toBe(false);
    expect(afterLock.locked).toBe(true);
    expect(afterLock.reason).toContain("Locked by Platform Super Admin");

    await locks.unlock(tenantId, "BRANCH_MANAGER", KEY, "platform-1", "Admin", "Override no longer needed.");
    const afterUnlock = await resolver.resolve(session, KEY);
    expect(afterUnlock.reason).not.toContain("Platform Super Admin");
  });
});

/**
 * A lock has to be reversible, and the reversal has to be explicable.
 *
 * Setting a lock always demanded a reason; removing one -- audited at the
 * same HIGH risk, and the act that hands a permission back to a workshop
 * the platform took it from -- recorded none. A trail that says access
 * was restored but never why is the half that gets questioned later.
 */
describe("removing a lock", () => {
  const KEY2 = "finance.invoice.view";

  it("records why the permission was handed back", async () => {
    await locks.lock(tenantId, "BRANCH_MANAGER", KEY2, false, "Compliance hold", "platform-1", "Admin");
    await locks.unlock(tenantId, "BRANCH_MANAGER", KEY2, "platform-1", "Admin", "Compliance review closed.");

    const entry = await prisma.auditLog.findFirst({
      where: { tenantId, action: "governance.role_permission_lock.removed" },
      orderBy: { createdAt: "desc" },
      select: { reason: true, riskLevel: true },
    });

    expect(entry!.reason).toBe("Compliance review closed.");
    expect(entry!.riskLevel).toBe("HIGH");
  });

  it("restores the permission the workshop had before the lock", async () => {
    await locks.lock(tenantId, "BRANCH_MANAGER", KEY2, false, "Hold", "platform-1", "Admin");
    const locked = await locks.listActive(tenantId);
    expect(locked.some((l) => l.permissionKey === KEY2)).toBe(true);

    await locks.unlock(tenantId, "BRANCH_MANAGER", KEY2, "platform-1", "Admin", "Released.");
    const after = await locks.listActive(tenantId);

    // Gone from what is in force, still present in the history.
    expect(after.some((l) => l.permissionKey === KEY2)).toBe(false);
    const history = await locks.history(tenantId);
    expect(history.some((l) => l.permissionKey === KEY2)).toBe(true);
  });

  it("refuses to remove a lock that is not in force", async () => {
    await expect(
      // A key this spec never locks, so "not in force" is genuinely true
      // rather than an artefact of another test in the file.
      locks.unlock(tenantId, "DATA_ANALYST", "reports.company.view", "platform-1", "Admin", "Nothing to remove."),
    ).rejects.toThrow(/No active lock/);
  });
});
