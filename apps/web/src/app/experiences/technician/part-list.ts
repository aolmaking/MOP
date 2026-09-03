import { Component, computed, input, output, signal } from '@angular/core';
import type { WorkCardPart } from './technician.api';

export interface PartReturn {
  readonly part: WorkCardPart;
  readonly quantity: number;
  readonly reason: string;
}

export interface PartClarification {
  readonly part: WorkCardPart;
  readonly answer: string;
}

/**
 * The parts on this job, and what the technician can do about each.
 *
 * Split out of the Work Card when that component crossed the project's
 * 8 kB CSS budget for the second time -- the same remedy `parts-catalog`
 * used, and for the same reason: the budget is a real limit on how much
 * one screen may carry, not a number to raise when it is inconvenient.
 *
 * Every affordance here is rendered strictly from the server's own flags
 * (`action`, `returnable`, `clarificationPending`). None is computed
 * from the status. A workshop with PART_RETURNS removed has no
 * RETURN_REQUESTED edge in its graph, so `returnable` is false and the
 * button does not exist -- it dies with the capability that owns it,
 * rather than surviving as a press the service layer then refuses.
 *
 * Knows nothing about HTTP. The Work Card owns sending; this owns what a
 * technician sees and presses.
 */
@Component({
  selector: 'app-part-list',
  templateUrl: './part-list.html',
  styleUrl: './part-list.css',
})
export class PartList {
  readonly parts = input.required<readonly WorkCardPart[]>();
  /** The key of whatever write is in flight, so one press disables the rest. */
  readonly busy = input<string | null>(null);

  readonly receive = output<WorkCardPart>();
  readonly markUsed = output<WorkCardPart>();
  readonly returned = output<PartReturn>();
  readonly clarified = output<PartClarification>();

  /**
   * Which part has a sub-panel open, and which one. One at a time: this
   * is a small screen, and both panels ask for typed text, which is
   * already the most expensive thing a technician does one-handed.
   */
  protected readonly panel = signal<{ kind: 'return' | 'clarify'; partRequestId: string } | null>(null);
  protected readonly quantity = signal('1');
  protected readonly reason = signal('');
  protected readonly answer = signal('');

  protected open(kind: 'return' | 'clarify', part: WorkCardPart): void {
    const current = this.panel();
    if (current?.kind === kind && current.partRequestId === part.partRequestId) {
      this.panel.set(null);
      return;
    }
    this.panel.set({ kind, partRequestId: part.partRequestId });
    this.quantity.set(String(part.quantity));
    this.reason.set('');
    this.answer.set('');
  }

  protected isOpen(kind: 'return' | 'clarify', part: WorkCardPart): boolean {
    const panel = this.panel();
    return panel?.kind === kind && panel.partRequestId === part.partRequestId;
  }

  /**
   * The server's own floor, checked here too so "no" is refused before
   * the round trip rather than after it. Not a second rule -- the same
   * one, stated where the technician can still act on it.
   */
  protected readonly reasonValid = computed(() => this.reason().trim().length >= 3);
  protected readonly answerValid = computed(() => this.answer().trim().length >= 3);
  protected readonly quantityValid = computed(() => {
    const value = Number(this.quantity().trim());
    return Number.isInteger(value) && value >= 1;
  });

  protected act(part: WorkCardPart): void {
    if (part.action === 'RECEIVE') this.receive.emit(part);
    else if (part.action === 'MARK_USED') this.markUsed.emit(part);
  }

  protected actionLabel(part: WorkCardPart): string {
    return part.action === 'RECEIVE' ? "I've got it" : "It's fitted";
  }

  protected sendBack(part: WorkCardPart): void {
    if (!this.reasonValid() || !this.quantityValid()) return;
    this.panel.set(null);
    this.returned.emit({ part, quantity: Number(this.quantity().trim()), reason: this.reason().trim() });
  }

  protected sendAnswer(part: WorkCardPart): void {
    if (!this.answerValid()) return;
    this.panel.set(null);
    this.clarified.emit({ part, answer: this.answer().trim() });
  }
}
