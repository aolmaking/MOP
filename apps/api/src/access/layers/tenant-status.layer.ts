import { Injectable } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import type { LayerDecision, PermissionLayer } from "../types";

const ACTIVE_STATUS = "ACTIVE";

/**
 * Layer 3: the tenant's live status, a true ceiling over every tenant-scoped
 * permission. Reads `session.tenantStatus` rather than querying Tenant
 * again -- SessionGuard re-resolves SessionContext from the database on
 * every request (see AuthService.getSessionContext), so this value is
 * already fresh as of this request, not a stale cookie-cached copy. This
 * is what actually enforces a mid-session freeze/suspend: AuthService only
 * blocks the blocked statuses at login/refresh time, so without this layer
 * a tenant frozen mid-session would keep working until the access token
 * happened to expire.
 */
@Injectable()
export class TenantStatusLayer implements PermissionLayer {
  readonly name = "TenantStatus";

  evaluate(session: SessionContext, _permissionKey: string): LayerDecision {
    if (!session.tenantId || !session.tenantStatus) return null; // platform session, not tenant-scoped

    if (session.tenantStatus === ACTIVE_STATUS) return null; // active, no opinion

    return {
      allowed: false,
      locked: true,
      reason: `Workspace is currently ${session.tenantStatus.toLowerCase().replace("_", " ")}`,
    };
  }
}
