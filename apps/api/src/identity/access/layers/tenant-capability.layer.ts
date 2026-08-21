import { Injectable } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { ACTIVE_STATUSES, capabilityForPermissionKey } from "@mop/shared";
import type { LayerDecision, LayerResult, PermissionLayer } from "../types";
import type { PermissionContext } from "../permission-context.service";

/**
 * Layer 4: does this workshop's business model include the function this
 * permission belongs to at all?
 *
 * Sits above Module, Role Template and User Override precisely so that a
 * permission can never resurrect a disabled capability. Granting a
 * technician `inventory.request.issue` in a workshop with no inventory
 * still denies -- the workshop does not perform that function, so no
 * permission can create it. Locking on deny is what makes that true
 * rather than merely intended.
 *
 * DISABLED and EXTERNAL are both inactive here. EXTERNAL matters: the
 * business function still happens, but outside MOP, so MOP must not offer
 * the action. A workshop whose invoices come from separate accounting
 * software should not have an "issue invoice" button producing a document
 * nobody recognises.
 */
@Injectable()
export class TenantCapabilityLayer implements PermissionLayer {
  readonly name = "TenantCapability";

  evaluate(session: SessionContext, permissionKey: string, _current: LayerResult, context: PermissionContext): LayerDecision {
    if (!session.tenantId) return null;

    const required = capabilityForPermissionKey(permissionKey);
    // Core keys, and unregistered ones, are not this layer's business.
    // Never guess a capability for an unknown key -- a wrong guess denies
    // a legitimate action for a reason nobody can trace.
    if (!required) return null;

    const status = context.capabilities[required] ?? "ENABLED";
    if (ACTIVE_STATUSES.includes(status)) return null;

    return {
      allowed: false,
      locked: true,
      reason:
        status === "EXTERNAL"
          ? `${humanise(required)} is handled outside MOP for this workshop`
          : `${humanise(required)} is not part of this workshop's setup`,
    };
  }
}

/** "PART_RETURNS" -> "Part returns". The reason is read by staff, not developers. */
function humanise(capability: string): string {
  const words = capability.toLowerCase().split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
