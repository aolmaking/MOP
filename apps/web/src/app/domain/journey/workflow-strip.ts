import {
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type {
  JourneyAction,
  JourneyEvent,
  JourneyStageFact,
  PresentedJourney,
  PresentedJourneyStage,
} from '@mop/shared';

/**
 * The wire shapes come from `@mop/shared`, not from a copy declared
 * here.
 *
 * They used to be re-declared in this file, and the two definitions
 * drifted the moment the server grew a field: the client kept compiling
 * against a shape the server had stopped sending. Re-exported rather
 * than merely imported so the existing `from './workflow-strip'` imports
 * across the role surfaces keep working and there is still exactly one
 * definition behind them.
 */
export type {
  JourneyAction,
  JourneyEvent,
  JourneyEventKind,
  JourneyStageFact,
  JourneyStageState,
  PresentedJourney,
  PresentedJourneyStage,
} from '@mop/shared';

/** Kept for the surfaces that already import these names. */
export type StageFact = JourneyStageFact;
export type PresentedStage = PresentedJourneyStage;

/**
 * The live journey of ONE work order.
 *
 * One component, every shell. The server decides the stages, the words,
 * the durations and which actions are real -- this draws what it is
 * given and computes nothing about the job itself, which is what keeps
 * it from drifting into a picture of a process no workshop runs.
 *
 * Deliberately **not a progress bar**. A bar implies a percentage, and a
 * job stopped in WAITING_PARTS has no meaningful percentage: it has a
 * stage, an owner, a reason and a duration. Those are what this shows.
 *
 * Three layers, in the order somebody actually reads them:
 *
 *  1. the **horizontal strip** -- where are we;
 *  2. the **current stage panel** -- why are we stopped, since when, and
 *     what has to happen;
 *  3. the **event history** -- what actually happened, in order.
 *
 * The strip alone cannot answer 2 or 3, and forcing every detail into it
 * is what turns a strip into an unreadable ribbon of thirty dots.
 */
@Component({
  selector: 'app-workflow-strip',
  templateUrl: './workflow-strip.html',
  styleUrl: './workflow-strip.css',
})
export class WorkflowStrip {
  readonly journey = input.required<PresentedJourney>();
  /** Compact drops the panel, narrative and history — for a row in a list. */
  readonly compact = input(false);

  /**
   * A real, server-authorized action was pressed.
   *
   * The component never performs it: the page that owns the API client
   * does, and then refreshes the journey from the server. A strip whose
   * entire purpose is telling the truth about state must not be the one
   * component that guesses at the next state.
   */
  readonly act = output<JourneyAction>();

  protected readonly openStage = signal<string | null>(null);
  protected readonly historyOpen = signal(false);

  private readonly rail = viewChild<ElementRef<HTMLElement>>('rail');

  /**
   * Bring the stage the job is actually AT into view.
   *
   * The rail is wider than a phone, and a long journey puts the current
   * stage well off the right-hand edge -- so a technician opening their
   * work card saw "Checked in / Inspection" and had to scroll to find
   * out where the car is. That is the one question the strip exists to
   * answer, and it must not cost a gesture.
   *
   * Scrolls the RAIL rather than calling `scrollIntoView`, which would
   * also scroll the page and yank the header away from under the reader.
   * Instant rather than smooth: this runs on load and on every poll, and
   * a strip that glides sideways every twenty seconds is motion nobody
   * asked for. Centred where there is room, clamped at both ends so the
   * first and last stages are never left half off-screen.
   */
  private readonly keepCurrentInView = effect(() => {
    const stages = this.journey().stages;
    const rail = this.rail()?.nativeElement;
    if (!rail) return;

    const index = stages.findIndex((stage) => stage.state !== 'DONE' && stage.state !== 'AHEAD');
    if (index < 0) return;

    const element = rail.querySelectorAll<HTMLElement>('.stage')[index];
    if (!element) return;

    const target = element.offsetLeft - (rail.clientWidth - element.offsetWidth) / 2;
    rail.scrollLeft = Math.max(0, Math.min(target, rail.scrollWidth - rail.clientWidth));
  });

  protected readonly current = computed(
    () => this.journey().stages.find((stage) => stage.state !== 'DONE' && stage.state !== 'AHEAD') ?? null,
  );

  /**
   * The history, newest LAST.
   *
   * Chronological order comes from the server and is never re-sorted
   * here: it is total there (time, then a causal tie-break, then the
   * source row's id) and re-deriving it on the client from formatted
   * timestamps is how two readers end up with two different stories.
   */
  protected readonly events = computed(() => this.journey().events);

  protected toggleStage(stage: PresentedJourneyStage): void {
    if (stage.facts.length === 0) return;
    this.openStage.set(this.openStage() === stage.status ? null : stage.status);
  }

  protected isOpen(stage: PresentedJourneyStage): boolean {
    return this.openStage() === stage.status;
  }

  /**
   * Said out loud for assistive technology, so state never depends on
   * seeing an icon or a colour.
   */
  protected spoken(stage: PresentedJourneyStage): string {
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
  protected mark(stage: PresentedJourneyStage): string {
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

  /** Date AND time, for a log line where "10:48" alone is ambiguous. */
  protected fullWhen(iso: string): string {
    const date = new Date(iso);
    const today = new Date();
    const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return date.toDateString() === today.toDateString()
      ? time
      : `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${time}`;
  }

  /**
   * A duration the server measured, put into words.
   *
   * The NUMBER is never computed here -- the server sends whole minutes,
   * measured against its own clock, because a workshop tablet with a
   * wrong clock would otherwise report a job as three hours late. All
   * this does is choose the unit a person would say out loud.
   */
  protected elapsed(minutes: number | null): string | null {
    if (minutes === null) return null;
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours === 1 ? '1 hour' : `${hours} hours`;
    const days = Math.floor(hours / 24);
    return days === 1 ? '1 day' : `${days} days`;
  }

  /** How long the job has been where it is. */
  protected readonly forElapsed = computed(() => this.elapsed(this.journey().current.forMinutes));

  /** How long somebody has owed the next move — often longer. */
  protected readonly waitingElapsed = computed(() => this.elapsed(this.journey().current.waitingForMinutes));

  /**
   * Grouped for the log's left rail: consecutive events on the same day
   * share one date heading rather than repeating it on every line.
   */
  protected dayOf(iso: string): string {
    const date = new Date(iso);
    const today = new Date();
    return date.toDateString() === today.toDateString()
      ? 'Today'
      : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  protected newDay(event: JourneyEvent, index: number): boolean {
    if (index === 0) return true;
    return this.dayOf(this.events()[index - 1].at) !== this.dayOf(event.at);
  }

  protected run(action: JourneyAction): void {
    this.act.emit(action);
  }
}
