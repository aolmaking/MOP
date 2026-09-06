import { Component, inject, input, output } from '@angular/core';
import { ThemeToggle } from '../theme-toggle/theme-toggle';
import { ThemeService } from '../theme.service';
import { WorkshopBrandingService } from '../workshop-branding.service';
import type { SessionContext } from '@mop/shared';

@Component({
  selector: 'app-shell-topbar',
  standalone: true,
  imports: [ThemeToggle],
  templateUrl: './shell-topbar.html',
  styleUrl: './shell-topbar.css',
})
export class ShellTopbar {
  readonly session = input<SessionContext | null>(null);
  readonly roleTitle = input<string>('Workspace');
  readonly logout = output<void>();

  protected readonly theme = inject(ThemeService);
  protected readonly branding = inject(WorkshopBrandingService);

  onLogout(): void {
    this.logout.emit();
  }
}
