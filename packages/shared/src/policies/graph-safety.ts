import { ALL_GRAPHS } from "../capabilities/workflow-graphs";
import { SHIPPED_PROFILES } from "../capabilities/profiles";
import { effectiveGraph, type PolicyAnswers, type WorkOrderFacts } from "../capabilities/workflow-router";
import { isCapabilityActive, type CapabilityProfile, type WorkflowGraph } from "../capabilities/types";
import { POLICY_DEFINITIONS } from "./registry";
import { isPolicyRelevant, policyCapabilityKey } from "./types";

/**
 * The guarantee that lets a policy touch the workflow graph at all.
 *
 * The capability engine's central promise is that no configuration can
 * strand a work order. Letting policies narrow the graph puts that
 * promise at risk in a new way: a policy condition removes edges, and
 * enough removed edges leave a state with no way out.
 *
 * PHASE_21.md S3.1's rule -- *a policy may never change reachability* --
 * is what keeps the two compatible, and this file is where that rule
 * stops being a convention. It walks every shipped capability profile
 * against every combination of the policy options that actually appear on
 * an edge, and reports any state that loses its last route to a terminal.
 *
 * Run in CI against the real graphs and the real registry, so an option
 * that would strand a job fails the build rather than a workshop.
 *
 * ---------------------------------------------------------------------
 * THE SECOND HALF: A STALE ANSWER IS NOT AN ANSWER
 * ---------------------------------------------------------------------
 *
 * The subtler failure has nothing to do with the options themselves. A
 * workshop answers "team review is compulsory", then later turns the
 * TEAM_REVIEW capability off. The stored row survives -- correctly, the
 * table is time-ranged history -- and if the router read it, both
 * remaining FINISH edges would go dark and every job would stick in
 * IN_PROGRESS for a question the workshop is no longer even asked.
 *
 * `relevantPolicyAnswers` is the fix, and it is a semantic point rather
 * than a defensive one: a policy whose capability is gone has no answer,
 * in exactly the sense `isPolicyRelevant` already means. Every caller
 * that hands answers to the router goes through it.
 */

/**
 * The subset of a workshop's answers that its current shape makes
 * meaningful. Everything handed to the router passes through here.
 */
export function relevantPolicyAnswers(
  profile: CapabilityProfile,
  allAnswers: ReadonlyMap<string, string>,
  specializations: ReadonlySet<string> = new Set(),
): PolicyAnswers {
  const relevant = new Map<string, string>();
  for (const definition of POLICY_DEFINITIONS) {
    const answer = allAnswers.get(definition.key);
    if (answer === undefined) continue;
    if (!isPolicyRelevant(definition, profile, specializations, allAnswers)) continue;
    relevant.set(definition.key, answer);
  }
  return relevant;
}

export interface GraphSafetyIssue {
  readonly entity: string;
  readonly profileName: string;
  /** The policy answers in force when the strand appeared. */
  readonly answers: Readonly<Record<string, string>>;
  readonly strandedStates: readonly string[];
  readonly message: string;
}

export interface GraphSafetyResult {
  readonly safe: boolean;
  readonly issues: readonly GraphSafetyIssue[];
  /** How many (profile x answer-combination x entity) cases were walked. */
  readonly casesChecked: number;
}

/** Policy keys that actually appear as a condition on some edge. */
export function policiesAppearingOnEdges(graphs: readonly WorkflowGraph[] = ALL_GRAPHS): readonly string[] {
  const keys = new Set<string>();
  for (const graph of graphs) {
    for (const transition of graph.transitions) {
      for (const condition of transition.requiresPolicy ?? []) keys.add(condition.policyKey);
    }
  }
  return [...keys].sort();
}

/** Fact keys that actually appear as a condition on some edge (see WorkflowTransition.requiresFact). */
export function factsAppearingOnEdges(graphs: readonly WorkflowGraph[] = ALL_GRAPHS): readonly string[] {
  const keys = new Set<string>();
  for (const graph of graphs) {
    for (const transition of graph.transitions) {
      for (const fact of transition.requiresFact ?? []) keys.add(fact);
    }
  }
  return [...keys].sort();
}

/**
 * Every subset of the fact keys that appear on an edge -- a work order
 * either has a given fact or it does not, so this is a plain powerset
 * rather than the per-policy option expansion `answerCombinations` does.
 */
function factCombinations(keys: readonly string[]): readonly WorkOrderFacts[] {
  let combos: ReadonlySet<string>[] = [new Set()];
  for (const key of keys) {
    const next: ReadonlySet<string>[] = [];
    for (const combo of combos) {
      next.push(combo, new Set([...combo, key]));
    }
    combos = next;
  }
  return combos;
}

/**
 * Every combination of options for the policies that appear on an edge.
 *
 * Exhaustive rather than sampled: the set is small by construction --
 * only policies that touch the graph are included, and the registry has
 * a handful -- and a reachability guarantee proven on a sample is not a
 * guarantee. If this ever grows past a few thousand combinations, the
 * right answer is fewer graph-touching policies, not a smarter sampler.
 */
