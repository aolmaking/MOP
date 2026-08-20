import { isCapabilityActive, type CapabilityKey } from "../capabilities/types";
import { validateCapabilityProfile } from "../capabilities/validator";
import { POLICY_DEFINITIONS } from "../policies/registry";
import { BUSINESS_TYPES, INITIAL_STATUSES } from "../platform/workshop-options";
import { isOperatingCategory } from "../operations/categories";
import { SUPPORTED_CURRENCIES, country, isSupportedCountry } from "../platform/countries";
import { specializationPack } from "./specialization-packs";
import { applicableResponsibilities, orphanedCapabilities } from "./responsibility";
import { applicablePolicies, strandedPolicyAnswers, type PlanLimits, type WorkshopDraft } from "./draft";
import type { OnboardingStageId } from "./stages";

/**
 * Whether this draft can become a workshop, and if not, exactly what is
 * wrong and where to fix it.
 *
 * Two rules shape everything here.
 *
 * **A finding names the stage that fixes it.** "Something went wrong" is
 * the failure this whole surface is built against; a finding that a user
 * cannot act on is the same failure wearing more words. Every finding
 * carries the stage it belongs to so the review screen can offer to jump
 * there.
 *
 * **The same function runs in both places.** The browser previews with
 * it and the server refuses with it. A client-side check the server does
 * not repeat is a suggestion; a server-side check the client cannot
 * anticipate is an ambush at the last press. This is neither.
 *
 * What this does *not* do is re-prove reachability itself -- that is
 * `validateCapabilityProfile`'s job, and its issues are lifted in whole
 * rather than re-derived here, because two implementations of the
 * reachability guarantee is one too many.
 */

export type DraftFindingSeverity = "BLOCKER" | "WARNING";

export type DraftFindingCode =
  // identity / plan
  | "IDENTITY_INCOMPLETE"
  | "SLUG_MALFORMED"
  | "CURRENCY_MALFORMED"
  | "UNKNOWN_COUNTRY"
  | "UNSUPPORTED_CURRENCY"
  | "CURRENCY_UNUSUAL_FOR_COUNTRY"
  | "UNKNOWN_CATEGORY"
  | "UNKNOWN_BUSINESS_TYPE"
  | "BUSINESS_TYPE_OTHER_MISSING"
  | "OWNER_INCOMPLETE"
  | "OWNER_EMAIL_MALFORMED"
  | "OWNER_PHONE_MALFORMED"
  | "PLAN_NOT_CHOSEN"
  | "UNKNOWN_INITIAL_STATUS"
  // capability engine (lifted from validateCapabilityProfile)
  | "CAPABILITY_INVALID"
  // structure
  | "NO_BRANCH"
  | "MULTI_BRANCH_NEEDS_TWO"
  | "BRANCH_EXCEEDS_PLAN"
  | "DUPLICATE_BRANCH_CODE"
  | "BRANCH_INCOMPLETE"
  | "NO_WAREHOUSE"
  | "MULTI_WAREHOUSE_NEEDS_TWO"
  | "WAREHOUSE_WITHOUT_INVENTORY"
  | "WAREHOUSE_EXCEEDS_PLAN"
  | "DUPLICATE_WAREHOUSE_CODE"
  | "WAREHOUSE_INCOMPLETE"
  | "WAREHOUSE_UNKNOWN_BRANCH"
  // specialization
  | "UNKNOWN_SPECIALIZATION_PACK"
  | "PACK_WRONG_CATEGORY"
  | "NO_SPECIALIZATION"
  // policies
  | "POLICY_NOT_ANSWERED"
  | "POLICY_VALUE_INVALID"
  | "POLICY_NOT_APPLICABLE"
  // responsibility
  | "CAPABILITY_HAS_NO_OPERATOR"
  | "RESPONSIBILITY_NOT_ANSWERED"
  // services
  | "SERVICE_INCOMPLETE"
  | "SERVICE_PRICE_INVALID"
  | "DUPLICATE_SERVICE_NAME"
  | "SERVICES_WITHOUT_FINANCE";

