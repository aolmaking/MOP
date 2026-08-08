import { Injectable } from "@nestjs/common";
import { moduleForPermissionKey } from "@mop/shared";
import type { SessionContext } from "@mop/shared";
import type { LayerDecision, PermissionLayer } from "../types";

/**
 * Layer 4: is this key's module switched on for this tenant at all, per
 * TenantConfiguration.enabledModules (published by Platform Super Admin's
 * Builder Control -- see Phase 2). Reads `session.enabledModules`, already
 * fresh this request (see TenantStatusLayer for why that's safe).
 */
@Injectable()
export class ModuleEnabledLayer implements PermissionLayer {
  readonly name = "ModuleEnabled";

  evaluate(session: SessionContext, permissionKey: string): LayerDecision {
    if (!session.tenantId) return null;

    const requiredModule = moduleForPermissionKey(permissionKey);
    if (!requiredModule) return null; // unregistered key -- never guess, defer

    if (session.enabledModules.includes(requiredModule)) return null; // enabled, no opinion

    return { allowed: false, locked: true, reason: "This module is not enabled for your workshop" };
  }
}
