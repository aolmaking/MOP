import { Component, input } from '@angular/core';

/**
 * What creating this workshop will actually do, stated before the press.
 *
 * Every figure is passed in from the derived facts rather than computed
 * here: this component's job is to say the sentence, and the engine's is
 * to know the number. Splitting them that way is also what keeps this
 * panel honest -- it cannot invent a claim, because it has nothing to
 * invent one from.
 */
@Component({
  selector: 'app-review-consequences',
  imports: [],
  templateUrl: './review-consequences.html',
  styleUrl: './review-consequences.css',
})
export class ReviewConsequences {
  readonly slug = input.required<string>();
  readonly currency = input.required<string>();
  readonly ownerName = input.required<string>();
  readonly roleCount = input.required<number>();
  readonly pageCount = input.required<number>();
  readonly gateCount = input.required<number>();
  readonly grantCount = input.required<number>();
  readonly cardCount = input.required<number>();
}
