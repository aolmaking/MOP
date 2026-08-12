import { PermissionContextService } from "./permission-context.service";
import { PermissionResolverService } from "./permission-resolver.service";
import { PlatformControlLayer } from "./layers/platform-control.layer";
import { PlanEntitlementLayer } from "./layers/plan-entitlement.layer";
import { TenantStatusLayer } from "./layers/tenant-status.layer";
import { TenantCapabilityLayer } from "./layers/tenant-capability.layer";
import { ModuleEnabledLayer } from "./layers/module-enabled.layer";
import { FeatureEnabledLayer } from "./layers/feature-enabled.layer";
import { WorkshopConfigurationLayer } from "./layers/workshop-configuration.layer";
import { DelegationLayer } from "./layers/delegation.layer";
import { RolePermissionTemplateLayer } from "./layers/role-permission-template.layer";
import { UserOverrideLayer } from "./layers/user-override.layer";
import { createSession } from "./test-support/session-fixture";
import type { PrismaService } from "../database/prisma.service";
import type { CapabilityResolutionService } from "../capabilities/capability-resolution.service";

/**
 * The guarantee this file protects: permission resolution costs a constant
 * number of queries per request, no matter how many keys are checked.
 *
 * Before the per-request context, six of the layers queried the database
 * on every `can()` call -- so a page checking ten permissions cost sixty
 * round-trips on the hottest path in the system.
 */
function buildHarness() {
  const counters = { controlSetting: 0, tenant: 0, rolePermission: 0, userOverride: 0, configuration: 0, capabilities: 0 };

  const prisma = {
    controlSetting: {
      findMany: jest.fn(async () => {
        counters.controlSetting += 1;
        return [];
      }),
    },
    tenant: {
      findUnique: jest.fn(async () => {
        counters.tenant += 1;
        return { plan: { allowedModules: [] } };
      }),
    },
    rolePermission: {
      findMany: jest.fn(async () => {
        counters.rolePermission += 1;
        return [{ permissionKey: "inventory.stock.adjust", allowed: true }];
      }),
    },
    userPermissionOverride: {
      findMany: jest.fn(async () => {
        counters.userOverride += 1;
        return [];
      }),
    },
    tenantConfiguration: {
      findUnique: jest.fn(async () => {
        counters.configuration += 1;
        return { roleExperience: {} };
      }),
    },
  } as unknown as PrismaService;

  const capabilities = {
    resolveCurrent: jest.fn(async () => {
      counters.capabilities += 1;
      return {};
    }),
  } as unknown as CapabilityResolutionService;

  const contextService = new PermissionContextService(prisma, capabilities);
  const resolver = new PermissionResolverService(
    contextService,
    new PlatformControlLayer(),
    new PlanEntitlementLayer(),
    new TenantStatusLayer(),
    new TenantCapabilityLayer(),
    new ModuleEnabledLayer(),
    new FeatureEnabledLayer(),
    new WorkshopConfigurationLayer(),
    new DelegationLayer(),
    new RolePermissionTemplateLayer(),
    new UserOverrideLayer(),
  );

  const totalQueries = () => Object.values(counters).reduce((sum, count) => sum + count, 0);

  return { resolver, contextService, counters, totalQueries };
}

const session = createSession({
  tenantId: "tenant-1",
  role: "TECHNICIAN",
  staffUserId: "staff-1",
  enabledModules: ["INVENTORY"],
});

describe("PermissionContextService", () => {
  it("loads each source exactly once", async () => {
    const { contextService, counters } = buildHarness();

    await contextService.load(session);

    expect(counters).toEqual({
      controlSetting: 1,
      tenant: 1,
      rolePermission: 1,
      userOverride: 1,
      configuration: 1,
      capabilities: 1,
    });
  });

  it("queries nothing for a session with no tenant", async () => {
    const { contextService, totalQueries } = buildHarness();

    await contextService.load(createSession({ tenantId: null, role: "PLATFORM_SUPER_ADMIN" }));

    expect(totalQueries()).toBe(0);
  });

  it("skips staff-only sources for a customer session", async () => {
    // A customer has no StaffRole and no staff user, so a role template
    // and per-user overrides cannot apply to them.
    const { contextService, counters } = buildHarness();

    await contextService.load(createSession({ tenantId: "tenant-1", role: "CUSTOMER", staffUserId: undefined }));

    expect(counters.rolePermission).toBe(0);
    expect(counters.userOverride).toBe(0);
  });
});

describe("query amplification", () => {
  it("costs the same for one key as for twenty", async () => {
    const oneKey = buildHarness();
    await oneKey.resolver.resolveMany(session, ["inventory.stock.adjust"]);

    const manyKeys = buildHarness();
    const keys = Array.from({ length: 20 }, (_, index) => `inventory.stock.key_${index}`);
    await manyKeys.resolver.resolveMany(session, keys);

    expect(manyKeys.totalQueries()).toBe(oneKey.totalQueries());
  });

  it("resolves twenty keys in a constant six queries", async () => {
    const { resolver, totalQueries } = buildHarness();
    const keys = Array.from({ length: 20 }, (_, index) => `inventory.stock.key_${index}`);

    await resolver.resolveMany(session, keys);

    // Six sources, loaded once. The old shape would have been 120.
    expect(totalQueries()).toBe(6);
  });

  it("still returns a decision per key", async () => {
    const { resolver } = buildHarness();

    const results = await resolver.resolveMany(session, ["inventory.stock.adjust", "finance.invoice.issue"]);

    expect(results.size).toBe(2);
    // Granted by the stubbed role template above.
    expect(results.get("inventory.stock.adjust")?.allowed).toBe(true);
    // Nothing grants this one, so deny-by-default stands.
    expect(results.get("finance.invoice.issue")?.allowed).toBe(false);
  });

  it("a single resolve still loads the context once", async () => {
    const { resolver, totalQueries } = buildHarness();

    await resolver.resolve(session, "inventory.stock.adjust");

    expect(totalQueries()).toBe(6);
  });
});
