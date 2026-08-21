import { Injectable } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { DEFAULT_DECISION, type LayerResult, type PermissionLayer } from "./types";
import { PlatformControlLayer } from "./layers/platform-control.layer";
import { PlanEntitlementLayer } from "./layers/plan-entitlement.layer";
import { TenantStatusLayer } from "./layers/tenant-status.layer";
import { StaffRestrictionLayer } from "./layers/staff-restriction.layer";
import { TenantCapabilityLayer } from "./layers/tenant-capability.layer";
import { ModuleEnabledLayer } from "./layers/module-enabled.layer";
import { FeatureEnabledLayer } from "./layers/feature-enabled.layer";
import { WorkshopConfigurationLayer } from "./layers/workshop-configuration.layer";
import { DelegationLayer } from "./layers/delegation.layer";
import { RolePermissionTemplateLayer } from "./layers/role-permission-template.layer";
import { UserOverrideLayer } from "./layers/user-override.layer";
import { PermissionContextService, type PermissionContext } from "./permission-context.service";

/**
 * Layers 1-10 of the Effective Permission Resolver: "can this session ever
 * do X". A literal ordered array that IS actually iterated -- the old
 * project's permission hierarchy was a decorative array nothing walked;
 * this is the fix for that specific failure.
 *
 * Each layer returns `null` ("no opinion, defer") or a real LayerResult.
 * The running decision starts at DEFAULT_DECISION (deny) and is overwritten
 * by every non-null result in order; iteration stops the moment a layer
 * returns `locked: true`, so no lower layer can ever override a higher
 * layer's definitive answer. If every layer defers, DEFAULT_DECISION (deny)
 * stands -- deny-by-default, never allow-by-default.
 */
@Injectable()
export class PermissionResolverService {
  private readonly layers: PermissionLayer[];

  constructor(
    private readonly contextService: PermissionContextService,
    platformControl: PlatformControlLayer,
    planEntitlement: PlanEntitlementLayer,
    tenantStatus: TenantStatusLayer,
    staffRestriction: StaffRestrictionLayer,
    tenantCapability: TenantCapabilityLayer,
    moduleEnabled: ModuleEnabledLayer,
    featureEnabled: FeatureEnabledLayer,
    workshopConfiguration: WorkshopConfigurationLayer,
    delegation: DelegationLayer,
    rolePermissionTemplate: RolePermissionTemplateLayer,
    userOverride: UserOverrideLayer,
  ) {
    // Order is the contract. Platform, plan, tenant status, capability,
    // module and feature are true ceilings (1-6); workshop configuration
    // only narrows (7); role template is the tenant default (8); user
    // override is the final, most-specific word (9).
    //
    // Capability sits above role and user deliberately: a permission must
    // never be able to resurrect a function the workshop does not perform.
    // Granting inventory.request.issue in a workshop with no inventory
    // still denies.
    //
    // Delegation (8) narrows for the same reason one step lower down:
    // team management is the owner's, and a role template that offers it
    // must not be able to hand it over on the owner's behalf.
    //
    // Staff restriction (Phase 19.D) sits right beside tenant status: a
    // true ceiling like it, just scoped to one account instead of the
    // whole tenant -- an owner or platform investigating one person must
    // never need the tenant-wide freeze to curtail that one person.
    this.layers = [
      platformControl,
      planEntitlement,
      tenantStatus,
      staffRestriction,
      tenantCapability,
      moduleEnabled,
      featureEnabled,
      workshopConfiguration,
      delegation,
      rolePermissionTemplate,
      userOverride,
    ];
  }

  async resolve(session: SessionContext, permissionKey: string): Promise<LayerResult> {
    const context = await this.contextService.load(session);
    return this.resolveWith(context, session, permissionKey);
  }

  /**
   * Resolves many keys against ONE snapshot. This is the shape a page load
   * should use: asking for ten permissions costs the same queries as
   * asking for one, because the layers are pure over the context.
   */
  async resolveMany(session: SessionContext, permissionKeys: readonly string[]): Promise<Map<string, LayerResult>> {
    const context = await this.contextService.load(session);
    return new Map(permissionKeys.map((key) => [key, this.resolveWith(context, session, key)]));
  }

  /** The chain itself: synchronous, because every layer is now pure. */
  private resolveWith(context: PermissionContext, session: SessionContext, permissionKey: string): LayerResult {
    let current: LayerResult = DEFAULT_DECISION;

    for (const layer of this.layers) {
      const decision = layer.evaluate(session, permissionKey, current, context);
      if (decision === null) continue;

      current = decision;
      if (decision.locked) break;
    }

    return current;
  }
}
