import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../auth/auth.store';
import { ToastContainer } from '../../../shared/toast/toast-container';
import { ButtonDirective } from '../../../shared/button/button.directive';

interface BranchNavItem {
  label: string;
  route: string;
}

/**
 * The Branch Manager shell -- its own frame, following the same rule as
 * PlatformShell: one shell per role rather than one shell branching on
 * role. A shared shell could only serve six roles by accreting
 * conditionals none of them wants.
 *
 * The rail lists ONLY pages that exist. An entry pointing at an unbuilt
 * route is worse than a short rail: the first dead link teaches the
 * manager that navigation is unreliable, and from then on they navigate
 * by memorised URL. The remaining five pages are specified in
 * docs/phases/PHASE_5.md and each adds its entry here as it lands.
 */
@Component({
  selector: 'app-branch-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastContainer, ButtonDirective],
  templateUrl: './branch-shell.html',
  styleUrl: './branch-shell.css',
})
export class BranchShell {
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly session = this.authStore.session;

  protected readonly navigation: readonly BranchNavItem[] = [
    { label: 'Attention', route: '/branch/attention' },
    { label: 'Work orders', route: '/branch/work-orders' },
    { label: 'Approvals', route: '/branch/approvals' },
    { label: 'Delivery', route: '/branch/delivery' },
    { label: 'Book in', route: '/branch/intake' },
  ];

  /**
   * Read from the session rather than assumed from the route. Someone who
   * is not a branch manager can still reach this URL -- they get the
   * page's no-access state -- and the rail must not tell them they are
   * someone they are not.
   */
  protected readonly roleLabel = computed(() => {
    const role = this.session()?.role;
    return role ? role.toLowerCase().replace(/_/g, ' ') : '';
  });

  async logout(): Promise<void> {
    await this.authStore.logout();
    await this.router.navigate(['/login']);
  }
}
