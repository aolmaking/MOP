import {
  isCapabilityActive,
  type CapabilityProfile,
  type PolicyCondition,
  type WorkflowGraph,
  type WorkflowIntent,
  type WorkflowTransition,
} from "./types";
import { CAPABILITY_REGISTRY } from "./registry";
import type { GateKey } from "./gates";

/**
 * Walks a capability-annotated workflow graph.
 *
 * The validator proves a graph is *safe*; this is what makes it *run*. It
 * is the single answer to "where does this go next", so no service ever
 * assigns a status directly -- which is the one discipline that keeps the
 * capability engine from decaying into decoration once five roles depend
 * on the lifecycle.
 *
 * Pure and synchronous, like the validator, for the same reason: it can be
 * tested exhaustively in isolation, and that property disappears the
 * moment it touches a database.
 */

export interface EffectiveGraph {
  readonly entity: string;
  readonly initial: string;
  readonly terminal: readonly string[];
  /** Only the edges live under this tenant's capabilities. */
  readonly transitions: readonly WorkflowTransition[];
}

export type RoutingFailure =
  | { readonly kind: "NO_SUCH_TRANSITION"; readonly message: string }
  | { readonly kind: "INTENT_UNAVAILABLE"; readonly message: string };

export type RoutingResult =
  | { readonly ok: true; readonly transition: WorkflowTransition }
  | { readonly ok: false; readonly failure: RoutingFailure };

/** Shared with the validator and inventory -- see isCapabilityActive. */
const isActive = isCapabilityActive;

/**
 * A workshop's policy answers, as the router needs them: key -> chosen
 * option. An absent key means the registry default applies, and callers
 * are expected to have resolved that already -- `PolicyResolutionService`
 * does, and the pure layer deliberately cannot, because the defaults live
 * in the policy registry and importing it here would tie the capability
 * engine to the policy engine in the wrong direction.
 *
 * An empty map therefore means "no policy narrows anything", which is
 * exactly the behaviour every caller had before policies reached the
 * graph.
 */
export type PolicyAnswers = ReadonlyMap<string, string>;

const NO_POLICIES: PolicyAnswers = new Map();

function policyHolds(conditions: readonly PolicyCondition[] | undefined, answers: PolicyAnswers): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((condition) => {
    const answer = answers.get(condition.policyKey);
    // An unanswered policy does not remove an edge. Narrowing the graph
    // on the strength of a value nobody supplied is how a workshop ends
    // up unable to move a job for a question it was never asked.
    if (answer === undefined) return true;
    return condition.oneOf.includes(answer);
  });
}

/**
 * Facts about one specific work order -- "this job has a critical
 * fault", not anything true of the tenant. See `WorkflowTransition.
 * requiresFact`'s own doc for why this is a separate input from
 * `PolicyAnswers` rather than folded into it.
 */
export type WorkOrderFacts = ReadonlySet<string>;

const NO_FACTS: WorkOrderFacts = new Set();

function factsHold(required: readonly string[] | undefined, facts: WorkOrderFacts): boolean {
  if (!required || required.length === 0) return true;
  // A missing fact is false, not "unknown" -- unlike an unanswered
  // policy, there is no safe default direction to assume for data about
  // a specific work order nobody computed.
  return required.every((fact) => facts.has(fact));
}

/**
 * The graph as this workshop actually experiences it: base edges whose
 * capabilities are all active, plus the replacement edges that removal
 * policies contribute.
 */
export function effectiveGraph(
  graph: WorkflowGraph,
  profile: CapabilityProfile,
  policies: PolicyAnswers = NO_POLICIES,
  facts: WorkOrderFacts = NO_FACTS,
): EffectiveGraph {
  const active = (key: string) => isActive(profile, key);
  const known = new Set(graph.states);

  const live = graph.transitions.filter(
    (transition) =>
      (transition.requires ?? []).every(active) &&
      policyHolds(transition.requiresPolicy, policies) &&
      factsHold(transition.requiresFact, facts),
  );

  const replacements: WorkflowTransition[] = [];
  for (const [key, definition] of CAPABILITY_REGISTRY) {
    if (active(key) || !definition.removal) continue;

    for (const transition of definition.removal.addTransitions ?? []) {
      // A replacement edge is itself conditional -- a finance-off reroute
      // out of team review only applies if team review still exists.
      if (!(transition.requires ?? []).every(active)) continue;
      if (!policyHolds(transition.requiresPolicy, policies)) continue;
      if (!factsHold(transition.requiresFact, facts)) continue;
      if (!known.has(transition.from) || !known.has(transition.to)) continue;
      replacements.push(transition);
    }
  }

  return {
    entity: graph.entity,
    initial: graph.initial,
    terminal: graph.terminal,
    transitions: [...live, ...replacements],
  };
}

/** Every move legal from `from` for this workshop. */
export function allowedTransitions(
  graph: WorkflowGraph,
  profile: CapabilityProfile,
  from: string,
  policies: PolicyAnswers = NO_POLICIES,
  facts: WorkOrderFacts = NO_FACTS,
): readonly WorkflowTransition[] {
  return effectiveGraph(graph, profile, policies, facts).transitions.filter((transition) => transition.from === from);
}

/** Is this exact move legal? Used to refuse a state change, not to choose one. */
export function canTransition(
  graph: WorkflowGraph,
  profile: CapabilityProfile,
  from: string,
  to: string,
  policies: PolicyAnswers = NO_POLICIES,
  facts: WorkOrderFacts = NO_FACTS,
): boolean {
  return allowedTransitions(graph, profile, from, policies, facts).some((transition) => transition.to === to);
}

/**
 * Where does this action land?
 *
 * The whole point of the router. "Technician finishes" goes to Team
 * Review, QC, invoicing or delivery readiness purely as a function of the
 * workshop's capabilities -- and that branching lives here, in graph data,
 * rather than as an if-chain in a service.
 *
 * When several intent edges are live from one state, the FIRST declared
 * wins: declaration order is precedence. The graph therefore lists review
 * before QC before invoicing, so a workshop with all three routes finish
 * to review, and one with only invoicing routes straight there.
 */
export function resolveIntent(
  graph: WorkflowGraph,
  profile: CapabilityProfile,
  from: string,
  intent: WorkflowIntent,
  policies: PolicyAnswers = NO_POLICIES,
  facts: WorkOrderFacts = NO_FACTS,
): RoutingResult {
  const candidates = allowedTransitions(graph, profile, from, policies, facts).filter(
    (transition) => transition.intent === intent,
  );

  if (candidates.length > 0) return { ok: true, transition: candidates[0]! };

  // Distinguish "this action never applies here" from "this action exists
  // but not from this state" -- they need different messages to the user
  // and different fixes from a developer.
  const existsSomewhere = graph.transitions.some((transition) => transition.intent === intent);

  return existsSomewhere
    ? {
        ok: false,
        failure: {
          kind: "NO_SUCH_TRANSITION",
          message: `${intent} is not available from ${graph.entity}.${from}.`,
        },
      }
    : {
        ok: false,
        failure: {
          kind: "INTENT_UNAVAILABLE",
          message: `${intent} does not apply to ${graph.entity} in this workshop's configuration.`,
        },
      };
}

/** The gates guarding a specific move, if any. */
export function gatesFor(transition: WorkflowTransition): readonly GateKey[] {
  return transition.gates ?? [];
}

/** Has this record finished its lifecycle? */
export function isTerminal(graph: WorkflowGraph, state: string): boolean {
  return graph.terminal.includes(state);
}
