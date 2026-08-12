import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../auth/auth.store';
import { ToastContainer } from '../../../shared/toast/toast-container';
import { ButtonDirective } from '../../../shared/button/button.directive';

/**
 * The inventory manager's shell -- a rail, like the platform and branch
 * sides, because this person sits at a desk and works long sessions.
 * Density is the feature here, which is the opposite of the technician's
 * requirement and the reason these are separate shells.
 */
@Component({
  selector: 'app-inventory-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastContainer, ButtonDirective],
  templateUrl: './inventory-shell.html',
  styleUrl: './inventory-shell.css',
})
export class InventoryShell {
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly session = this.authStore.session;

  protected readonly navigation = [
    { label: 'Home', route: '/inventory/home' },
    { label: 'Requests', route: '/inventory/requests' },
    { label: 'Stock', route: '/inventory/stock' },
    { label: 'Returns', route: '/inventory/returns' },
    { label: 'Catalog', route: '/inventory/catalog' },
    { label: 'Reports', route: '/inventory/reports' },
  ];

  async logout(): Promise<void> {
    await this.authStore.logout();
    await this.router.navigate(['/login']);
  }
}
