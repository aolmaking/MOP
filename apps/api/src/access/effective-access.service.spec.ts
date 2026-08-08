import { EffectiveAccessService } from "./effective-access.service";
import { PermissionResolverService } from "./permission-resolver.service";
import { ScopeResolverService } from "./scope-resolver.service";
import { createSession } from "./test-support/session-fixture";

describe("EffectiveAccessService", () => {
  function build() {
    const permissionResolver = { resolve: jest.fn() } as unknown as PermissionResolverService;
    const scopeResolver = { filterBy: jest.fn() } as unknown as ScopeResolverService;
    const service = new EffectiveAccessService(permissionResolver, scopeResolver);
    return { service, permissionResolver, scopeResolver };
  }

  it("can() resolves to true when the resolver's decision is allowed", async () => {
    const { service, permissionResolver } = build();
    (permissionResolver.resolve as jest.Mock).mockResolvedValue({ allowed: true, locked: true, reason: "ok" });

    await expect(service.can(createSession(), "inventory.stock.adjust")).resolves.toBe(true);
  });

  it("can() resolves to false when the resolver's decision denies", async () => {
    const { service, permissionResolver } = build();
    (permissionResolver.resolve as jest.Mock).mockResolvedValue({ allowed: false, locked: true, reason: "no" });

    await expect(service.can(createSession(), "inventory.stock.adjust")).resolves.toBe(false);
  });

  it("check() returns the full decision, including the human-readable reason", async () => {
    const { service, permissionResolver } = build();
    const decision = { allowed: false, locked: true, reason: "Locked by Platform Super Admin" };
    (permissionResolver.resolve as jest.Mock).mockResolvedValue(decision);

    await expect(service.check(createSession(), "inventory.stock.adjust")).resolves.toEqual(decision);
  });

  it("scope() delegates straight through to ScopeResolverService.filterBy", () => {
    const { service, scopeResolver } = build();
    (scopeResolver.filterBy as jest.Mock).mockReturnValue({ branchId: { in: ["b1"] } });
    const session = createSession({ branchScope: ["b1"] });

    const result = service.scope(session, "branch", "branchId");

    expect(scopeResolver.filterBy).toHaveBeenCalledWith(session, "branch", "branchId");
    expect(result).toEqual({ branchId: { in: ["b1"] } });
  });
});
