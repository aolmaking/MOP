import { Component, computed, inject, input } from '@angular/core';
import { grantsForResponsibilities, type ResponsibilityAnswer } from '@mop/shared';
import { OnboardingStore } from '../onboarding.store';
import type { OnboardingBlueprint, ResponsibilityBlueprint } from '../onboarding.api';

/**
 * Who actually does the work each capability creates.
 *
 * This stage exists because of a hole nothing in the product refused.
 * `TENANT_OWNER` holds no `inventory.*` permission in the platform's
 * baseline map, so a workshop that turned Inventory on and never staffed
 * a storekeeper got part requests that no account on earth could
 * approve. The capability was on, the pages existed, and the first
 * request stuck forever.
 *
 * Answering here writes real permission rows at creation — the same rows
 * an owner would otherwise have to find and grant by hand, after the
 * problem had already happened.
 */
@Component({
  selector: 'app-stage-responsibility',
  imports: [],
  templateUrl: './stage-responsibility.html',
  styleUrl: './stage-responsibility.css',
})
export class StageResponsibility {
  readonly blueprint = input.required<OnboardingBlueprint>();
  protected readonly store = inject(OnboardingStore);

  /** Only the questions this workshop's capabilities actually raise. */
  protected readonly questions = computed(() => {
    const applicable = new Set(this.store.responsibilities().map((question) => question.capability));
    return this.blueprint().responsibilities.filter((question) => applicable.has(question.capability as never));
  });

  /** The permission rows the current answers will really write. */
  protected readonly grants = computed(() =>
    grantsForResponsibilities(this.store.draft().capabilities, this.store.draft().responsibilities),
  );

  protected answerFor(question: ResponsibilityBlueprint): string | undefined {
    return this.store.draft().responsibilities[question.capability];
  }

  protected choose(question: ResponsibilityBlueprint, answer: string): void {
    this.store.setResponsibility(question.capability, answer as ResponsibilityAnswer);
  }

  /** Permissions a given answer would move, so the consequence is visible before it is chosen. */
  protected grantsFor(question: ResponsibilityBlueprint, role: string): number {
    return grantsForResponsibilities(this.store.draft().capabilities, { [question.capability]: role as ResponsibilityAnswer })
      .length;
  }

  protected humanRole(role: string): string {
    return role.toLowerCase().replace(/_/g, ' ');
  }

  protected titleOf(key: string): string {
    return this.blueprint().capabilities.find((capability) => capability.key === key)?.title ?? key;
  }
}
