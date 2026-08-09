import { Injectable } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import type { LayerDecision, LayerResult, PermissionLayer } from "../types";
import type { PermissionContext } from "../permission-context.service";

/** Layer 1: the platform's own role/permission locks -- the true ceiling. */
@Injectable()
export class PlatformControlLayer implements PermissionLayer {
  readonly name = "PlatformControl";

  evaluate(session: SessionContext, permissionKey: string, _current: LayerResult, context: PermissionContext): LayerDecision {
    if (!session.tenantId || !session.role) return null;

    const allowed = context.platformLocks.get(`${session.role}:${permissionKey}`);
    if (typeof allowed !== "boolean") return null;

    return {
      allowed,
      locked: true,
      reason: allowed ? "Enabled by Platform Super Admin" : "Locked by Platform Super Admin",
    };
  }
}
