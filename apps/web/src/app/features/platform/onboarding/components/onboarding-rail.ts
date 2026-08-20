import { Component, input, output } from '@angular/core';
import { ONBOARDING_STAGES, type OnboardingStageId, type StageProgress } from '@mop/shared';

/**
 * The stage rail: which stage am I on, and how much of each is done.
 *
 * Split out of `OnboardingPage` when that component's stylesheet crossed
 * the project's 8 kB CSS budget and broke the build -- the same remedy
 * the branch-manager work order used for its dossier drawer and the
 * technician Work Card for its parts picker.
 *
 * Presentational only. It reads progress and reports a click; the page
 * still owns what changing stage means.
 */
@Component({
  selector: 'app-onboarding-rail',
  templateUrl: './onboarding-rail.html',
  styleUrl: './onboarding-rail.css',
})
export class OnboardingRail {
  readonly current = input.required<OnboardingStageId>();
  readonly progress = input.required<readonly StageProgress[]>();
  readonly visited = input.required<ReadonlySet<OnboardingStageId>>();

  readonly navigate = output<OnboardingStageId>();

  protected readonly stages = ONBOARDING_STAGES;

  /** Done means complete AND actually looked at -- not merely defaulted. */
  protected isDone(index: number, id: OnboardingStageId): boolean {
    return (this.progress()[index]?.complete ?? false) && this.visited().has(id);
  }
}
