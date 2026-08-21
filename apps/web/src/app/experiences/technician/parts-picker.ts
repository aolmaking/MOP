import { Component, computed, input, output, signal } from '@angular/core';
import type { PartCard } from './technician.api';

export interface PartRequestChoice {
  readonly part: PartCard;
  readonly quantity: number;
}

/**
 * Choosing a part off the workshop's own catalogue.
 *
 * Cards, not a SKU box: a technician knows the part by sight and by
 * price, and typing an identifier one-handed at a car is how the wrong
 * part gets requested.
 *
 * Split out of the Work Card when that component crossed the project's
 * 8 kB CSS budget -- the same remedy `work-order-workspace` used for its
 * dossier drawer. It earns its own file either way: a catalogue, a
 * choice and a quantity is a self-contained job.
 *
 * Knows nothing about HTTP. The Work Card owns loading and sending; this
 * owns what a technician sees and presses.
 */
@Component({
  selector: 'app-parts-picker',
  templateUrl: './parts-picker.html',
  styleUrl: './parts-picker.css',
})
export class PartsPicker {
  readonly catalog = input.required<readonly PartCard[] | null>();
  readonly loading = input(false);
  readonly busy = input(false);

  readonly chosen = output<PartRequestChoice>();
  /** The part is not in the catalogue at all -- fall back to a blocker. */
  readonly uncatalogued = output<void>();

  protected readonly query = signal('');
  protected readonly selected = signal<PartCard | null>(null);
  protected readonly quantity = signal(1);

  protected readonly visible = computed(() => {
    const all = this.catalog() ?? [];
    const q = this.query().trim().toLowerCase();
    if (!q) return all;
    return all.filter((part) => part.name.toLowerCase().includes(q) || part.sku.toLowerCase().includes(q));
  });

  protected select(part: PartCard): void {
    // Tapping the chosen card again clears it, so a mis-tap costs one tap.
    this.selected.set(this.selected()?.id === part.id ? null : part);
    this.quantity.set(1);
  }

  protected adjust(delta: number): void {
    this.quantity.set(Math.max(1, this.quantity() + delta));
  }

  protected confirm(): void {
    const part = this.selected();
    if (!part) return;
    this.chosen.emit({ part, quantity: this.quantity() });
    this.selected.set(null);
    this.quantity.set(1);
  }
}
