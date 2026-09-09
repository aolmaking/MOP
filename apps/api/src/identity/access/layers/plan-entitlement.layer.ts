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

    // An empty module list means the plan imposes no module restriction at
    // all, which is different from export categories below: an empty
    // export list means "no exports."
    if (context.planAllowedModules.length > 0 && !context.planAllowedModules.includes(requiredModule)) {
      return { allowed: false, locked: true, reason: "Not included in your current plan" };
    }

    if (permissionKey === "analytics.export" && context.planAllowedExports.length === 0) {
      return { allowed: false, locked: true, reason: "Exports are not included in your current plan" };
    }

    // Which individual reports the plan sells. `Plan.allowedReports` sat
    // beside `allowedModules` and `allowedExports` and was read by nothing
    // anywhere, so a plan that included one report granted all four: the
    // module gate is all-or-nothing and there was no finer answer below it.
    // Empty means no restriction -- see planAllowedReports' own note.
    if (
      permissionKey.startsWith("reports.") &&
      context.planAllowedReports.length > 0 &&
      !context.planAllowedReports.includes(permissionKey)
    ) {
      return { allowed: false, locked: true, reason: "That report is not included in your current plan" };
    }

    return null;
  }
}
