import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../ui/button/button.directive';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import { CustomerPortalApi, type PortalAsset } from './customer-portal.api';

type State = 'loading' | 'ready' | 'empty' | 'forbidden' | 'error';

/**
 * My Assets -- every asset with an open ownership row for this customer.
 * Card grid, not a table: `docs/detailed-specs/customer.md` names this
 * "a single card" for most customers and "a paginated card grid" only
 * for a fleet operator, so a table asserting rows are worth comparing
 * side-by-side would be the wrong device for the common case.
 */
@Component({
  selector: 'app-my-assets',
  imports: [ErrorBanner, ButtonDirective],
  templateUrl: './my-assets.html',
  styleUrl: './my-assets.css',
})
export class MyAssets {
  private readonly api = inject(CustomerPortalApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly assets = signal<readonly PortalAsset[]>([]);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .assets()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (assets) => {
          this.assets.set(assets);
          this.state.set(assets.length === 0 ? 'empty' : 'ready');
        },
        error: (err: PresentedError) => {
          this.error.set(err);
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
        },
      });
  }

  protected identifier(asset: PortalAsset): string {
    return asset.plateNumber ?? asset.vinOrChassisNumber ?? 'No identifier on file';
  }

  protected category(value: string): string {
    return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
  }
}
