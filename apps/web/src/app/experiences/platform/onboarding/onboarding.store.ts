import { Injectable, computed, signal } from '@angular/core';
import {
  ONBOARDING_STAGE_IDS,
  applicablePolicies,
  applicableResponsibilities,
  applyCapabilityChange,
  country,
  derivedFacts,
  draftProgress,
  emptyDraft,
  SHIPPED_PROFILES,
  packsForCategory,
  pruneStrandedAnswers,
  recommendedPolicyAnswers,
  validateDraft,
  type CapabilityKey,
  type CapabilityStatus,
  type DraftBranch,
  type DraftService,
  type DraftWarehouse,
  type OnboardingStageId,
  type ResponsibilityAnswer,
  type WorkshopDraft,
} from '@mop/shared';

/**
 * The configuration being built, and everything derived from it.
 *
 * All the intelligence lives in `@mop/shared` -- this holds one signal
 * and exposes the engine's answers as computed views of it. That is the
 * load-bearing decision: the browser previews a workshop with exactly
 * the code the server refuses it with, so a preview can never promise
 * something the publish then rejects.
 *
 * Nothing here decides anything. If a number appears on screen, some
 * function in the shared engine produced it from this draft.
 */
@Injectable()
export class OnboardingStore {
  private readonly _draft = signal<WorkshopDraft>(emptyDraft());
  readonly draft = this._draft.asReadonly();

  /** Which stage is on screen. */
  private readonly _stage = signal<OnboardingStageId>('IDENTITY');
  readonly stage = this._stage.asReadonly();

  /** Stages the operator has actually been to, so an untouched one is not shown as failing. */
  private readonly _visited = signal<ReadonlySet<OnboardingStageId>>(new Set(['IDENTITY']));
  readonly visited = this._visited.asReadonly();

  /**
   * What just changed because of a capability toggle, held long enough to
   * be announced and shown once. Cleared by the next change.
   */
  private readonly _lastCascade = signal<{
    capability: CapabilityKey;
    on: readonly CapabilityKey[];
    off: readonly CapabilityKey[];
    droppedPolicies: readonly string[];
  } | null>(null);
  readonly lastCascade = this._lastCascade.asReadonly();

  /** Plan ceilings for the selected plan, supplied to the validator. */
  private readonly _planLimits = signal<{ maxBranches: number; maxUsers: number; maxWarehouses: number } | null>(null);

  // --- derived -----------------------------------------------------------

  readonly facts = computed(() => derivedFacts(this._draft()));
  readonly progress = computed(() => draftProgress(this._draft()));
  readonly validation = computed(() => validateDraft(this._draft(), this._planLimits() ?? undefined));
  readonly policies = computed(() => applicablePolicies(this._draft()));
  readonly responsibilities = computed(() => applicableResponsibilities(this._draft().capabilities));

  /** Packs offered for the chosen category. Empty until a category is picked. */
  readonly availablePacks = computed(() => {
    const category = this._draft().identity.primaryCategory;
    return category ? packsForCategory(category) : [];
  });

  readonly publishable = computed(() => this.validation().publishable);

  readonly stageIndex = computed(() => ONBOARDING_STAGE_IDS.indexOf(this._stage()));

  /** Findings for the stage on screen, so a problem is visible where it is fixed. */
  readonly currentStageFindings = computed(() =>
    this.validation().findings.filter((finding) => finding.stage === this._stage()),
  );

  // --- navigation --------------------------------------------------------

  goTo(stage: OnboardingStageId): void {
    this._stage.set(stage);
    this._visited.update((visited) => new Set([...visited, stage]));
  }

  next(): void {
    const index = ONBOARDING_STAGE_IDS.indexOf(this._stage());
    if (index < ONBOARDING_STAGE_IDS.length - 1) this.goTo(ONBOARDING_STAGE_IDS[index + 1]);
  }

  previous(): void {
    const index = ONBOARDING_STAGE_IDS.indexOf(this._stage());
    if (index > 0) this.goTo(ONBOARDING_STAGE_IDS[index - 1]);
  }

