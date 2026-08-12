import { Injectable } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import type { LayerDecision, LayerResult, PermissionLayer } from "../types";
import type { PermissionContext } from "../permission-context.service";

/**
 * Layer 10: a named exception granted or revoked for one specific person on
 * top of their role's template. Last in the chain, so it locks whenever a
 * row exists -- there is nothing after it to defer to.
 */
@Injectable()
export class UserOverrideLayer implements PermissionLayer {
  readonly name = "UserOverride";

  evaluate(session: SessionContext, permissionKey: string, _current: LayerResult, context: PermissionContext): LayerDecision {
    if (!session.staffUserId) return null;

    const override = context.userOverrides.get(permissionKey);
    if (!override) return null;

    return {
      allowed: override.allowed,
      locked: true,
      reason: override.reason ?? (override.allowed ? "Individually granted to you" : "Individually revoked for you"),
    };
  }
}
