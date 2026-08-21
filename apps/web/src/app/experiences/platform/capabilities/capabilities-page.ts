import { Component, computed, inject, input, signal } from '@angular/core';
import { ErrorBanner } from '../../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../../ui/button/button.directive';
import type { PresentedError } from '../../../runtime/http/error.interceptor';
import {
  CapabilitiesApi,
  type CapabilityChange,
  type CapabilityImpactPreview,
  type CapabilityRow,
} from './capabilities.api';

type State = 'loading' | 'ready' | 'error';

/**
 * Shaping a workshop -- the capability engine's interface.
 *
 * The one rule this page exists to make visible:
 *
 *   Removal is workflow rewiring, not feature hiding.
 *
 * So a toggle never applies anything. It stages a change, the server
 * computes what that change would actually do to live records, and the
 * operator reads the consequences before committing. The preview is
 * always server-computed: the reachability guarantee is enforced by the
 * validator, and a client that predicted the outcome for itself would
 * eventually predict it wrong.
 */
@Component({
  selector: 'app-capabilities-page',
  imports: [ErrorBanner, ButtonDirective],
  templateUrl: './capabilities-page.html',
  styleUrl: './capabilities-page.css',
})
export class CapabilitiesPage {
  private readonly api = inject(CapabilitiesApi);

  /** Bound from the route. */
  readonly id = input.required<string>();

  protected readonly rows = signal<readonly CapabilityRow[]>([]);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

  /** Staged, not applied. Keyed by capability. */
  protected readonly staged = signal<Record<string, string>>({});
  protected readonly preview = signal<CapabilityImpactPreview | null>(null);
  protected readonly previewing = signal(false);
  protected readonly applying = signal(false);
  protected readonly reason = signal('');
  protected readonly applied = signal(false);

  constructor() {
    queueMicrotask(() => this.load());
  }

  protected load(): void {
    this.state.set('loading');
    this.api.current(this.id()).subscribe({
      next: ({ capabilities }) => {
        this.rows.set(capabilities);
        this.state.set('ready');
      },
      error: (err: PresentedError) => {
        this.error.set(err);
        this.state.set('error');
      },
    });
  }

  protected readonly changes = computed<readonly CapabilityChange[]>(() => {
    const staged = this.staged();
    return Object.entries(staged).map(([capabilityKey, status]) => ({ capabilityKey, status }));
  });

  protected readonly hasChanges = computed(() => this.changes().length > 0);

  /** The server said no. Nothing may be applied while this holds. */
  protected readonly blocked = computed(() => (this.preview()?.blockers.length ?? 0) > 0);

  protected readonly canApply = computed(
    () => this.hasChanges() && this.preview() !== null && !this.blocked() && this.reason().trim().length >= 3,
  );

  protected effectiveStatus(row: CapabilityRow): string {
    return this.staged()[row.key] ?? row.status;
  }

  protected isStaged(row: CapabilityRow): boolean {
    return this.staged()[row.key] !== undefined;
  }

  protected stage(row: CapabilityRow, status: string): void {
    const next = { ...this.staged() };
    // Setting it back to where it started is not a change, so it stops
    // being one -- otherwise the operator would be asked to justify a
    // no-op and the audit trail would record one.
    if (status === row.status) delete next[row.key];
    else next[row.key] = status;

    this.staged.set(next);
    this.applied.set(false);
    this.preview.set(null);

    if (Object.keys(next).length > 0) this.runPreview();
  }

  protected discard(): void {
    this.staged.set({});
    this.preview.set(null);
    this.reason.set('');
    this.applied.set(false);
  }

  private runPreview(): void {
    this.previewing.set(true);
    this.error.set(null);
    this.api.preview(this.id(), this.changes()).subscribe({
      next: (preview) => {
        this.preview.set(preview);
        this.previewing.set(false);
      },
      error: (err: PresentedError) => {
        this.error.set(err);
        this.previewing.set(false);
      },
    });
  }

  protected apply(): void {
    if (!this.canApply()) return;
    this.applying.set(true);
    this.error.set(null);

    this.api.apply(this.id(), this.changes(), this.reason().trim()).subscribe({
      next: () => {
        this.applying.set(false);
        this.applied.set(true);
        this.discard();
        this.load();
      },
      error: (err: PresentedError) => {
        this.applying.set(false);
        this.error.set(err);
        // Re-previewing on failure rather than leaving a stale one on
        // screen: apply re-validates from scratch, so a rejection means
        // the world moved since the preview was taken.
        this.runPreview();
      },
    });
  }

  protected label(value: string): string {
    return value.toLowerCase().replace(/_/g, ' ');
  }
}
