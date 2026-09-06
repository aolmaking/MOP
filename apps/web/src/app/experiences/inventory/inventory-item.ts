import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ErrorBanner } from '../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../ui/button/button.directive';
import { FormField } from '../../ui/form-field/form-field';
import { DismissOnEscapeDirective } from '../../ui/dismiss-on-escape/dismiss-on-escape.directive';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import { InventoryApi, type ItemDetail, type Movement } from './inventory.api';

type State = 'loading' | 'ready' | 'not-found' | 'forbidden' | 'error';

/**
 * "Why is this number what it is?"
 *
 * The ledger IS the page; the balance is just its last line. This is the
 * screen that makes the phase's governing rule true -- every number
 * traceable to the movements that produced it -- so the movements get the
 * space and the balance gets a strip.
 */
@Component({
  selector: 'app-inventory-item',
  imports: [RouterLink, ErrorBanner, ButtonDirective, FormField, DismissOnEscapeDirective],
  templateUrl: './inventory-item.html',
  styleUrl: './inventory-item.css',
})
export class InventoryItem {
  private readonly api = inject(InventoryApi);

  readonly id = input.required<string>();

  protected readonly detail = signal<ItemDetail | null>(null);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

  protected readonly movementModal = signal<'receive' | 'adjust' | null>(null);
  protected readonly targetWarehouseId = signal<string>('');
  protected readonly movementQty = signal<number>(1);
  protected readonly movementNotes = signal<string>('');
  protected readonly movementSaving = signal<boolean>(false);
  protected readonly movementError = signal<string | null>(null);

  constructor() {
    queueMicrotask(() => this.load());
  }

  protected load(): void {
    this.state.set('loading');
    this.api.item(this.id()).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.state.set('ready');
      },
      error: (err: PresentedError) => {
        this.error.set(err);
        if (err.httpStatus === 404) this.state.set('not-found');
        else if (err.httpStatus === 403) this.state.set('forbidden');
        else this.state.set('error');
      },
    });
  }

  protected readonly totals = computed(() => {
    const balances = this.detail()?.item.stockBalances ?? [];
    return balances.reduce(
      (sum, balance) => ({
        available: sum.available + balance.availableQty,
        reserved: sum.reserved + balance.reservedQty,
        damaged: sum.damaged + balance.damagedQty,
      }),
      { available: 0, reserved: 0, damaged: 0 },
    );
  });

  /**
   * Did the balance go up or down? Read from the ledger's own before/after
   * rather than from the movement type, so a type added later cannot make
   * the arrow disagree with the numbers beside it.
   */
  protected direction(movement: Movement): 'up' | 'down' | 'flat' {
    if (movement.afterQty > movement.beforeQty) return 'up';
    if (movement.afterQty < movement.beforeQty) return 'down';
    return 'flat';
  }

  protected label(value: string): string {
    return value.toLowerCase().replace(/_/g, ' ');
  }

  protected when(iso: string): string {
    const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
    if (hours < 1) return 'just now';
    if (hours < 24) return `${Math.floor(hours)}h ago`;
    const days = Math.floor(hours / 24);
    return days === 1 ? '1 day ago' : `${days} days ago`;
  }

  protected openReceive(): void {
    const balances = this.detail()?.item.stockBalances ?? [];
    const firstWh = balances[0]?.warehouseId ?? '';
    this.targetWarehouseId.set(firstWh);
    this.movementQty.set(10);
    this.movementNotes.set('');
    this.movementError.set(null);
    this.movementModal.set('receive');
  }

  protected openAdjust(): void {
    const balances = this.detail()?.item.stockBalances ?? [];
    const firstWh = balances[0]?.warehouseId ?? '';
    this.targetWarehouseId.set(firstWh);
    this.movementQty.set(0);
    this.movementNotes.set('');
    this.movementError.set(null);
    this.movementModal.set('adjust');
  }

  protected closeMovementModal(): void {
    this.movementModal.set(null);
  }

  protected submitMovement(): void {
    const modal = this.movementModal();
    const whId = this.targetWarehouseId();
    const qty = Number(this.movementQty());
    if (!whId) {
      this.movementError.set('Please select a warehouse');
      return;
    }
    if (modal === 'receive' && (!qty || qty <= 0)) {
      this.movementError.set('Quantity must be a positive whole number');
      return;
    }
    if (modal === 'adjust' && qty === 0) {
      this.movementError.set('Adjustment cannot be zero');
      return;
    }
    this.movementSaving.set(true);
    this.movementError.set(null);

    const action$ =
      modal === 'receive'
        ? this.api.receive(this.id(), whId, qty, this.movementNotes())
        : this.api.adjust(this.id(), whId, qty, this.movementNotes());

    action$.subscribe({
      next: () => {
        this.movementSaving.set(false);
        this.movementModal.set(null);
        this.load();
      },
      error: (err: PresentedError) => {
        this.movementSaving.set(false);
        this.movementError.set(err.message || 'Failed to record movement');
      },
    });
  }
}
