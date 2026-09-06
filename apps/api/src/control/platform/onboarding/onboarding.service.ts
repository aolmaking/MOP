import { Injectable } from "@nestjs/common";
import {
  ALL_CAPABILITY_CONSEQUENCES,
  CAPABILITY_PRESENTATION,
  COUNTRY_REGISTRY,
  ONBOARDING_STAGES,
  OPERATING_CATEGORIES,
  OWNING_SYSTEM_PRESENTATION,
  POLICY_DEFINITIONS,
  SPECIALIZATION_PACKS,
  BUSINESS_TYPES,
  INITIAL_STATUSES,
  INITIAL_STATUS_HELP,
  SUPPORTED_CURRENCIES,
  applicableResponsibilities,
  gateWords,
  validateDraft,
  type CapabilityConsequence,
  type CapabilityPresentation,
  type CountryEntry,
  type DraftFinding,
  type OnboardingStage,
  type SpecializationPack,
} from "@mop/shared";
import { PrismaService } from "../../../runtime/database/prisma.service";
import { draftFromValidateDto } from "./validate-draft.dto";
import type { ValidateDraftDto } from "./validate-draft.dto";

/**
 * The registry data the onboarding experience is built from, and the
 * verdict it checks itself against.
 *
 * Everything served here is read from the same registries the running
 * product uses -- the capability registry, the gate registry, the policy
 * registry, the page registry, the country table. Nothing is a second
 * copy maintained for the benefit of a screen, which is what keeps the
 * promise that a preview cannot drift from the product it previews.
 */

/** One capability, with its copy and its derived consequences already joined. */
export interface CapabilityBlueprint extends CapabilityPresentation {
  readonly consequence: CapabilityConsequence;
  /** The gates this capability owns, in the words a blocked person is shown. */
  readonly gateWords: readonly { key: string; checkpoint: string; blocked: string; satisfied: string }[];
}

export interface PolicyBlueprint {
  readonly key: string;
  readonly question: string;
  readonly options: readonly { key: string; label: string; meaning: string }[];
  readonly default: string;
  readonly defaultReason: string;
  readonly mutability: string;
  readonly buildPosture: string;
  readonly dependsOnCapabilities: readonly string[];
  readonly dependsOnPolicies: readonly string[];
  /**
   * Whether answering this changes behaviour today, or is recorded now
   * and read when named work lands. Shown verbatim, because a screen
   * implying a stored string is live when nothing reads it is the same
   * defect as a gate hardcoded to true.
   */
  readonly enforcement: { readonly status: string; readonly where: string };
  /** Which group this question is asked under. */
  readonly group: string;
  /**
   * The behavioural consequence of this answer, grouped by what it
   * touches rather than by page -- a policy is cross-cutting, and a
   * screen organised by page would hide that a single answer can move
   * billing, visibility and a workflow state at once.
   */
  readonly impact: {
    readonly capabilities: readonly string[];
    readonly roles: readonly string[];
    readonly workflowStates: readonly string[];
    readonly permissions: readonly string[];
    readonly pages: readonly string[];
    readonly changesVisibility: boolean;
    readonly changesBilling: boolean;
    readonly summary: string;
  };
}

export interface ResponsibilityBlueprint {
  readonly capability: string;
  readonly dedicatedRole: string;
  readonly question: string;
  readonly why: string;
  readonly fallbackRoles: readonly string[];
  readonly defaultAnswer: string;
}

export interface OnboardingBlueprint {
  readonly stages: readonly OnboardingStage[];
  readonly capabilities: readonly CapabilityBlueprint[];
  readonly owningSystems: Readonly<Record<string, { title: string; summary: string }>>;
  readonly policies: readonly PolicyBlueprint[];
  readonly policyGroups: readonly { key: string; title: string; summary: string }[];
  readonly specializationPacks: readonly SpecializationPack[];
  readonly responsibilities: readonly ResponsibilityBlueprint[];
  readonly countries: readonly CountryEntry[];
  readonly currencies: readonly string[];
  readonly categories: readonly { value: string; label: string }[];
  readonly businessTypes: readonly string[];
  readonly initialStatuses: readonly { key: string; help: string }[];
  readonly plans: readonly {
    id: string;
    code: string;
    name: string;
    maxBranches: number;
    maxUsers: number;
    maxWarehouses: number;
    allowedModules: readonly string[];
    allowedFeatures: readonly string[];
    monthlyPrice: string;
  }[];
}

