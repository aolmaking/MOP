import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../shared/error-banner/error-banner';
import { ButtonDirective } from '../../shared/button/button.directive';
import type { PresentedError } from '../../core/api/error.interceptor';
import { InventoryApi, type StockRow, type StockTable } from './inventory.api';

type State = 'loading' | 'ready' | 'empty' | 'no-results' | 'forbidden' | 'error';

/**
 * "What do we have, and where?"
 *
 * A real table: items down, warehouses across. This is the one page in
 * the product where a table is genuinely right, because the cells ARE
 * comparable in both directions -- which is exactly the claim a table
 * makes (PHASE_7.md section 3). The Attention Center refuses a table for
 * the opposite reason, and that is the same rule, not a contradiction.
 */
@Component({
  selector: 'app-inventory-stock',
  imports: [RouterLink, ErrorBanner, ButtonDirective],
  templateUrl: './inventory-stock.html',
  styleUrl: './inventory-stock.css',
})
export class InventoryStock {
  private readonly api = inject(InventoryApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly table = signal<StockTable | null>(null);
  protected readonly query = signal('');
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

  private readonly queries = new Subject<string>();

  constructor() {
    // Debounce on typing only. The first load goes straight to the
    // network -- the same fix 5.D needed.
    this.queries
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((q) => this.api.stock(q || undefined)),
        takeUntilDestroyed(),
      )
      .subscribe({ next: (table) => this.receive(table), error: (err: PresentedError) => this.fail(err) });

    this.fetchNow();
  }

  protected onQuery(value: string): void {
    this.query.set(value);
    this.state.set('loading');
    this.queries.next(value.trim());
  }

  protected reload(): void {
    this.fetchNow();
  }

  private fetchNow(): void {
    this.state.set('loading');
    this.api
      .stock(this.query().trim() || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (table) => this.receive(table), error: (err: PresentedError) => this.fail(err) });
  }

  private receive(table: StockTable): void {
    this.table.set(table);
    if (table.rows.length > 0) this.state.set('ready');
    else this.state.set(this.query().trim() ? 'no-results' : 'empty');
  }

  private fail(err: PresentedError): void {
    this.error.set(err);
    this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
  }

  /**
   * Below critical is red; below low is amber; otherwise no colour.
   *
   * The good state carries no colour at all, per the design language --
   * a store where everything is fine should look calm, so the two items
   * that are actually short are the only thing the eye lands on.
   */
  protected level(row: StockRow): 'critical' | 'low' | 'ok' {
    if (row.totalAvailable <= row.criticalStockThreshold) return 'critical';
    if (row.totalAvailable <= row.lowStockThreshold) return 'low';
    return 'ok';
  }
}
