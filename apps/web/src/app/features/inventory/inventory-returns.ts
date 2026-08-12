import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../shared/error-banner/error-banner';
import { ButtonDirective } from '../../shared/button/button.directive';
import { FormField } from '../../shared/form-field/form-field';
import { ToastService } from '../../shared/toast/toast.service';
import type { PresentedError } from '../../core/api/error.interceptor';
import { InventoryApi, type MovementPage, type OpenReturn } from './inventory.api';

type Tab = 'queue' | 'ledger';
type QueueState = 'loading' | 'ready' | 'empty' | 'forbidden' | 'error';
type LedgerState = 'loading' | 'ready' | 'empty' | 'forbidden' | 'error';

const MOVEMENT_TYPES = [
  'ISSUE',
  'RETURN_TO_STOCK',
  'DAMAGED',
  'RETURN_PENDING',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'SUPPLIER_RECEIPT',
  'ADJUSTMENT',
] as const;

/**
 * Returns/Movements -- the append-only ledger, and the return-request
 * decision queue.
 *
 * Two tabs, not two pages, because they are two views over one question
 * ("what happened to this stock, and what's still undecided") rather
 * than two unrelated jobs -- and switching between them while chasing
 * one return is a real, common motion: was this item's quantity ever
 * actually issued before someone asks to send it back.
 *
 * The queue is a decision list, not a table: each row carries its own
 * four actions and, when clarification is outstanding, its own inline
 * question -- the same "items, not a grid of identical cells" instinct
 * the Attention Center uses, because a return with an open question
 * reads differently from one waiting on a plain accept/reject.
 */
@Component({
  selector: 'app-inventory-returns',
  imports: [ErrorBanner, ButtonDirective, FormField],
  templateUrl: './inventory-returns.html',
  styleUrl: './inventory-returns.css',
})
export class InventoryReturns {
  private readonly api = inject(InventoryApi);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tab = signal<Tab>('queue');
  protected readonly movementTypes = MOVEMENT_TYPES;

  // --- queue -----------------------------------------------------------

  protected readonly returns = signal<readonly OpenReturn[]>([]);
  protected readonly queueState = signal<QueueState>('loading');
  protected readonly queueError = signal<PresentedError | null>(null);
  protected readonly busyId = signal<string | null>(null);

  /** Which row's clarify/reject form is open. Null closes every one. */
  protected readonly openAction = signal<{ id: string; kind: 'accept' | 'reject' | 'clarify' } | null>(null);
  protected readonly formText = signal('');
  protected readonly formDamaged = signal(false);
  protected readonly warehouses = signal<readonly { id: string; name: string; code: string }[]>([]);
  protected readonly formWarehouseId = signal('');

  // --- ledger ------------------------------------------------------------

