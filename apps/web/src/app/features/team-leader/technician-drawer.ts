import { Component, input, output, signal } from '@angular/core';
import { ButtonDirective } from '../../shared/button/button.directive';
import type { TechnicianDetail } from './team-leader.api';
import { DismissOnEscapeDirective } from '../../shared/dismiss-on-escape/dismiss-on-escape.directive';

/**
 * The technician detail drawer -- roster, recent tasks, and the
 * supervision note thread.
 *
 * The note form is deliberately here and nowhere else: PHASE_10.md
 * section 3 names this the one place in the product where a note is
 * hidden from the person it is about, so there is no technician-facing
 * screen this needed to be reconciled with. Escalate is a flag on the
 * note, not a separate action -- the service treats it as one write.
 *
 * Presentational, like WorkshopDrawer: it takes what the page already
 * loaded and emits intent, so a slow note-submit cannot leave the
 * drawer showing a detail response older than what it just posted.
 */
@Component({
  selector: 'app-technician-drawer',
  imports: [ButtonDirective, DismissOnEscapeDirective],
  templateUrl: './technician-drawer.html',
  styleUrl: './technician-drawer.css',
})
export class TechnicianDrawer {
  readonly detail = input.required<TechnicianDetail>();
  readonly submitting = input(false);
  readonly closed = output<void>();
  readonly noteAdded = output<{ body: string; escalate: boolean }>();

  protected readonly body = signal('');
  protected readonly escalate = signal(false);

  protected setBody(value: string): void {
    this.body.set(value);
  }

  protected setEscalate(value: boolean): void {
    this.escalate.set(value);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const text = this.body().trim();
    if (!text) return;
    this.noteAdded.emit({ body: text, escalate: this.escalate() });
    this.body.set('');
    this.escalate.set(false);
  }

  protected label(value: string): string {
    return value.toLowerCase().replace(/_/g, ' ');
  }

  protected when(iso: string): string {
    return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
}
