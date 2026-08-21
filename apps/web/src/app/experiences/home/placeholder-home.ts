import { Component, inject } from '@angular/core';
import { AuthStore } from '../../identity/auth.store';

/**
 * Stands in for every role's real landing page until Phase 2+ builds them.
 * Its only job is proving the full chain works end to end: guard -> real
 * session -> a page rendering real session data, not placeholder text.
 */
@Component({
  selector: 'app-placeholder-home',
  templateUrl: './placeholder-home.html',
})
export class PlaceholderHome {
  private readonly authStore = inject(AuthStore);
  protected readonly session = this.authStore.session;
}
