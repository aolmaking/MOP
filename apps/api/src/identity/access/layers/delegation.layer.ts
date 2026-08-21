import { Injectable } from "@nestjs/common";
import { delegationFor, type SessionContext } from "@mop/shared";
import type { LayerDecision, LayerResult, PermissionLayer } from "../types";
import type { PermissionContext } from "../permission-context.service";

/**
 * Owner delegation.
 *
 * A small number of permissions are not the platform's to grant and not
 * the role template's to assume: team management stayed with the owner,
 * and a branch manager may only touch it where the owner has explicitly
 * handed it over. This layer is the "has anyone been let in at all"
 * question, asked before "which role is this".
 *
 * It sits with the other narrowing layers and only ever narrows -- it
 * cannot grant a permission the role template withholds, it can only
 * refuse one the template offers. It locks on deny, so no lower layer
 * can resurrect a function the owner has not delegated, which is the
 * same shape as the capability rule one layer up.
 *
 * A key not in DELEGATED_PERMISSIONS is none of this layer's business
 * and defers immediately, which is almost every key.
 */
@Injectable()
export class DelegationLayer implements PermissionLayer {
  readonly name = "Delegation";

  evaluate(
    session: SessionContext,
    permissionKey: string,
    _current: LayerResult,
    context: PermissionContext,
  ): LayerDecision {
    if (!session.tenantId) return null;

    const delegation = delegationFor(permissionKey);
    if (!delegation) return null;
    if (context.activeDelegations.has(delegation.delegationKey)) return null;

    return { allowed: false, locked: true, reason: delegation.deniedReason };
  }
}
