import { Component, computed, inject, input } from '@angular/core';
import { OnboardingStore } from '../onboarding.store';
import type { OnboardingBlueprint, PolicyBlueprint } from '../onboarding.api';
import { PolicyImpact } from '../components/policy-impact';

/**
 * The rules the enabled parts of the operation run under.
 *
 * The question set is *derived*, not filtered: a workshop with no
 * inventory is never asked about separation of duties on parts, because
 * in that workshop the question has no meaning — it does not have a
 * defaulted answer, it has no answer. `applicablePolicies` in the shared
 * engine is what decides, using the same relevance predicates the server
 * resolves a live workshop's policies with.
 *
 * Two things are shown on every question that a plain radio group would
 * not: the reason behind the recommended answer, and whether choosing
 * something else changes behaviour today or is recorded for when the
 * named work lands. The second matters — a screen implying a stored
 * string is live when nothing reads it is the same defect as a gate
 * hardcoded to true.
 */
@Component({
  selector: 'app-stage-policies',
  imports: [PolicyImpact],
  templateUrl: './stage-policies.html',
  styleUrl: './stage-policies.css',
})
export class StagePolicies {
  readonly blueprint = input.required<OnboardingBlueprint>();
  protected readonly store = inject(OnboardingStore);

  /**
   * The applicable questions, grouped for reading.
   *
   * A group with no applicable question disappears entirely rather than
   * rendering as an empty heading — the whole point is that this
   * workshop is asked fewer things, and an empty section undoes that.
   */
  protected readonly groups = computed(() => {
    const applicable = new Map(this.store.policies().map((policy) => [policy.key, policy]));
    const blueprintByKey = new Map(this.blueprint().policies.map((policy) => [policy.key, policy]));

    return this.blueprint()
      .policyGroups.map((group) => ({
        ...group,
        policies: [...applicable.keys()]
          .map((key) => blueprintByKey.get(key))
          .filter((policy): policy is PolicyBlueprint => policy !== undefined && policy.group === group.key),
      }))
      .filter((group) => group.policies.length > 0);
  });

  /** How many of this workshop's questions are still on their recommended answer. */
  protected readonly onDefaults = computed(() => {
    const answers = this.store.draft().policies;
    return this.store.policies().filter((policy) => answers[policy.key] === undefined).length;
  });

  protected valueOf(policy: PolicyBlueprint): string {
    return this.store.draft().policies[policy.key] ?? policy.default;
  }

  protected isAnswered(policy: PolicyBlueprint): boolean {
    return this.store.draft().policies[policy.key] !== undefined;
  }

  protected choose(policy: PolicyBlueprint, optionKey: string): void {
    this.store.setPolicy(policy.key, optionKey);
  }

  /**
   * Which capability raised this question, in the words the capability
   * stage used — so "you are only being asked this because you turned on
   * parts and stock" is legible rather than implied.
   */
  protected raisedBy(policy: PolicyBlueprint): readonly string[] {
    return policy.dependsOnCapabilities.map(
      (key) => this.blueprint().capabilities.find((capability) => capability.key === key)?.title ?? key,
    );
  }
}
