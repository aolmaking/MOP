/**
 * The journey, as stages.
 *
 * The order is not a preference. It is the dependency order the
 * configuration graph actually has, and each step below can name what it
 * needs from the one before:
 *
 *   IDENTITY       nothing -- it is the root
 *   PLAN           nothing, but its ceilings bound STRUCTURE
 *   CAPABILITIES   needs nothing; decides which POLICIES are asked and
 *                  which STRUCTURE is required
 *   SPECIALIZATION needs the category from IDENTITY, since a pack is
 *                  offered per category
 *   POLICIES       needs CAPABILITIES -- the question set is derived
 *                  from it, not filtered after the fact
 *   RESPONSIBILITY needs CAPABILITIES: a capability with no operator is
 *                  the gap this stage exists to close, and there is
 *                  nothing to ask about a capability that is off
 *   STRUCTURE      needs CAPABILITIES (does a store exist at all?) and
 *                  PLAN (how many may there be?)
 *   SERVICES       needs IDENTITY's currency, and FINANCE_CORE to be on
 *                  at all -- a price in no currency is not a price
 *   REVIEW         needs everything
 *
 * Every stage answers the same three questions, and they are fields
 * rather than prose in a template so no stage can quietly ship without
 * one: what is being configured, why it matters, and what it changes.
 */

export const ONBOARDING_STAGE_IDS = [
  "IDENTITY",
  "PLAN",
  "CAPABILITIES",
  "SPECIALIZATION",
  "POLICIES",
  "RESPONSIBILITY",
  "STRUCTURE",
  "SERVICES",
  "REVIEW",
] as const;

export type OnboardingStageId = (typeof ONBOARDING_STAGE_IDS)[number];

export interface OnboardingStage {
  readonly id: OnboardingStageId;
  /** Two or three words, on the stage rail. */
  readonly title: string;
  /** One line, under the title on the stage itself. */
  readonly what: string;
  readonly why: string;
  readonly changes: string;
}

export const ONBOARDING_STAGES: readonly OnboardingStage[] = [
  {
    id: "IDENTITY",
    title: "Identity",
    what: "The workshop's name, where it trades, and the money and time it works in.",
    why: "Currency and timezone can never be changed afterwards — every price and every timestamp is recorded against them.",
    changes: "Sets the workshop's public address, the currency on every invoice, and the clock every deadline is measured by.",
  },
  {
    id: "PLAN",
    title: "Plan & access",
    what: "The commercial plan, who owns this workshop, and whether they can log in yet.",
    why: "The plan's ceilings bound how many branches, stores and people this workshop may have.",
    changes: "Creates the owner's account and the one-time invite that lets them set their own password.",
  },
  {
    id: "CAPABILITIES",
    title: "Capabilities",
    what: "Which parts of the operation this workshop actually runs.",
    why: "A capability is not a feature toggle — removing one rewires the job's route so nothing is left stranded with no way to finish.",
    changes: "Decides which pages exist, which roles have work, which checks run before a job can finish, and which questions you are asked next.",
  },
  {
    id: "SPECIALIZATION",
    title: "Specialisation",
    what: "What kind of work this workshop does, and the cards and forms it records that work on.",
    why: "A brake measurement and an oil change are not the same shape of record, and a workshop that has to force one into the other stops recording it.",
    changes: "Creates real service cards and measurement forms the workshop starts with, and can edit on day two.",
  },
  {
    id: "POLICIES",
    title: "Policies",
    what: "The rules the enabled parts of the operation run under.",
    why: "Two workshops can have exactly the same capabilities and still disagree completely about whether a car leaves unpaid.",
    changes: "Sets the rule each step passes under. Only questions this workshop's shape makes meaningful are asked.",
  },
  {
    id: "RESPONSIBILITY",
    title: "Responsibility",
    what: "Who in this workshop actually does the work each capability creates.",
    why: "Every capability is gated behind permissions only certain roles hold — turning one on without anyone able to operate it produces a system nobody in the building can use.",
    changes: "Grants the covering role the permissions it needs, at creation, instead of leaving the owner to discover the gap after the first request sticks.",
  },
  {
    id: "STRUCTURE",
    title: "Structure",
    what: "The branches this workshop trades from and the stores its parts live in.",
    why: "A job is taken in at a branch and a part comes out of a store — without at least one of each, the capabilities above have nowhere to happen.",
    changes: "Creates real branches and stores, and grants each branch the stores it may draw from.",
  },
  {
    id: "SERVICES",
    title: "Services",
    what: "The named jobs this workshop sells, and what each one costs.",
    why: "A price typed fresh onto every job is a price that drifts between staff, and the running total has nothing to look up.",
    changes: "Creates real catalogue prices the running invoice reads from the first job onward. Optional — a workshop can price as it goes.",
  },
  {
    id: "REVIEW",
    title: "Review",
    what: "Everything above, in one place, checked before anything is created.",
    why: "Creation is a single transaction — it either produces the whole workshop or none of it. This is the last point at which it costs nothing to change your mind.",
    changes: "Nothing yet. Publishing is the next press.",
  },
];

export function onboardingStage(id: OnboardingStageId): OnboardingStage {
  const stage = ONBOARDING_STAGES.find((candidate) => candidate.id === id);
  if (!stage) throw new Error(`"${id}" is not a declared onboarding stage.`);
  return stage;
}
