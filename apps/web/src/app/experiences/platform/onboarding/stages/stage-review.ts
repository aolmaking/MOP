import { Component, computed, inject, input, output } from '@angular/core';
import { CAPABILITY_PRESENTATION, country, responsibilitySummary, type CapabilityKey, type OnboardingStageId } from '@mop/shared';
import { OnboardingStore } from '../onboarding.store';
import type { OnboardingBlueprint } from '../onboarding.api';
import { ReviewConsequences } from '../components/review-consequences';

/**
 * Everything decided, in one place, before anything is created.
 *
 * Sections appear only when they have something to say -- a workshop
 * with no stock shows no store section, because listing "0 stores" is a
 * gap where there is none.
 *
 * Every blocker carries the stage that fixes it, so this screen can
 * offer to go there. "Something went wrong" is the failure this whole
 * surface exists against, and a problem the reader cannot navigate to is
 * the same failure wearing more words.
 */
@Component({
  selector: 'app-stage-review',
  imports: [ReviewConsequences],
  templateUrl: './stage-review.html',
  styleUrl: './stage-review.css',
})
export class StageReview {
  readonly blueprint = input.required<OnboardingBlueprint>();
  readonly jumpTo = output<OnboardingStageId>();
  protected readonly store = inject(OnboardingStore);

  protected readonly blockers = computed(() =>
    this.store.validation().findings.filter((finding) => finding.severity === 'BLOCKER'),
  );
  protected readonly warnings = computed(() =>
    this.store.validation().findings.filter((finding) => finding.severity === 'WARNING'),
  );

  protected readonly countryEntry = computed(() => country(this.store.draft().identity.country));

  protected readonly plan = computed(() =>
    this.blueprint().plans.find((plan) => plan.id === this.store.draft().plan.planId),
  );

  protected readonly activeTitles = computed(() =>
    this.store.facts().activeCapabilities.map((key) => CAPABILITY_PRESENTATION[key as CapabilityKey].title),
  );
  protected readonly offTitles = computed(() =>
    this.store.facts().disabledCapabilities.map((key) => CAPABILITY_PRESENTATION[key as CapabilityKey].title),
  );
  protected readonly externalTitles = computed(() =>
    this.store.facts().externalCapabilities.map((key) => CAPABILITY_PRESENTATION[key as CapabilityKey].title),
  );

  /** Only the questions this workshop was actually asked, with the answer it will run under. */
  protected readonly answeredPolicies = computed(() => {
    const answers = this.store.draft().policies;
    return this.store.policies().map((policy) => {
      const chosen = answers[policy.key] ?? policy.default;
      const option = policy.options.find((candidate) => candidate.key === chosen);
      return {
        key: policy.key,
        question: policy.question,
        answer: option?.label ?? chosen,
        isDefault: answers[policy.key] === undefined,
        enforced: policy.enforcement.status === 'ENFORCED',
      };
    });
  });

  protected readonly responsibilities = computed(() =>
    responsibilitySummary(this.store.draft().capabilities, this.store.draft().responsibilities),
  );

  protected humanRole(role: string): string {
    return role.toLowerCase().replace(/_/g, ' ');
  }

  protected titleOf(key: string): string {
    return CAPABILITY_PRESENTATION[key as CapabilityKey]?.title ?? key;
  }

  protected displayPrice(price: string): string {
    if (!/^\d+$/.test(price)) return price;
    const padded = price.padStart(3, '0');
    return `${padded.slice(0, -2)}.${padded.slice(-2)}`;
  }
}
