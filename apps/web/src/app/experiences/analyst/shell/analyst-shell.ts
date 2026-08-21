import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../../identity/auth.store';
import { ToastContainer } from '../../../ui/toast/toast-container';
import { ButtonDirective } from '../../../ui/button/button.directive';

/**
 * The Data Analyst's shell -- a rail, like Inventory/Owner/Platform: a
 * desk role, long sessions, the opposite requirement to the
 * technician's. See docs/detailed-specs/data-analyst.md.
 */
@Component({
  selector: 'app-analyst-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastContainer, ButtonDirective],
  templateUrl: './analyst-shell.html',
  styleUrl: './analyst-shell.css',
})
export class AnalystShell {
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly session = this.authStore.session;

  protected readonly navigation = [
    { label: 'Home', route: '/analyst/home' },
    { label: 'Operations', route: '/analyst/operations' },
    { label: 'Technician & Team', route: '/analyst/people' },
    { label: 'Inventory', route: '/analyst/inventory' },
    { label: 'Customer Decisions', route: '/analyst/decisions' },
    { label: 'Feature Adoption', route: '/analyst/feature-adoption' },
  ];

  async logout(): Promise<void> {
    await this.authStore.logout();
    await this.router.navigate(['/login']);
  }
}
