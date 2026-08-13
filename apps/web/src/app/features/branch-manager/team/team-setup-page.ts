import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../../shared/error-banner/error-banner';
import { ButtonDirective } from '../../../shared/button/button.directive';
import { FormField } from '../../../shared/form-field/form-field';
import { ToastService } from '../../../shared/toast/toast.service';
import type { PresentedError } from '../../../core/api/error.interceptor';
import { TeamApi, type TeamSetupPage as PageData, type TeamView } from './team.api';

type State = 'loading' | 'ready' | 'empty' | 'not-delegated' | 'error';

/**
 * Team Setup -- who works with whom, within this manager's branches.
 *
 * The page is a roster, not a table. A team is a group of named people
 * with one leader, and the question asked of it is "who is on this, and
 * who is loose" -- which a column of rows answers badly and a card per
 * team answers directly. The unassigned technicians sit in their own
 * group beside the teams for the same reason: they are the work this
 * page exists to finish.
 *
 * Refused access is a distinct state, not an error. A branch manager
 * whose owner has not delegated team management has not done anything
 * wrong, and the page says so in those words rather than showing them a
 * red banner about permissions.
 */
@Component({
  selector: 'app-team-setup-page',
  imports: [ErrorBanner, ButtonDirective, FormField],
  templateUrl: './team-setup-page.html',
  styleUrl: './team-setup-page.css',
})
export class TeamSetupPage {
  private readonly api = inject(TeamApi);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  /** Set via route `data` on the Owner's reuse of this page (see app.routes.ts). */
  protected readonly forOwner = inject(ActivatedRoute).snapshot.data['teamsForOwner'] === true;

  protected readonly notDelegatedTitle = this.forOwner
    ? "You don't have access to this page"
    : 'Team setup stays with the workshop owner';

  protected readonly data = signal<PageData | null>(null);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);
  /** The owner's own words for why, straight from the delegation layer. */
  protected readonly refusal = signal<string | null>(null);

  protected readonly creating = signal(false);
  protected readonly draftName = signal('');
  protected readonly draftBranchId = signal('');
  protected readonly draftLeaderId = signal('');
  protected readonly busy = signal(false);
  protected readonly formError = signal<string | null>(null);

  /** Which team's member picker is open. */
  protected readonly picking = signal<string | null>(null);

  protected readonly unassigned = computed(() =>
    (this.data()?.technicians ?? []).filter((technician) => technician.currentTeamId === null),
  );

  protected readonly canCreate = computed(
    () => (this.data()?.branches.length ?? 0) > 0 && (this.data()?.eligibleLeaders.length ?? 0) > 0,
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .page()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (page) => this.receive(page), error: (err: PresentedError) => this.fail(err) });
  }

  protected startCreate(): void {
    const data = this.data();
    this.formError.set(null);
    this.draftName.set('');
    this.draftBranchId.set(data?.branches[0]?.id ?? '');
    this.draftLeaderId.set(data?.eligibleLeaders[0]?.id ?? '');
    this.creating.set(true);
  }

  protected cancelCreate(): void {
    this.creating.set(false);
    this.formError.set(null);
  }

  protected create(): void {
    const name = this.draftName().trim();
    if (!name) {
      this.formError.set('A team needs a name.');
      return;
    }
    if (!this.draftBranchId() || !this.draftLeaderId()) {
      this.formError.set('Pick a branch and a team leader.');
      return;
    }

    this.busy.set(true);
    this.api
      .createTeam(name, this.draftBranchId(), this.draftLeaderId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (team) => {
          this.busy.set(false);
          this.creating.set(false);
          this.toast.show(`${team.name} created.`, 'success');
          this.load();
        },
        error: (err: PresentedError) => {
          this.busy.set(false);
          this.formError.set(err.message);
        },
      });
  }

  protected changeLeader(team: TeamView, teamLeaderId: string): void {
    if (!teamLeaderId || teamLeaderId === team.leader?.id) return;

    this.busy.set(true);
    this.api
      .assignLeader(team.id, teamLeaderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.toast.show(`${updated.leader?.fullName ?? 'A new leader'} now leads ${updated.name}.`, 'success');
          this.load();
        },
        error: (err: PresentedError) => {
          this.busy.set(false);
          this.toast.show(err.message, 'danger');
        },
      });
  }

  protected togglePicker(teamId: string): void {
    this.picking.update((current) => (current === teamId ? null : teamId));
  }

  protected move(technicianId: string, teamId: string | null): void {
    this.busy.set(true);
    this.picking.set(null);
    this.api
      .moveTechnician(technicianId, teamId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.busy.set(false);
          this.receive(page);
        },
        error: (err: PresentedError) => {
          this.busy.set(false);
          this.toast.show(err.message, 'danger');
        },
      });
  }

  /** dd MMM yyyy, so a membership date reads the same in every locale. */
  protected day(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private receive(page: PageData): void {
    this.data.set(page);
    this.state.set(page.teams.length > 0 || page.technicians.length > 0 ? 'ready' : 'empty');
  }

  private fail(err: PresentedError): void {
    if (err.httpStatus === 403) {
      // Not an error state. The owner has simply kept this for
      // themselves, which is the default and a legitimate choice.
      this.refusal.set(err.message);
      this.state.set('not-delegated');
      return;
    }
    this.error.set(err);
    this.state.set('error');
  }
}
