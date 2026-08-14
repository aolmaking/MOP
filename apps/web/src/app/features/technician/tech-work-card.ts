import { Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Identifier } from '../../shared/identifier/identifier';
import type { PresentedError } from '../../core/api/error.interceptor';
import { TechnicianApi, type AssetHistorySummary, type TechnicianTask, type WorkCard } from './technician.api';

type State = 'loading' | 'ready' | 'not-mine' | 'forbidden' | 'error';

/** What a technician can report, in the words they would use out loud. */
const BLOCKER_REASONS = [
  { key: 'WAITING_PART', label: 'Need a part' },
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
  imports: [RouterLink, Identifier, DatePipe],
  templateUrl: './tech-work-card.html',
  styleUrl: './tech-work-card.css',
})
export class TechWorkCard {
  private readonly api = inject(TechnicianApi);

  readonly id = input.required<string>();

  protected readonly card = signal<WorkCard | null>(null);
  protected readonly state = signal<State>('loading');
  protected readonly busy = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  /** Which panel is open. Only one at a time -- this is a small screen. */
  protected readonly panel = signal<'none' | 'blocker' | 'fault'>('none');
  protected readonly faultText = signal('');
  protected readonly faultSeverity = signal('MEDIUM');

  protected readonly reasons = BLOCKER_REASONS;

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
    this.run(`done-${task.id}`, this.api.completeTask(task.id));
  }

  protected reportBlocker(reason: string): void {
    const task = this.activeTask() ?? this.nextTask();
    if (!task) return;
    this.panel.set('none');
    this.run('blocker', this.api.reportBlocker(task.id, reason));
  }

  protected logFault(): void {
    const text = this.faultText().trim();
    if (text.length < 3) return;
    this.panel.set('none');
    this.run('fault', this.api.createFault(this.id(), text, this.faultSeverity()));
    this.faultText.set('');
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