function answerCombinations(keys: readonly string[]): readonly Readonly<Record<string, string>>[] {
  let combos: Record<string, string>[] = [{}];
  for (const key of keys) {
    const definition = POLICY_DEFINITIONS.find((candidate) => candidate.key === key);
    if (!definition) continue;
    const next: Record<string, string>[] = [];
    for (const combo of combos) {
      for (const option of definition.options) {
        next.push({ ...combo, [key]: option.key });
      }
    }
    combos = next;
  }
  return combos;
}

/** States reachable from the initial state, and which of those cannot reach a terminal. */
function strandedStates(
  graph: WorkflowGraph,
  profile: CapabilityProfile,
  answers: PolicyAnswers,
  facts: WorkOrderFacts,
): readonly string[] {
  const effective = effectiveGraph(graph, profile, answers, facts);
  const out = new Map<string, string[]>();
  for (const transition of effective.transitions) {
    if (!out.has(transition.from)) out.set(transition.from, []);
    out.get(transition.from)!.push(transition.to);
  }

  // Forward reachability from the initial state.
  const reachable = new Set<string>([effective.initial]);
  const queue = [effective.initial];
  while (queue.length > 0) {
    for (const next of out.get(queue.shift()!) ?? []) {
      if (reachable.has(next)) continue;
      reachable.add(next);
      queue.push(next);
    }
  }

  // Backward reachability from the terminals.
  const canFinish = new Set<string>(effective.terminal);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [from, targets] of out) {
      if (canFinish.has(from)) continue;
      if (targets.some((target) => canFinish.has(target))) {
        canFinish.add(from);
        changed = true;
      }
    }
  }

  return [...reachable].filter((state) => !canFinish.has(state)).sort();
}

/**
 * Walks every shipped profile against every graph-touching policy
 * combination, and reports anything that strands.
 *
 * Only *relevant* answers are applied, mirroring the runtime exactly --
 * checking combinations the runtime would never assemble would report
 * failures nobody can reach and hide the ones they can.
 */
export function validatePolicyGraphSafety(
  graphs: readonly WorkflowGraph[] = ALL_GRAPHS,
  profiles: Readonly<Record<string, CapabilityProfile>> = SHIPPED_PROFILES,
): GraphSafetyResult {
  const issues: GraphSafetyIssue[] = [];
  const keys = policiesAppearingOnEdges(graphs);
  const combos = answerCombinations(keys);
  const factKeys = factsAppearingOnEdges(graphs);
  const factCombos = factCombinations(factKeys);
  let casesChecked = 0;

  for (const [profileName, profile] of Object.entries(profiles)) {
    for (const combo of combos) {
      const answers = relevantPolicyAnswers(profile, new Map(Object.entries(combo)));
      for (const facts of factCombos) {
        for (const graph of graphs) {
          // A graph whose own required capabilities are gone is not part of
          // this workshop at all -- "this never happens here" is not the
          // same defect as "this happens and then gets stuck".
          if ((graph.requires ?? []).some((key) => !isCapabilityActive(profile, key))) continue;

          casesChecked += 1;
          const stranded = strandedStates(graph, profile, answers, facts);
          if (stranded.length === 0) continue;

          issues.push({
            entity: graph.entity,
            profileName,
            answers: combo,
            strandedStates: stranded,
            message:
              `Under ${profileName}, with ${JSON.stringify(combo)} and facts [${[...facts].join(", ")}], ` +
              `${graph.entity} states ${stranded.join(", ")} are reachable but cannot reach a terminal state.`,
          });
        }
      }
    }
  }

  return { safe: issues.length === 0, issues, casesChecked };
}

/**
 * Every policy that appears on an edge must declare the capability that
 * owns the states it narrows.
 *
 * Without that declaration the condition survives its own capability
 * being removed, which is the stale-answer failure `relevantPolicyAnswers`
 * exists to prevent -- and relying on the runtime filter alone would mean
 * one forgotten call site reintroduces it.
 */
export function policiesOnEdgesDeclareTheirCapability(graphs: readonly WorkflowGraph[] = ALL_GRAPHS): readonly string[] {
  const problems: string[] = [];
  for (const graph of graphs) {
    for (const transition of graph.transitions) {
      for (const condition of transition.requiresPolicy ?? []) {
        const definition = POLICY_DEFINITIONS.find((candidate) => candidate.key === condition.policyKey);
        if (!definition) {
          problems.push(`${graph.entity}: ${condition.policyKey} is not a registered policy.`);
          continue;
        }
        // An edge that itself requires capabilities must be narrowed only
        // by a policy that depends on at least one of them, or on nothing
        // at all (a policy that applies to every workshop cannot go stale).
        const edgeCaps = new Set(transition.requires ?? []);
        const policyCaps = definition.dependsOnCapabilities.map(policyCapabilityKey);
        if (policyCaps.length === 0) continue;
        if (edgeCaps.size === 0) continue;
        if (policyCaps.some((key) => edgeCaps.has(key))) continue;
        problems.push(
          `${graph.entity}: ${transition.from} -> ${transition.to} requires [${[...edgeCaps].join(", ")}] but is ` +
            `narrowed by ${condition.policyKey}, which depends on [${policyCaps.join(", ")}]. A policy that outlives ` +
            `the capability owning the edge it narrows can strand that edge's state.`,
        );
      }
    }
  }
  return problems;
}
