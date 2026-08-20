import { CAPABILITY_KEYS, isCapabilityActive, type CapabilityKey, type CapabilityProfile, type CapabilityStatus } from "../capabilities/types";
import { CAPABILITY_REGISTRY, capabilityDefinition } from "../capabilities/registry";
import { validateCapabilityProfile } from "../capabilities/validator";
import { GATE_DEFINITIONS, gateDefinition, gatesOwnedBy, type GateKey } from "../capabilities/gates";
import { ALL_GRAPHS } from "../capabilities/workflow-graphs";
import { ROLE_PAGES } from "../pages/page-registry";
import { POLICY_DEFINITIONS } from "../policies/registry";
import { isPolicyRelevant, policyCapabilityKey, type PolicyDefinition } from "../policies/types";
import type { StaffRole } from "../session/session-context";
import type { OperatingCategory } from "../operations/categories";
import { definitionsSeededBy, specializationPack } from "./specialization-packs";
import { applicableResponsibilities, grantsForResponsibilities, type ResponsibilityAnswer } from "./responsibility";

/**
 * The workshop being configured, and everything that can be *derived*
 * from it.
 *
 * The whole point of the onboarding experience is that an answer visibly
 * changes the workshop being built. That only stays true if the things
 * shown back -- which pages exist, which roles have work, which
 * questions still apply, how far through this is -- are computed from
 * the same registries the running product uses, not from a second list
 * maintained beside them.
 *
 * So: nothing in this file states a fact about a workshop that the
 * capability registry, the gate registry, the workflow graphs, the page
 * registry or the policy registry does not already assert. If a number
 * cannot be derived, it is not shown. That is what stops a premium
 * onboarding screen from becoming a brochure.
 *
 * Pure, like the engines it reads: no Prisma, no Nest, no clock. The API
 * validates a submitted draft with exactly this code, and the browser
 * previews it with exactly this code, so the preview and the verdict can
 * never disagree.
 */

// ---------------------------------------------------------------------------
// The draft
// ---------------------------------------------------------------------------

export interface DraftBranch {
  readonly name: string;
  readonly code: string;
  readonly city?: string;
  readonly address?: string;
}

export interface DraftWarehouse {
  readonly name: string;
  readonly code: string;
  /** Branch codes this store serves. Empty means every branch. */
  readonly branchCodes: readonly string[];
}

export interface WorkshopIdentityDraft {
  readonly name: string;
  readonly slug: string;
  readonly country: string;
  readonly city: string;
  readonly currency: string;
  readonly timezone: string;
  readonly businessType: string;
  readonly businessTypeOther?: string;
  readonly primaryCategory: OperatingCategory | "";
}

export interface WorkshopOwnerDraft {
  readonly ownerFullName: string;
  readonly ownerEmail: string;
  readonly ownerPhone: string;
}

export interface WorkshopPlanDraft {
  readonly planId: string;
  readonly initialStatus: string;
  readonly enableDemoData: boolean;
}

/**
 * A plan's ceilings, passed in rather than looked up: plans are database
 * rows, and this module does not read a database. The caller supplies
 * the selected plan's numbers so the same validation runs identically in
 * the browser and on the server.
 */
export interface PlanLimits {
  readonly maxBranches: number;
  readonly maxUsers: number;
  readonly maxWarehouses: number;
}

/**
 * A service the workshop offers, priced.
 *
 * Written as real `PriceCatalogEntry` rows, which is what the running
 * invoice reads when a line is added -- deliberately not an
 * onboarding-only price list. A workshop that declares "Oil change,
 * 450 EGP" here can charge it on its first job.
 */
export interface DraftService {
  readonly name: string;
  /** Minor units as a string, the same way money crosses every other API boundary in MOP. */
  readonly price: string;
  readonly category?: string;
}

export interface WorkshopDraft {
  readonly identity: WorkshopIdentityDraft;
  readonly owner: WorkshopOwnerDraft;
  readonly plan: WorkshopPlanDraft;
  /** Deviations from the full product. An absent key is ENABLED. */
  readonly capabilities: CapabilityProfile;
  /** Specialization pack keys. */
  readonly specializationPacks: readonly string[];
  /** Policy key -> chosen option key. An absent key runs on the registry default. */
  readonly policies: Readonly<Record<string, string>>;
  /** Capability key -> who operates it. An absent key means the dedicated role is staffed. */
  readonly responsibilities: Readonly<Record<string, ResponsibilityAnswer>>;
  readonly branches: readonly DraftBranch[];
  readonly warehouses: readonly DraftWarehouse[];
  readonly services: readonly DraftService[];
}

