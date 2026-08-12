import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../auth/auth.store';
import { ToastContainer } from '../../../shared/toast/toast-container';
import { ButtonDirective } from '../../../shared/button/button.directive';

interface PlatformNavItem {
  label: string;
  route: string;
}

/**
 * The Platform Super Admin shell -- a dense left-rail nav, unlike the
 * generic authenticated Shell from Phase 1. Every role ends up with its
 * own shell rather than one shell branching on role: Technician's own
 * spec is explicit that it gets "exactly 3 pages, no admin sidebar,"
 * which a one-shell-fits-all design could only achieve by accreting
 * conditionals no one page actually wants.
 *
 * "Add Workshop" is deliberately not a nav item here -- per spec it's
 * only reachable via the "+ Add Workshop" button on the Workshops page.
 */
@Component({
  selector: 'app-platform-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastContainer, ButtonDirective],
  templateUrl: './platform-shell.html',
  styleUrl: './platform-shell.css',
})
export class PlatformShell {
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly session = this.authStore.session;

  /**
   * Only pages that exist, the same rule BranchShell states and keeps.
   * This rail carried Control Center, Reports and Live View from Phase 2
   * onward, all three 404ing -- the first dead link teaches a super
   * admin that navigation is unreliable, and from then on they navigate
   * by memorised URL. Each returns here as it lands.
   */
  protected readonly navItems: PlatformNavItem[] = [{ label: 'Workshops', route: '/platform/workshops' }];

  async logout(): Promise<void> {
    await this.authStore.logout();
    await this.router.navigate(['/login']);
  }
}