  // --- identity ----------------------------------------------------------

  patchIdentity(patch: Partial<WorkshopDraft['identity']>): void {
    this._draft.update((draft) => ({ ...draft, identity: { ...draft.identity, ...patch } }));
  }

  /**
   * Choosing a country fills in what it implies -- currency and timezone
   * -- without overwriting a deliberate choice.
   *
   * The `wasSuggested` comparison is what makes this safe to run on every
   * country change: a value the operator typed themselves survives,
   * while one this method put there is replaced by the new country's.
   * Silently overwriting a chosen currency would be worse than not
   * suggesting at all.
   */
  selectCountry(code: string): void {
    const entry = country(code);
    this._draft.update((draft) => {
      const previous = country(draft.identity.country);
      const currencyWasSuggested = !draft.identity.currency || draft.identity.currency === previous?.currency;
      const timezoneWasSuggested = !draft.identity.timezone || draft.identity.timezone === previous?.timezone;

      return {
        ...draft,
        identity: {
          ...draft.identity,
          country: code,
          currency: currencyWasSuggested && entry ? entry.currency : draft.identity.currency,
          timezone: timezoneWasSuggested && entry ? entry.timezone : draft.identity.timezone,
        },
      };
    });
  }

  patchOwner(patch: Partial<WorkshopDraft['owner']>): void {
    this._draft.update((draft) => ({ ...draft, owner: { ...draft.owner, ...patch } }));
  }

  patchPlan(patch: Partial<WorkshopDraft['plan']>): void {
    this._draft.update((draft) => ({ ...draft, plan: { ...draft.plan, ...patch } }));
  }

  setPlanLimits(limits: { maxBranches: number; maxUsers: number; maxWarehouses: number } | null): void {
    this._planLimits.set(limits);
  }

  // --- capabilities ------------------------------------------------------

  /**
   * Sets a capability and resolves everything that follows from it in one
   * step: dependencies pulled up, dependents pushed down, and answers to
   * questions the change makes meaningless dropped.
   *
   * The alternative -- set the value, discover the contradiction at
   * publish -- is what makes a configuration wizard feel like a form.
   */
  setCapability(key: CapabilityKey, status: CapabilityStatus): void {
    const effect = applyCapabilityChange(this._draft(), key, status);
    this._draft.set(effect.draft);
    this._lastCascade.set(
      effect.cascadedOn.length > 0 || effect.cascadedOff.length > 0 || effect.droppedPolicies.length > 0
        ? { capability: key, on: effect.cascadedOn, off: effect.cascadedOff, droppedPolicies: effect.droppedPolicies }
        : null,
    );
  }

  dismissCascade(): void {
    this._lastCascade.set(null);
  }

  /**
   * Starts from one of the platform's shipped shapes.
   *
   * The profile replaces the capability set wholesale rather than being
   * merged into it -- a shape is a complete statement about a workshop,
   * and half of one merged over half of another is a configuration
   * nobody chose. Stranded policy answers are pruned for the same reason
   * a single toggle prunes them.
   */
  applyProfile(key: string): void {
    const profile = SHIPPED_PROFILES[key];
    if (!profile) return;

    const withProfile: WorkshopDraft = { ...this._draft(), capabilities: { ...profile } };
    this._draft.set(pruneStrandedAnswers(withProfile));
    this._appliedProfile.set(key);
    this._lastCascade.set(null);
  }

  /** Which shape was last applied, so the stage can show it as the starting point. */
  private readonly _appliedProfile = signal<string | null>(null);
  readonly appliedProfile = this._appliedProfile.asReadonly();

  // --- specialization ----------------------------------------------------

  togglePack(key: string): void {
    this._draft.update((draft) => {
      const packs = draft.specializationPacks.includes(key)
        ? draft.specializationPacks.filter((pack) => pack !== key)
        : [...draft.specializationPacks, key];
      return { ...draft, specializationPacks: packs };
    });
  }

