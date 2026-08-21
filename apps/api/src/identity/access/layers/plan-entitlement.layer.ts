import { Injectable } from "@nestjs/common";
import { moduleForPermissionKey } from "@mop/shared";
import type { SessionContext } from "@mop/shared";
import type { LayerDecision, LayerResult, PermissionLayer } from "../types";
import type { PermissionContext } from "../permission-context.service";

/** Layer 2: does this tenant's plan even include the module this key belongs to. */
@Injectable()
export class PlanEntitlementLayer implements PermissionLayer {
  readonly name = "PlanEntitlement";

  evaluate(session: SessionContext, permissionKey: string, _current: LayerResult, context: PermissionContext): LayerDecision {
    if (!session.tenantId) return null;

    const requiredModule = moduleForPermissionKey(permissionKey);
    if (!requiredModule) return null; // unregistered key -- never guess, defer

    // An empty list means the plan imposes no module restriction at all,
    // which is different from a plan that allows nothing.
    if (context.planAllowedModules.length === 0) return null;
    if (context.planAllowedModules.includes(requiredModule)) return null;

    return { allowed: false, locked: true, reason: "Not included in your current plan" };
  }
}