export interface DraftFinding {
  readonly code: DraftFindingCode;
  readonly severity: DraftFindingSeverity;
  /** Where the user goes to fix it. */
  readonly stage: OnboardingStageId;
  /** What is wrong, in words the person reading it can act on. */
  readonly message: string;
  /** The capability, policy, branch code or field the finding is about. */
  readonly subject?: string;
}

export interface DraftValidationResult {
  /** No BLOCKERs. Warnings do not stop a publish. */
  readonly publishable: boolean;
  readonly findings: readonly DraftFinding[];
  readonly blockerCount: number;
  readonly warningCount: number;
}

const SLUG_PATTERN = /^[a-z0-9-]{2,60}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
// Same E.164 shape the DTO enforces -- a leading "+", first digit 1-9,
// up to 15 digits. Deliberately the same regex, not a looser one: a
// client-side check that passes what the server refuses is worse than
// no client-side check.
const PHONE_PATTERN = /^\+[1-9]\d{1,14}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_PATTERN = /^[A-Z0-9-]{1,12}$/;

export function validateDraft(draft: WorkshopDraft, planLimits?: PlanLimits): DraftValidationResult {
  const findings: DraftFinding[] = [];
  const add = (finding: DraftFinding) => findings.push(finding);

  validateIdentity(draft, add);
  validateOwnerAndPlan(draft, add);
  validateCapabilities(draft, add);
  validateSpecialization(draft, add);
  validatePolicies(draft, add);
  validateResponsibility(draft, add);
  validateStructure(draft, planLimits, add);
  validateServices(draft, add);

  const blockerCount = findings.filter((finding) => finding.severity === "BLOCKER").length;
  return {
    publishable: blockerCount === 0,
    findings,
    blockerCount,
    warningCount: findings.length - blockerCount,
  };
}

// ---------------------------------------------------------------------------

function validateIdentity(draft: WorkshopDraft, add: (finding: DraftFinding) => void): void {
  const { identity } = draft;
  const missing: string[] = [];
  if (identity.name.trim().length < 2) missing.push("name");
  if (identity.country.trim().length < 2) missing.push("country");
  if (identity.city.trim().length < 2) missing.push("city");
  if (identity.timezone.trim().length === 0) missing.push("timezone");

  if (missing.length > 0) {
    add({
      code: "IDENTITY_INCOMPLETE",
      severity: "BLOCKER",
      stage: "IDENTITY",
      message: `The workshop still needs a ${missing.join(", a ")}.`,
      subject: missing[0],
    });
  }

  if (!SLUG_PATTERN.test(identity.slug)) {
    add({
      code: "SLUG_MALFORMED",
      severity: "BLOCKER",
      stage: "IDENTITY",
      message:
        "The web address can only use lowercase letters, digits and hyphens. It becomes a public URL, so it cannot carry anything else.",
      subject: "slug",
    });
  }

  if (identity.country.trim().length >= 2 && !isSupportedCountry(identity.country)) {
    add({
      code: "UNKNOWN_COUNTRY",
      severity: "BLOCKER",
      stage: "IDENTITY",
      message:
        `"${identity.country}" is not a country this platform supports yet. Pick one from the list — the country sets ` +
        "the working week every ageing and SLA figure is counted against.",
      subject: "country",
    });
  }

  if (!CURRENCY_PATTERN.test(identity.currency)) {
    add({
      code: "CURRENCY_MALFORMED",
      severity: "BLOCKER",
      stage: "IDENTITY",
      message: "Currency must be a three-letter code, like EGP, SAR or AED. It can never be changed after creation.",
      subject: "currency",
    });
  } else if (!SUPPORTED_CURRENCIES.includes(identity.currency)) {
    add({
      code: "UNSUPPORTED_CURRENCY",
      severity: "BLOCKER",
      stage: "IDENTITY",
      message: `"${identity.currency}" is not a currency this platform trades in. Every invoice this workshop ever issues is denominated in it, so it cannot be a typo.`,
      subject: "currency",
    });
  } else {
    const entry = country(identity.country);
    if (entry && entry.currency !== identity.currency) {
      // A warning, never a blocker: a workshop in Cairo invoicing fleet
      // customers in USD is a real business, not a mistake. Saying it
      // once is worth it because the same three keystrokes are also how
      // a genuine typo looks.
      add({
        code: "CURRENCY_UNUSUAL_FOR_COUNTRY",
        severity: "WARNING",
        stage: "IDENTITY",
        message: `${entry.name} normally trades in ${entry.currency}, and this workshop is set to ${identity.currency}. That is allowed — confirm it is deliberate.`,
        subject: "currency",
      });
    }
  }

  if (!identity.primaryCategory || !isOperatingCategory(identity.primaryCategory)) {
    add({
      code: "UNKNOWN_CATEGORY",
      severity: "BLOCKER",
      stage: "IDENTITY",
      message: "Choose what this workshop works on. It decides which specialisation packs are offered.",
      subject: "primaryCategory",
    });
  }

  if (!(BUSINESS_TYPES as readonly string[]).includes(identity.businessType)) {
    add({
      code: "UNKNOWN_BUSINESS_TYPE",
      severity: "BLOCKER",
      stage: "IDENTITY",
      message: "Choose a business type.",
      subject: "businessType",
    });
  } else if (identity.businessType === "Other" && (identity.businessTypeOther ?? "").trim().length < 2) {
    add({
      code: "BUSINESS_TYPE_OTHER_MISSING",
      severity: "BLOCKER",
      stage: "IDENTITY",
      message: "Describe the business type — 'Other' on its own tells the workshop's own staff nothing.",
      subject: "businessTypeOther",
    });
  }
}

