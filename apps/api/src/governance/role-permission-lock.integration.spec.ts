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
import { AuditService } from "../audit/audit.service";
import { PermissionContextService } from "../access/permission-context.service";
import { PermissionResolverService } from "../access/permission-resolver.service";
import { PlatformControlLayer } from "../access/layers/platform-control.layer";
import { PlanEntitlementLayer } from "../access/layers/plan-entitlement.layer";
import { TenantStatusLayer } from "../access/layers/tenant-status.layer";
import { StaffRestrictionLayer } from "../access/layers/staff-restriction.layer";
import { TenantCapabilityLayer } from "../access/layers/tenant-capability.layer";
import { ModuleEnabledLayer } from "../access/layers/module-enabled.layer";
import { FeatureEnabledLayer } from "../access/layers/feature-enabled.layer";
import { WorkshopConfigurationLayer } from "../access/layers/workshop-configuration.layer";
import { DelegationLayer } from "../access/layers/delegation.layer";
import { RolePermissionTemplateLayer } from "../access/layers/role-permission-template.layer";
import { UserOverrideLayer } from "../access/layers/user-override.layer";
import { CapabilityResolutionService } from "../capabilities/capability-resolution.service";
import { createSession } from "../access/test-support/session-fixture";
import type { PrismaService } from "../database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const locks = new RolePermissionLockService(asService, new AuditService(asService));

const capabilities = new CapabilityResolutionService(asService);
const contextService = new PermissionContextService(asService, capabilities);
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
    await locks.unlock(tenantId, "TEAM_LEADER", "team.home.view", "platform-1", "Admin");

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

    await locks.unlock(tenantId, "BRANCH_MANAGER", KEY, "platform-1", "Admin");
    const afterUnlock = await resolver.resolve(session, KEY);
    expect(afterUnlock.reason).not.toContain("Platform Super Admin");
  });
});
