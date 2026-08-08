import { Directive, HostBinding, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'default' | 'small';

/**
 * Styles a real <button> rather than wrapping one, so native behavior
 * (type="submit", keyboard activation, form association) stays intact
 * instead of being re-implemented. Usage: <button appButton variant="danger">.
 * `appButton` is a plain marker, deliberately not aliased to `variant`:
 * a bare `<button appButton>` (no value) would bind variant="" through an
 * alias, which isn't a valid ButtonVariant -- keeping them separate lets
 * "just appButton, default variant" and "appButton with an explicit
 * variant" both type-check.
 * A loading state is the caller's own [disabled] + inline .mop-spinner
 * content -- a directive has no template slot to inject one into.
 */
@Directive({
  selector: 'button[appButton]',
})
export class ButtonDirective {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('default');

  @HostBinding('class')
  get hostClass(): string {
    return `mop-button mop-button--${this.variant()} mop-button--${this.size()}`;
  }
}
