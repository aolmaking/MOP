import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../shared/error-banner/error-banner';
import { ButtonDirective } from '../../shared/button/button.directive';
import { FormField } from '../../shared/form-field/form-field';
import { ToastService } from '../../shared/toast/toast.service';
import { OPERATING_CATEGORIES } from '@mop/shared';
import type { PresentedError } from '../../core/api/error.interceptor';
import { InventoryApi, type CatalogDraft, type CatalogItem, type CatalogPage } from './inventory.api';

type State = 'loading' | 'ready' | 'empty' | 'no-results' | 'forbidden' | 'error';

const PAGE_SIZE = 50;

function emptyDraft(): CatalogDraft {
  return {
    sku: '',
    name: '',
    itemType: 'PART',
    sellingPrice: '',
    compatibleCategories: [],
    lowStockThreshold: 0,
    criticalStockThreshold: 0,
    workOrderUsable: true,
    posVisible: true,
    stockTracked: true,
  };
}

/**
 * Catalog Control -- item master data.
 *
 * Despite the name inherited from the canonical spec, this is not a
 * cashier's POS. It is where an item's identity, pricing and thresholds
 * live, and the one thing it deliberately cannot do is set a quantity:
 * stock is a balance produced by movements, and a catalog form that
 * could change it would be a second way to move stock without a
 * movement -- the exact thing the ledger exists to prevent. The list
 * still SHOWS on-hand, because knowing what you have while editing an
 * item is useful; it is a read, not a field.
 *
 * List and editor share the page rather than living on two routes. The
 * work here is comparative -- "what did I set the threshold to on the
 * other brake pad?" -- and a full-page navigation loses that.
 */
@Component({
  selector: 'app-inventory-catalog',
  imports: [ErrorBanner, ButtonDirective, FormField],
  templateUrl: './inventory-catalog.html',
  styleUrl: './inventory-catalog.css',
})
export class InventoryCatalog {
  private readonly api = inject(InventoryApi);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly categories = OPERATING_CATEGORIES;

  protected readonly page = signal<CatalogPage | null>(null);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

  protected readonly query = signal('');
  protected readonly category = signal('');
  protected readonly trackedOnly = signal(false);
  protected readonly pageNumber = signal(1);

