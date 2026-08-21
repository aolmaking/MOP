import { Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../../identity/auth.store';

/**
 * The authenticated layout every guarded route renders inside. Currently
 * just a header (who's signed in + logout) around a router-outlet -- real
 * per-role navigation gets added as Phase 2+ registers real pages to link
 * to (see SessionContext.permissions doc comment for why nav isn't
 * permission-filtered yet: there's nothing real to filter today).
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class Shell {
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly session = this.authStore.session;

  async logout(): Promise<void> {
    await this.authStore.logout();
    await this.router.navigate(['/login']);
  }
}
