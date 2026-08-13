import { Component, DestroyRef, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../shared/error-banner/error-banner';
import { ButtonDirective } from '../../shared/button/button.directive';
import type { PresentedError } from '../../core/api/error.interceptor';
import { CustomerPortalApi, type SafeHistoryEntry } from './customer-portal.api';

type State = 'loading' | 'ready' | 'empty' | 'forbidden' | 'error';

/**
 * Safe Technical History -- `SafeTechnicalHistory` scoped to this
 * customer's own ownership period, so a used-vehicle buyer never sees a
 * previous owner's entries (proven server-side, see
 * `customer-portal.integration.spec.ts`).
 *
 * `SafeHistoryEntry.assetId` is a raw id with nothing a customer can
 * read; the assets call is fetched alongside it purely to label each
 * entry with the plate/VIN a person actually recognises, falling back
 * to "Vehicle" for an asset that isn't in the customer's own current
 * asset list (e.g. one they no longer own).
 */
@Component({
  selector: 'app-safe-history',
  imports: [ErrorBanner, ButtonDirective],
  templateUrl: './safe-history.html',
  styleUrl: './safe-history.css',
})
export class SafeHistory {
  private readonly api = inject(CustomerPortalApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly entries = signal<readonly SafeHistoryEntry[]>([]);
  protected readonly assetLabels = signal<Record<string, string>>({});
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    forkJoin({ entries: this.api.safeHistory(), assets: this.api.assets() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ entries, assets }) => {
          this.entries.set(entries);
          this.assetLabels.set(
            Object.fromEntries(assets.map((asset) => [asset.id, asset.plateNumber ?? asset.vinOrChassisNumber ?? 'Vehicle'])),
          );
          this.state.set(entries.length === 0 ? 'empty' : 'ready');
        },
        error: (err: PresentedError) => {
          this.error.set(err);
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
        },
      });
  }

  protected assetLabel(assetId: string): string {
    return this.assetLabels()[assetId] ?? 'Vehicle';
  }

  protected when(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  }
}
