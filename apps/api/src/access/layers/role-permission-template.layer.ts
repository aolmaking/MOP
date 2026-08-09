import { Injectable } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import type { LayerDecision, LayerResult, PermissionLayer } from "../types";
import type { PermissionContext } from "../permission-context.service";

/**
 * Layer 8: the tenant's own effective permission set per role
 * (RolePermission), edited via Platform Super Admin's Permission Matrix
 * per the 2026-08-07 architecture amendment.
 *
 * Never locks: User Override (layer 9) must still be able to grant or deny
 * for one specific person on top of whatever the role template says.
 */
@Injectable()
export class RolePermissionTemplateLayer implements PermissionLayer {
  readonly name = "RolePermissionTemplate";

  evaluate(session: SessionContext, permissionKey: string, _current: LayerResult, context: PermissionContext): LayerDecision {
    if (!session.tenantId || !session.staffUserId) return null;

    const allowed = context.roleTemplate.get(permissionKey);
    // No tenant default set -- defer to User Override, then deny-by-default.
    if (typeof allowed !== "boolean") return null;

    return {
      allowed,
      locked: false,
      reason: allowed ? "Allowed by your role" : "Not allowed by your role",
    };
  }
}
