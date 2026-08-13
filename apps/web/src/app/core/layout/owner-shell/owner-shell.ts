import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../auth/auth.store';
import { ToastContainer } from '../../../shared/toast/toast-container';
import { ButtonDirective } from '../../../shared/button/button.directive';

/**
 * The Tenant Owner shell -- the first Owner surface, and the frame the
 * rest of Phase 10 hangs off.
 *
 * The rail lists only what exists. Audit was the first page built because
 * it was one of three finished systems with no way in; Home is the
 * role's actual landing page, added once OwnerHomeService had a page
 * calling it (see PHASE_10.md section 6). The other six Owner pages
 * remain owed.
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

  protected readonly navigation = [
    { label: 'Home', route: '/owner/home' },
    { label: 'Organization', route: '/owner/organization' },
    { label: 'Teams', route: '/owner/organization/teams' },
    { label: 'Forms & Fields', route: '/owner/forms' },
    { label: 'Messages', route: '/owner/messages' },
    { label: 'Pricing', route: '/owner/pricing' },
    { label: 'Reports', route: '/owner/reports' },
    { label: 'History', route: '/owner/audit' },
  ];

  async logout(): Promise<void> {
    await this.authStore.logout();
    await this.router.navigate(['/login']);
  }
}
