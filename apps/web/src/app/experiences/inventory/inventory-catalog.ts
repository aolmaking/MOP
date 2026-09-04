import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Subject, debounceTime, map, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../ui/button/button.directive';
import { FormField } from '../../ui/form-field/form-field';
import { ToastService } from '../../ui/toast/toast.service';
import { OPERATING_CATEGORIES } from '@mop/shared';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import {
  InventoryApi,
  type CatalogConfiguration,
  type CatalogDraft,
  type CatalogItem,
  type CatalogPage,
  type ConfiguredAttribute,
} from './inventory.api';
import { DismissOnEscapeDirective } from '../../ui/dismiss-on-escape/dismiss-on-escape.directive';

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
  imports: [ErrorBanner, ButtonDirective, FormField, DismissOnEscapeDirective],
  templateUrl: './inventory-catalog.html',
  styleUrl: './inventory-catalog.css',
})
export class InventoryCatalog {
  private readonly api = inject(InventoryApi);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly categories = OPERATING_CATEGORIES;

  protected readonly page = signal<CatalogPage | null>(null);
  /**
   * The filter vocabulary, loaded once alongside the list.
   *
   * The item editor needs to know which filters the chosen category
   * offers, and that is configuration this page reads rather than owns
   * -- Catalog Builder writes it. Loading it here keeps the editor one
   * dialog instead of a trip to another route and back.
   */
  protected readonly configuration = signal<CatalogConfiguration | null>(null);
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

  /** Categories, flattened with their parent's name for readability. */
  protected readonly categoryOptions = computed(() => {
    const config = this.configuration();
    if (!config) return [] as { id: string; name: string }[];
    const flatten = (
      nodes: CatalogConfiguration['categories'],
      prefix: string,
    ): { id: string; name: string }[] =>
      nodes.flatMap((node) => [
        { id: node.id, name: prefix ? `${prefix} › ${node.name}` : node.name },
        ...flatten(node.children, prefix ? `${prefix} › ${node.name}` : node.name),
      ]);
    return flatten(config.categories, '');
  });

  /**
   * The filters the chosen category offers -- including the ones it
   * inherits from its parent, since a technician browsing "Brakes" and
   * one browsing "Brakes › Pads" both see the parent's filters.
   */
  protected readonly applicableFilters = computed<readonly ConfiguredAttribute[]>(() => {
    const config = this.configuration();
    const categoryId = this.draft().catalogCategoryId;
    if (!config || !categoryId) return [];

    const chain = new Set<string>();
    const walk = (nodes: CatalogConfiguration['categories'], ancestors: string[]): void => {
      for (const node of nodes) {
        if (node.id === categoryId) {
          for (const id of [...ancestors, node.id]) chain.add(id);
          return;
        }
        walk(node.children, [...ancestors, node.id]);
      }
    };
    walk(config.categories, []);

    return config.attributes.filter(
      (attribute) => attribute.isActive && attribute.usedByCategoryIds.some((id) => chain.has(id)),
    );
  });

  protected hasValue(valueId: string): boolean {
    return (this.draft().attributeValueIds ?? []).includes(valueId);
  }

  protected toggleValue(valueId: string): void {
    this.draft.update((draft) => {
      const current = draft.attributeValueIds ?? [];
      return {
        ...draft,
        attributeValueIds: current.includes(valueId)
          ? current.filter((id) => id !== valueId)
          : [...current, valueId],
      };
    });
  }

  /* ------------------------------------------------------------------ *
   * Creating a category or a filter without leaving the part.
   *
   * The old shape sent a storekeeper away to Catalog Builder the moment
   * the category or filter they needed did not exist yet -- cancel this
   * dialog, build it there, come back, remember what you were filing.
   * Filing a part and shaping the taxonomy it needs are one job in
   * practice, so both now happen inline, in this editor, using the same
   * server endpoints Catalog Builder uses. Nothing here duplicates that
   * page's authority: a filter invented here is the same workshop-wide
   * `CatalogAttribute` row, reusable by every other category exactly as
   * if it had been built there.
   * ------------------------------------------------------------------ */

  protected readonly creatingCategory = signal(false);
  protected readonly newCategoryName = signal('');
  protected readonly newCategoryParentId = signal('');

  protected readonly creatingFilterForItem = signal(false);
  protected readonly newFilterLabelForItem = signal('');
  protected readonly newFilterFirstValueForItem = signal('');

  protected readonly attachFilterChoice = signal('');

  /** Top-level categories only -- one level of nesting, so only these may be a parent. */
  protected readonly topLevelCategories = computed(() =>
    (this.configuration()?.categories ?? []).map((node) => ({ id: node.id, name: node.name })),
  );

  /** Active filters not already offered by the selected category. */
  protected readonly attachableFilters = computed<readonly ConfiguredAttribute[]>(() => {
    const categoryId = this.draft().catalogCategoryId;
    const config = this.configuration();
    if (!categoryId || !config) return [];
    const own = new Set(this.findCategory(categoryId)?.attributeIds ?? []);
    return config.attributes.filter((attribute) => attribute.isActive && !own.has(attribute.id));
  });

  protected onCategorySelect(value: string): void {
    if (value === '__new__') {
      this.saveError.set(null);
      this.newCategoryName.set('');
      this.newCategoryParentId.set('');
      this.creatingCategory.set(true);
      return;
    }
    this.creatingCategory.set(false);
    this.patch('catalogCategoryId', value || undefined);
  }