  /**
   * A category change drops packs that do not apply to the new one.
   *
   * Keeping them would leave the review screen listing a hydraulic
   * diagnostic on a motorcycle shop, and the publish refusing it -- the
   * contradiction is resolved at the moment it is created instead.
   */
  setCategory(category: WorkshopDraft['identity']['primaryCategory']): void {
    this._draft.update((draft) => {
      const stillValid = category
        ? packsForCategory(category).map((pack) => pack.key)
        : [];
      return {
        ...draft,
        identity: { ...draft.identity, primaryCategory: category },
        specializationPacks: draft.specializationPacks.filter((pack) => stillValid.includes(pack)),
      };
    });
  }

  // --- policies ----------------------------------------------------------

  setPolicy(key: string, value: string): void {
    this._draft.update((draft) => ({ ...draft, policies: { ...draft.policies, [key]: value } }));
  }

  clearPolicy(key: string): void {
    this._draft.update((draft) => {
      const policies = { ...draft.policies };
      delete policies[key];
      return { ...draft, policies };
    });
  }

  /**
   * Fills in the recommended answer for every question this workshop's
   * shape actually raises -- and for nothing else.
   *
   * Deliberately not "turn everything on": a workshop with no portal gets
   * no portal answers, because those questions were never asked of it.
   */
  useRecommendedPolicies(): void {
    this._draft.update((draft) => ({ ...draft, policies: { ...recommendedPolicyAnswers(draft) } }));
  }

  // --- responsibility ----------------------------------------------------

  setResponsibility(capability: string, answer: ResponsibilityAnswer): void {
    this._draft.update((draft) => ({
      ...draft,
      responsibilities: { ...draft.responsibilities, [capability]: answer },
    }));
  }

  // --- structure ---------------------------------------------------------

  addBranch(branch: DraftBranch): void {
    this._draft.update((draft) => ({ ...draft, branches: [...draft.branches, branch] }));
  }

  updateBranch(index: number, patch: Partial<DraftBranch>): void {
    this._draft.update((draft) => ({
      ...draft,
      branches: draft.branches.map((branch, i) => (i === index ? { ...branch, ...patch } : branch)),
    }));
  }

  removeBranch(index: number): void {
    this._draft.update((draft) => {
      const removed = draft.branches[index];
      return {
        ...draft,
        branches: draft.branches.filter((_, i) => i !== index),
        // A store granted to a branch that no longer exists is a publish
        // blocker, so the grant goes with the branch rather than being
        // left to be discovered on the review screen.
        warehouses: draft.warehouses.map((warehouse) => ({
          ...warehouse,
          branchCodes: warehouse.branchCodes.filter((code) => code !== removed?.code),
        })),
      };
    });
  }

  addWarehouse(warehouse: DraftWarehouse): void {
    this._draft.update((draft) => ({ ...draft, warehouses: [...draft.warehouses, warehouse] }));
  }

  updateWarehouse(index: number, patch: Partial<DraftWarehouse>): void {
    this._draft.update((draft) => ({
      ...draft,
      warehouses: draft.warehouses.map((warehouse, i) => (i === index ? { ...warehouse, ...patch } : warehouse)),
    }));
  }

  removeWarehouse(index: number): void {
    this._draft.update((draft) => ({ ...draft, warehouses: draft.warehouses.filter((_, i) => i !== index) }));
  }

  toggleWarehouseBranch(index: number, code: string): void {
    this._draft.update((draft) => ({
      ...draft,
      warehouses: draft.warehouses.map((warehouse, i) => {
        if (i !== index) return warehouse;
        const branchCodes = warehouse.branchCodes.includes(code)
          ? warehouse.branchCodes.filter((existing) => existing !== code)
          : [...warehouse.branchCodes, code];
        return { ...warehouse, branchCodes };
      }),
    }));
  }

  // --- services ----------------------------------------------------------