export function emptyDraft(): WorkshopDraft {
  return {
    identity: {
      name: "",
      slug: "",
      country: "",
      city: "",
      currency: "",
      timezone: "",
      businessType: "",
      primaryCategory: "",
    },
    owner: { ownerFullName: "", ownerEmail: "", ownerPhone: "" },
    plan: { planId: "", initialStatus: "TRIAL", enableDemoData: false },
    capabilities: {},
    specializationPacks: [],
    policies: {},
    responsibilities: {},
    branches: [],
    warehouses: [],
    services: [],
  };
}

// ---------------------------------------------------------------------------
// Capability consequences -- all derived, none authored
// ---------------------------------------------------------------------------

export interface CapabilityConsequence {
  readonly key: CapabilityKey;
  readonly owningSystem: string;
  /** Capabilities that must be active for this one to function. */
  readonly requires: readonly CapabilityKey[];
  /** Capabilities that stop working if this one is turned off. */
  readonly requiredBy: readonly CapabilityKey[];
  readonly conflicts: readonly CapabilityKey[];
  /** Gates that exist only while this capability does. */
  readonly gates: readonly GateKey[];
  /** Lifecycle states that stop being enterable without it. */
  readonly statesLostWithout: readonly string[];
  readonly rolesAffected: readonly string[];
  readonly reportsAffected: readonly string[];
  /** Pages that belong to the roles this capability affects. */
  readonly pagesAffected: readonly string[];
  readonly reversible: boolean;
  /** null for a CORE capability -- one that may never be disabled. */
  readonly removalBehavior: string | null;
  /** Replacement wording for the customer, where removal changes what they are told. */
  readonly customerSafeMessage: string | null;
  /** Policy questions that stop being asked without this capability. */
  readonly policiesLostWithout: readonly string[];
  /** Stages later in the journey that this capability makes relevant. */
  readonly requiresLaterSetup: readonly string[];
}

/**
 * Everything the product itself already knows about one capability,
 * collected in one shape a card can render.
 *
 * `requiredBy` is the reverse edge of `dependencies`, computed here
 * rather than declared: a hand-written reverse list is the classic way
 * two halves of a dependency graph drift, and the capability registry
 * already had one such drift cost this project a stranded-work-order bug.
 */
export function capabilityConsequence(key: CapabilityKey): CapabilityConsequence {
  const definition = capabilityDefinition(key);
  if (!definition) {
    throw new Error(`"${key}" is not a registered capability.`);
  }

  const requiredBy = [...CAPABILITY_REGISTRY.values()]
    .filter((other) => other.dependencies.includes(key))
    .map((other) => other.key);

  const rolesAffected = definition.affectedRoles;
  const pagesAffected = rolesAffected.flatMap((role) => ROLE_PAGES[role as StaffRole] ?? []);

  const policiesLostWithout = POLICY_DEFINITIONS.filter((policy) =>
    policy.dependsOnCapabilities.some((dependency) => policyCapabilityKey(dependency) === key),
  ).map((policy) => policy.key);

  return {
    key,
    owningSystem: definition.owningSystem,
    requires: definition.dependencies,
    requiredBy,
    conflicts: definition.conflicts,
    gates: gatesOwnedBy(key),
    statesLostWithout: definition.removal?.statesToDisable ?? [],
    rolesAffected,
    reportsAffected: definition.affectedReports,
    pagesAffected,
    reversible: definition.reversible,
    removalBehavior: definition.removal?.behavior ?? null,
    customerSafeMessage: definition.removal?.customerSafeMessage ?? null,
    policiesLostWithout,
    requiresLaterSetup: laterSetupFor(key),
  };
}

/**
 * Stages a capability makes relevant further along the journey.
 *
 * Deliberately short and specific. "Enabling Inventory means you will
 * configure a store later" is a real, checkable consequence -- the
 * validator below refuses to publish an inventory workshop with no
 * store. A vaguer promise here would be a claim nothing enforces.
 */
function laterSetupFor(key: CapabilityKey): readonly string[] {
  switch (key) {
    case "INVENTORY":
      return ["At least one store, on the Structure stage"];
    case "MULTI_WAREHOUSE":
      return ["Two or more stores, on the Structure stage"];
    case "MULTI_BRANCH":
      return ["Two or more branches, on the Structure stage"];
    default:
      return [];
  }
}

