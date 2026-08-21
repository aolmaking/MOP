import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../ui/button/button.directive';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import { CustomerPortalApi, type PortalHome as HomeData } from './customer-portal.api';

type State = 'loading' | 'ready' | 'forbidden' | 'error';

/**
 * Customer Portal Home -- orientation across the customer's own assets
 * and open service, per `docs/detailed-specs/customer.md`.
 *
 * Pending decisions leads when nonzero: the spec calls this out as
 * "usually the reason a customer is opening the portal at all", and
 * DESIGN_LANGUAGE.md section 0 says this person opens the portal maybe
 * three times in their life -- when there is a reason, that reason
 * should be the first thing on the screen, not one tile among several.
 */
@Component({
  selector: 'app-portal-home',
  imports: [RouterLink, ErrorBanner, ButtonDirective],
  templateUrl: './portal-home.html',
  styleUrl: './portal-home.css',
})
export class PortalHome {
  private readonly api = inject(CustomerPortalApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly data = signal<HomeData | null>(null);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

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

  protected when(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
}