export interface DraftValidationResponse {
  readonly publishable: boolean;
  readonly findings: readonly DraftFinding[];
  readonly blockerCount: number;
  readonly warningCount: number;
}

/**
 * Which section a policy question is asked under.
 *
 * Grouping is presentation, so it lives here rather than on the policy
 * definition -- a policy's registry entry describes what it decides, not
 * where a wizard chooses to put it. Derived from the capability the
 * policy depends on where there is one, which keeps the grouping honest
 * as policies are added: a new inventory policy lands under Parts
 * without anyone editing a list.
 */
const POLICY_GROUPS = [
  { key: "MONEY", title: "Money & handover", summary: "What has to be settled before a vehicle leaves." },
  { key: "PARTS", title: "Parts & stock", summary: "How parts are controlled between the store and the bay." },
  { key: "WORK", title: "Work & quality", summary: "How work is checked and recorded on its way out." },
  { key: "CUSTOMER", title: "The customer", summary: "What the customer is asked, and how their answer is taken." },
  { key: "GENERAL", title: "General", summary: "Rules that apply however this workshop is shaped." },
] as const;

const EXPLICIT_GROUPS: Readonly<Record<string, string>> = {
  DELIVERY_BLOCKED_UNTIL_PAID: "MONEY",
  PARTIAL_PAYMENT: "MONEY",
  DISCOUNT_AUTHORITY: "MONEY",
  REFUND_AUTHORITY: "MONEY",
  UNCOVERED_COUNTRY_BILLING: "MONEY",
  PARTS_SEPARATION_OF_DUTIES: "PARTS",
  RETURN_UNUSED_BEFORE_FINISH: "PARTS",
  CUSTOMER_SUPPLIED_PARTS: "PARTS",
  DIRECT_PART_PURCHASE: "PARTS",
  QC_MANDATORY: "WORK",
  TECHNICIAN_DIRECT_SEND: "WORK",
  TIME_TRACKING: "WORK",
  POST_CLOSE_ADDENDA: "WORK",
  INSPECTION_REQUIRED: "WORK",
  APPROVAL_REQUIRED_SCOPE: "CUSTOMER",
  APPROVAL_WEIGHT: "CUSTOMER",
  PORTAL_COUNTER_APPROVAL: "CUSTOMER",
  CUSTOMER_INVOICE_VISIBILITY: "CUSTOMER",
  UNAPPROVED_WORK_EXECUTION: "CUSTOMER",
  PROMISED_TIME_VISIBILITY: "CUSTOMER",
  WORKING_WEEK: "GENERAL",
};

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async blueprint(): Promise<OnboardingBlueprint> {
    const plans = await this.prisma.plan.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        maxBranches: true,
        maxUsers: true,
        maxWarehouses: true,
        allowedModules: true,
        allowedFeatures: true,
        monthlyPrice: true,
      },
      orderBy: { monthlyPrice: "asc" },
    });

    return {
      stages: ONBOARDING_STAGES,
      capabilities: ALL_CAPABILITY_CONSEQUENCES.map((consequence) => ({
        ...CAPABILITY_PRESENTATION[consequence.key],
        consequence,
        gateWords: consequence.gates.flatMap((gate) => {
          const words = gateWords(gate);
          return words ? [{ key: gate, ...words }] : [];
        }),
      })),
      owningSystems: OWNING_SYSTEM_PRESENTATION,
      policies: POLICY_DEFINITIONS.map((policy) => ({
        key: policy.key,
        question: policy.question,
        options: policy.options.map((option) => ({ key: option.key, label: option.label, meaning: option.meaning })),
        default: policy.default,
        defaultReason: policy.defaultReason,
        mutability: policy.mutability,
        buildPosture: policy.buildPosture,
        // The predicate itself cannot cross the wire -- it is a function
        // -- so the browser re-evaluates relevance with the same shared
        // code rather than being told the answer. What crosses is the
        // declared graph edge, for the dependency indicator.
        dependsOnCapabilities: policy.dependsOnCapabilities.map((dependency) =>
          typeof dependency === "string" ? dependency : dependency.key,
        ),
        dependsOnPolicies: policy.dependsOnPolicies,
        enforcement: { status: policy.enforcement.status, where: policy.enforcement.where },
        group: EXPLICIT_GROUPS[policy.key] ?? "GENERAL",
        impact: policy.impact,
      })),
      policyGroups: POLICY_GROUPS.map((group) => ({ ...group })),
      specializationPacks: SPECIALIZATION_PACKS,
      // Every question that could be raised, not only the ones this
      // draft raises -- the browser filters by profile with the same
      // shared function, so the catalogue is complete and the filtering
      // is not a server round trip on every toggle.
      responsibilities: applicableResponsibilities({}).map((question) => ({
        capability: question.capability,
        dedicatedRole: question.dedicatedRole,
        question: question.question,
        why: question.why,
        fallbackRoles: question.fallbackRoles,
        defaultAnswer: question.defaultAnswer,
      })),
      countries: COUNTRY_REGISTRY,
      currencies: SUPPORTED_CURRENCIES,
      categories: OPERATING_CATEGORIES.map((category) => ({ value: category.value, label: category.label })),
      businessTypes: [...BUSINESS_TYPES],
      initialStatuses: INITIAL_STATUSES.map((status) => ({ key: status, help: INITIAL_STATUS_HELP[status] })),
      plans: plans.map((plan) => ({ ...plan, monthlyPrice: plan.monthlyPrice.toString() })),
    };
  }

  /**
   * The publish verdict, before the publish.
   *
   * Three sources, in one answer: the shared draft validator, the plan's
   * real ceilings, and the uniqueness checks only a database can make.
   * The last of those is why this cannot be a purely client-side preview
   * -- "a workshop with this name already exists" is not knowable in the
   * browser, and finding it out at the final press is exactly the ambush
   * this endpoint removes.
   */
  async validate(dto: ValidateDraftDto): Promise<DraftValidationResponse> {
    const draft = draftFromValidateDto(dto);

    const plan = dto.planId
      ? await this.prisma.plan.findUnique({
          where: { id: dto.planId },
          select: {
            maxBranches: true,
            maxUsers: true,
            maxWarehouses: true,
            allowedModules: true,
            allowedFeatures: true,
          },
        })
      : null;

    const result = validateDraft(draft, plan ?? undefined);
    const findings: DraftFinding[] = [...result.findings];

    // Uniqueness, checked here rather than guessed at in the browser.
    // Still re-checked at creation by the unique constraints themselves
    // -- a name can be claimed between this call and the publish, and
    // the constraint is the enforcement; this is the courtesy.
    const [nameTaken, slugTaken, emailTaken] = await Promise.all([
      draft.identity.name.trim().length >= 2
        ? this.prisma.tenant.findUnique({ where: { nameNormalized: draft.identity.name.toLowerCase() }, select: { id: true } })
        : null,
      draft.identity.slug.trim().length >= 2
        ? this.prisma.tenant.findUnique({ where: { slug: draft.identity.slug }, select: { id: true } })
        : null,
      draft.owner.ownerEmail.includes("@")
        ? this.prisma.account.findFirst({ where: { email: draft.owner.ownerEmail }, select: { id: true } })
        : null,
    ]);

    if (nameTaken) {
      findings.push({
        code: "IDENTITY_INCOMPLETE",
        severity: "BLOCKER",
        stage: "IDENTITY",
        message: "A workshop with this name already exists. Names are unique across the platform.",
        subject: "name",
      });
    }
    if (slugTaken) {
      findings.push({
        code: "SLUG_MALFORMED",
        severity: "BLOCKER",
        stage: "IDENTITY",
        message: "This web address is already in use by another workshop.",
        subject: "slug",
      });
    }
    if (emailTaken) {
      findings.push({
        code: "OWNER_EMAIL_MALFORMED",
        severity: "BLOCKER",
        stage: "PLAN",
        message: "This email already has an account. The owner needs an address that is not yet registered.",
        subject: "ownerEmail",
      });
    }

    const blockerCount = findings.filter((finding) => finding.severity === "BLOCKER").length;
    return {
      publishable: blockerCount === 0,
      findings,
      blockerCount,
      warningCount: findings.length - blockerCount,
    };
  }
}
