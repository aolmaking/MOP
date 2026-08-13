import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../auth/auth.store';
import { ToastContainer } from '../../../shared/toast/toast-container';

/**
 * The Customer Portal shell.
 *
 * DESIGN_LANGUAGE.md section 0: this person opens MOP maybe three times
 * in their life, on a phone, worried about their car and their money.
 * They are not a daily user of a workshop tool, so this shell is not the
 * staff red rail -- it follows the technician shell's own reasoning
 * instead (bottom nav, no admin sidebar, thumb-reachable), because that
 * is the other shell built for a phone held in one hand, even though the
 * two personas are otherwise unrelated. Labels are plain words, never
 * the internal vocabulary staff pages use ("My Assets" is the closest
 * the spec gets to jargon, and it stays because it is what the page is).
 */
@Component({
  selector: 'app-customer-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastContainer],
  templateUrl: './customer-shell.html',
  styleUrl: './customer-shell.css',
})
export class CustomerShell {
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly session = this.authStore.session;

  protected readonly navigation = [
    { label: 'Home', route: '/customer' },
    { label: 'Assets', route: '/customer/assets' },
    { label: 'Service', route: '/customer/service' },
    { label: 'Invoices', route: '/customer/invoices' },
    { label: 'History', route: '/customer/history' },
  ];

  async logout(): Promise<void> {
    await this.authStore.logout();
    await this.router.navigate(['/login']);
  }
}