function validateOwnerAndPlan(draft: WorkshopDraft, add: (finding: DraftFinding) => void): void {
  const { owner, plan } = draft;

  if (owner.ownerFullName.trim().length < 2) {
    add({
      code: "OWNER_INCOMPLETE",
      severity: "BLOCKER",
      stage: "PLAN",
      message: "The owner needs a name — it is who the audit trail will attribute this workshop's first actions to.",
      subject: "ownerFullName",
    });
  }
  if (!EMAIL_PATTERN.test(owner.ownerEmail)) {
    add({
      code: "OWNER_EMAIL_MALFORMED",
      severity: "BLOCKER",
      stage: "PLAN",
      message: "The owner needs a valid email address — the invite link is the only way into this workshop.",
      subject: "ownerEmail",
    });
  }
  if (!PHONE_PATTERN.test(owner.ownerPhone)) {
    add({
      code: "OWNER_PHONE_MALFORMED",
      severity: "BLOCKER",
      stage: "PLAN",
      message: "The owner's phone must be in international format, starting with + and the country code.",
      subject: "ownerPhone",
    });
  }
  if (plan.planId.trim().length === 0) {
    add({
      code: "PLAN_NOT_CHOSEN",
      severity: "BLOCKER",
      stage: "PLAN",
      message: "Choose a plan. Its ceilings decide how many branches, stores and people this workshop may have.",
      subject: "planId",
    });
  }
  if (!(INITIAL_STATUSES as readonly string[]).includes(plan.initialStatus)) {
    add({
      code: "UNKNOWN_INITIAL_STATUS",
      severity: "BLOCKER",
      stage: "PLAN",
      message: "Choose whether the owner can log in immediately.",
      subject: "initialStatus",
    });
  }
}

/**
 * The reachability guarantee, lifted rather than re-derived.
 *
 * `validateCapabilityProfile` is the function that proves no
 * configuration can strand a work order. Its issues are translated into
 * findings here, keeping their own wording, because that wording is
 * already written for a human who has to act on it.
 */
function validateCapabilities(draft: WorkshopDraft, add: (finding: DraftFinding) => void): void {
  const result = validateCapabilityProfile(draft.capabilities);
  for (const issue of result.issues) {
    add({
      code: "CAPABILITY_INVALID",
      severity: "BLOCKER",
      stage: "CAPABILITIES",
      message: issue.message,
      subject: issue.subject ?? issue.entity,
    });
  }
}

