import { Component, input } from '@angular/core';

/**
 * Consistent label + control + error/hint layout around a projected
 * native input/select/textarea. Wraps the control inside the <label>
 * itself (implicit association) rather than coordinating id/for pairs
 * across every call site -- one less thing a caller can get wrong.
 */
@Component({
  selector: 'app-form-field',
  templateUrl: './form-field.html',
})
export class FormField {
  readonly label = input.required<string>();
  readonly hint = input<string | null>(null);
  readonly error = input<string | null>(null);
  readonly checking = input(false);
  readonly required = input(false);
}
