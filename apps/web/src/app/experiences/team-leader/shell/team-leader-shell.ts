import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../../identity/auth.store';
import { ToastContainer } from '../../../ui/toast/toast-container';
import { ButtonDirective } from '../../../ui/button/button.directive';
import { ShellTopbar } from '../../../ui/shell-topbar/shell-topbar';
import { WorkshopBrandingService } from '../../../ui/workshop-branding.service';

/**
 * The Team Leader shell -- one shell per role, same rule as every other
 * side of the product. All four pages ship together in this phase (see
 * PHASE_10.md section 3), so unlike BranchShell's team-setup entry there
 * is no conditional item here: the whole rail exists from the start.
 */
@Component({
  selector: 'app-team-leader-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastContainer, ButtonDirective, ShellTopbar],
  templateUrl: './team-leader-shell.html',
  styleUrl: './team-leader-shell.css',
})
export class TeamLeaderShell {
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);
  protected readonly branding = inject(WorkshopBrandingService);

  protected readonly session = this.authStore.session;

  protected readonly navigation = [
    { label: 'Home', route: '/team-leader' },
    { label: 'Technicians', route: '/team-leader/technicians' },
    { label: 'Work orders', route: '/team-leader/work-orders' },
    { label: 'Reports', route: '/team-leader/reports' },
  ];

  async logout(): Promise<void> {
    await this.authStore.logout();
    await this.router.navigate(['/login']);
  }
}
