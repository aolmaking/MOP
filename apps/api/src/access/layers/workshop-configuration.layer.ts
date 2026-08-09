import { Injectable } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import type { LayerDecision, LayerResult, PermissionLayer } from "../types";
import type { PermissionContext } from "../permission-context.service";

/**
 * Layer 7: this specific workshop's published Role Experience
 * configuration, set by Platform Super Admin's Builder Control per the
 * 2026-08-07 architecture amendment -- workshop-level differentiation
 * still exists, it is just no longer Owner-editable.
 *
 * Only ever narrows: it can deny a permission that a lower layer (Role
 * Template, User Override) would otherwise grant, but never grants one
 * itself. That is why it locks on deny only, unlike layers 1-6, which are
 * true ceilings that lock on any definitive answer.
 */
@Injectable()
export class WorkshopConfigurationLayer implements PermissionLayer {
  readonly name = "WorkshopConfiguration";

  evaluate(session: SessionContext, permissionKey: string, _current: LayerResult, context: PermissionContext): LayerDecision {
    if (!session.tenantId) return null;
    if (!context.configurationDeniedKeys.has(permissionKey)) return null;

    return { allowed: false, locked: true, reason: "Disabled for this role in this workshop" };
  }
}
