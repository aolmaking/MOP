import { Injectable } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { DEFAULT_DECISION, type LayerResult, type PermissionLayer } from "./types";
import { PlatformControlLayer } from "./layers/platform-control.layer";
import { PlanEntitlementLayer } from "./layers/plan-entitlement.layer";
import { TenantStatusLayer } from "./layers/tenant-status.layer";
import { ModuleEnabledLayer } from "./layers/module-enabled.layer";
import { FeatureEnabledLayer } from "./layers/feature-enabled.layer";
import { WorkshopConfigurationLayer } from "./layers/workshop-configuration.layer";
import { RolePermissionTemplateLayer } from "./layers/role-permission-template.layer";
import { UserOverrideLayer } from "./layers/user-override.layer";

/**
 * Layers 1-8 of the Effective Permission Resolver: "can this session ever
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
    platformControl: PlatformControlLayer,
    planEntitlement: PlanEntitlementLayer,
    tenantStatus: TenantStatusLayer,
    moduleEnabled: ModuleEnabledLayer,
    featureEnabled: FeatureEnabledLayer,
    workshopConfiguration: WorkshopConfigurationLayer,
    rolePermissionTemplate: RolePermissionTemplateLayer,
    userOverride: UserOverrideLayer,
  ) {
    // Order is the contract: platform/plan/tenant-status/module/feature are
    // true ceilings (1-5); workshop configuration only narrows (6); role
    // template is the tenant default (7); user override is the final,
    // most-specific word (8).
    this.layers = [
      platformControl,
      planEntitlement,
      tenantStatus,
      moduleEnabled,
      featureEnabled,
      workshopConfiguration,
      rolePermissionTemplate,
      userOverride,
    ];
  }

  async resolve(session: SessionContext, permissionKey: string): Promise<LayerResult> {
    let current: LayerResult = DEFAULT_DECISION;

    for (const layer of this.layers) {
      const decision = await layer.evaluate(session, permissionKey, current);
      if (decision === null) continue;

      current = decision;
      if (decision.locked) break;
    }

    return current;
  }
}
