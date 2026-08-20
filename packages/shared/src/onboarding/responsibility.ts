import { isCapabilityActive, type CapabilityKey, type CapabilityProfile } from "../capabilities/types";
import { capabilityDefinition } from "../capabilities/registry";
import { DEFAULT_ROLE_PERMISSIONS } from "../permissions/default-role-permissions";
import type { PermissionKey } from "../permissions/permission-manifest";
import type { StaffRole } from "../session/session-context";

/**
 * Who actually does the work a capability creates.
 *
 * This exists because of a real, silent hole. Turning on Inventory gives
 * a workshop part requests, issuing, returns and stock — every one of
 * which is gated behind an `inventory.*` permission that, in the
 * platform's baseline map, only `INVENTORY_MANAGER` holds. `TENANT_OWNER`
 * holds none of them.
 *
 * So a one-bay workshop that enables Inventory and never hires a
 * storekeeper gets a capability nobody in the building can operate: the
 * technician raises a part request and there is no account on earth
 * permitted to approve it. Nothing in the product refuses that
 * configuration, because nothing in the product was ever asked the
 * question.
 *
 * The question is asked here, and the answer is a real permission grant.
 * Choosing "the owner covers this" writes the missing `RolePermission`
 * rows for `TENANT_OWNER` at creation — the same rows an owner would
 * otherwise have to discover and grant by hand, after the first part
 * request had already stuck.
 *
 * What this deliberately does NOT do is invent a permission or a role.
 * Every key transferred below is one the dedicated role already holds in
 * `DEFAULT_ROLE_PERMISSIONS`, moved to a role the same map already
 * treats as senior to it. Nothing new is granted to anyone.
 */

export interface ResponsibilityQuestion {
  /** The capability that raises the question. */
  readonly capability: CapabilityKey;
  /** The role the platform's baseline map gives this work to. */
  readonly dedicatedRole: StaffRole;
  readonly question: string;
  /** Why this is being asked at all, in the operator's terms. */
  readonly why: string;
  /**
   * Roles that may legitimately hold this work instead. Never a free
   * list: each is a role the baseline map already places above the
   * dedicated one, so delegating never grants anybody a new kind of
   * authority.
   */
  readonly fallbackRoles: readonly StaffRole[];
  /** The default answer: staff the dedicated role. */
  readonly defaultAnswer: ResponsibilityAnswer;
}

/**
 * `DEDICATED` — this workshop will hire someone for it. Nothing is
 * granted; the role's own seeded permissions are already correct.
 *
 * Any other value is a role that picks the work up instead, and its
 * permissions are written at creation.
 */
export type ResponsibilityAnswer = "DEDICATED" | StaffRole;

const QUESTIONS: readonly ResponsibilityQuestion[] = [
  {
    capability: "INVENTORY",
    dedicatedRole: "INVENTORY_MANAGER",
    question: "Who runs the store?",
    why:
      "Approving a part request, issuing stock and accepting a return are all inventory-manager work. If nobody " +
      "holds that role, a technician's first part request has nobody who can answer it.",
    fallbackRoles: ["TENANT_OWNER", "BRANCH_MANAGER"],
    defaultAnswer: "DEDICATED",
  },
  {
    capability: "TEAMS",
    dedicatedRole: "TEAM_LEADER",
    question: "Who supervises the technicians?",
    why:
      "Team leaders see their technicians' load, write supervision notes and raise issues to the branch. Without " +
      "one, that work has no home — which is fine if the branch manager is doing it, and a gap if nobody is.",
    fallbackRoles: ["BRANCH_MANAGER", "TENANT_OWNER"],
    defaultAnswer: "DEDICATED",
  },
  {
    capability: "MULTI_BRANCH",
    dedicatedRole: "BRANCH_MANAGER",
    question: "Who runs each branch day to day?",
    why:
      "Booking a vehicle in, reassigning a technician, clearing blockers and releasing a delivery are branch-manager " +
      "work. In a single-operator workshop the owner does all of it.",
    fallbackRoles: ["TENANT_OWNER"],
    defaultAnswer: "DEDICATED",
  },
];

