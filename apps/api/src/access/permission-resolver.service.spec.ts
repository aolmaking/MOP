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
import { PermissionContextService } from "./permission-context.service";
import { createContext } from "./test-support/permission-context-fixture";
import { DEFAULT_DECISION, type LayerDecision, type PermissionLayer } from "./types";

describe("PermissionResolverService", () => {
  function build() {
    const platformControlInstance = new PlatformControlLayer();
    const planEntitlementInstance = new PlanEntitlementLayer();
    const tenantStatusInstance = new TenantStatusLayer();
    // Resolution is stubbed per-test below; the resolver only cares about ordering.
    const tenantCapabilityInstance = new TenantCapabilityLayer();
    const moduleEnabledInstance = new ModuleEnabledLayer();
    const featureEnabledInstance = new FeatureEnabledLayer();
    const workshopConfigurationInstance = new WorkshopConfigurationLayer();
    const delegationInstance = new DelegationLayer();
    const rolePermissionTemplateInstance = new RolePermissionTemplateLayer();
    const userOverrideInstance = new UserOverrideLayer();

    // Same objects, widened to the interface type so every layer can be
    // stubbed uniformly below regardless of its own sync/async signature.
    const layers: Record<
      | "platformControl"
      | "planEntitlement"
      | "tenantStatus"
      | "tenantCapability"
      | "moduleEnabled"
      | "featureEnabled"
      | "workshopConfiguration"
      | "delegation"
      | "rolePermissionTemplate"
      | "userOverride",
      PermissionLayer
    > = {
      platformControl: platformControlInstance,
      planEntitlement: planEntitlementInstance,
      tenantStatus: tenantStatusInstance,
      tenantCapability: tenantCapabilityInstance,
      moduleEnabled: moduleEnabledInstance,
      featureEnabled: featureEnabledInstance,
      workshopConfiguration: workshopConfigurationInstance,
      delegation: delegationInstance,
      rolePermissionTemplate: rolePermissionTemplateInstance,
      userOverride: userOverrideInstance,
    };

    // Loaded once per resolve; the layers are stubbed per test, so the
    // snapshot contents do not matter here -- only that one is provided.
    const contextService = { load: jest.fn().mockResolvedValue(createContext()) } as unknown as PermissionContextService;

    const service = new PermissionResolverService(
      contextService,
      platformControlInstance,
      planEntitlementInstance,
      tenantStatusInstance,
      tenantCapabilityInstance,
      moduleEnabledInstance,
      featureEnabledInstance,
      workshopConfigurationInstance,
      delegationInstance,
      rolePermissionTemplateInstance,
      userOverrideInstance,
    );

    return { service, layers, contextService };
  }

  function stub(layer: PermissionLayer, decision: LayerDecision) {
    return jest.spyOn(layer, "evaluate").mockImplementation(() => decision);
  }

  function stubAllDefer(layers: Record<string, PermissionLayer>) {
    Object.values(layers).forEach((layer) => stub(layer, null));
  }

  it("denies by default (DEFAULT_DECISION) when every layer defers", async () => {
    const { service, layers } = build();
    stubAllDefer(layers);

    const result = await service.resolve(createSession(), "inventory.stock.adjust");

    expect(result).toEqual(DEFAULT_DECISION);
  });

  it("stops at the first locked layer and never calls layers after it", async () => {
    const { service, layers } = build();
    stub(layers.platformControl, null);
    stub(layers.planEntitlement, { allowed: false, locked: true, reason: "plan" });
    const laterSpies = [
      layers.tenantStatus,
      layers.moduleEnabled,
      layers.featureEnabled,
      layers.workshopConfiguration,
      layers.delegation,
      layers.rolePermissionTemplate,
      layers.userOverride,
    ].map((layer) => jest.spyOn(layer, "evaluate"));

    const result = await service.resolve(createSession(), "inventory.stock.adjust");

    expect(result).toEqual({ allowed: false, locked: true, reason: "plan" });
    laterSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it("a higher layer's lock overrides a lower layer's allow -- platform lock beats an allowing role template and user override", async () => {
    const { service, layers } = build();
    stub(layers.platformControl, { allowed: false, locked: true, reason: "platform lock" });
    stub(layers.planEntitlement, null);
    stub(layers.tenantStatus, null);
    stub(layers.moduleEnabled, null);
    stub(layers.featureEnabled, null);
    stub(layers.workshopConfiguration, null);
    stub(layers.delegation, null);
    const rolePermissionSpy = jest.spyOn(layers.rolePermissionTemplate, "evaluate");
    const userOverrideSpy = jest.spyOn(layers.userOverride, "evaluate");

    const result = await service.resolve(createSession(), "inventory.stock.adjust");

    expect(result).toEqual({ allowed: false, locked: true, reason: "platform lock" });
    expect(rolePermissionSpy).not.toHaveBeenCalled();
    expect(userOverrideSpy).not.toHaveBeenCalled();
  });

  it("an unlocked deny from the role template can still be overridden by a user override that allows it", async () => {
    const { service, layers } = build();
    stub(layers.platformControl, null);
    stub(layers.planEntitlement, null);
    stub(layers.tenantStatus, null);
    stub(layers.moduleEnabled, null);
    stub(layers.featureEnabled, null);
    stub(layers.workshopConfiguration, null);
    stub(layers.delegation, null);
    stub(layers.rolePermissionTemplate, { allowed: false, locked: false, reason: "role denies" });
    stub(layers.userOverride, { allowed: true, locked: true, reason: "personally granted" });

    const result = await service.resolve(createSession(), "inventory.stock.adjust");

    expect(result).toEqual({ allowed: true, locked: true, reason: "personally granted" });
  });

  it("a workshop-configuration denial (unlocked upstream) still wins over an allowing role template, since it locks on deny", async () => {
    const { service, layers } = build();
    stub(layers.platformControl, null);
    stub(layers.planEntitlement, null);
    stub(layers.tenantStatus, null);
    stub(layers.moduleEnabled, null);
    stub(layers.featureEnabled, null);
    stub(layers.workshopConfiguration, { allowed: false, locked: true, reason: "disabled in this workshop" });
    const rolePermissionSpy = jest.spyOn(layers.rolePermissionTemplate, "evaluate");

    const result = await service.resolve(createSession(), "inventory.stock.adjust");

    expect(result).toEqual({ allowed: false, locked: true, reason: "disabled in this workshop" });
    expect(rolePermissionSpy).not.toHaveBeenCalled();
  });

  it("evaluates layers in the documented 1-10 order", async () => {
    const { service, layers } = build();
    const callOrder: string[] = [];
    Object.entries(layers).forEach(([label, layer]) => {
      jest.spyOn(layer, "evaluate").mockImplementation(() => {
        callOrder.push(label);
        return null;
      });
    });

    await service.resolve(createSession(), "inventory.stock.adjust");

    expect(callOrder).toEqual([
      "platformControl",
      "planEntitlement",
      "tenantStatus",
      "tenantCapability",
      "moduleEnabled",
      "featureEnabled",
      "workshopConfiguration",
      "delegation",
      "rolePermissionTemplate",
      "userOverride",
    ]);
  });
});