  addService(service: DraftService): void {
    this._draft.update((draft) => ({ ...draft, services: [...draft.services, service] }));
  }

  updateService(index: number, patch: Partial<DraftService>): void {
    this._draft.update((draft) => ({
      ...draft,
      services: draft.services.map((service, i) => (i === index ? { ...service, ...patch } : service)),
    }));
  }

  removeService(index: number): void {
    this._draft.update((draft) => ({ ...draft, services: draft.services.filter((_, i) => i !== index) }));
  }

  // --- submission --------------------------------------------------------

  /**
   * The draft as the creation endpoint wants it.
   *
   * The three "soft target" numbers the older payload carried are gone
   * rather than derived: they were only ever a promise about the same
   * structure this draft now declares outright, and two places to say one
   * thing is how they drift. The API validates with
   * `forbidNonWhitelisted`, so a field CreateWorkshopDto has dropped is
   * not a harmless extra -- it is a 400 on the whole submission.
   */
  toCreatePayload(): Record<string, unknown> {
    const draft = this._draft();

    return {
      planId: draft.plan.planId,
      name: draft.identity.name,
      slug: draft.identity.slug,
      country: draft.identity.country,
      city: draft.identity.city,
      businessType: draft.identity.businessType,
      businessTypeOther: draft.identity.businessType === 'Other' ? draft.identity.businessTypeOther : undefined,
      primaryCategory: draft.identity.primaryCategory,
      currency: draft.identity.currency,
      timezone: draft.identity.timezone,
      ownerFullName: draft.owner.ownerFullName,
      ownerEmail: draft.owner.ownerEmail,
      ownerPhone: draft.owner.ownerPhone,
      // Kept because Builder Control still reads it as the workshop's
      // starting module set. Derived rather than asked: a template is a
      // shorthand for a capability shape, and the capability shape is now
      // stated outright one stage earlier.
      starterBuilderTemplate: this.starterTemplate(),
      initialStatus: draft.plan.initialStatus,
      capabilities: draft.capabilities,
      policies: draft.policies,
      responsibilities: draft.responsibilities,
      specializationPacks: draft.specializationPacks,
      branches: draft.branches,
      warehouses: draft.warehouses,
      services: draft.services,
    };
  }

  /** The draft as the validate endpoint wants it -- everything optional. */
  toValidatePayload(): Record<string, unknown> {
    const draft = this._draft();
    return {
      name: draft.identity.name || undefined,
      slug: draft.identity.slug || undefined,
      country: draft.identity.country || undefined,
      city: draft.identity.city || undefined,
      currency: draft.identity.currency || undefined,
      timezone: draft.identity.timezone || undefined,
      businessType: draft.identity.businessType || undefined,
      businessTypeOther: draft.identity.businessTypeOther || undefined,
      primaryCategory: draft.identity.primaryCategory || undefined,
      ownerFullName: draft.owner.ownerFullName || undefined,
      ownerEmail: draft.owner.ownerEmail || undefined,
      ownerPhone: draft.owner.ownerPhone || undefined,
      planId: draft.plan.planId || undefined,
      initialStatus: draft.plan.initialStatus || undefined,
      capabilities: draft.capabilities,
      policies: draft.policies,
      responsibilities: draft.responsibilities,
      specializationPacks: draft.specializationPacks,
      branches: draft.branches,
      warehouses: draft.warehouses,
      services: draft.services,
    };
  }

  /**
   * Which starter template best matches the capability shape chosen.
   *
   * A mapping rather than a question, because the two overlap almost
   * entirely and asking both invites them to contradict each other.
   */
  private starterTemplate(): string {
    const facts = this.facts();
    const active = new Set(facts.activeCapabilities);
    if (active.has('MULTI_BRANCH') && active.has('TEAMS')) return 'HIGH_VOLUME_BRANCH_NETWORK';
    if (!active.has('INVENTORY') && !active.has('TEAMS')) return 'MINIMAL';
    return 'DEFAULT';
  }
}
