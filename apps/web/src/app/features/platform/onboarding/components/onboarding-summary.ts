import { Component, computed, inject, input } from '@angular/core';
import { CAPABILITY_PRESENTATION, type CapabilityKey } from '@mop/shared';
import { OnboardingStore } from '../onboarding.store';
import type { OnboardingBlueprint } from '../onboarding.api';

/**
 * What this workshop will contain, kept on screen throughout.
 *
 * Every figure is derived by the shared engine from the current draft --
 * pages from the page registry filtered by which roles still have work,
 * checks from the gate registry filtered by capability, questions from
 * the policy registry filtered by relevance. Nothing here is a
 * hand-maintained number, which is what lets the panel claim to be a
 * preview rather than a summary of a form.
 *
 * The progress figure is a ratio of real decisions, not a percentage
 * invented to fill a bar: a one-bay workshop genuinely has fewer
 * decisions to make than a twelve-branch network, and the denominator
 * moves when a capability changes the question set.
 */
@Component({
  selector: 'app-onboarding-summary',
  imports: [],
  templateUrl: './onboarding-summary.html',
  styleUrl: './onboarding-summary.css',
  host: { class: 'onb-summary-host' },
})
export class OnboardingSummary {
  readonly blueprint = input.required<OnboardingBlueprint>();
  protected readonly store = inject(OnboardingStore);

  protected readonly facts = computed(() => this.store.facts());

  /** Active capabilities in the words a workshop owner reads, not their keys. */
  protected readonly activeTitles = computed(() =>
    this.facts().activeCapabilities.map((key) => CAPABILITY_PRESENTATION[key as CapabilityKey].title),
  );

  protected readonly externalTitles = computed(() =>
    this.facts().externalCapabilities.map((key) => CAPABILITY_PRESENTATION[key as CapabilityKey].title),
  );

  /**
   * The lifecycle states a work order can actually reach in this
   * workshop, out of every state the graph declares.
   *
   * Read from the reachability validator -- the same function that
   * guarantees no configuration can strand a job -- so this number moving
   * is the capability engine visibly doing its work.
   */
  protected readonly workOrderStates = computed(() =>
    this.facts().workflowStates.find((entity) => entity.entity === 'WorkOrder'),
  );

  protected readonly progress = computed(() => this.store.progress());

  protected readonly blockerCount = computed(() => this.store.validation().blockerCount);
}
