import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthStore } from '../../../identity/auth.store';
import { ToastContainer } from '../../../ui/toast/toast-container';
import { ThemeToggle } from '../../../ui/theme-toggle/theme-toggle';

import { WorkshopBrandingService } from '../../../ui/workshop-branding.service';

/**
 * The Technician shell -- single unified workstation, no redundant bottom tabs.
 */
@Component({
  selector: 'app-technician-shell',
  imports: [RouterOutlet, ToastContainer, ThemeToggle],
  templateUrl: './technician-shell.html',
  styleUrl: './technician-shell.css',
})
export class TechnicianShell {
  private readonly authStore = inject(AuthStore);
  protected readonly branding = inject(WorkshopBrandingService);
  protected readonly session = this.authStore.session;
}
