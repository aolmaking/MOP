import { ChangeDetectionStrategy, Component, input } from "@angular/core";

/**
 * Renders a machine identifier -- plate number, VIN/chassis, serial,
 * SKU, work order number, invoice number -- with bidirectional isolation.
 *
 * Why this exists rather than plain interpolation:
 *
 * MOP's primary market works in Arabic, a right-to-left script, while
 * these identifiers are Latin/numeric. The Unicode bidirectional
 * algorithm resolves direction from surrounding context, so a plate
 * number dropped into an Arabic sentence can be **reordered on screen** --
 * "ABC 1234" rendering as "1234 ABC", or a trailing hyphen jumping to the
 * front. A technician reading a plate number backwards off a work order
 * takes the wrong car into the bay. That is an operational error, not a
 * cosmetic one.
 *
 * `<bdi>` (bidirectional isolate) tells the algorithm to treat the
 * content as an independent run, so it renders correctly regardless of
 * the surrounding direction. `dir="ltr"` pins it further: these values
 * are always read left-to-right even inside RTL text.
 *
 * Usage: <mop-identifier [value]="asset.plateNumber" />
 */
@Component({
  selector: "mop-identifier",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<bdi dir="ltr" class="mop-identifier">{{ value() }}</bdi>`,
  styles: [
    `
      .mop-identifier {
        font-family: var(--font-mono);
        unicode-bidi: isolate;
        white-space: nowrap;
      }
    `,
  ],
})
export class Identifier {
  readonly value = input.required<string>();
}
