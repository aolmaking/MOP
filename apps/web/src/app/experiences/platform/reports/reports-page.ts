import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../../ui/button/button.directive';
import type { PresentedError } from '../../../runtime/http/error.interceptor';
import { PlatformReportsApi, type PlatformReportsOverview, type WorkshopReportCard } from './platform-reports.api';

type State = 'loading' | 'ready' | 'empty' | 'no-results' | 'forbidden' | 'error';

const SORTS = [
  { value: 'last_activity_desc', label: 'Last activity' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'created_desc', label: 'Newest' },
] as const;

/**
 * Platform Reports — Level 1, the aggregated view.
 *
 * Cards, not a dense table: `DESIGN_LANGUAGE.md` §7.5 asks for an
 * editorial layout here, and these are comparison-oriented in a way the
 * Workshops table's operational rows are not — a super admin scans this
 * page asking "which of these needs attention", the same job a card
 * grid does better than a table with thirty columns.
 *
 * Level 2 is the six-section per-workshop detail at `/platform/reports/:id`.
 */
@Component({
  selector: 'app-reports-page',
  imports: [ErrorBanner, ButtonDirective],
  templateUrl: './reports-page.html',
  styleUrl: './reports-page.css',
})
export class ReportsPage {
  private readonly api = inject(PlatformReportsApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly sorts = SORTS;

  protected readonly result = signal<PlatformReportsOverview | null>(null);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

  protected readonly search = signal('');
  protected readonly sort = signal('last_activity_desc');
  protected readonly page = signal(1);
  protected readonly pageSize = 25;

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil((this.result()?.workshops.total ?? 0) / this.pageSize)),
  );

  protected readonly hasFilters = computed(() => this.search().trim().length > 0);

  private readonly searches = new Subject<void>();

  constructor() {
    this.searches
      .pipe(
        debounceTime(400),
        distinctUntilChanged(),
        switchMap(() => this.api.overview(this.filters())),
        takeUntilDestroyed(),
      )
      .subscribe({ next: (result) => this.receive(result), error: (err: PresentedError) => this.fail(err) });

    this.fetchNow();
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
    this.state.set('loading');
    this.searches.next();
  }

  protected onSort(value: string): void {
    this.sort.set(value);
    this.page.set(1);
    this.fetchNow();
  }

  protected goToPage(next: number): void {
    if (next < 1 || next > this.totalPages()) return;
    this.page.set(next);
    this.fetchNow();
  }

  protected clearFilters(): void {
    this.search.set('');
    this.page.set(1);
    this.fetchNow();
  }

  protected open(card: WorkshopReportCard): void {
    void this.router.navigate(['/platform/reports', card.id]);
  }

  protected reload(): void {
    this.fetchNow();
  }

  protected label(value: string): string {
    return value.toLowerCase().replace(/_/g, ' ');
  }

  protected ago(iso: string | null): string {
    if (!iso) return 'no recorded activity';
    const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  private filters() {
    return { page: this.page(), pageSize: this.pageSize, search: this.search().trim() || undefined, sort: this.sort() };
  }

  private fetchNow(): void {
    this.state.set('loading');
    this.api
      .overview(this.filters())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (result) => this.receive(result), error: (err: PresentedError) => this.fail(err) });
  }

  private receive(result: PlatformReportsOverview): void {
    this.result.set(result);
    if (result.workshops.items.length > 0) this.state.set('ready');
    else this.state.set(this.hasFilters() ? 'no-results' : 'empty');
  }

  private fail(err: PresentedError): void {
    this.error.set(err);
    this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
  }
}
