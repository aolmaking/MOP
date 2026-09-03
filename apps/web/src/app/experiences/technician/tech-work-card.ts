import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Identifier } from '../../ui/identifier/identifier';
import { WorkflowStrip, type JourneyAction } from '../../domain/journey/workflow-strip';
import { PartList, type PartClarification, type PartReturn } from './part-list';
import { pollJourney, type JourneyFeed } from '../../domain/journey/journey-poller';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import {
  TechnicianApi,
  type AssetHistorySummary,
  type TechnicianTask,
  type WorkCard,
  type WorkCardPart,
} from './technician.api';

type State = 'loading' | 'ready' | 'not-mine' | 'forbidden' | 'error';

/**
 * What a technician can report, in the words they would use out loud.
 *
 * `WAITING_PART` is deliberately absent: needing a part has a real path
 * now (the parts picker writes a `PartRequest` the store actually
 * receives), and leaving it here as a blocker would offer a dead end
 * beside the working door. The picker itself still falls back to this
 * blocker for a part the catalogue does not carry.
 */
const BLOCKER_REASONS = [
  { key: 'TOOL_MISSING', label: 'Missing a tool' },
  { key: 'NEED_TEAM_LEADER', label: 'Need the team leader' },
  { key: 'UNCLEAR_DIAGNOSIS', label: "Don't know what's wrong" },
  { key: 'SAFETY_ISSUE', label: 'Not safe to continue' },
  { key: 'WAITING_CUSTOMER', label: 'Need the customer' },
] as const;

/**
 * The Work Card -- one car and the things a technician can do to it.
 *
 * The tools are grouped by what each action costs somebody ELSE, because
 * that is what decides how hard it should be to press (PHASE_6.md §4):
 * recording is one tap, telling someone something needs a reason, and
 * finishing shows the gate result before the press rather than as a
 * failure after it.
 */
