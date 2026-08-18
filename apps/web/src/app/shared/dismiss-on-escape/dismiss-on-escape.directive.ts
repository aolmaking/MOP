import { Directive, output } from '@angular/core';

/**
 * Closes a dialog, drawer or modal when Escape is pressed.
 *
 * Every overlay in the product could previously only be dismissed by
 * clicking a backdrop or hunting for Cancel -- the whole app contained no
 * Escape handling at all. A backdrop `(click)` is a mouse affordance; a
 * keyboard user who opened Freeze Workshop, Invite Staff or the workshop
 * drawer had no equivalent, which is a real accessibility failure and not
 * a cosmetic one.
 *
 * Listens on `document` rather than the host, because focus is often
 * inside a child input when the key is pressed, and a host listener would
 * miss it. `keydown.escape` is Angular's own key binding syntax, so the
 * key check is not hand-rolled.
 *
 * Usage: <div role="dialog" appDismissOnEscape (dismissed)="close()">
 *
 * Deliberately does NOT also handle the backdrop click or focus trapping.
 * The backdrop handlers already exist and work; a directive that quietly
 * took them over would make the existing templates lie about what closes
 * them.
 */
@Directive({
  selector: '[appDismissOnEscape]',
  host: {
    '(document:keydown.escape)': 'onEscape($event)',
  },
})
export class DismissOnEscapeDirective {
  readonly dismissed = output<void>();

  protected onEscape(event: Event): void {
    // Stops one Escape from closing a dialog and something behind it in
    // the same pass when overlays are ever nested.
    event.stopPropagation();
    this.dismissed.emit();
  }
}