  protected cancelNewCategory(): void {
    this.creatingCategory.set(false);
  }

  protected saveNewCategory(): void {
    const name = this.newCategoryName().trim();
    if (!name) {
      this.saveError.set('A category needs a name.');
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);
    this.api
      .createCategory({ name, parentId: this.newCategoryParentId() || undefined })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (category) => {
          this.saving.set(false);
          this.creatingCategory.set(false);
          this.patch('catalogCategoryId', category.id);
          this.toast.show(`${category.name} added.`, 'success');
          this.reloadConfiguration();
        },
        error: (err: PresentedError) => {
          this.saving.set(false);
          this.saveError.set(err.message ?? 'That could not be saved.');
        },
      });
  }

  protected startNewFilterForItem(): void {
    this.saveError.set(null);
    this.creatingFilterForItem.set(true);
    this.newFilterLabelForItem.set('');
    this.newFilterFirstValueForItem.set('');
  }

  protected cancelNewFilterForItem(): void {
    this.creatingFilterForItem.set(false);
  }

  /**
   * Invents a filter, gives it its first value, attaches it to the
   * category this part is filed under, and stamps that value on the
   * part being edited -- the whole reason a manager would open this
   * mid-edit rather than finish the part first.
   */
  protected saveNewFilterForItem(): void {
    const categoryId = this.draft().catalogCategoryId;
    const label = this.newFilterLabelForItem().trim();
    const firstValue = this.newFilterFirstValueForItem().trim();
    if (!categoryId) return;
    if (!label) {
      this.saveError.set('A filter needs a name.');
      return;
    }
    if (!firstValue) {
      this.saveError.set('Give it at least one value to start with.');
      return;
    }

    const ownIds = this.findCategory(categoryId)?.attributeIds ?? [];

    this.saving.set(true);
    this.saveError.set(null);
    this.api
      .createAttribute({ label })
      .pipe(
        switchMap((attribute) =>
          this.api.addAttributeValue(attribute.id, { label: firstValue }).pipe(map((value) => ({ attribute, value }))),
        ),
        switchMap(({ attribute, value }) =>
          this.api.setCategoryAttributes(categoryId, [...ownIds, attribute.id]).pipe(map(() => ({ attribute, value }))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ attribute, value }) => {
          this.saving.set(false);
          this.creatingFilterForItem.set(false);
          this.toggleValue(value.id);
          this.toast.show(`${attribute.label} added, with "${firstValue}".`, 'success');
          this.reloadConfiguration();
        },
        error: (err: PresentedError) => {
          this.saving.set(false);
          this.saveError.set(err.message ?? 'That could not be saved.');
        },
      });
  }

  /** Attaches a filter that already exists elsewhere to this category. */
  protected attachExistingFilter(): void {
    const categoryId = this.draft().catalogCategoryId;
    const attributeId = this.attachFilterChoice();
    if (!categoryId || !attributeId) return;

    const ownIds = this.findCategory(categoryId)?.attributeIds ?? [];

    this.saving.set(true);
    this.saveError.set(null);
    this.api
      .setCategoryAttributes(categoryId, [...ownIds, attributeId])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.attachFilterChoice.set('');
          this.toast.show('Filter attached to this category.', 'success');
          this.reloadConfiguration();
        },
        error: (err: PresentedError) => {
          this.saving.set(false);
          this.saveError.set(err.message ?? 'That could not be attached.');
        },
      });
  }

  private findCategory(categoryId: string): CatalogConfiguration['categories'][number] | null {
    const config = this.configuration();
    if (!config) return null;
    const walk = (
      nodes: CatalogConfiguration['categories'],
    ): CatalogConfiguration['categories'][number] | null => {
      for (const node of nodes) {
        if (node.id === categoryId) return node;
        const found = walk(node.children);
        if (found) return found;
      }
      return null;
    };
    return walk(config.categories);
  }

  private reloadConfiguration(): void {
    this.api
      .catalogConfiguration()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (config) => this.configuration.set(config), error: () => this.configuration.set(null) });
  }

  private readonly refresh = new Subject<void>();

  constructor() {
    this.refresh
      .pipe(
        // Debounce on typing only; the first load goes straight out.
        debounceTime(200),
        switchMap(() =>
          this.api.catalog({
            q: this.query().trim() || undefined,
            categoryId: this.category() || undefined,
            stockTracked: this.trackedOnly() ? true : undefined,
            page: this.pageNumber(),
          }),
        ),
        takeUntilDestroyed(),
      )
      .subscribe({ next: (page) => this.receive(page), error: (err: PresentedError) => this.fail(err) });

    this.fetchNow();

    // Configuration changes far less often than the list, so it is
    // fetched once rather than with every filter change -- and again
    // after any inline category/filter creation reshapes it.
    this.reloadConfiguration();
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
      catalogCategoryId: item.catalogCategoryId ?? undefined,
      compatibleCategories: [...item.compatibleCategories],
      attributeValueIds: [...item.attributeValueIds],
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
      imageUrl: item.imageUrl ?? undefined,
      summary: item.summary ?? undefined,
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
        categoryId: this.category() || undefined,
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
