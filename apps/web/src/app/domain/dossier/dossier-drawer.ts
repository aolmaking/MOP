import { Component, DestroyRef, inject, input, output, signal, effect } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Identifier } from '../../ui/identifier/identifier';
import { ButtonDirective } from '../../ui/button/button.directive';
import { DismissOnEscapeDirective } from '../../ui/dismiss-on-escape/dismiss-on-escape.directive';
import { ErrorBanner } from '../../ui/error-banner/error-banner';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import { DossierApi, type WorkOrderDossier } from './dossier.api';

type State = 'loading' | 'ready' | 'error';

/**
 * The whole life of one job, in a panel over the page it was opened from.
 *
 * A drawer rather than a route on purpose: this is consulted *while*
 * working a job -- "what did we already do to this car", "who touched it",
 * "what did the last visit cost" -- and navigating away to answer that
 * loses the board position the person was working from.
 *
 * Everything shown is read from the dossier endpoint. Nothing is computed
 * here, so the panel cannot disagree with the records it is displaying.
 */
@Component({
  selector: 'app-dossier-drawer',
  imports: [Identifier, ButtonDirective, DismissOnEscapeDirective, ErrorBanner],
  templateUrl: './dossier-drawer.html',
  styleUrl: './dossier-drawer.css',
})
export class DossierDrawer {
  private readonly api = inject(DossierApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly workOrderId = input.required<string>();
  readonly closed = output<void>();

  protected readonly state = signal<State>('loading');
  protected readonly data = signal<WorkOrderDossier | null>(null);
  protected readonly error = signal<PresentedError | null>(null);

  constructor() {
    effect(() => {
      const id = this.workOrderId();
      if (id) this.load(id);
    });
  }

  protected load(id: string): void {
    this.state.set('loading');
    this.api
      .dossier(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (d) => {
          this.data.set(d);
          this.state.set('ready');
        },
        error: (err: PresentedError) => {
          this.error.set(err);
          this.state.set('error');
        },
      });
  }

  protected retry(): void {
    this.load(this.workOrderId());
  }

  /** Local time, because a dossier is read by the people who did the work. */
  protected when(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  protected label(value: string): string {
    return value.toLowerCase().replace(/_/g, ' ');
  }
}
