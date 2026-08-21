import { Component, computed, effect, inject, input } from '@angular/core';
import { OnboardingStore } from '../onboarding.store';
import type { OnboardingBlueprint, PlanBlueprint } from '../onboarding.api';

/**
 * The commercial plan, and the person who will own this workshop.
 *
 * The plan is here rather than last because its ceilings bound the
 * Structure stage: a plan allowing one branch has to be known before
 * someone types a fourth one. Selecting one hands its limits to the
 * store, which hands them to the validator, which is why exceeding them
 * is reported on Structure rather than discovered at publish.
 *
 * No password field, deliberately. The owner account is created INVITED
 * with no password at all and sets their own through the invite link --
 * a platform admin who could type a customer's first password is a
 * platform admin who knows it.
 */
@Component({
  selector: 'app-stage-plan',
  imports: [],
  templateUrl: './stage-plan.html',
  styleUrl: './stage-plan.css',
})
export class StagePlan {
  readonly blueprint = input.required<OnboardingBlueprint>();
  protected readonly store = inject(OnboardingStore);

  protected readonly selected = computed<PlanBlueprint | undefined>(() =>
    this.blueprint().plans.find((plan) => plan.id === this.store.draft().plan.planId),
  );

  constructor() {
    // The validator needs the ceilings, not the plan id -- it is a pure
    // function with no database, so the numbers travel with the draft.
    effect(() => {
      const plan = this.selected();
      this.store.setPlanLimits(
        plan ? { maxBranches: plan.maxBranches, maxUsers: plan.maxUsers, maxWarehouses: plan.maxWarehouses } : null,
      );
    });
  }

  protected choosePlan(id: string): void {
    this.store.patchPlan({ planId: id });
  }

  protected statusHelp(key: string): string {
    return this.blueprint().initialStatuses.find((status) => status.key === key)?.help ?? '';
  }
}