export const ALL_CAPABILITY_CONSEQUENCES: readonly CapabilityConsequence[] = CAPABILITY_KEYS.map(capabilityConsequence);

// ---------------------------------------------------------------------------
// What the workshop will actually contain
// ---------------------------------------------------------------------------

export interface DerivedFacts {
  /** Capabilities live in the finished workshop. */
  readonly activeCapabilities: readonly CapabilityKey[];
  readonly disabledCapabilities: readonly CapabilityKey[];
  readonly externalCapabilities: readonly CapabilityKey[];
  /** Roles with somewhere to work. An orphaned role is excluded. */
  readonly activeRoles: readonly string[];
  readonly orphanedRoles: readonly string[];
  /** Pages reachable by at least one active role. */
  readonly pageCount: number;
  readonly pages: readonly string[];
  /** Gate checks that will really run at Finish and Delivery. */
  readonly liveGates: readonly GateKey[];
  readonly droppedGates: readonly string[];
  /** Reachable, non-stranded lifecycle states per entity. */
  readonly workflowStates: readonly { entity: string; reachable: number; total: number }[];
  /** Policy questions that apply to this workshop's shape. */
  readonly applicablePolicyCount: number;
  readonly answeredPolicyCount: number;
  /** Specialization definitions the creation transaction will really write. */
  readonly specializationDefinitionCount: number;
  readonly specializationDefinitionNames: readonly string[];
  readonly branchCount: number;
  readonly warehouseCount: number;
  /** Capabilities whose work has been handed to a role other than the dedicated one. */
  readonly delegatedCapabilities: readonly CapabilityKey[];
  /** Extra permission rows those delegations will really write. */
  readonly extraPermissionGrants: number;
  readonly serviceCount: number;
}

/** Roles that appear in the page registry -- the ones a workshop can actually staff. */
const ALL_TENANT_ROLES: readonly StaffRole[] = Object.keys(ROLE_PAGES) as StaffRole[];

export function derivedFacts(draft: WorkshopDraft): DerivedFacts {
  const profile = draft.capabilities;
  const validation = validateCapabilityProfile(profile);

  const active: CapabilityKey[] = [];
  const disabled: CapabilityKey[] = [];
  const external: CapabilityKey[] = [];
  for (const key of CAPABILITY_KEYS) {
    const status = profile[key] ?? "ENABLED";
    if (status === "EXTERNAL") external.push(key);
    else if (isCapabilityActive(profile, key)) active.push(key);
    else disabled.push(key);
  }

  // A role is orphaned when the capability that gave it work is gone --
  // the capability engine already computes this, so it is read, not
  // re-decided. TENANT_OWNER is never orphaned: someone owns the
  // workshop under every shape.
  const orphaned = new Set(validation.orphanedRoles);
  const activeRoles = ALL_TENANT_ROLES.filter((role) => role === "TENANT_OWNER" || !orphaned.has(role));

  const pages = [...new Set(activeRoles.flatMap((role) => ROLE_PAGES[role] ?? []))].sort();

  const liveGates = GATE_DEFINITIONS.filter(
    (gate) => gate.owner === null || isCapabilityActive(profile, gate.owner),
  ).map((gate) => gate.key);

  const workflowStates = validation.reachability.map((entity) => {
    const graph = ALL_GRAPHS.find((candidate) => candidate.entity === entity.entity);
    return { entity: entity.entity, reachable: entity.reachable.length, total: graph?.states.length ?? entity.reachable.length };
  });

  const applicable = applicablePolicies(draft);
  const answered = applicable.filter((policy) => draft.policies[policy.key] !== undefined).length;

  const seeded = definitionsSeededBy(draft.specializationPacks);

  return {
    activeCapabilities: active,
    disabledCapabilities: disabled,
    externalCapabilities: external,
    activeRoles,
    orphanedRoles: validation.orphanedRoles,
    pageCount: pages.length,
    pages,
    liveGates,
    droppedGates: validation.droppedGates,
    workflowStates,
    applicablePolicyCount: applicable.length,
    answeredPolicyCount: answered,
    specializationDefinitionCount: seeded.length,
    specializationDefinitionNames: seeded.map((definition) => definition.name),
    branchCount: draft.branches.length,
    warehouseCount: draft.warehouses.length,
    delegatedCapabilities: applicableResponsibilities(profile)
      .filter((question) => {
        const answer = draft.responsibilities[question.capability];
        return answer !== undefined && answer !== "DEDICATED";
      })
      .map((question) => question.capability),
    extraPermissionGrants: grantsForResponsibilities(profile, draft.responsibilities).length,
    serviceCount: draft.services.length,
  };
}

