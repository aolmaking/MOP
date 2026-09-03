import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../../identity/auth.store';
import { ToastContainer } from '../../../ui/toast/toast-container';
import { ButtonDirective } from '../../../ui/button/button.directive';
import { visibleNavigation } from '../../../runtime/launch-surface';

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

  /**
   * The rail lists only what exists AND what this sprint ships. The
   * launch manifest does the second half, so "why is Messages gone?"
   * has an answer written next to the entry rather than in a diff.
   */
  protected readonly navigation = visibleNavigation([
    { label: 'Home', route: '/owner/home' },
    { label: 'Organization', route: '/owner/organization' },
    { label: 'Teams', route: '/owner/organization/teams' },
    { label: 'Forms & Fields', route: '/owner/forms' },
    { label: 'Messages', route: '/owner/messages' },
    { label: 'Pricing', route: '/owner/pricing' },
    { label: 'Reports', route: '/owner/reports' },
    { label: 'Workflow Health', route: '/owner/workflow-health' },
    // Two different products, two different entries. History is what
    // happened to customers and their vehicles; Audit is what changed
    // about the system. This rail used to point the word "History" at
    // the audit page, which is how the two get confused for one.
    { label: 'History', route: '/owner/history' },
    { label: 'Audit & Changes', route: '/owner/audit' },
  ]);

  async logout(): Promise<void> {
    await this.authStore.logout();
    await this.router.navigate(['/login']);
  }
}
