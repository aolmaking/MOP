import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Identifier } from '../../../ui/identifier/identifier';
import { ButtonDirective } from '../../../ui/button/button.directive';
import { ErrorBanner } from '../../../ui/error-banner/error-banner';
import type { PresentedError } from '../../../runtime/http/error.interceptor';
import { HistoryRecordDrawer } from './history-record-drawer';
import { OwnerHistoryApi, type HistorySort, type OwnerHistoryIndexRow } from './history.api';

type State = 'loading' | 'ready' | 'empty' | 'forbidden' | 'error';

interface Column {
  readonly key: HistorySort | null;
  readonly label: string;
  readonly numeric?: boolean;
}

/**
 * The columns, and which of them the SERVER can sort by.
 *
 * A header with `key: null` is not clickable. That is deliberate: a
 * column that looks sortable and is not teaches people the table is
 * broken, and sorting a page of rows in the browser would silently sort
 * one page of a paginated result -- which is worse than not sorting,
 * because it looks like it worked.
 */
const COLUMNS: readonly Column[] = [
  { key: 'customer', label: 'Customer' },
  { key: null, label: 'Vehicle' },
  { key: 'plate', label: 'Plate / VIN' },
  { key: 'visits', label: 'Visits', numeric: true },
  { key: 'lastVisit', label: 'Last visit' },
  { key: null, label: 'Currently' },
  { key: null, label: 'Last reported' },
  { key: 'outstanding', label: 'Outstanding', numeric: true },
];

const ACTIVITY = [
  { key: 'all', label: 'Everyone' },
  { key: 'open', label: 'In the workshop now' },
  { key: 'closed', label: 'Nothing open' },
] as const;

const PAGE_SIZE = 25;

/**
 * The workshop's memory, as an index.
 *
 * This page is NOT the audit log (`/owner/audit`), which answers "who
 * changed the system", and it is not the live board, which answers
 * "where is this job right now". It answers "what has ever happened to
 * this customer and this car" -- and it lists every customer and vehicle
 * that has ever been through the workshop, including ones that came once
 * years ago and never returned.
 *
 * Search, filter, sort and paging are all server-side. A history table
 * is the one place where filtering the page you happen to be holding is
 * indistinguishable from filtering the data, and getting that wrong
 * would let an owner conclude a customer does not exist.
 */
@Component({
  selector: 'app-owner-history-page',
  imports: [Identifier, ButtonDirective, ErrorBanner, HistoryRecordDrawer],
  templateUrl: './history-page.html',
  styleUrl: './history-page.css',
})
export class OwnerHistoryPage {
  private readonly api = inject(OwnerHistoryApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly columns = COLUMNS;
  protected readonly activities = ACTIVITY;

  protected readonly rows = signal<readonly OwnerHistoryIndexRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly generatedAt = signal<string | null>(null);

  protected readonly search = signal('');
  protected readonly activity = signal<'all' | 'open' | 'closed'>('all');
  protected readonly sort = signal<HistorySort>('lastVisit');
  protected readonly direction = signal<'asc' | 'desc'>('desc');

  /** The relationship whose complete record is open, if any. */
  protected readonly openRecord = signal<{ customerId: string; assetId: string } | null>(null);

  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  protected readonly showingFrom = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * PAGE_SIZE + 1));
  protected readonly showingTo = computed(() => Math.min(this.total(), this.page() * PAGE_SIZE));

  /**
   * Typing runs one request per pause, not one per keystroke.
   *
   * `switchMap` rather than `mergeMap` so a slow earlier response can
   * never land after a faster later one and repopulate the table with
   * results for a query the person has already changed. That failure mode
   * looks exactly like a broken search box.
   */
  private readonly typed = new Subject<void>();

  constructor() {
    this.typed
      .pipe(
        debounceTime(250),
        takeUntilDestroyed(this.destroyRef),
        switchMap(() => {
          this.state.set('loading');
          return this.api.index({
            search: this.search(),
            activity: this.activity(),
            sort: this.sort(),
            direction: this.direction(),
            page: this.page(),
            pageSize: PAGE_SIZE,
          });
        }),
      )
      .subscribe({
        next: (result) => {
          this.rows.set(result.rows);
          this.total.set(result.total);
          this.generatedAt.set(result.generatedAt);
          this.state.set(result.rows.length === 0 ? 'empty' : 'ready');
        },
        error: (err: PresentedError) => {
          this.error.set(err);
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
        },
      });

    this.load();
  }

  protected load(): void {
    this.typed.next();
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    // Back to page one: staying on page 4 of a new, shorter result set is
    // how a search appears to return nothing.
    this.page.set(1);
    this.load();
  }

  protected setActivity(value: 'all' | 'open' | 'closed'): void {
    this.activity.set(value);
    this.page.set(1);
    this.load();
  }

  protected sortBy(column: Column): void {
    if (!column.key) return;
    if (this.sort() === column.key) {
      this.direction.update((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sort.set(column.key);
      // A new column starts on the direction that is useful for it:
      // newest visit first, most visits first, but names A-Z.
      this.direction.set(column.key === 'customer' || column.key === 'plate' ? 'asc' : 'desc');
    }
    this.page.set(1);
    this.load();
  }

  protected sortIndicator(column: Column): string {
    if (!column.key || this.sort() !== column.key) return '';
    return this.direction() === 'asc' ? '↑' : '↓';
  }

  protected turnPage(delta: number): void {
    const next = Math.min(this.pageCount(), Math.max(1, this.page() + delta));
    if (next === this.page()) return;
    this.page.set(next);
    this.load();
  }

  protected open(row: OwnerHistoryIndexRow): void {
    this.openRecord.set({ customerId: row.customerId, assetId: row.assetId });
  }

  protected identifierFor(row: OwnerHistoryIndexRow): string {
    return row.plateNumber ?? row.vin ?? row.serialNumber ?? '—';
  }

  protected onlyDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  protected when(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  protected label(value: string): string {
    return value.toLowerCase().replace(/[._]/g, ' ');
  }
}