// ---------------------------------------------------------------------------
// Which questions this workshop is even asked
// ---------------------------------------------------------------------------

/**
 * The policy questions that apply to this draft, in registry order.
 *
 * This is PHASE_21.md S3.2's "decision sets are derived, not enumerated"
 * made concrete: a workshop with no inventory is never asked about
 * separation of duties on parts, because in that workshop the question
 * has no meaning -- not because it has a defaulted answer.
 *
 * Specializations are passed through as the chosen pack keys, which is
 * what a relevance predicate can meaningfully test against at creation
 * time.
 */
export function applicablePolicies(draft: WorkshopDraft): readonly PolicyDefinition[] {
  const specializations = new Set(draft.specializationPacks);
  const answers = new Map(Object.entries(draft.policies));
  return POLICY_DEFINITIONS.filter((policy) =>
    isPolicyRelevant(policy, draft.capabilities, specializations, answers),
  );
}

/**
 * Policies the draft carries an answer for that no longer apply.
 *
 * Changing an earlier answer must not leave a stale later one behind:
 * a workshop that enabled Inventory, answered its parts questions, then
 * disabled Inventory again would otherwise publish answers to questions
 * it was never asked. Callers strip these before submitting; the
 * validator reports them so the UI can say what it dropped and why.
 */
export function strandedPolicyAnswers(draft: WorkshopDraft): readonly string[] {
  const applicable = new Set(applicablePolicies(draft).map((policy) => policy.key));
  return Object.keys(draft.policies)
    .filter((key) => !applicable.has(key))
    .sort();
}

/** The draft with stranded answers removed. Used whenever capabilities change. */
export function pruneStrandedAnswers(draft: WorkshopDraft): WorkshopDraft {
  const stranded = new Set(strandedPolicyAnswers(draft));
  if (stranded.size === 0) return draft;

  const policies: Record<string, string> = {};
  for (const [key, value] of Object.entries(draft.policies)) {
    if (!stranded.has(key)) policies[key] = value;
  }
  return { ...draft, policies };
}

/**
 * The recommended answer for every applicable policy -- what "use
 * recommended defaults" actually applies.
 *
 * Deliberately not "turn everything on": it fills in exactly the
 * registry's declared default for exactly the questions this workshop's
 * shape makes relevant, and answers nothing else. A workshop with no
 * portal gets no portal answers.
 */
export function recommendedPolicyAnswers(draft: WorkshopDraft): Readonly<Record<string, string>> {
  const answers: Record<string, string> = {};
  for (const policy of applicablePolicies(draft)) {
    answers[policy.key] = policy.default;
  }
  return answers;
}

/** A policy's effective value in this draft: the answer if given, otherwise the registry default. */
export function effectivePolicyValue(draft: WorkshopDraft, policyKey: string): string | null {
  const answered = draft.policies[policyKey];
  if (answered !== undefined) return answered;
  return POLICY_DEFINITIONS.find((policy) => policy.key === policyKey)?.default ?? null;
}

// ---------------------------------------------------------------------------
// Capability changes, with their knock-on effects resolved
// ---------------------------------------------------------------------------

export interface CapabilityChangeEffect {
  readonly draft: WorkshopDraft;
  /** Capabilities switched off because what they depend on went off. */
  readonly cascadedOff: readonly CapabilityKey[];
  /** Capabilities switched on because the change requires them. */
  readonly cascadedOn: readonly CapabilityKey[];
  /** Policy answers dropped because their question no longer applies. */
  readonly droppedPolicies: readonly string[];
}

/**
 * Sets one capability's status and resolves what that means for the rest
 * of the configuration, in one step.
 *
 * The user-visible promise this keeps: turning Inventory off cannot
 * leave Part Returns quietly on, dependent on something that no longer
 * exists, to be discovered at publish as a validation error. The
 * cascade happens at the moment of the click, and the caller is told
 * exactly what else moved so it can say so.
 *
 * Enabling cascades upward through `dependencies` for the same reason:
 * asking someone to turn on Inventory *and* remember that Part Returns
 * needed it is asking them to hold the dependency graph in their head.
 */
