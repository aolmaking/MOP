import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, switchMap } from 'rxjs';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import {
  TechnicianApi,
  type PartCard,
  type PartCategoryNode,
  type PartsCatalogPage,
} from './technician.api';
import {
  CustomerPortalApi,
  type CustomerPosOrderResult,
} from '../customer/customer-portal.api';
import { OperatorApi } from '../operator/operator.api';

export interface CartLine {
  readonly item: PartCard;
  readonly quantity: number;
}

type State = 'loading' | 'ready' | 'empty' | 'no-results' | 'unconfigured' | 'forbidden' | 'error';

/** Matches `MAX_CART_LINE_QUANTITY` on the server. */
const MAX_LINE = 999;

/**
 * Asking the store for parts, as shopping rather than as a form.
 * Supports technician work-order requisition, customer over-the-counter POS, and operator front-desk POS.
 */
@Component({
  selector: 'app-parts-catalog',
  imports: [RouterLink],
  templateUrl: './parts-catalog.html',
  styleUrl: './parts-catalog.css',
})
export class PartsCatalog {
  private readonly api = inject(TechnicianApi);
  private readonly customerApi = inject(CustomerPortalApi);
  private readonly operatorApi = inject(OperatorApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Optional because customer POS (/customer/pos) and operator POS (/operator/pos) do not have a route id */
  readonly id = input<string>('');
  /** Optional category name/slug passed via query param to pre-filter catalog */
  readonly category = input<string>('');

  /** Technician mode vs Operator reception POS vs Customer over-the-counter POS mode */
  readonly isTechMode = computed(() => this.router.url.includes('/tech'));
  readonly isOperatorMode = computed(() => this.router.url.includes('/operator'));
  readonly isCustomerMode = computed(() => !this.isTechMode() && !this.isOperatorMode());

  protected readonly page = signal<PartsCatalogPage | null>(null);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<string | null>(null);

  protected readonly query = signal('');
  protected readonly categoryId = signal<string | null>(null);
  protected readonly inStockOnly = signal(false);
  protected readonly pageNumber = signal(1);
  /** attributeId -> chosen valueIds. Empty until a filter is touched. */
  protected readonly selected = signal<Record<string, string[]>>({});

  protected readonly cart = signal<readonly CartLine[]>([]);
  protected readonly cartOpen = signal(false);
  protected readonly submitting = signal(false);
  protected readonly submitted = signal<number | null>(null);
  protected readonly customerOrderResult = signal<CustomerPosOrderResult | null>(null);

  /* ------------------------------------------------------------------ *
   * Part from outside (Strictly enabled ONLY when opened from tech page)
   * ------------------------------------------------------------------ */
  protected readonly externalModalOpen = signal(false);
  protected readonly externalPartName = signal('');
  protected readonly externalProvenance = signal<'CUSTOMER_SUPPLIED' | 'EXTERNAL_PURCHASE'>('CUSTOMER_SUPPLIED');
  protected readonly externalQuantity = signal('1');
  protected readonly externalSubmitting = signal(false);
  protected readonly externalError = signal<string | null>(null);
  protected readonly externalSuccess = signal<string | null>(null);
  protected readonly externalNameValid = computed(() => this.externalPartName().trim().length >= 1);

  protected openExternalModal(): void {
    if (!this.isTechMode()) return;
    this.externalError.set(null);
    this.externalModalOpen.set(true);
  }

  protected closeExternalModal(): void {
    this.externalModalOpen.set(false);
    this.externalPartName.set('');
    this.externalQuantity.set('1');
    this.externalError.set(null);
  }

  protected recordExternalPart(): void {
    if (!this.isTechMode() || !this.externalNameValid() || this.externalSubmitting()) return;
    const quantity = Number(this.externalQuantity().trim());
    if (!Number.isInteger(quantity) || quantity < 1) {
      this.externalError.set('Say how many — a whole number, at least one.');
      return;
    }

    const name = this.externalPartName().trim();
    const provenance = this.externalProvenance();
    this.externalSubmitting.set(true);
    this.externalError.set(null);

    this.api
      .addExternalPart(this.id(), name, provenance, quantity)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.externalSubmitting.set(false);
          this.externalSuccess.set(`Recorded external part: ${name} (${quantity}x) on job card.`);
          this.closeExternalModal();
        },
        error: (err: PresentedError) => {
          this.externalSubmitting.set(false);
          this.externalError.set(err.message ?? 'Failed to record external part.');
        },
      });
  }

  /**
   * Minted once per cart target and kept in session storage.
   */
  private readonly cartKey = signal<string>('');

  protected readonly cartCount = computed(() => this.cart().reduce((sum, line) => sum + line.quantity, 0));
  protected readonly cartLines = computed(() => this.cart().length);
  protected readonly cartTotalAmount = computed(() => {
    let sum = 0;
    for (const line of this.cart()) {
      const price = parseFloat(line.item.sellingPrice.replace(/[^0-9.]/g, '')) || 0;
      sum += price * line.quantity;
    }
    return sum > 0 ? `$${sum.toFixed(2)}` : null;
  });

  /** Categories flattened for the chip rail: parents, then their children. */
  protected readonly categoryChips = computed(() => {
    const flatten = (nodes: readonly PartCategoryNode[], depth: number): { node: PartCategoryNode; depth: number }[] =>
      nodes.flatMap((node) => [{ node, depth }, ...flatten(node.children, depth + 1)]);
    return flatten(this.page()?.categories ?? [], 0);
  });

  protected readonly filters = computed(() => this.page()?.filters ?? []);
  protected readonly items = computed(() => this.page()?.items ?? []);
  protected readonly total = computed(() => this.page()?.total ?? 0);
  protected readonly totalPages = computed(() => {
    const current = this.page();
    return current ? Math.max(1, Math.ceil(current.total / current.pageSize)) : 1;
  });

  /** How many of this part are already in the basket, for the card. */
  protected inCart(item: PartCard): number {
    return this.cart().find((line) => line.item.id === item.id)?.quantity ?? 0;
  }

  protected readonly activeFilterCount = computed(() =>
    Object.values(this.selected()).reduce((sum, values) => sum + values.length, 0),
  );

  private readonly refresh = new Subject<void>();

  constructor() {
    effect(() => {
      const targetId = this.isTechMode() ? this.id() : 'customer-pos';
      if (this.cartKey()) return;
      this.cartKey.set(this.restoreKey(targetId));
    });

    effect(() => {
      const catParam = this.category()?.trim().toLowerCase();
      const pageData = this.page();
      if (catParam && pageData && !this.categoryId()) {
        const flatten = (nodes: readonly PartCategoryNode[]): PartCategoryNode[] =>
          nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
        const allCats = flatten(pageData.categories);
        const match = allCats.find(
          (c) => c.name.toLowerCase().includes(catParam) || c.id.toLowerCase().includes(catParam)
        );
        if (match) {
          untracked(() => {
            this.categoryId.set(match.id);
            this.fetchNow();
          });
        }
      }
    });

    this.refresh
      .pipe(
        debounceTime(220),
        switchMap(() =>
          this.isTechMode()
            ? this.api.partsCatalog(this.currentQuery())
            : this.customerApi.partsCatalog(this.currentQuery()),
        ),
        takeUntilDestroyed(),
      )
      .subscribe({ next: (result) => this.receive(result), error: (err: PresentedError) => this.fail(err) });

    this.fetchNow();
  }

  /* ------------------------------------------------------------------ *
   * Browsing
   * ------------------------------------------------------------------ */

  protected onQuery(value: string): void {
    this.query.set(value);
    this.pageNumber.set(1);
    this.state.set('loading');
    this.refresh.next();
  }

  /**
   * Changing category clears the filters. It has to: filters belong to a
   * category, and a "Brand" selection carried into Body Parts would
   * silently filter by an attribute that category does not even offer.
   */
  protected chooseCategory(id: string | null): void {
    this.categoryId.set(this.categoryId() === id ? null : id);
    this.selected.set({});
    this.pageNumber.set(1);
    this.fetchNow();
  }

  protected toggleFilterValue(attributeId: string, valueId: string): void {
    this.selected.update((current) => {
      const chosen = current[attributeId] ?? [];
      const next = chosen.includes(valueId) ? chosen.filter((id) => id !== valueId) : [...chosen, valueId];
      const updated = { ...current };
      if (next.length === 0) delete updated[attributeId];
      else updated[attributeId] = next;
      return updated;
    });
    this.pageNumber.set(1);
    this.fetchNow();
  }

  protected clearFilters(): void {
    this.selected.set({});
    this.pageNumber.set(1);
    this.fetchNow();
  }

  protected toggleInStock(): void {
    this.inStockOnly.update((value) => !value);
    this.pageNumber.set(1);
    this.fetchNow();
  }

  protected goToPage(next: number): void {
    if (next < 1 || next > this.totalPages()) return;
    this.pageNumber.set(next);
    this.fetchNow();
  }

  /* ------------------------------------------------------------------ *
   * The cart
   * ------------------------------------------------------------------ */

  /**
   * Adding a part already in the basket adds to the line rather than
   * making a second one. Two lines for one part is a basket a technician
   * has to reconcile in their head, and the store would get two requests
   * for the same shelf.
   */
  protected add(item: PartCard, delta = 1): void {
    this.submitted.set(null);
    this.cart.update((lines) => {
      const existing = lines.find((line) => line.item.id === item.id);
      if (!existing) return delta > 0 ? [...lines, { item, quantity: Math.min(delta, MAX_LINE) }] : lines;

      const quantity = existing.quantity + delta;
      if (quantity <= 0) return lines.filter((line) => line.item.id !== item.id);
      return lines.map((line) =>
        line.item.id === item.id ? { item, quantity: Math.min(quantity, MAX_LINE) } : line,
      );
    });
    this.persistCart();
  }

  protected setQuantity(item: PartCard, raw: string): void {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return;
    const quantity = Math.max(0, Math.min(parsed, MAX_LINE));
    this.cart.update((lines) =>
      quantity === 0
        ? lines.filter((line) => line.item.id !== item.id)
        : lines.map((line) => (line.item.id === item.id ? { item: line.item, quantity } : line)),
    );
    this.persistCart();
  }

  protected remove(item: PartCard): void {
    this.cart.update((lines) => lines.filter((line) => line.item.id !== item.id));
    this.persistCart();
  }

  protected emptyCart(): void {
    this.cart.set([]);
    this.persistCart();
  }

  protected toggleCart(): void {
    this.cartOpen.update((open) => !open);
  }

  /**
   * Send the basket.
   *
   * The submit is disabled while in flight rather than merely ignored:
   * the key makes a duplicate harmless, but a technician who can press
   * twice will, and the honest thing is to show them it is going.
   */
  protected submit(): void {
    const lines = this.cart();
    if (lines.length === 0 || this.submitting()) return;

    this.submitting.set(true);
    this.error.set(null);

    if (this.isTechMode()) {
      this.api
        .submitCart(
          this.id(),
          this.cartKey(),
          lines.map((line) => ({ inventoryItemId: line.item.id, quantity: line.quantity })),
        )
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (result) => {
            this.submitting.set(false);
            this.submitted.set(result.requests.length);
            this.cart.set([]);
            this.cartOpen.set(false);
            this.cartKey.set(this.mintKey());
            this.persistCart();
          },
          error: (err: PresentedError) => {
            this.submitting.set(false);
            this.error.set(err.message ?? 'The store could not be reached. Try again.');
          },
        });
    } else if (this.isOperatorMode()) {
      // Operator Reception Point of Sale direct order
      this.operatorApi
        .submitPosOrder({
          lines: lines.map((line) => ({ inventoryItemId: line.item.id, quantity: line.quantity })),
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (result) => {
            this.submitting.set(false);
            this.customerOrderResult.set(result);
            this.cart.set([]);
            this.cartOpen.set(false);
            this.cartKey.set(this.mintKey());
            this.persistCart();
          },
          error: (err: PresentedError) => {
            this.submitting.set(false);
            this.error.set(err.message ?? 'Could not place POS order. Try again.');
          },
        });
    } else {
      // Customer Point of Sale direct order
      this.customerApi
        .submitPosOrder({
          lines: lines.map((line) => ({ inventoryItemId: line.item.id, quantity: line.quantity })),
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (result) => {
            this.submitting.set(false);
            this.customerOrderResult.set(result);
            this.cart.set([]);
            this.cartOpen.set(false);
            this.cartKey.set(this.mintKey());
            this.persistCart();
          },
          error: (err: PresentedError) => {
            this.submitting.set(false);
            this.error.set(err.message ?? 'Could not place POS order. Try again.');
          },
        });
    }
  }

  protected backToCard(): void {
    if (this.isTechMode()) {
      void this.router.navigate(['/tech', 'card', this.id()]);
    } else if (this.isOperatorMode()) {
      void this.router.navigate(['/operator']);
    } else {
      void this.router.navigate(['/customer']);
    }
  }

  /* ------------------------------------------------------------------ *
   * Plumbing
   * ------------------------------------------------------------------ */

  private currentQuery() {
    return {
      q: this.query().trim() || undefined,
      categoryId: this.categoryId() ?? undefined,
      attributes: this.selected(),
      inStockOnly: this.inStockOnly(),
      page: this.pageNumber(),
    };
  }

  private fetchNow(): void {
    this.state.set('loading');
    const query = this.currentQuery();
    const req$ = this.isTechMode()
      ? this.api.partsCatalog(query)
      : this.isOperatorMode()
        ? this.operatorApi.posCatalog(query)
        : this.customerApi.partsCatalog(query);
    req$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (result) => this.receive(result), error: (err: PresentedError) => this.fail(err) });
  }

  private receive(result: PartsCatalogPage): void {
    this.page.set(result);
    this.restoreCartAgainst(result.items);

    if (result.items.length > 0) {
      this.state.set('ready');
      return;
    }
    const filtering = Boolean(this.query().trim() || this.categoryId() || this.activeFilterCount() || this.inStockOnly());
    if (filtering) {
      this.state.set('no-results');
      return;
    }
    // Nothing here AND nothing configured is a different problem from an
    // empty search, and it needs a different sentence: the technician
    // cannot fix it, the inventory manager can.
    this.state.set(result.categories.length === 0 ? 'unconfigured' : 'empty');
  }

  private fail(err: PresentedError): void {
    this.error.set(err.message ?? 'The catalogue could not be loaded.');
    this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
  }

  private storageKey(targetId: string): string {
    const key = targetId || (this.isTechMode() ? this.id() : 'customer-pos');
    return `mop.parts-cart.${key}`;
  }

  private mintKey(): string {
    const random = globalThis.crypto?.randomUUID?.();
    return random ?? `cart-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private restoreKey(workOrderId: string): string {
    try {
      const raw = sessionStorage.getItem(this.storageKey(workOrderId));
      if (raw) {
        const parsed = JSON.parse(raw) as { cartKey?: string; lines?: { id: string; quantity: number }[] };
        if (parsed.cartKey) {
          this.pendingLines = parsed.lines ?? [];
          return parsed.cartKey;
        }
      }
    } catch {
      // Storage unavailable or corrupt. A fresh basket is the right
      // fallback -- losing an unsent cart beats losing the page.
    }
    return this.mintKey();
  }

  /**
   * Lines read back from storage, waiting for the catalogue that
   * describes them. A card is a server shape, so the basket cannot be
   * rebuilt from ids alone.
   */
  private pendingLines: { id: string; quantity: number }[] = [];

  private restoreCartAgainst(items: readonly PartCard[]): void {
    if (this.pendingLines.length === 0) return;
    const found = this.pendingLines
      .map((line) => {
        const item = items.find((candidate) => candidate.id === line.id);
        return item ? { item, quantity: line.quantity } : null;
      })
      .filter((line): line is CartLine => line !== null);

    if (found.length > 0) {
      const known = new Set(found.map((line) => line.item.id));
      this.cart.update((lines) => [...lines, ...found.filter((line) => !lines.some((l) => l.item.id === line.item.id))]);
      this.pendingLines = this.pendingLines.filter((line) => !known.has(line.id));
    }
  }

  private persistCart(): void {
    try {
      sessionStorage.setItem(
        this.storageKey(this.id()),
        JSON.stringify({
          cartKey: this.cartKey(),
          lines: this.cart().map((line) => ({ id: line.item.id, quantity: line.quantity })),
        }),
      );
    } catch {
      // Same reasoning as restore: the basket in memory still works.
    }
  }
}