  /** Null when the editor is closed; the id, or 'new'. */
  protected readonly editing = signal<string | null>(null);
  protected readonly draft = signal<CatalogDraft>(emptyDraft());
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  /**
   * Cost visibility is inferred from the response, never asked for
   * separately. The server omits `cost` when this reader may not see it,
   * so there is nothing to leak and nothing to keep in sync -- if any
   * item came back with a cost, this reader is allowed it.
   */
  protected readonly maySeeCost = computed(() => this.page()?.items.some((item) => item.cost !== null) ?? false);

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil((this.page()?.total ?? 0) / PAGE_SIZE)));

  private readonly refresh = new Subject<void>();

  constructor() {
    this.refresh
      .pipe(
        // Debounce on typing only; the first load goes straight out.
        debounceTime(200),
        switchMap(() =>
          this.api.catalog({
            q: this.query().trim() || undefined,
            category: this.category() || undefined,
            stockTracked: this.trackedOnly() ? true : undefined,
            page: this.pageNumber(),
          }),
        ),
        takeUntilDestroyed(),
      )
      .subscribe({ next: (page) => this.receive(page), error: (err: PresentedError) => this.fail(err) });

    this.fetchNow();
  }

  protected onQuery(value: string): void {
    this.query.set(value);
    this.pageNumber.set(1);
    this.state.set('loading');
    this.refresh.next();
  }

  protected onCategory(value: string): void {
    this.category.set(value);
    this.pageNumber.set(1);
    this.fetchNow();
  }

  protected onTracked(value: boolean): void {
    this.trackedOnly.set(value);
    this.pageNumber.set(1);
    this.fetchNow();
  }

  protected goToPage(next: number): void {
    if (next < 1 || next > this.totalPages()) return;
    this.pageNumber.set(next);
    this.fetchNow();
  }

  protected startNew(): void {
    this.saveError.set(null);
    this.draft.set(emptyDraft());
    this.editing.set('new');
  }

  protected startEdit(item: CatalogItem): void {
    this.saveError.set(null);
    this.draft.set({
      sku: item.sku,
      name: item.name,
      itemType: item.itemType,
      category: item.category ?? undefined,
      subcategory: item.subcategory ?? undefined,
      compatibleCategories: [...item.compatibleCategories],
      lowStockThreshold: item.lowStockThreshold,
      criticalStockThreshold: item.criticalStockThreshold,
      sellingPrice: item.sellingPrice,
      // Undefined rather than empty when hidden, so saving an item you
      // cannot see the cost of does not wipe it.
      cost: item.cost ?? undefined,
      workOrderUsable: item.workOrderUsable,
      posVisible: item.posVisible,
      stockTracked: item.stockTracked,
      barcode: item.barcode ?? undefined,
      supplier: item.supplier ?? undefined,
      notes: item.notes ?? undefined,
    });
    this.editing.set(item.id);
  }

  protected cancelEdit(): void {
    this.editing.set(null);
    this.saveError.set(null);
  }

  protected patch<K extends keyof CatalogDraft>(key: K, value: CatalogDraft[K]): void {
    this.draft.update((draft) => ({ ...draft, [key]: value }));
  }

  protected patchNumber(key: 'lowStockThreshold' | 'criticalStockThreshold', raw: string): void {
    const parsed = Number.parseInt(raw, 10);
    this.patch(key, Number.isFinite(parsed) && parsed >= 0 ? parsed : 0);
  }

  /**
   * A part that fits cars and motorcycles is entered once with both,
   * never duplicated per category -- the spec is explicit, so the
   * control is a multi-select rather than a single choice.
   */
  protected toggleCategory(code: string): void {
    this.draft.update((draft) => {
      const current = draft.compatibleCategories ?? [];
      return {
        ...draft,
        compatibleCategories: current.includes(code)
          ? current.filter((entry) => entry !== code)
          : [...current, code],
      };
    });
  }

  protected isCompatible(code: string): boolean {
    return (this.draft().compatibleCategories ?? []).includes(code);
  }

  protected save(): void {
    const draft = this.draft();
    const id = this.editing();
    if (!id) return;

    if (!draft.sku.trim() || !draft.name.trim()) {
      this.saveError.set('An item needs a name and a SKU.');
      return;
    }
    // Money is a string end to end. Validated by shape, never parsed
    // into a number to check it.
    if (!/^\d+(\.\d{1,2})?$/.test(draft.sellingPrice.trim())) {
      this.saveError.set('Selling price must be an amount like 250 or 250.00.');
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    const request = id === 'new' ? this.api.createItem(draft) : this.api.updateItem(id, draft);

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (item) => {
        this.saving.set(false);
        this.editing.set(null);
        this.toast.show(id === 'new' ? `${item.name} added to the catalog.` : `${item.name} updated.`, 'success');
        this.fetchNow();
      },
      error: (err: PresentedError) => {
        this.saving.set(false);
        // A SKU clash is refused rather than auto-suffixed, so it has to
        // be readable here -- the storekeeper must pick another.
        this.saveError.set(err.message);
      },
    });
  }

  protected reload(): void {
    this.fetchNow();
  }

  private fetchNow(): void {
    this.state.set('loading');
    this.api
      .catalog({
        q: this.query().trim() || undefined,
        category: this.category() || undefined,
        stockTracked: this.trackedOnly() ? true : undefined,
        page: this.pageNumber(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (page) => this.receive(page), error: (err: PresentedError) => this.fail(err) });
  }

  private receive(page: CatalogPage): void {
    this.page.set(page);
    if (page.items.length > 0) this.state.set('ready');
    else this.state.set(this.query().trim() || this.category() ? 'no-results' : 'empty');
  }

  private fail(err: PresentedError): void {
    this.error.set(err);
    this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
  }
}