@Component({
  selector: 'app-tech-work-card',
  imports: [RouterLink, Identifier, DatePipe, WorkflowStrip, PartList],
  templateUrl: './tech-work-card.html',
  styleUrl: './tech-work-card.css',
})
export class TechWorkCard {
  private readonly api = inject(TechnicianApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input.required<string>();

  protected readonly card = signal<WorkCard | null>(null);
  /**
   * The workflow strip. Loaded alongside the card and reloaded with it,
   * because almost every write here can move the job -- a strip that
   * only refreshed on navigation would show the stage the job was at
   * before the technician pressed the button.
   */
  /**
   * Polled rather than fetched once: the store issuing a part or the
   * customer answering a decision changes this job without the
   * technician touching anything, and a strip that only refreshed on
   * navigation would quietly go stale in their hand.
   */
  private feed: JourneyFeed | null = null;
  protected readonly journey = computed(() => this.feed?.journey() ?? null);
  protected readonly state = signal<State>('loading');
  protected readonly busy = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  /** Which panel is open. Only one at a time -- this is a small screen. */
  protected readonly panel = signal<'none' | 'blocker' | 'fault' | 'inspection' | 'external'>('none');
  protected readonly faultText = signal('');
  protected readonly inspectionNote = signal('');
  protected readonly faultSeverity = signal('MEDIUM');
  protected readonly taskMinutes = signal<Record<string, string>>({});

  /**
   * "Ask the customer" -- folded into the same panel as logging the
   * fault, rather than a second screen, because a fault that needs
   * approval and its price are one decision in the technician's head,
   * not two.
   */
  protected readonly askCustomer = signal(false);
  protected readonly faultPrice = signal('');
  protected readonly faultLaborPrice = signal('');
  private static readonly MONEY = /^\d+(\.\d{1,2})?$/;

  protected readonly reasons = BLOCKER_REASONS;

  /**
   * Only the parts still needing somebody -- settled ones are history.
   *
   * A part the technician could still send back counts as open even
   * when nobody is formally waiting on it: RECEIVED_BY_TECHNICIAN reads
   * as "yours to fit", and hiding the return door until something has
   * gone wrong is how a wrong part ends up fitted.
   */
  protected readonly openParts = computed(
    () => this.card()?.parts.filter((part) => part.waitingOn !== 'NOBODY' || part.returnable) ?? [],
  );


  /**
   * A move offered by the journey, performed.
   *
   * Routed by the server's own action KEY rather than by reading the
   * job's status here: which move is available from where is the
   * workflow graph's business, and re-deriving it on the tablet is how
   * the button and the endpoint come to disagree. An unrecognised key is
   * ignored rather than guessed at -- a new server-side action reaches
   * this client as nothing, never as the wrong request.
   */
  protected runJourneyAction(action: JourneyAction): void {
    switch (action.key) {
      case 'start_inspection':
        this.run('primary', this.api.startInspection(this.id()));
        return;
      case 'start_work':
        this.run('primary', this.api.startWork(this.id()));
        return;
      default:
        return;
    }
  }

  protected receivePart(part: WorkCardPart): void {
    this.run(`part-${part.partRequestId}`, this.api.receivePart(part.partRequestId));
  }

  protected usePart(part: WorkCardPart): void {
    this.run(`part-${part.partRequestId}`, this.api.usePart(part.partRequestId));
  }

  protected returnPart(event: PartReturn): void {
    this.run(
      `return-${event.part.partRequestId}`,
      this.api.returnPart(event.part.partRequestId, event.quantity, event.reason),
    );
  }

  protected answerClarification(event: PartClarification): void {
    this.run(
      `clarify-${event.part.partRequestId}`,
      this.api.answerClarification(event.part.partRequestId, event.answer),
    );
  }

  /**
   * A part the workshop never held. Offered as its own door rather than
   * inside the picker, because the picker searches the workshop's own
   * catalogue and this part is by definition not in it.
   */
  protected readonly externalPartName = signal('');
  protected readonly externalProvenance = signal<'CUSTOMER_SUPPLIED' | 'EXTERNAL_PURCHASE'>('CUSTOMER_SUPPLIED');
  protected readonly externalQuantity = signal('1');
  protected readonly externalNameValid = computed(() => this.externalPartName().trim().length >= 1);

  protected addExternalPart(): void {
    if (!this.externalNameValid()) return;
    const quantity = Number(this.externalQuantity().trim());
    if (!Number.isInteger(quantity) || quantity < 1) {
      this.actionError.set('Say how many — a whole number, at least one.');
      return;
    }

    const name = this.externalPartName().trim();
    const provenance = this.externalProvenance();
    this.panel.set('none');
    this.externalPartName.set('');
    this.externalQuantity.set('1');
    this.run('external', this.api.addExternalPart(this.id(), name, provenance, quantity));
  }

  /** Loaded lazily, on request -- not every job has history, and most visits are a single one. */
  protected readonly vehicleHistory = signal<AssetHistorySummary | null>(null);
  protected readonly vehicleHistoryOpen = signal(false);
  protected readonly vehicleHistoryLoading = signal(false);

  constructor() {
    queueMicrotask(() => this.load());
  }

  protected load(): void {
    this.state.set('loading');
    this.api.workCard(this.id()).subscribe({
      next: (card) => {
        this.card.set(card);
        this.state.set('ready');
        // Started after the card resolves, so a technician never sees a
        // strip for a job the card then refuses to show them.
        this.feed ??= pollJourney(this.destroyRef, () => this.api.journey(this.id()));
      },
      error: (err: PresentedError) => {
        if (err.httpStatus === 404) this.state.set('not-mine');
        else if (err.httpStatus === 403) this.state.set('forbidden');
        else this.state.set('error');
      },
    });
  }

  protected readonly activeTask = computed(() =>
    this.card()?.tasks.find((task) => task.status === 'IN_PROGRESS') ?? null,
  );

  protected readonly nextTask = computed(
    () => this.card()?.tasks.find((task) => task.status === 'ASSIGNED' || task.status === 'RETURNED_FOR_REWORK') ?? null,
  );

  protected readonly blockedTask = computed(() => this.card()?.tasks.find((task) => task.blockedReason) ?? null);

  protected start(task: TechnicianTask): void {
    this.run(`start-${task.id}`, this.api.startTask(task.id));
  }

  protected complete(task: TechnicianTask): void {
    const minutes = this.minutesForCompletion(task);
    if (minutes === false) {
      this.actionError.set('Enter whole minutes before marking this task done.');
      return;
    }
    this.run(`done-${task.id}`, this.api.completeTask(task.id, minutes));
  }

  protected setTaskMinutes(taskId: string, value: string): void {
    this.taskMinutes.update((current) => ({ ...current, [taskId]: value }));
  }

  protected canComplete(task: TechnicianTask): boolean {
    return this.minutesForCompletion(task) !== false;
  }

  private minutesForCompletion(task: TechnicianTask): number | undefined | false {
    const rule = this.card()?.timeTracking ?? 'OPTIONAL';
    if (rule === 'OFF') return undefined;

    const raw = this.taskMinutes()[task.id]?.trim() ?? '';
    if (raw === '') return rule === 'REQUIRED' ? false : undefined;

    const minutes = Number(raw);
    if (!Number.isInteger(minutes) || minutes < 0) return false;
    return minutes;
  }

  /**
   * One press per inspection type. The category-specific measurement
   * form is Phase 15/16 work; a type and a note is what a technician can
   * honestly record today, and the finish gate only asks whether an
   * inspection happened.
   */
  protected recordInspection(type: 'QUICK' | 'FULL'): void {
    const note = this.inspectionNote().trim();
    this.panel.set('none');
    this.inspectionNote.set('');
    this.run('inspection', this.api.recordInspection(this.id(), type, note || undefined));
  }

  protected reportBlocker(reason: string): void {
    const task = this.activeTask() ?? this.nextTask();
    if (!task) return;
    this.panel.set('none');
    this.run('blocker', this.api.reportBlocker(task.id, reason));
  }

  protected finish(): void {
    this.run('finish', this.api.finishWorkOrder(this.id()));
  }

  protected readonly priceValid = computed(() => TechWorkCard.MONEY.test(this.faultPrice().trim()));

  protected logFault(): void {
    const text = this.faultText().trim();
    if (text.length < 3) return;
    if (this.askCustomer() && !this.priceValid()) return;

    this.panel.set('none');
    const description = text;
    const severity = this.faultSeverity();
    const askCustomer = this.askCustomer();
    const price = this.faultPrice().trim();
    const laborPrice = this.faultLaborPrice().trim();

    this.busy.set('fault');
    this.actionError.set(null);

    this.api.createFault(this.id(), description, severity).subscribe({
      next: () => {
        this.faultText.set('');
        if (!askCustomer) {
          this.busy.set(null);
          this.load();
          return;
        }

        this.api
          .raiseDecision(this.id(), {
            name: description.slice(0, 200),
            explanation: description,
            importance: severity,
            price,
            laborPrice: laborPrice || undefined,
          })
          .subscribe({
            next: () => {
              this.busy.set(null);
              this.askCustomer.set(false);
              this.faultPrice.set('');
              this.faultLaborPrice.set('');
              this.load();
            },
            error: (err: PresentedError) => {
              this.busy.set(null);
              // The fault is already logged -- only the ask failed.
              this.actionError.set(err.message ?? 'Logged, but asking the customer did not go through.');
              this.load();
            },
          });
      },
      error: (err: PresentedError) => {
        this.busy.set(null);
        this.actionError.set(err.message ?? 'That did not work.');
      },
    });
  }

  /**
   * Every write reloads the card afterwards rather than patching local
   * state. The server decides what a write did -- a completed task may
   * have moved the whole job -- and guessing here is how a tablet ends up
   * showing a job that finished only on the tablet.
   */
  private run(key: string, request: { subscribe(o: { next: () => void; error: (e: PresentedError) => void }): void }): void {
    this.busy.set(key);
    this.actionError.set(null);
    request.subscribe({
      next: () => {
        this.busy.set(null);
        this.load();
        // The write may well have moved the job -- ask the server rather
        // than advancing the strip locally.
        this.feed?.refresh();
      },
      error: (err: PresentedError) => {
        this.busy.set(null);
        // Shown on the page, never as a toast. A technician who put the
        // tablet down would miss a toast entirely, and would believe the
        // thing they pressed had worked.
        this.actionError.set(err.message ?? 'That did not work.');
      },
    });
  }

  protected label(value: string): string {
    return value.toLowerCase().replace(/_/g, ' ');
  }

  protected toggleVehicleHistory(): void {
    const opening = !this.vehicleHistoryOpen();
    this.vehicleHistoryOpen.set(opening);
    if (opening && !this.vehicleHistory()) {
      this.vehicleHistoryLoading.set(true);
      this.api.vehicleHistory(this.id()).subscribe({
        next: (summary) => {
          this.vehicleHistoryLoading.set(false);
          this.vehicleHistory.set(summary);
        },
        error: () => this.vehicleHistoryLoading.set(false),
      });
    }
  }
}
