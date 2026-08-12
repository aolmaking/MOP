import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../shared/error-banner/error-banner';
import { ButtonDirective } from '../../shared/button/button.directive';
import type { PresentedError } from '../../core/api/error.interceptor';
import { InventoryApi, type InventoryHome as HomeData, type ScopedCount } from './inventory.api';

type State = 'loading' | 'ready' | 'forbidden' | 'error';

/** What a card needs to render itself, flattened out of the response. */
interface TriageCard {
  readonly key: string;
  readonly label: string;
  /** What the number means when it is not zero, in the storekeeper's words. */
  readonly meaning: string;
  readonly count: ScopedCount;
  readonly link: string | null;
  readonly weight: 'urgent' | 'active' | 'quiet';
}

/**
 * Inventory Home -- daily triage.
 *
 * Cards, not a table. A table asserts its cells are comparable, and
 * "eleven pending requests" and "three items out of stock" are not the
 * same kind of number; putting them in one column would invite reading
 * them as one. The Stock page uses a table for exactly the opposite
 * reason, and that is the same rule producing a different answer.
 *
 * Two bands, because these are two different jobs. **Flow** is people
 * waiting on this desk right now. **Shelves** is what the room itself is
 * short of. A storekeeper clears the first band before lunch and works
 * the second band once a week, so mixing them into one grid would mean
 * neither reads as a queue.
 *
 * The per-warehouse breakdown is always in the DOM, never fetched on
 * expand -- an interaction that costs a request teaches people not to
 * use it, and "which warehouse" is the question this role asks most.
 */
@Component({
  selector: 'app-inventory-home',
  imports: [RouterLink, ErrorBanner, ButtonDirective],
  templateUrl: './inventory-home.html',
  styleUrl: './inventory-home.css',
})
export class InventoryHomePage {
  private readonly api = inject(InventoryApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly data = signal<HomeData | null>(null);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly expanded = signal<string | null>(null);

  /** True only when the breakdown answers a question a total cannot. */
  protected readonly multiWarehouse = computed(() => (this.data()?.warehouses.length ?? 0) > 1);

  protected readonly flow = computed<readonly TriageCard[]>(() => {
    const data = this.data();
    if (!data) return [];
    return [
      {
        key: 'pending',
        label: 'Pending requests',
        meaning: 'technicians waiting on a decision',
        count: data.pendingRequests,
        link: '/inventory/requests',
        weight: 'urgent',
      },
      {
        key: 'dispatch',
        label: 'To dispatch',
        meaning: 'approved, not yet handed over',
        count: data.toDispatch,
        link: '/inventory/requests',
        weight: 'active',
      },
      {
        key: 'arrival',
        label: 'Awaiting arrival',
        meaning: 'issued, receipt not confirmed',
        count: data.awaitingArrival,
        link: '/inventory/requests',
        weight: 'quiet',
      },
      {
        key: 'returns',
        label: 'Return requests',
        meaning: 'parts coming back, undecided',
        count: data.returnRequests,
        link: '/inventory/requests',
        weight: 'active',
      },
    ];
  });

  protected readonly shelves = computed<readonly TriageCard[]>(() => {
    const data = this.data();
    if (!data) return [];
    // Ordered by how soon each one hurts: out of stock is a technician
    // already blocked, critical is today, low is this week's ordering.
    return [
      {
        key: 'out',
        label: 'Out of stock',
        meaning: 'nothing on the shelf',
        count: data.outOfStock,
        link: '/inventory/stock',
        weight: 'urgent',
      },
      {
        key: 'critical',
        label: 'Critical',
        meaning: 'below the critical threshold',
        count: data.criticalStock,
        link: '/inventory/stock',
        weight: 'active',
      },
      {
        key: 'low',
        label: 'Low',
        meaning: 'below the low threshold',
        count: data.lowStock,
        link: '/inventory/stock',
        weight: 'quiet',
      },
    ];
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .home()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.data.set(data);
          this.state.set('ready');
        },
        error: (err: PresentedError) => {
          this.error.set(err);
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
        },
      });
  }

  protected toggle(key: string): void {
    this.expanded.update((current) => (current === key ? null : key));
  }

  /**
   * A breakdown is only offered when it says something the total does
   * not: more than one warehouse in scope, and the number actually
   * split across them. A disclosure that opens to one line is noise.
   */
  protected hasBreakdown(card: TriageCard): boolean {
    return this.multiWarehouse() && card.count.byWarehouse.length > 1;
  }

  /** Largest first -- the worst room is the one being looked for. */
  protected slices(card: TriageCard): readonly { warehouseId: string; code: string; count: number }[] {
    return [...card.count.byWarehouse].sort((a, b) => b.count - a.count);
  }

  protected share(card: TriageCard, count: number): string {
    return card.count.total > 0 ? `${Math.round((count / card.count.total) * 100)}%` : '0%';
  }

  /** Zero is a calm state, not a coloured one. */
  protected tone(card: TriageCard): string {
    return card.count.total === 0 ? 'clear' : card.weight;
  }
}
