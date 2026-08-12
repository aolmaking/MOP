import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../../shared/error-banner/error-banner';
import { WorkshopDrawer } from './workshop-drawer';
import { ButtonDirective } from '../../../shared/button/button.directive';
import { ToastService } from '../../../shared/toast/toast.service';
import type { PresentedError } from '../../../core/api/error.interceptor';
import {
  PlatformWorkshopsApi,
  type FreezeImpact,
  type PlanOption,
  type WorkshopDetails,
  type WorkshopListResult,
  type WorkshopRow,
} from '../../../core/api/platform-workshops.api';

type State = 'loading' | 'ready' | 'empty' | 'no-results' | 'forbidden' | 'error';

const STATUSES = ['ACTIVE', 'TRIAL', 'PENDING_SETUP', 'FROZEN', 'SUSPENDED', 'READ_ONLY', 'ARCHIVED'] as const;
const HEALTHS = ['HEALTHY', 'AT_RISK', 'CRITICAL'] as const;

const SORTS = [
  { value: 'last_activity_desc', label: 'Last activity' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'branch_count_desc', label: 'Branches' },
  { value: 'user_count_desc', label: 'Users' },
  { value: 'created_desc', label: 'Newest' },
] as const;

/** Statuses that can be frozen. Already-frozen and archived cannot. */
const FREEZABLE = new Set(['ACTIVE', 'TRIAL', 'PENDING_SETUP', 'READ_ONLY']);

/**
 * Workshops -- every workshop on the platform, one row each.
 *
 * A table, and one of the few places one is right: every row is the same
 * kind of thing and the columns compare down their length, which is the
 * claim a table makes. The requirement that shapes everything else is
 * that this page must read identically at 3 workshops and at 30,000, so
 * paging, sorting and filtering are all server-side query parameters and
 * the row never changes shape with the size of the workshop behind it. A
 * workshop with 200 branches shows `200`; all large-versus-small
 * handling happens in the drawer.
 *
 * Two empty states, deliberately distinct. "No workshops yet" is first
 * use and offers the button that fixes it. "Nothing matches" is a filter
 * problem and offers to clear them. Collapsing the two teaches a super
 * admin to distrust the page the first time a filter hides everything.
 */
@Component({
  selector: 'app-workshops-page',
  imports: [ErrorBanner, ButtonDirective, WorkshopDrawer],
  templateUrl: './workshops-page.html',
  styleUrl: './workshops-page.css',
})
export class WorkshopsPage {
  private readonly api = inject(PlatformWorkshopsApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly statuses = STATUSES;
  protected readonly healths = HEALTHS;
  protected readonly sorts = SORTS;
  protected readonly pageSizes = [25, 50, 100] as const;

  protected readonly result = signal<WorkshopListResult | null>(null);
  protected readonly plans = signal<readonly PlanOption[]>([]);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

  protected readonly search = signal('');
  protected readonly status = signal<readonly string[]>([]);
  protected readonly plan = signal<readonly string[]>([]);
  protected readonly health = signal<readonly string[]>([]);
  protected readonly sort = signal<string>('last_activity_desc');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);

  /** The drawer. Null when closed. */
  protected readonly details = signal<WorkshopDetails | null>(null);
  protected readonly detailsLoading = signal(false);