/**
 * The responsibility questions this workshop's shape actually raises.
 *
 * Derived, like every other question set in this flow: a workshop with
 * no inventory is never asked who runs its store, because it has no
 * store and the question has no meaning.
 */
export function applicableResponsibilities(profile: CapabilityProfile): readonly ResponsibilityQuestion[] {
  return QUESTIONS.filter((question) => {
    if (!isCapabilityActive(profile, question.capability)) return false;
    // Belt and braces against the registry and this list drifting apart:
    // the question only stands while the capability really does name
    // this role as one it affects.
    const definition = capabilityDefinition(question.capability);
    return definition?.affectedRoles.includes(question.dedicatedRole) ?? false;
  });
}

export function responsibilityQuestion(capability: CapabilityKey): ResponsibilityQuestion | undefined {
  return QUESTIONS.find((question) => question.capability === capability);
}

export interface PermissionGrant {
  readonly role: StaffRole;
  readonly permissionKey: PermissionKey;
  readonly allowed: boolean;
  /** Which answer produced this grant, for the audit record and the review screen. */
  readonly becauseOf: CapabilityKey;
}

/**
 * The extra permission rows a set of responsibility answers requires.
 *
 * Only *positive* permissions move. A key the dedicated role is
 * explicitly denied (`inventory.cost.view` is `false` for
 * `INVENTORY_MANAGER` — managing the catalogue does not imply seeing
 * margin) stays denied for whoever picks the work up. Delegating a job
 * is not a route to a permission the job itself never carried.
 *
 * A key the fallback role already holds is skipped rather than
 * re-granted, so the seeded rows stay one-per-(role, key) and the
 * grant list shown on the review screen contains only real changes.
 */
export function grantsForResponsibilities(
  profile: CapabilityProfile,
  answers: Readonly<Record<string, ResponsibilityAnswer>>,
): readonly PermissionGrant[] {
  const grants: PermissionGrant[] = [];
  const seen = new Set<string>();

  for (const question of applicableResponsibilities(profile)) {
    const answer = answers[question.capability] ?? question.defaultAnswer;
    if (answer === "DEDICATED") continue;
    if (!question.fallbackRoles.includes(answer)) continue;

    const dedicated = DEFAULT_ROLE_PERMISSIONS[question.dedicatedRole] ?? {};
    const fallbackExisting = DEFAULT_ROLE_PERMISSIONS[answer] ?? {};

    for (const [key, allowed] of Object.entries(dedicated)) {
      if (allowed !== true) continue;
      if (fallbackExisting[key as PermissionKey] === true) continue;

      const identity = `${answer}:${key}`;
      if (seen.has(identity)) continue;
      seen.add(identity);

      grants.push({
        role: answer,
        permissionKey: key as PermissionKey,
        allowed: true,
        becauseOf: question.capability,
      });
    }
  }

  return grants;
}

/**
 * Capabilities that are on with nobody able to operate them.
 *
 * The answer is only ever "nobody" when the operator has said the role
 * will not be staffed AND named no fallback — which the UI does not
 * offer, but a hand-built API request can. This is the check that keeps
 * it out of the database.
 */
export function orphanedCapabilities(
  profile: CapabilityProfile,
  answers: Readonly<Record<string, ResponsibilityAnswer>>,
): readonly CapabilityKey[] {
  return applicableResponsibilities(profile)
    .filter((question) => {
      const answer = answers[question.capability];
      if (answer === undefined) return false; // unanswered means the default: staff the role
      if (answer === "DEDICATED") return false;
      return !question.fallbackRoles.includes(answer);
    })
    .map((question) => question.capability);
}

/**
 * A one-line summary of who ends up holding each capability, for the
 * review screen and the completion summary.
 */
export function responsibilitySummary(
  profile: CapabilityProfile,
  answers: Readonly<Record<string, ResponsibilityAnswer>>,
): readonly { capability: CapabilityKey; holder: StaffRole; delegated: boolean }[] {
  return applicableResponsibilities(profile).map((question) => {
    const answer = answers[question.capability] ?? question.defaultAnswer;
    const delegated = answer !== "DEDICATED" && question.fallbackRoles.includes(answer);
    return {
      capability: question.capability,
      holder: delegated ? (answer as StaffRole) : question.dedicatedRole,
      delegated,
    };
  });
}
