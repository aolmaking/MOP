import { isCapabilityActive } from "../capabilities/types";
import { validateCapabilityProfile } from "../capabilities/validator";
import { isOperatingCategory } from "../operations/categories";
import { BUSINESS_TYPES, INITIAL_STATUSES } from "../platform/workshop-options";
import { applicablePolicies, type WorkshopDraft } from "./draft";
import { applicableResponsibilities } from "./responsibility";
import { ONBOARDING_STAGES, type OnboardingStageId } from "./stages";

/**
 * How far through this configuration actually is.
 *
 * The denominator is derived, never assumed. A percentage over a fixed
 * number of steps would be a lie the moment a capability changes how
 * many questions this workshop is even asked: a one-bay shop with no
 * inventory, no teams and no portal has genuinely fewer decisions to
 * make than a twelve-branch dealership, and a progress bar that pretends
 * otherwise is telling them they are 40% done when they are finished.
 *
 * So every unit below is a decision this *specific* draft has to make.
 * Turning Inventory off does not advance the bar by answering its
 * questions -- it removes them from the denominator, which is a
 * different and honest thing.
 */

export interface StageProgress {
  readonly stage: OnboardingStageId;
  /** Decisions this draft actually has to make on this stage. */
  readonly applicable: number;
  readonly satisfied: number;
  /** No outstanding decisions. Says nothing about whether it is *valid* -- see the validator. */
  readonly complete: boolean;
}

export interface DraftProgress {
  readonly stages: readonly StageProgress[];
  readonly applicable: number;
  readonly satisfied: number;
  /** 0-100, rounded. Derived from the two numbers above and nothing else. */
  readonly percent: number;
}

export function draftProgress(draft: WorkshopDraft): DraftProgress {
  const stages = ONBOARDING_STAGES.map((stage) => stageProgress(draft, stage.id));
  const applicable = stages.reduce((total, stage) => total + stage.applicable, 0);
  const satisfied = stages.reduce((total, stage) => total + stage.satisfied, 0);
  return {
    stages,
    applicable,
    satisfied,
    percent: applicable === 0 ? 100 : Math.round((satisfied / applicable) * 100),
  };
}

function stageProgress(draft: WorkshopDraft, stage: OnboardingStageId): StageProgress {
  const units = unitsFor(draft, stage);
  const satisfied = units.filter(Boolean).length;
  return { stage, applicable: units.length, satisfied, complete: satisfied === units.length };
}

/**
 * One boolean per decision the stage requires of this draft. The array's
 * length is the denominator, so a decision that does not apply is absent
 * rather than counted-and-skipped.
 */
function unitsFor(draft: WorkshopDraft, stage: OnboardingStageId): readonly boolean[] {
  switch (stage) {
    case "IDENTITY": {
      const { identity } = draft;
      const units = [
        identity.name.trim().length >= 2,
        identity.slug.trim().length >= 2,
        identity.country.trim().length >= 2,
        identity.city.trim().length >= 2,
        identity.currency.trim().length === 3,
        identity.timezone.trim().length > 0,
        (BUSINESS_TYPES as readonly string[]).includes(identity.businessType),
        identity.primaryCategory !== "" && isOperatingCategory(identity.primaryCategory),
      ];
      // The follow-up field only exists for one answer, so it only joins
      // the denominator when that answer is given.
      if (identity.businessType === "Other") units.push((identity.businessTypeOther ?? "").trim().length >= 2);
      return units;
    }

    case "PLAN":
      return [
        draft.plan.planId.trim().length > 0,
        (INITIAL_STATUSES as readonly string[]).includes(draft.plan.initialStatus),
        draft.owner.ownerFullName.trim().length >= 2,
        draft.owner.ownerEmail.trim().length > 0,
        draft.owner.ownerPhone.trim().length > 0,
      ];

    case "CAPABILITIES":
      // One decision: is the shape this workshop has been given a legal
      // one? Counting twelve capability toggles would make the bar move
      // for turning something off, which is not progress -- every
      // capability already has a defensible value from the moment the
      // draft exists.
      return [validateCapabilityProfile(draft.capabilities).valid];

    case "SPECIALIZATION":
      // Genuinely optional, so it contributes nothing to the
      // denominator. A workshop that needs no starter cards is finished
      // with this stage the moment it arrives, and the bar says so.
      return [];

    case "POLICIES":
      // The derived question set, exactly. This is where the denominator
      // visibly moves when a capability changes.
      return applicablePolicies(draft).map((policy) => draft.policies[policy.key] !== undefined);

    case "RESPONSIBILITY":
      // One decision per capability that raises the question, and none at
      // all for a workshop whose shape raises none. Unanswered counts as
      // outstanding rather than defaulted, because "we will hire a
      // storekeeper" and "we have not thought about it" are different
      // answers and only the first is safe to assume.
      return applicableResponsibilities(draft.capabilities).map(
        (question) => draft.responsibilities[question.capability] !== undefined,
      );

    case "SERVICES":
      // Optional, like specialisation: a workshop can price every job as
      // it goes, and many do. Nothing to count.
      return [];

    case "STRUCTURE": {
      const units = [draft.branches.length >= 1];
      if (isCapabilityActive(draft.capabilities, "MULTI_BRANCH")) units.push(draft.branches.length >= 2);
      if (isCapabilityActive(draft.capabilities, "INVENTORY")) units.push(draft.warehouses.length >= 1);
      if (isCapabilityActive(draft.capabilities, "MULTI_WAREHOUSE")) units.push(draft.warehouses.length >= 2);
      return units;
    }

    case "REVIEW":
      // Review has nothing of its own to decide -- it shows what the
      // other stages decided. Giving it a unit would double-count them.
      return [];
  }
}
