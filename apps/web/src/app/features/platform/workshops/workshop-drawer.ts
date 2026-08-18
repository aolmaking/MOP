import { Component, input, output } from '@angular/core';
import type { WorkshopDetails } from '../../../core/api/platform-workshops.api';
import { DismissOnEscapeDirective } from '../../../shared/dismiss-on-escape/dismiss-on-escape.directive';

/**
 * Everything the platform knows about one workshop.
 *
 * Its own component because it is where ALL the large-versus-small
 * handling lives: branches and warehouses page inside it, plan limits
 * show usage against ceilings, health lists its reasons rather than
 * leaving a colour to be guessed at. The list page behind it is
 * deliberately fixed-shape, so the part that grows with the platform
 * should not grow inside it.
 *
 * Presentational: it takes the loaded details and emits a close. It
 * fetches nothing, so it cannot be open with stale data of its own.
 */
@Component({
  imports: [DismissOnEscapeDirective],
  selector: 'app-workshop-drawer',
  templateUrl: './workshop-drawer.html',
  styleUrl: './workshop-drawer.css',
})
export class WorkshopDrawer {
  readonly details = input.required<WorkshopDetails>();
  readonly closed = output<void>();

  protected label(value: string): string {
    return value.toLowerCase().replace(/_/g, ' ');
  }

  protected ago(iso: string | null): string {
    if (!iso) return 'never';
    const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  /**
   * In the WORKSHOP's timezone, not the reader's. A super admin in
   * Cairo reading a Jakarta workshop should see the hour its own staff
   * saw -- every timestamp about a specific workshop reads the way that
   * workshop's people read it.
   */
  protected absolute(iso: string | null, timezone: string): string {
    if (!iso) return 'No recorded activity';
    try {
      return `${new Date(iso).toLocaleString(undefined, { timeZone: timezone })} (${timezone})`;
    } catch {
      // An unrecognised IANA zone must not blank the tooltip.
      return new Date(iso).toLocaleString();
    }
  }
}
