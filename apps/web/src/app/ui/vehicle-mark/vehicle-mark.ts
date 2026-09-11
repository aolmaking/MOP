import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { findVehicleMake, type OperatingCategory } from '@mop/shared';
import { MARQUE_MARKS } from './marque-marks';

/**
 * The badge of the vehicle, for someone who is not reading the words.
 *
 * A technician crossing a workshop floor identifies the car they are
 * walking to by its badge, not by a plate number they have to spell out.
 * Every row that names a vehicle carries this, so the queue can be read
 * the same way the floor is.
 *
 * Three things can be drawn, in order of what is known:
 *
 *  1. the marque's badge, drawn in vector in `marque-marks.ts`;
 *  2. the marque's name set as a wordmark in its own colour, when there is
 *     no drawn badge for it yet -- still a badge, never a placeholder;
 *  3. the kind of machine alone, when no make was recorded at all.
 *
 * Case 3 matters: a guessed marque on the screen someone uses to confirm
 * they have the right car is worse than an empty space.
 */
@Component({
  selector: 'mop-vehicle-mark',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="mark" [class.mark--unknown]="!known()" [attr.aria-label]="label()" role="img">
      @if (drawn(); as svg) {
        <span class="mark-art" [innerHTML]="svg"></span>
      } @else if (known(); as make) {
        <span class="mark-word" [style.--marque]="make.tint">{{ make.label }}</span>
      }
      <span class="mark-kind" aria-hidden="true">{{ kindIcon() }}</span>
    </span>
  `,
  styles: [
    `
      .mark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: relative;
        inline-size: var(--mark-size, 52px);
        block-size: var(--mark-size, 52px);
        border-radius: var(--radius-md);
        /* A badge sits on its own quiet ground rather than a coloured tile:
           the marques carry the colour, and a tinted tile behind them turns
           a row of cars into a row of swatches. */
        background: var(--surface-raised);
        border: 1px solid var(--border);
        overflow: hidden;
        flex: none;
      }

      .mark-art,
      .mark-art > svg {
        display: block;
        inline-size: 100%;
        block-size: 100%;
      }

      .mark-art {
        padding: 12%;
        box-sizing: border-box;
      }

      /* The name as the badge, for a marque with no drawn art yet. */
      .mark-word {
        display: flex;
        align-items: center;
        justify-content: center;
        inline-size: 100%;
        block-size: 100%;
        padding-inline: 6%;
        background: var(--marque);
        color: #fff;
        font-size: calc(var(--mark-size, 52px) * 0.2);
        font-weight: 800;
        line-height: 1.05;
        letter-spacing: -0.01em;
        text-align: center;
        text-shadow: 0 1px 2px rgb(0 0 0 / 0.45);
        overflow: hidden;
      }

      /* The kind of machine, tucked into the corner -- the second signal,
         for a marque that builds more than one. */
      .mark-kind {
        position: absolute;
        inset-block-end: -1px;
        inset-inline-end: -1px;
        font-size: calc(var(--mark-size, 52px) * 0.28);
        line-height: 1;
        filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.55));
      }

      /* Nothing recorded: the silhouette alone, centred, no invented badge. */
      .mark--unknown .mark-kind {
        position: static;
        font-size: calc(var(--mark-size, 52px) * 0.5);
      }
    `,
  ],
})
export class VehicleMark {
  private readonly sanitizer = inject(DomSanitizer);

  readonly make = input<string | null | undefined>(null);
  readonly category = input<string | null | undefined>('CARS');

  protected readonly known = computed(() => findVehicleMake(this.make()));

  /**
   * The drawn badge, if this marque has one.
   *
   * Trusted because it is a constant in this repository, never anything a
   * tenant or a customer supplied -- the sanitizer would otherwise strip
   * the SVG entirely.
   */
  protected readonly drawn = computed(() => {
    const id = this.known()?.id;
    const art = id ? MARQUE_MARKS[id] : undefined;
    return art ? this.sanitizer.bypassSecurityTrustHtml(`<svg viewBox="0 0 64 64">${art}</svg>`) : null;
  });

  protected readonly kindIcon = computed(() => {
    switch ((this.category() ?? '').toUpperCase() as OperatingCategory | '') {
      case 'MOTORCYCLES':
        return '🏍️';
      case 'HEAVY_EQUIPMENT':
        return '🚚';
      default:
        return '🚗';
    }
  });

  protected readonly label = computed(() => {
    const make = this.known();
    const kind = (this.category() ?? 'CARS').toLowerCase().replace(/_/g, ' ');
    return make ? `${make.label} ${kind}` : kind;
  });
}
