import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../../identity/auth.store';
import { ToastContainer } from '../../../ui/toast/toast-container';
import { ButtonDirective } from '../../../ui/button/button.directive';
import { visibleNavigation } from '../../../runtime/launch-surface';

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
   * The rail as data rather than as four hand-written anchors, so the
   * launch manifest can hold one back without an `@if` growing beside
   * each icon. The icon stays with its entry: these are drawn inline
   * because the rail is the only place in the product that uses them.
   */
  protected readonly navigation = visibleNavigation([
    {
      label: 'Workshops',
      route: '/platform/workshops',
      icon: 'M3 8h6v9H3zM11 4h6v13h-6z',
    },
    {
      label: 'Control Center',
      route: '/platform/control-center',
      icon: 'M10 3.5v13M3.5 10h13',
    },
    {
      label: 'Reports',
      route: '/platform/reports',
      icon: 'M4 16V9M10 16V4M16 16v-6M3 16h14',
    },
    {
      label: 'Live View',
      route: '/platform/live-view',
      icon: 'M2.5 10S5.5 4.5 10 4.5 17.5 10 17.5 10 14.5 15.5 10 15.5 2.5 10 2.5 10Z',
    },
  ]);

  async logout(): Promise<void> {
    await this.authStore.logout();
    await this.router.navigate(['/login']);
  }
}