  protected readonly ledger = signal<MovementPage | null>(null);
  protected readonly ledgerState = signal<LedgerState>('loading');
  protected readonly ledgerError = signal<PresentedError | null>(null);
  protected readonly filterType = signal('');
  protected readonly filterPage = signal(1);

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil((this.ledger()?.total ?? 0) / (this.ledger()?.pageSize ?? 50))));

  constructor() {
    this.loadQueue();
    this.loadLedger();
    this.api
      .stock()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (table) => this.warehouses.set(table.warehouses), error: () => this.warehouses.set([]) });
  }

  protected selectTab(tab: Tab): void {
    this.tab.set(tab);
  }

  // --- queue actions -----------------------------------------------------

  protected loadQueue(): void {
    this.queueState.set('loading');
    this.api
      .openReturns()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ returns }) => {
          this.returns.set(returns);
          this.queueState.set(returns.length > 0 ? 'ready' : 'empty');
        },
        error: (err: PresentedError) => {
          this.queueError.set(err);
          this.queueState.set(err.httpStatus === 403 ? 'forbidden' : 'error');
        },
      });
  }

  protected startAccept(row: OpenReturn): void {
    this.openAction.set({ id: row.partRequestId, kind: 'accept' });
    this.formDamaged.set(false);
    this.formWarehouseId.set(this.warehouses()[0]?.id ?? '');
  }

  protected startReject(row: OpenReturn): void {
    this.openAction.set({ id: row.partRequestId, kind: 'reject' });
    this.formText.set('');
  }

  protected startClarify(row: OpenReturn): void {
    this.openAction.set({ id: row.partRequestId, kind: 'clarify' });
    this.formText.set('');
  }

  protected cancelAction(): void {
    this.openAction.set(null);
  }

  protected isOpen(row: OpenReturn, kind: 'accept' | 'reject' | 'clarify'): boolean {
    const action = this.openAction();
    return action?.id === row.partRequestId && action.kind === kind;
  }

  protected confirmAccept(row: OpenReturn): void {
    const warehouseId = this.formWarehouseId();
    if (!warehouseId) {
      this.toast.show('Pick which warehouse the part is going back into.', 'danger');
      return;
    }
    this.busyId.set(row.partRequestId);
    this.api
      .acceptReturn(row.partRequestId, warehouseId, row.quantity, this.formDamaged())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busyId.set(null);
          this.openAction.set(null);
          this.toast.show(
            this.formDamaged() ? `${row.itemName} accepted as damaged.` : `${row.itemName} back on the shelf.`,
            'success',
          );
          this.loadQueue();
        },
        error: (err: PresentedError) => {
          this.busyId.set(null);
          this.toast.show(err.message, 'danger');
        },
      });
  }

  protected confirmReject(row: OpenReturn): void {
    this.busyId.set(row.partRequestId);
    this.api
      .rejectReturn(row.partRequestId, this.formText().trim() || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busyId.set(null);
          this.openAction.set(null);
          this.toast.show(`Return of ${row.itemName} rejected.`, 'success');
          this.loadQueue();
        },
        error: (err: PresentedError) => {
          this.busyId.set(null);
          this.toast.show(err.message, 'danger');
        },
      });
  }

  protected confirmClarify(row: OpenReturn): void {
    const question = this.formText().trim();
    if (!question) {
      this.toast.show('Write what you need to ask.', 'danger');
      return;
    }
    this.busyId.set(row.partRequestId);
    this.api
      .requestReturnClarification(row.partRequestId, question)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busyId.set(null);
          this.openAction.set(null);
          this.toast.show('Question sent to the technician.', 'success');
          this.loadQueue();
        },
        error: (err: PresentedError) => {
          this.busyId.set(null);
          this.toast.show(err.message, 'danger');
        },
      });
  }

  /** dd MMM yyyy, HH:mm -- the same shape as the rest of the product. */
  protected when(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // --- ledger actions ------------------------------------------------

  protected onFilterType(value: string): void {
    this.filterType.set(value);
    this.filterPage.set(1);
    this.loadLedger();
  }

  protected goToPage(next: number): void {
    if (next < 1 || next > this.totalPages()) return;
    this.filterPage.set(next);
    this.loadLedger();
  }

  protected reloadLedger(): void {
    this.loadLedger();
  }

  private loadLedger(): void {
    this.ledgerState.set('loading');
    this.api
      .movements({ type: this.filterType() || undefined, page: this.filterPage() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.ledger.set(page);
          this.ledgerState.set(page.rows.length > 0 ? 'ready' : 'empty');
        },
        error: (err: PresentedError) => {
          this.ledgerError.set(err);
          this.ledgerState.set(err.httpStatus === 403 ? 'forbidden' : 'error');
        },
      });
  }

  /** A signed delta reads faster than "before/after" arithmetic in a dense table. */
  protected delta(row: { quantity: number; type: string }): string {
    const sign = row.quantity < 0 ? '' : '+';
    return `${sign}${row.quantity}`;
  }
}
