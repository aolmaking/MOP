import { CAPABILITY_REGISTRY } from "./registry";
import { ALL_GRAPHS } from "./workflow-graphs";
import { coreGates, gatesOwnedBy } from "./gates";
import {
  isCapabilityActive,
  type CapabilityDefinition,
  type CapabilityKey,
  type CapabilityProfile,
  type CapabilityValidationResult,
  type EntityReachability,
  type ValidationIssue,
  type WorkflowGraph,
  type WorkflowTransition,
} from "./types";

/**
 * The guarantee this file exists to enforce:
 *
 *   After any capability change, every reachable non-terminal state must
 *   still have a path to a terminal state.
 *
 * A configuration that could strand a Work Order, Part Request or
 * Customer Decision is rejected HERE, at validate time, rather than
 * discovered days later as "why can't anyone finish this job?".
 *
 * Deliberately a pure function over a graph: no database, no Nest, no
 * clock. That makes it exhaustively testable in isolation -- which will
 * never be true again once the lifecycle is entangled with five roles,
 * and is the entire reason this is built before Phase 3.
 */

export interface ValidateOptions {
  /** Overridable so tests can validate a deliberately-broken graph. */
  readonly graphs?: readonly WorkflowGraph[];
  readonly registry?: ReadonlyMap<CapabilityKey, CapabilityDefinition>;
}

/** Capabilities absent from a profile are ENABLED -- see isCapabilityActive. */
const isActive = isCapabilityActive;