export function applyCapabilityChange(
  draft: WorkshopDraft,
  key: CapabilityKey,
  status: CapabilityStatus,
): CapabilityChangeEffect {
  const capabilities: Record<string, CapabilityStatus> = { ...draft.capabilities };
  capabilities[key] = status;

  const cascadedOn: CapabilityKey[] = [];
  const cascadedOff: CapabilityKey[] = [];

  const nowActive = isCapabilityActive(capabilities as CapabilityProfile, key);

  if (nowActive) {
    // Pull every transitive dependency up with it.
    const queue: CapabilityKey[] = [key];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const dependency of capabilityDefinition(current)?.dependencies ?? []) {
        if (isCapabilityActive(capabilities as CapabilityProfile, dependency)) continue;
        capabilities[dependency] = "ENABLED";
        cascadedOn.push(dependency);
        queue.push(dependency);
      }
    }
  } else {
    // Push every transitive dependent down with it. Repeat to a fixed
    // point rather than one pass: PART_RETURNS depends on INVENTORY, and
    // anything depending on PART_RETURNS has to follow it down too.
    let changed = true;
    while (changed) {
      changed = false;
      for (const definition of CAPABILITY_REGISTRY.values()) {
        if (!isCapabilityActive(capabilities as CapabilityProfile, definition.key)) continue;
        const brokenDependency = definition.dependencies.some(
          (dependency) => !isCapabilityActive(capabilities as CapabilityProfile, dependency),
        );
        if (!brokenDependency) continue;
        capabilities[definition.key] = "DISABLED";
        cascadedOff.push(definition.key);
        changed = true;
      }
    }
  }

  const withCapabilities: WorkshopDraft = { ...draft, capabilities: capabilities as CapabilityProfile };
  const droppedPolicies = strandedPolicyAnswers(withCapabilities);

  return {
    draft: pruneStrandedAnswers(withCapabilities),
    cascadedOn,
    cascadedOff,
    droppedPolicies,
  };
}

/** A gate's own words, for a screen listing what will really be checked. */
export function gateWords(key: GateKey): { checkpoint: string; blocked: string; satisfied: string } | null {
  const definition = gateDefinition(key);
  if (!definition) return null;
  return {
    checkpoint: definition.checkpoint,
    blocked: definition.blockedMessage,
    satisfied: definition.satisfiedMessage,
  };
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

/**
 * The modules a workshop's capability profile actually requires.
 *
 * This exists because of a contradiction found by entering a created
 * workshop and looking at what its owner got. `enabledModules` was
 * written from the chosen starter *template* -- a list that predates
 * capabilities being decided at creation at all -- while the capability
 * profile was written separately. The two could disagree, and
 * `ModuleEnabledLayer` sits in the permission resolver denying any key
 * whose module is absent.
 *
 * So a workshop configured with pricing turned ON, but whose template
 * happened to be MINIMAL, got a live FINANCE_CORE capability and no
 * FINANCE module -- and every finance permission denied with "This
 * module is not enabled for your workshop". The onboarding said one
 * thing and the product did another, which is precisely the failure this
 * whole surface exists to prevent.
 *
 * Deriving the list from the profile removes the second source of truth.
 * ORGANIZATION, OPERATIONS and AUDIT are unconditional: every workshop
 * has an owner who configures it, work that moves through it, and a
 * record of what was done -- none of those is a capability anyone may
 * remove, which is exactly why none of them is in the capability
 * registry.
 */
export function modulesForProfile(profile: CapabilityProfile): readonly string[] {
  const modules = new Set<string>(["ORGANIZATION", "OPERATIONS", "AUDIT"]);

  if (isCapabilityActive(profile, "FINANCE_CORE") || profile.FINANCE_CORE === "EXTERNAL") modules.add("FINANCE");
  if (isCapabilityActive(profile, "INVENTORY")) modules.add("INVENTORY");
  if (isCapabilityActive(profile, "TEAMS")) modules.add("TEAM_MANAGEMENT");
  if (isCapabilityActive(profile, "CUSTOMER_PORTAL")) modules.add("CUSTOMER_PORTAL");

  // Reporting is not a capability -- there is no REPORTS key to remove --
  // and every shape has something worth reporting on, so it is on for
  // everyone. Listing it here rather than unconditionally above keeps the
  // three genuinely-structural modules distinguishable from this one.
  modules.add("REPORTS");

  return [...modules].sort();
}
