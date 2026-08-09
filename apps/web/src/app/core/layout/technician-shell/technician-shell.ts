import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../auth/auth.store';
import { ToastContainer } from '../../../shared/toast/toast-container';

/**
 * The Technician shell -- three pages, no admin sidebar, as the spec
 * requires. One shell per role, the rule PlatformShell set.
 *
 * Everything visual lives in technician-shell.css, including a density
 * layer scoped to `.tech`: 56px targets and 16px type, derived from what
 * a gloved hand can actually hit rather than chosen for looks. See
 * docs/phases/PHASE_6.md §2.
 */
@Component({
  selector: 'app-technician-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastContainer],
  templateUrl: './technician-shell.html',
  styleUrl: './technician-shell.css',
})
export class TechnicianShell {
  private readonly authStore = inject(AuthStore);
  protected readonly session = this.authStore.session;

  /**
   * Two tabs, for three pages.
   *
   * The Work Card is the third page but never a nav destination: it is
   * always *a specific car*, so a tab pointing at it would either be a
   * dead link or would silently guess which job the technician meant.
   * It is reached by tapping the job on either of these, which is also
   * how it is actually used.
   */
  protected readonly navigation = [
    { label: 'Now', route: '/tech' },
    { label: 'My work', route: '/tech/work' },
  ];
}
