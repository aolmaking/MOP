import { Component, input } from '@angular/core';

export type JourneyStageState = 'DONE' | 'CURRENT' | 'WAITING' | 'AHEAD';

export interface PresentedStage {
  readonly status: string;
  readonly state: JourneyStageState;
  readonly at: string | null;
  readonly label: string;
}

export interface PresentedJourney {
  readonly stages: readonly PresentedStage[];
  readonly finished: boolean;
  readonly waiting: boolean;
  readonly headline: string;
}

/**
 * The workflow strip.
 *
 * One component, three shells. The server decides both the stages and
 * the words -- this draws what it is given and nothing else, which is
 * what stops it drifting into a picture of a process no workshop
 * actually runs.
 *
 * The strip is deliberately not a progress BAR. A bar implies a
 * percentage, and a job sitting in WAITING_PARTS has no meaningful
 * percentage: it is stopped, and the honest thing to show is which stage
 * it is stopped at and who owns the next move.
 */
@Component({
  selector: 'app-workflow-strip',
  templateUrl: './workflow-strip.html',
  styleUrl: './workflow-strip.css',
})
export class WorkflowStrip {
  readonly journey = input.required<PresentedJourney>();

  /** Shown on the stage a person is standing at, not on every stage. */
  protected when(stage: PresentedStage): string {
    if (!stage.at) return '';
    return new Date(stage.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
}