  /** The freeze/reactivate dialog. */
  protected readonly confirming = signal<WorkshopRow | null>(null);
  protected readonly impact = signal<FreezeImpact | null>(null);
  protected readonly reason = signal('');
  protected readonly submitting = signal(false);
  protected readonly confirmError = signal<string | null>(null);

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil((this.result()?.total ?? 0) / this.pageSize())),
  );

  protected readonly hasFilters = computed(
    () =>
      this.search().trim().length > 0 ||
      this.status().length > 0 ||
      this.plan().length > 0 ||
      this.health().length > 0,
  );

  /** 10–500 characters, matching the server. No submit without it. */
  protected readonly reasonValid = computed(() => {
    const length = this.reason().trim().length;
    return length >= 10 && length <= 500;
  });

  protected readonly freezing = computed(() => FREEZABLE.has(this.confirming()?.status ?? ''));

  private readonly searches = new Subject<void>();

  constructor() {
    // 400ms, per the spec. On typing only -- the first load goes out
    // immediately, the same fix the stock and board pages needed.
    this.searches
      .pipe(
        debounceTime(400),
        distinctUntilChanged(),
        switchMap(() => this.api.listWorkshops(this.filters())),
        takeUntilDestroyed(),
      )
      .subscribe({ next: (result) => this.receive(result), error: (err: PresentedError) => this.fail(err) });

    this.api
      .listPlans()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (plans) => this.plans.set(plans), error: () => this.plans.set([]) });

    this.fetchNow();
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
    this.state.set('loading');
    this.searches.next();
  }

  protected toggleStatus(value: string): void {
    this.status.update((current) => this.flip(current, value));
    this.page.set(1);
    this.fetchNow();
  }

  protected togglePlan(value: string): void {
    this.plan.update((current) => this.flip(current, value));
    this.page.set(1);
    this.fetchNow();
  }

  protected toggleHealth(value: string): void {
    this.health.update((current) => this.flip(current, value));
    this.page.set(1);
    this.fetchNow();
  }

  protected clearFilters(): void {
    this.search.set('');
    this.status.set([]);
    this.plan.set([]);
    this.health.set([]);
    this.page.set(1);
    this.fetchNow();
  }

  protected onSort(value: string): void {
    this.sort.set(value);
    this.page.set(1);
    this.fetchNow();
  }

  protected onPageSize(value: string): void {
    this.pageSize.set(Number(value));
    this.page.set(1);
    this.fetchNow();
  }

  protected goToPage(next: number): void {
    if (next < 1 || next > this.totalPages()) return;
    this.page.set(next);
    this.fetchNow();
  }

  protected addWorkshop(): void {
    void this.router.navigate(['/platform/workshops/new']);
  }

  protected openControlCentre(row: WorkshopRow): void {
    void this.router.navigate(['/platform/workshops', row.id, 'capabilities']);
  }

  protected openDetails(row: WorkshopRow): void {
    this.detailsLoading.set(true);
    this.api
      .workshopDetails(row.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (details) => {
          this.details.set(details);
          this.detailsLoading.set(false);
        },
        error: (err: PresentedError) => {
          this.detailsLoading.set(false);
          this.toast.show(err.message, 'danger');
        },
      });
  }

  protected closeDetails(): void {
    this.details.set(null);
  }

  /**
   * Opens the dialog and asks for the impact at that moment. The counts
   * are live sessions, so a cached number would tell a super admin they
   * are signing out four people when it is now forty.
   */
  protected confirm(row: WorkshopRow): void {
    this.confirming.set(row);
    this.reason.set('');
    this.impact.set(null);
    this.confirmError.set(null);

    if (FREEZABLE.has(row.status)) {
      this.api
        .freezeImpact(row.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: (impact) => this.impact.set(impact), error: () => this.impact.set(null) });
    }
  }

  protected cancelConfirm(): void {
    this.confirming.set(null);
    this.confirmError.set(null);
  }

  protected submitConfirm(): void {
    const row = this.confirming();
    if (!row || !this.reasonValid()) return;

    this.submitting.set(true);
    this.confirmError.set(null);

    const reason = this.reason().trim();
    const request = this.freezing()
      ? this.api.freezeWorkshop(row.id, reason)
      : this.api.reactivateWorkshop(row.id, reason);

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.submitting.set(false);
        this.toast.show(`${row.name} ${this.freezing() ? 'frozen' : 'reactivated'}.`, 'success');
        this.confirming.set(null);
        // The row updates in place -- a full reload would lose the page,
        // the filters and the reader's place in a long list.
        this.fetchNow();
      },
      error: (err: PresentedError) => {
        this.submitting.set(false);
        this.confirmError.set(err.message);
      },
    });
  }

  protected canFreeze(row: WorkshopRow): boolean {
    return FREEZABLE.has(row.status);
  }

  protected canReactivate(row: WorkshopRow): boolean {
    return row.status === 'FROZEN' || row.status === 'SUSPENDED';
  }

  protected reload(): void {
    this.fetchNow();
  }

  protected label(value: string): string {
    return value.toLowerCase().replace(/_/g, ' ');
  }

  /** "2h ago". Relative, because the question is recency, not date. */
  protected ago(iso: string | null): string {
    if (!iso) return 'never';
    const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  /**
   * The absolute timestamp in THAT workshop's timezone, for the hover
   * title. A super admin in Cairo reading a Jakarta workshop's activity
   * should see the hour its own staff saw, not their own clock.
   */
  protected absolute(iso: string | null, timezone: string): string {
    if (!iso) return 'No recorded activity';
    try {
      return `${new Date(iso).toLocaleString(undefined, { timeZone: timezone })} (${timezone})`;
    } catch {
      // An unknown IANA zone must not blank the tooltip.
      return new Date(iso).toLocaleString();
    }
  }

  private flip(current: readonly string[], value: string): string[] {
    return current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value];
  }

  private filters() {
    return {
      page: this.page(),
      pageSize: this.pageSize(),
      search: this.search().trim() || undefined,
      status: [...this.status()],
      plan: [...this.plan()],
      health: [...this.health()],
      sort: this.sort(),
    };
  }

  private fetchNow(): void {
    this.state.set('loading');
    this.api
      .listWorkshops(this.filters())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (result) => this.receive(result), error: (err: PresentedError) => this.fail(err) });
  }

  private receive(result: WorkshopListResult): void {
    this.result.set(result);
    if (result.items.length > 0) this.state.set('ready');
    // "No workshops at all" and "none match" are different problems with
    // different fixes, so they are different states.
    else this.state.set(this.hasFilters() ? 'no-results' : 'empty');
  }

  private fail(err: PresentedError): void {
    this.error.set(err);
    this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
  }
}
