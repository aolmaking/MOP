import { Injectable } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import type { LayerDecision, PermissionLayer } from "../types";

const ACTIVE_STATUS = "ACTIVE";

/**
 * Statuses where the tenant is not merely frozen but has a real, distinct
 * meaning: the data is retained and readable, but nothing may change.
 * FROZEN and SUSPENDED stay fully blocked -- READ_ONLY and ARCHIVED were
 * previously indistinguishable from them here, which contradicted the
 * status enum's own naming (a "read-only" tenant that permits no reads at
 * all is not read-only, it is frozen with an extra label). Phase 18.D
 * settles what "archived" means operationally: data retained, read-only.
 */
const READ_ONLY_STATUSES: ReadonlySet<string> = new Set(["READ_ONLY", "ARCHIVED"]);

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

  evaluate(session: SessionContext, permissionKey: string): LayerDecision {
    if (!session.tenantId || !session.tenantStatus) return null; // platform session, not tenant-scoped

    if (session.tenantStatus === ACTIVE_STATUS) return null; // active, no opinion

    // A "view" key is mechanically identifiable by the manifest's own
    // naming convention ({resource}.{scope?}.{action}) -- every read-only
    // permission in this codebase ends in ".view". A READ_ONLY/ARCHIVED
    // tenant allows exactly those, and nothing that could mutate data.
    if (READ_ONLY_STATUSES.has(session.tenantStatus) && permissionKey.endsWith(".view")) {
      return null; // defer to the lower layers -- this status does not forbid a read
    }

    return {
      allowed: false,
      locked: true,
      reason: `Workspace is currently ${session.tenantStatus.toLowerCase().replace("_", " ")}`,
    };
  }
}
