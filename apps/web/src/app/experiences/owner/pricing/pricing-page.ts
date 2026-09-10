import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ErrorBanner } from '../../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../../ui/button/button.directive';
import type { PresentedError } from '../../../runtime/http/error.interceptor';
import { ALL_PAYMENT_METHODS, PricingApi, type FinanceConfigView, type PriceCatalogItemView } from './pricing.api';
import { DismissOnEscapeDirective } from '../../../ui/dismiss-on-escape/dismiss-on-escape.directive';

type State = 'loading' | 'ready' | 'forbidden' | 'error';

/**
 * Pricing & Financial Configuration (docs/detailed-specs/tenant-owner.md).
 * FinanceConfiguration existed in the schema since Phase 8, genuinely
 * read by gate-evaluator.service.ts (Delivery Payment Gate) and
 * decision.service.ts (discount threshold) -- this page is the first
 * thing that ever writes to it besides an internal `compliantBlocked`
 * upsert. "Who Can Handle Money" is intentionally not on this page yet;
 * see finance-configuration.service.ts's doc comment for why.
 */
@Component({
  selector: 'app-pricing-page',
  imports: [FormsModule, ErrorBanner, ButtonDirective, DismissOnEscapeDirective],
  templateUrl: './pricing-page.html',
  styleUrl: './pricing-page.css',
})
export class PricingPage {
  private readonly api = inject(PricingApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly allMethods = ALL_PAYMENT_METHODS;
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly config = signal<FinanceConfigView | null>(null);
  protected readonly catalog = signal<readonly PriceCatalogItemView[]>([]);

  protected readonly saveError = signal<PresentedError | null>(null);
  protected readonly saving = signal(false);

  protected readonly showAddPrice = signal(false);
  protected readonly isEditing = signal(false);
  protected readonly priceDraft = signal<{
    itemKey: string;
    itemType: string;
    unitPrice: number;
    laborPrice: number;
    /**
     * Empty means "not set", which is not the same as zero hours.
     *
     * Typed as `string | number` because that is what the control actually
     * produces: `ngModel` on `<input type="number">` emits a number once the
     * field parses and the empty string while it does not, so treating it as
     * a string threw on `.trim()` and the save silently did nothing.
     */
    standardHours: string | number;
  }>({ itemKey: '', itemType: 'SERVICE', unitPrice: 0, laborPrice: 0, standardHours: '' });
  protected readonly priceError = signal<PresentedError | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .get()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (config) => {
          this.config.set(config);
          this.state.set('ready');
          this.loadCatalog();
        },
        error: (err: PresentedError) => {
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
          this.error.set(err);
        },
      });
  }

  private loadCatalog(): void {
    this.api
      .catalog()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (items) => this.catalog.set(items) });
  }

  protected patch<K extends keyof FinanceConfigView>(key: K, value: FinanceConfigView[K]): void {
    const current = this.config();
    if (!current) return;
    this.save({ [key]: value } as Partial<FinanceConfigView>);
  }

  protected togglePaymentMethod(method: string): void {
    const current = this.config();
    if (!current) return;
    const set = new Set(current.paymentMethods);
    if (set.has(method)) set.delete(method);
    else set.add(method);
    this.save({ paymentMethods: [...set] });
  }

  private save(patch: Partial<FinanceConfigView>): void {
    this.saving.set(true);
    this.saveError.set(null);
    this.api
      .update(patch)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (config) => {
          this.saving.set(false);
          this.config.set(config);
        },
        error: (err: PresentedError) => {
          this.saving.set(false);
          this.saveError.set(err);
        },
      });
  }

  protected openAddPrice(): void {
    this.priceDraft.set({ itemKey: '', itemType: 'SERVICE', unitPrice: 0, laborPrice: 0, standardHours: '' });
    this.isEditing.set(false);
    this.priceError.set(null);
    this.showAddPrice.set(true);
  }

  protected openEditPrice(item: PriceCatalogItemView): void {
    const rate = Number(item.laborPrice ?? item.unitPrice ?? 0);
    this.priceDraft.set({
      itemKey: item.itemKey,
      itemType: item.itemType || 'SERVICE',
      unitPrice: rate,
      laborPrice: rate,
      standardHours: item.standardHours ?? '',
    });
    this.isEditing.set(true);
    this.priceError.set(null);
    this.showAddPrice.set(true);
  }

  protected submitPrice(): void {
    const draft = this.priceDraft();
    this.priceError.set(null);
    const labor = Number(draft.laborPrice ?? draft.unitPrice ?? 0);
    const hours = String(draft.standardHours ?? '').trim();
    this.api
      .setPrice({
        itemKey: draft.itemKey,
        itemType: draft.itemType || 'SERVICE',
        unitPrice: labor,
        laborPrice: labor,
        // Blank clears it rather than storing a zero: "we have not set a time"
        // and "this job takes no time" are different statements.
        standardHours: hours === '' ? null : Number(hours),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.showAddPrice.set(false);
          this.loadCatalog();
        },
        error: (err: PresentedError) => this.priceError.set(err),
      });
  }

  /**
   * How this workshop's estimate is shown, or that it has not made one.
   *
   * There was a `resolveStandardHours` here that produced a number by matching
   * words in the service's name -- "battery" meant 0.5 hours, "compressor"
   * 2.5, anything unrecognised 1.0 -- and the table rendered it beside a
   * padlock captioned "Locked Operational Benchmark". Nothing was locked and
   * nothing was a benchmark: every workshop in the product saw the same
   * invented figures and none of them could correct one. The number now comes
   * from the workshop's own catalogue row and this page is where it is set.
   */
  protected displayStandardHours(item: PriceCatalogItemView): string {
    return item.standardHours === null ? 'Not set' : `${Number(item.standardHours)}h`;
  }
}
