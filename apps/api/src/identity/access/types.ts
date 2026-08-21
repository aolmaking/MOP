import type { SessionContext } from "@mop/shared";
import type { PermissionContext } from "./permission-context.service";

export interface LayerResult {
  allowed: boolean;
  /** true = final; no lower layer may override this decision. */
  locked: boolean;
  reason?: string;
}

/**
 * A layer returns `null` to mean "no opinion, defer to the next layer" --
 * distinct from returning a real (even if unlocked) allow/deny decision.
 */
export type LayerDecision = LayerResult | null;

/**
 * Layers are pure functions over a PermissionContext loaded once per
 * request. None of them queries the database: six of nine used to, which
 * meant resolving ten keys for one page cost sixty round-trips on the
 * hottest path in the system.
 *
 * Being pure also makes each layer trivially testable -- no Prisma stub,
 * no async, just a snapshot in and a decision out.
 */
export interface PermissionLayer {
  readonly name: string;
  evaluate(
    session: SessionContext,
    permissionKey: string,
    current: LayerResult,
    context: PermissionContext,
  ): LayerDecision;
}

export const DEFAULT_DECISION: LayerResult = {
  allowed: false,
  locked: false,
  reason: "No permission granted by default",
};
