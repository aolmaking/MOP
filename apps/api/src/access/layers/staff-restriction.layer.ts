import { Injectable } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import type { LayerDecision, PermissionLayer } from "../types";

/**
 * Layer 3.5 (evaluated alongside TenantStatusLayer, a true ceiling) --
 * Phase 19.D's restricted-pending-investigation account state.
 *
 * A tenant-wide freeze (TenantStatusLayer) and a single account's
 * restriction are deliberately different levers: Workshop 5 scenario 24
 * found the freeze was the only tool available for a single-account
 * fraud investigation, which is far too large a hammer. This layer is
 * that missing, narrower lever -- one restricted account loses every
 * mutating permission; the rest of the tenant is untouched.
 *
 * Same read-only shape as TenantStatusLayer's own READ_ONLY/ARCHIVED
 * fix: a `.view`-suffixed key still defers (allowed), so a restricted
 * account can still see its own work while under investigation, never a
 * declaration of guilt by way of being locked out entirely.
 */
@Injectable()
export class StaffRestrictionLayer implements PermissionLayer {
  readonly name = "StaffRestriction";

  evaluate(session: SessionContext, permissionKey: string): LayerDecision {
    if (session.staffRestrictionStatus !== "RESTRICTED_PENDING_INVESTIGATION") return null;

    if (permissionKey.endsWith(".view")) return null; // defer -- a read is still allowed

    return {
      allowed: false,
      locked: true,
      reason: "Your access is currently restricted pending an internal review",
    };
  }
}
