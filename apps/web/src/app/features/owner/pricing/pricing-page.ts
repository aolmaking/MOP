import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ErrorBanner } from '../../../shared/error-banner/error-banner';
import { ButtonDirective } from '../../../shared/button/button.directive';
import type { PresentedError } from '../../../core/api/error.interceptor';
import { ALL_PAYMENT_METHODS, PricingApi, type FinanceConfigView, type PriceCatalogItemView } from './pricing.api';

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
  imports: [FormsModule, ErrorBanner, ButtonDirective],
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
  protected readonly priceDraft = signal({ itemKey: '', itemType: 'SERVICE', unitPrice: 0, laborPrice: 0 });
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
    this.priceDraft.set({ itemKey: '', itemType: 'SERVICE', unitPrice: 0, laborPrice: 0 });
    this.priceError.set(null);
    this.showAddPrice.set(true);
  }

  protected submitPrice(): void {
    const draft = this.priceDraft();
    this.priceError.set(null);
    this.api
      .setPrice({
        itemKey: draft.itemKey,
        itemType: draft.itemType,
        unitPrice: draft.unitPrice,
        laborPrice: draft.laborPrice || undefined,
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
}