function validateSpecialization(draft: WorkshopDraft, add: (finding: DraftFinding) => void): void {
  for (const key of draft.specializationPacks) {
    const pack = specializationPack(key);
    if (!pack) {
      add({
        code: "UNKNOWN_SPECIALIZATION_PACK",
        severity: "BLOCKER",
        stage: "SPECIALIZATION",
        message: `"${key}" is not a specialisation pack this platform ships.`,
        subject: key,
      });
      continue;
    }
    const category = draft.identity.primaryCategory;
    if (category && isOperatingCategory(category) && !pack.categories.includes(category)) {
      add({
        code: "PACK_WRONG_CATEGORY",
        severity: "BLOCKER",
        stage: "SPECIALIZATION",
        message: `"${pack.title}" does not apply to this workshop's category. Changing the category above dropped it.`,
        subject: key,
      });
    }
  }

  if (draft.specializationPacks.length === 0) {
    // A warning, never a blocker: a workshop with no starter cards is a
    // real, working workshop -- the dealership shape Phase 17.A was
    // written around needs none. It is worth saying once that they will
    // start with an empty library, and then getting out of the way.
    add({
      code: "NO_SPECIALIZATION",
      severity: "WARNING",
      stage: "SPECIALIZATION",
      message:
        "This workshop starts with no service cards or measurement forms. That is a valid shape — the owner can author their own — but nothing is pre-filled.",
    });
  }
}

function validatePolicies(draft: WorkshopDraft, add: (finding: DraftFinding) => void): void {
  const applicable = applicablePolicies(draft);

  for (const policy of applicable) {
    const answer = draft.policies[policy.key];
    if (answer === undefined) {
      // A warning, not a blocker. An unanswered policy runs on the
      // registry's declared default, which is a real, reasoned answer --
      // that is the whole point of requiring a defaultReason. Blocking
      // here would make a fourteen-question stage compulsory for a
      // one-bay workshop that is happy with every default.
      add({
        code: "POLICY_NOT_ANSWERED",
        severity: "WARNING",
        stage: "POLICIES",
        message: `"${policy.question}" is unanswered — this workshop will run on the recommended answer: ${optionLabel(policy.key, policy.default)}.`,
        subject: policy.key,
      });
      continue;
    }
    if (!policy.options.some((option) => option.key === answer)) {
      add({
        code: "POLICY_VALUE_INVALID",
        severity: "BLOCKER",
        stage: "POLICIES",
        message: `"${answer}" is not one of the answers offered for "${policy.question}".`,
        subject: policy.key,
      });
    }
  }

  for (const key of strandedPolicyAnswers(draft)) {
    add({
      code: "POLICY_NOT_APPLICABLE",
      severity: "BLOCKER",
      stage: "POLICIES",
      message: `"${key}" was answered, but this workshop's capabilities mean the question is never asked. Remove the answer or restore the capability it depends on.`,
      subject: key,
    });
  }
}

function optionLabel(policyKey: string, optionKey: string): string {
  const policy = POLICY_DEFINITIONS.find((candidate) => candidate.key === policyKey);
  return policy?.options.find((option) => option.key === optionKey)?.label ?? optionKey;
}

/**
 * The gap this stage exists for: a capability that is on with nobody
 * permitted to operate it.
 *
 * `TENANT_OWNER` holds no `inventory.*` permission in the platform's
 * baseline map. A workshop that enables Inventory and never staffs an
 * inventory manager therefore has part requests nobody can approve --
 * and until this check existed, nothing anywhere refused that.
 */
function validateResponsibility(draft: WorkshopDraft, add: (finding: DraftFinding) => void): void {
  for (const capability of orphanedCapabilities(draft.capabilities, draft.responsibilities)) {
    add({
      code: "CAPABILITY_HAS_NO_OPERATOR",
      severity: "BLOCKER",
      stage: "RESPONSIBILITY",
      message:
        `${capability} is on, but no role has been named to operate it. Someone has to be able to do this work, ` +
        "or the first request will have nobody who can answer it.",
      subject: capability,
    });
  }

  for (const question of applicableResponsibilities(draft.capabilities)) {
    if (draft.responsibilities[question.capability] !== undefined) continue;
    add({
      code: "RESPONSIBILITY_NOT_ANSWERED",
      severity: "WARNING",
      stage: "RESPONSIBILITY",
      message: `"${question.question}" is unanswered — this workshop will expect to staff a ${humanRole(question.dedicatedRole)}.`,
      subject: question.capability,
    });
  }
}

