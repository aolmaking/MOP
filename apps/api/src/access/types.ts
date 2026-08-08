import type { SessionContext } from "@mop/shared";

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

export interface PermissionLayer {
  readonly name: string;
  evaluate(session: SessionContext, permissionKey: string, current: LayerResult): Promise<LayerDecision> | LayerDecision;
}

export const DEFAULT_DECISION: LayerResult = {
  allowed: false,
  locked: false,
  reason: "No permission granted by default",
};
