import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../ui/button/button.directive';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import { CustomerPortalApi, type InvoiceStatusRow } from './customer-portal.api';

type State = 'loading' | 'ready' | 'empty' | 'forbidden' | 'error';

/**
 * Invoice & Payment Status. Every figure is a string end to end -- the
 * server already computed `total`/`paid`/`balance` with `toFixed(2)` on
 * `Decimal` columns, so this page only ever displays them, never adds
 * or compares them as numbers.
 */
@Component({
  selector: 'app-invoice-status',
  imports: [ErrorBanner, ButtonDirective],
  templateUrl: './invoice-status.html',
  styleUrl: './invoice-status.css',
})
export class InvoiceStatus {
  private readonly api = inject(CustomerPortalApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly rows = signal<readonly InvoiceStatusRow[]>([]);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .invoices()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.rows.set(rows);
          this.state.set(rows.length === 0 ? 'empty' : 'ready');
        },
        error: (err: PresentedError) => {
          this.error.set(err);
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
        },
      });
  }

  protected isSettled(row: InvoiceStatusRow): boolean {
    return row.balance === '0.00' || row.balance === '0';
  }

  protected label(value: string): string {
    return value.toLowerCase().replace(/_/g, ' ');
  }

  protected when(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