/**
 * Prices, checked as money rather than as text.
 *
 * A price crosses every API boundary in MOP as a string of minor units,
 * never a JS number -- a float here would be a rounding error with a
 * customer's invoice on the other end of it.
 */
function validateServices(draft: WorkshopDraft, add: (finding: DraftFinding) => void): void {
  if (draft.services.length === 0) return;

  if (!isCapabilityActive(draft.capabilities, "FINANCE_CORE")) {
    add({
      code: "SERVICES_WITHOUT_FINANCE",
      severity: "BLOCKER",
      stage: "SERVICES",
      message:
        "Services are priced here, but this workshop does not price work in MOP. Either turn pricing back on, or " +
        "remove the services — a catalogue nothing can read from is a list that goes stale unnoticed.",
      subject: "FINANCE_CORE",
    });
    return;
  }

  const seen = new Set<string>();
  for (const service of draft.services) {
    if (service.name.trim().length < 2) {
      add({
        code: "SERVICE_INCOMPLETE",
        severity: "BLOCKER",
        stage: "SERVICES",
        message: "Every service needs a name staff will recognise on the job.",
        subject: service.name,
      });
      continue;
    }

    // Minor units, as an integer string. Anything else -- "45.50",
    // "45,50", a bare decimal point -- is refused here rather than
    // silently truncated somewhere downstream.
    if (!/^\d{1,12}$/.test(service.price)) {
      add({
        code: "SERVICE_PRICE_INVALID",
        severity: "BLOCKER",
        stage: "SERVICES",
        message: `"${service.name}" has no valid price. A price is a whole number of ${draft.identity.currency || "currency"} minor units.`,
        subject: service.name,
      });
    }

    const identity = service.name.trim().toLowerCase();
    if (seen.has(identity)) {
      add({
        code: "DUPLICATE_SERVICE_NAME",
        severity: "BLOCKER",
        stage: "SERVICES",
        message: `Two services are both called "${service.name}". Staff picking one off a list cannot tell them apart.`,
        subject: service.name,
      });
    }
    seen.add(identity);
  }
}

/** A role key in the words a workshop owner uses. */
function humanRole(role: string): string {
  return role.toLowerCase().replace(/_/g, " ");
}