export function validateCapabilityProfile(
  profile: CapabilityProfile,
  options: ValidateOptions = {},
): CapabilityValidationResult {
  const graphs = options.graphs ?? ALL_GRAPHS;
  const registry = options.registry ?? CAPABILITY_REGISTRY;

  const issues: ValidationIssue[] = [];
  const orphanedRoles = new Set<string>();
  const droppedGates = new Set<string>();
  const keptGates = new Set<string>();

  const active = (key: CapabilityKey): boolean => isActive(profile, key);

  // --- 1. Static integrity: core, dependencies, conflicts ------------------
  const inactiveDefinitions: CapabilityDefinition[] = [];

  for (const [key, definition] of registry) {
    if (active(key)) {
      for (const dependency of definition.dependencies) {
        if (!active(dependency)) {
          issues.push({
            code: "MISSING_DEPENDENCY",
            entity: "-",
            subject: key,
            message: `${key} is active but its dependency ${dependency} is not.`,
          });
        }
      }
      for (const conflict of definition.conflicts) {
        if (active(conflict)) {
          issues.push({
            code: "CONFLICT",
            entity: "-",
            subject: key,
            message: `${key} and ${conflict} cannot both be active.`,
          });
        }
      }
      continue;
    }

    if (definition.removal === null) {
      issues.push({
        code: "CORE_CAPABILITY_DISABLED",
        entity: "-",
        subject: key,
        message: `${key} is a core capability and cannot be disabled.`,
      });
      continue;
    }

    inactiveDefinitions.push(definition);
    definition.affectedRoles.forEach((role) => orphanedRoles.add(role));

    // A gate belongs to the capability that PRODUCES the thing it checks,
    // so it dies with that capability -- and the owner is read from the
    // gate registry, not from this capability's own list. That is what
    // stops two policies disagreeing about a shared gate: with Inventory
    // and Part Returns both off, Part Returns' "keep parts-used" must not
    // resurrect a check that only Inventory could satisfy, which would
    // strand every job.
    gatesOwnedBy(key).forEach((gate) => droppedGates.add(gate));
    definition.removal.gatesToKeep.forEach((gate) => keptGates.add(gate));

    // A capability may only claim to drop gates the registry says it owns.
    // Catches a policy drifting away from the registry after an edit.
    const owned = new Set<string>(gatesOwnedBy(key));
    const notOwned = definition.removal.gatesToDrop.filter((gate) => !owned.has(gate));
    if (notOwned.length > 0) {
      issues.push({
        code: "GATE_NOT_OWNED",
        entity: "-",
        subject: key,
        message:
          `${key}'s removal policy drops gate(s) ${notOwned.join(", ")} that the gate registry does not ` +
          `assign to it. A capability may only drop gates it owns.`,
      });
    }
  }

  // A core gate has no owner, so nothing above can have dropped it. Belt
  // and braces: assert it explicitly rather than trusting the derivation.
  for (const gate of coreGates()) droppedGates.delete(gate);

  // "Keep" only means "my own removal doesn't drop this" -- it can never
  // override an owner having gone away.
  for (const gate of droppedGates) keptGates.delete(gate);

  // --- 2. Per-entity reachability -----------------------------------------
  const disabledStates = new Set<string>();
  for (const definition of inactiveDefinitions) {
    definition.removal?.statesToDisable.forEach((state) => disabledStates.add(state));
  }

  const addedTransitions: WorkflowTransition[] = [];
  for (const definition of inactiveDefinitions) {
    for (const transition of definition.removal?.addTransitions ?? []) {
      // A replacement edge is itself conditional -- a finance-off reroute
      // out of team review only applies if team review still exists.
      if ((transition.requires ?? []).every(active)) addedTransitions.push(transition);
    }
  }

  const reachability: EntityReachability[] = [];

  for (const graph of graphs) {
    if (!(graph.requires ?? []).every(active)) continue; // entity never created here

    const known = new Set(graph.states);
    const edges = [
      ...graph.transitions.filter((t) => (t.requires ?? []).every(active)),
      ...addedTransitions.filter((t) => known.has(t.from) && known.has(t.to)),
    ];

    for (const transition of graph.transitions) {
      for (const state of [transition.from, transition.to]) {
        if (known.has(state)) continue;
        issues.push({
          code: "UNKNOWN_STATE_REFERENCE",
          entity: graph.entity,
          subject: state,
          message: `Transition references state "${state}", which is not declared on ${graph.entity}.`,
        });
      }
    }

    const forward = new Map<string, string[]>();
    const backward = new Map<string, string[]>();
    for (const { from, to } of edges) {
      appendTo(forward, from, to);
      appendTo(backward, to, from);
    }

    const reachable = traverse([graph.initial], forward);
    const canReachTerminal = traverse(graph.terminal, backward);

    const terminalSet = new Set(graph.terminal);
    const stranded: string[] = [];

    for (const state of reachable) {
      if (terminalSet.has(state)) continue;

      if (disabledStates.has(state)) {
        issues.push({
          code: "DISABLED_STATE_REACHABLE",
          entity: graph.entity,
          subject: state,
          message:
            `${graph.entity}.${state} is disabled by a removal policy but is still reachable — ` +
            `a transition into it is not guarded by the capability that owns it.`,
        });
      }

      if (!canReachTerminal.has(state)) {
        stranded.push(state);
        issues.push({
          code: "STRANDED_STATE",
          entity: graph.entity,
          subject: state,
          message:
            `${graph.entity}.${state} is reachable but has no path to a terminal state ` +
            `(${graph.terminal.join(" or ")}). Records would be stuck there permanently.`,
        });
      }
    }

    if (!graph.terminal.some((state) => reachable.has(state))) {
      issues.push({
        code: "TERMINAL_UNREACHABLE",
        entity: graph.entity,
        message: `No terminal state of ${graph.entity} is reachable from ${graph.initial}.`,
      });
    }

    reachability.push({
      entity: graph.entity,
      reachable: [...reachable].sort(),
      stranded: stranded.sort(),
    });
  }

  return {
    valid: issues.length === 0,
    issues,
    reachability,
    orphanedRoles: [...orphanedRoles].sort(),
    droppedGates: [...droppedGates].sort(),
    keptGates: [...keptGates].sort(),
  };
}

function appendTo(map: Map<string, string[]>, key: string, value: string): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

function traverse(seeds: readonly string[], edges: ReadonlyMap<string, string[]>): Set<string> {
  const seen = new Set<string>(seeds);
  const queue = [...seeds];

  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const next of edges.get(current) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }

  return seen;
}
