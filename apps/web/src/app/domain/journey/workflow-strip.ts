import { Component, computed, input, signal } from '@angular/core';

export type JourneyStageState = 'DONE' | 'CURRENT' | 'WAITING' | 'BLOCKED' | 'AHEAD';

export interface StageFact {
  readonly label: string;
  readonly value: string;
}

export interface PresentedStage {
  readonly status: string;
  readonly state: JourneyStageState;
  readonly at: string | null;
  readonly label: string;
  readonly detail: string | null;
  readonly facts: readonly StageFact[];
}

export interface PresentedJourney {
  readonly stages: readonly PresentedStage[];
  readonly finished: boolean;
  readonly waiting: boolean;
  readonly blocked: boolean;
  readonly headline: string;
  readonly happened: string | null;
  readonly next: string | null;
  readonly waitingOn: { readonly who: string; readonly since: string | null } | null;
  readonly history: readonly { readonly at: string; readonly message: string }[];
}

/**
 * The workflow journey.
 *
 * One component, every shell. The server decides both the stages and the
 * words -- this draws what it is given and nothing else, which is what
 * stops it drifting into a picture of a process no workshop runs.
 *
 * Deliberately **not a progress bar**. A bar implies a percentage, and a
 * job stopped in WAITING_PARTS has no meaningful percentage: it has a
 * stage, an owner, and a reason. Those are what this shows.
 *
 * Progressive disclosure, per §32: the strip is the summary and the
 * navigation. Pressing a stage that has facts opens them; the full
 * history is a separate, deliberately secondary toggle. The strip is not
 * the work-order dossier.
 */
@Component({
  selector: 'app-workflow-strip',
  templateUrl: './workflow-strip.html',
  styleUrl: './workflow-strip.css',
})
export class WorkflowStrip {
  readonly journey = input.required<PresentedJourney>();
  /** Compact drops the narrative and history — for a row in a list. */
  readonly compact = input(false);

  protected readonly openStage = signal<string | null>(null);
  protected readonly historyOpen = signal(false);

  protected readonly current = computed(
    () => this.journey().stages.find((stage) => stage.state !== 'DONE' && stage.state !== 'AHEAD') ?? null,
  );

  protected toggleStage(stage: PresentedStage): void {
    if (stage.facts.length === 0) return;
    this.openStage.set(this.openStage() === stage.status ? null : stage.status);
  }

  protected isOpen(stage: PresentedStage): boolean {
    return this.openStage() === stage.status;
  }

  /**
   * Said out loud for assistive technology, so state never depends on
   * seeing an icon or a colour.
   */
  protected spoken(stage: PresentedStage): string {
    switch (stage.state) {
      case 'DONE':
        return `${stage.label} — done`;
      case 'CURRENT':
        return `${stage.label} — currently in progress`;
      case 'WAITING':
        return `${stage.label} — waiting`;
      case 'BLOCKED':
        return `${stage.label} — blocked`;
      default:
        return `${stage.label} — still to come`;
    }
  }

  /** The mark beside a stage. Paired with a word, never used alone. */
  protected mark(stage: PresentedStage): string {
    switch (stage.state) {
      case 'DONE':
        return '✓';
      case 'CURRENT':
        return '●';
      case 'WAITING':
        return '⏳';
      case 'BLOCKED':
        return '!';
      default:
        return '○';
    }
  }

  protected when(iso: string | null): string {
    if (!iso) return '';
    const date = new Date(iso);
    const today = new Date();
    const sameDay = date.toDateString() === today.toDateString();
    return sameDay
      ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  /** "for 3 days" — how long the job has been stuck on somebody. */
  protected readonly waitingFor = computed(() => {
    const since = this.journey().waitingOn?.since;
    if (!since) return null;
    const hours = (Date.now() - new Date(since).getTime()) / 3_600_000;
    if (hours < 1) return 'just now';
    if (hours < 24) return `for ${Math.floor(hours)}h`;
    const days = Math.floor(hours / 24);
    return days === 1 ? 'for 1 day' : `for ${days} days`;
  });
}