function validateStructure(
  draft: WorkshopDraft,
  planLimits: PlanLimits | undefined,
  add: (finding: DraftFinding) => void,
): void {
  const active = (key: CapabilityKey) => isCapabilityActive(draft.capabilities, key);

  // --- branches ----------------------------------------------------------
  if (draft.branches.length === 0) {
    // A warning rather than a refusal, because creation does not leave
    // the workshop broken: `WorkOrder.branchId` is required, so a tenant
    // with no branch could not accept a single job, and the creation
    // transaction therefore writes a default one from the workshop's own
    // name. Saying so is worth a line; refusing would make the operator
    // type a branch they were about to be given anyway.
    add({
      code: "NO_BRANCH",
      severity: "WARNING",
      stage: "STRUCTURE",
      message:
        "No branch is declared. One will be created from the workshop's name, because a job is taken in at a branch " +
        "and a workshop with none could not accept its first job.",
    });
  }
  if (active("MULTI_BRANCH") && draft.branches.length === 1) {
    add({
      code: "MULTI_BRANCH_NEEDS_TWO",
      severity: "WARNING",
      stage: "STRUCTURE",
      message:
        "Multiple branches is on, but only one is configured. That works — the owner can add more later — but the branch column will show the same value everywhere until they do.",
      subject: "MULTI_BRANCH",
    });
  }
  if (planLimits && draft.branches.length > planLimits.maxBranches) {
    add({
      code: "BRANCH_EXCEEDS_PLAN",
      severity: "BLOCKER",
      stage: "STRUCTURE",
      message: `The chosen plan allows ${planLimits.maxBranches} branch(es); ${draft.branches.length} are configured.`,
    });
  }
  checkCodesAndNames(
    draft.branches,
    "branch",
    { duplicate: "DUPLICATE_BRANCH_CODE", incomplete: "BRANCH_INCOMPLETE" },
    add,
  );

  // --- warehouses --------------------------------------------------------
  const inventoryOn = active("INVENTORY");

  if (inventoryOn && draft.warehouses.length === 0) {
    add({
      code: "NO_WAREHOUSE",
      severity: "BLOCKER",
      stage: "STRUCTURE",
      message: "Parts and stock is on, but no store is configured. A part has to come out of somewhere.",
      subject: "INVENTORY",
    });
  }
  if (!inventoryOn && draft.warehouses.length > 0) {
    add({
      code: "WAREHOUSE_WITHOUT_INVENTORY",
      severity: "BLOCKER",
      stage: "STRUCTURE",
      message:
        "Stores are configured but parts and stock is off. Either turn the capability back on, or remove the stores — an unreachable store is a trap for whoever inherits this workshop.",
      subject: "INVENTORY",
    });
  }
  if (active("MULTI_WAREHOUSE") && draft.warehouses.length === 1) {
    add({
      code: "MULTI_WAREHOUSE_NEEDS_TWO",
      severity: "WARNING",
      stage: "STRUCTURE",
      message: "Multiple stores is on with one store configured. Transfers have nowhere to go until a second exists.",
      subject: "MULTI_WAREHOUSE",
    });
  }
  if (planLimits && draft.warehouses.length > planLimits.maxWarehouses) {
    add({
      code: "WAREHOUSE_EXCEEDS_PLAN",
      severity: "BLOCKER",
      stage: "STRUCTURE",
      message: `The chosen plan allows ${planLimits.maxWarehouses} store(s); ${draft.warehouses.length} are configured.`,
    });
  }
  checkCodesAndNames(
    draft.warehouses,
    "store",
    { duplicate: "DUPLICATE_WAREHOUSE_CODE", incomplete: "WAREHOUSE_INCOMPLETE" },
    add,
  );

  const branchCodes = new Set(draft.branches.map((branch) => branch.code));
  for (const warehouse of draft.warehouses) {
    for (const code of warehouse.branchCodes) {
      if (!branchCodes.has(code)) {
        add({
          code: "WAREHOUSE_UNKNOWN_BRANCH",
          severity: "BLOCKER",
          stage: "STRUCTURE",
          message: `Store "${warehouse.name || warehouse.code}" is granted to branch "${code}", which is not configured.`,
          subject: warehouse.code,
        });
      }
    }
  }
}

function checkCodesAndNames(
  entries: readonly { name: string; code: string }[],
  noun: string,
  codes: { duplicate: DraftFindingCode; incomplete: DraftFindingCode },
  add: (finding: DraftFinding) => void,
): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.name.trim().length < 2 || !CODE_PATTERN.test(entry.code)) {
      add({
        code: codes.incomplete,
        severity: "BLOCKER",
        stage: "STRUCTURE",
        message: `Every ${noun} needs a name and a short code (up to 12 characters: capitals, digits and hyphens).`,
        subject: entry.code || entry.name,
      });
      continue;
    }
    if (seen.has(entry.code)) {
      add({
        code: codes.duplicate,
        severity: "BLOCKER",
        stage: "STRUCTURE",
        message: `Two ${noun}s share the code "${entry.code}". Codes have to be unique within a workshop.`,
        subject: entry.code,
      });
    }
    seen.add(entry.code);
  }
}

/**
 * Findings for one stage, so a stage can show its own state without the
 * review screen being the only place problems are visible.
 */
export function findingsForStage(
  result: DraftValidationResult,
  stage: OnboardingStageId,
): readonly DraftFinding[] {
  return result.findings.filter((finding) => finding.stage === stage);
}
