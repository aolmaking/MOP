import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../auth/auth.store';
import { ToastContainer } from '../../../shared/toast/toast-container';
import { ButtonDirective } from '../../../shared/button/button.directive';

/**
 * The Tenant Owner shell -- the first Owner surface, and the frame the
 * rest of Phase 10 hangs off.
 *
 * The rail lists only what exists. Audit is the first page built because
 * it was one of three finished systems with no way in, not because it is
 * the owner's most important screen; the other seven arrive in Phase 10.
 */
@Component({
  selector: 'app-owner-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastContainer, ButtonDirective],
  templateUrl: './owner-shell.html',
  styleUrl: './owner-shell.css',
})
export class OwnerShell {
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly session = this.authStore.session;

  protected readonly navigation = [{ label: 'History', route: '/owner/audit' }];

  async logout(): Promise<void> {
    await this.authStore.logout();
    await this.router.navigate(['/login']);
  }
}
