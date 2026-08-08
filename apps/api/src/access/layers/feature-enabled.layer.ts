import { Injectable } from "@nestjs/common";
import { FEATURE_GATED_PERMISSIONS } from "@mop/shared";
import type { PermissionKey, SessionContext } from "@mop/shared";
import type { LayerDecision, PermissionLayer } from "../types";

/**
 * Layer 5: finer-grained than Module -- is a specific togglable feature
 * within an enabled module switched on for this tenant, per
 * TenantConfiguration.enabledFeatures. Most permission keys aren't gated by
 * an individual feature flag (FEATURE_GATED_PERMISSIONS is sparse), so this
 * layer defers (returns null) for the majority of keys today; that is a
 * correct, real answer for those keys, not a stub.
 */
@Injectable()
export class FeatureEnabledLayer implements PermissionLayer {
  readonly name = "FeatureEnabled";

  evaluate(session: SessionContext, permissionKey: string): LayerDecision {
    if (!session.tenantId) return null;

    const requiredFeature = FEATURE_GATED_PERMISSIONS[permissionKey as PermissionKey];
    if (!requiredFeature) return null; // this key isn't feature-gated

    if (session.enabledFeatures.includes(requiredFeature)) return null; // enabled, no opinion

    return { allowed: false, locked: true, reason: "This feature is not enabled for your workshop" };
  }
}
