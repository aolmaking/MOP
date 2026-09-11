/**
 * The marque badges drawn on a vehicle.
 *
 * A technician crossing a workshop floor identifies the car they are
 * walking to by the badge on its bonnet, not by a plate number they have
 * to spell out. So the queue, the front desk and the work card all show
 * the badge, and a two-letter monogram -- which is what this replaced --
 * is not what anybody recognises from six metres away.
 *
 * ## What these are, and what they are not
 *
 * Each mark is drawn here, in vector, from the marque's own geometry: a
 * quartered roundel for BMW, four rings for Audi, three ellipses for
 * Toyota. They are recognisable badges for identifying a vehicle in a
 * workshop -- nominative use, the same reason a parts catalogue prints
 * "fits BMW 3 Series". They are NOT the manufacturers' official artwork:
 * MOP does not ship licensed logo files, and each maker's brand
 * guidelines govern any use beyond identifying a customer's own car.
 * A workshop that wants exact artwork should license it.
 *
 * ## Why drawn rather than fetched
 *
 * A workshop tablet in a bay is regularly on a bad connection or none at
 * all. An `<img src>` to a logo CDN is a grey box exactly when the
 * technician needs to tell two silver saloons apart. These are inline
 * SVG: no request, no cache, no failure mode.
 *
 * A make with no drawn mark falls back to its name set as a wordmark in
 * the marque's own colour, which still reads as a badge and never as a
 * placeholder. `VEHICLE_MAKES` in `@mop/shared` holds the colour.
 */

/**
 * id -> SVG body, drawn inside a 0 0 64 64 viewBox.
 *
 * The `<svg>` wrapper is added by the component so the sizing and the
 * accessible name are decided in one place.
 */
export const MARQUE_MARKS: Readonly<Record<string, string>> = {
  // Quartered roundel: the propeller-and-sky quarters inside a dark ring.
  bmw: `
    <circle cx="32" cy="32" r="30" fill="#0b0b0b"/>
    <circle cx="32" cy="32" r="23" fill="#fff"/>
    <path d="M32 9a23 23 0 0 1 23 23H32z" fill="#0066b1"/>
    <path d="M32 55a23 23 0 0 1-23-23h23z" fill="#0066b1"/>
    <circle cx="32" cy="32" r="23" fill="none" stroke="#0b0b0b" stroke-width="2"/>
    <circle cx="32" cy="32" r="30" fill="none" stroke="#2b2b2b" stroke-width="2"/>
  `,

  // Three-pointed star in a ring.
  mercedes: `
    <circle cx="32" cy="32" r="29" fill="none" stroke="#b7c3cc" stroke-width="4"/>
    <g stroke="#b7c3cc" stroke-width="5" stroke-linecap="round">
      <line x1="32" y1="32" x2="32" y2="5"/>
      <line x1="32" y1="32" x2="9" y2="46"/>
      <line x1="32" y1="32" x2="55" y2="46"/>
    </g>
  `,

  // Four interlocking rings.
  audi: `
    <g fill="none" stroke="#d8dde1" stroke-width="4">
      <circle cx="15" cy="32" r="11"/>
      <circle cx="26.5" cy="32" r="11"/>
      <circle cx="38" cy="32" r="11"/>
      <circle cx="49.5" cy="32" r="11"/>
    </g>
  `,

  // V over W inside a ring.
  volkswagen: `
    <circle cx="32" cy="32" r="29" fill="#001e50"/>
    <circle cx="32" cy="32" r="29" fill="none" stroke="#dfe4e8" stroke-width="3"/>
    <g fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round">
      <path d="M20 20l12 24 12-24"/>
      <path d="M14 34l7 12 5.5-11"/>
      <path d="M50 34l-7 12-5.5-11"/>
    </g>
  `,

  // Three overlapping ellipses.
  toyota: `
    <g fill="none" stroke="#e1e6ea" stroke-width="3.5">
      <ellipse cx="32" cy="32" rx="29" ry="19"/>
      <ellipse cx="32" cy="24" rx="9" ry="7"/>
      <ellipse cx="32" cy="36" rx="19" ry="8" transform="rotate(90 32 36)"/>
    </g>
  `,

  // Circle crossed by a horizontal bar.
  nissan: `
    <circle cx="32" cy="32" r="27" fill="none" stroke="#cfd6dc" stroke-width="4"/>
    <rect x="2" y="26" width="60" height="12" rx="2" fill="#c3002f"/>
    <rect x="2" y="26" width="60" height="12" rx="2" fill="none" stroke="#cfd6dc" stroke-width="2"/>
  `,

  // The squared H.
  honda: `
    <rect x="6" y="10" width="52" height="44" rx="8" fill="none" stroke="#e40521" stroke-width="4"/>
    <path d="M20 20v24M44 20v24M20 30h24v-6M20 34h24" fill="none" stroke="#e40521" stroke-width="4" stroke-linecap="square"/>
  `,

  // Slanted H in an ellipse.
  hyundai: `
    <ellipse cx="32" cy="32" rx="30" ry="19" fill="none" stroke="#c9d2d9" stroke-width="3"/>
    <path d="M20 40c-4-6-2-13 6-15 7-2 14-2 20 1" fill="none" stroke="#c9d2d9" stroke-width="4" stroke-linecap="round"/>
    <path d="M44 24c4 6 2 13-6 15-7 2-14 2-20-1" fill="none" stroke="#c9d2d9" stroke-width="4" stroke-linecap="round"/>
  `,

  // Bowtie.
  chevrolet: `
    <path d="M4 26h20l4-8h12l-2 8h22v12H40l-4 8H24l2-8H4z" fill="#d1a53f" stroke="#4a3a12" stroke-width="2" stroke-linejoin="round"/>
  `,

  // Oval wordmark.
  ford: `
    <ellipse cx="32" cy="32" rx="30" ry="19" fill="#00274e" stroke="#dfe4e8" stroke-width="2"/>
    <text x="32" y="39" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="19" fill="#fff">Ford</text>
  `,

  // The iron mark: circle with the arrow.
  volvo: `
    <circle cx="30" cy="34" r="22" fill="none" stroke="#c9d2d9" stroke-width="4"/>
    <path d="M44 20h14v14" fill="none" stroke="#c9d2d9" stroke-width="4"/>
    <path d="M44 20l16-16" fill="none" stroke="#c9d2d9" stroke-width="4"/>
  `,

  // Three diamonds.
  mitsubishi: `
    <g fill="#e60012">
      <path d="M32 6l11 19H21z"/>
      <path d="M18 30l11 19H7z" transform="rotate(180 18 39.5)"/>
      <path d="M46 30l11 19H35z" transform="rotate(180 46 39.5)"/>
    </g>
  `,

  // The diamond outline.
  renault: `
    <path d="M32 4l20 28-20 28-20-28z" fill="none" stroke="#d7dde2" stroke-width="4"/>
    <path d="M32 16l12 16-12 16-12-16z" fill="none" stroke="#d7dde2" stroke-width="4"/>
  `,

  // Double chevron.
  citroen: `
    <g fill="none" stroke="#d7dde2" stroke-width="6" stroke-linecap="square">
      <path d="M14 30l18-14 18 14"/>
      <path d="M14 48l18-14 18 14"/>
    </g>
  `,

  // Circle with the bolt.
  opel: `
    <circle cx="32" cy="32" r="28" fill="none" stroke="#e8eef2" stroke-width="4"/>
    <path d="M14 32h14l-6-8 24 8-14 0 6 8z" fill="#e8eef2"/>
  `,

  // Winged oval.
  mazda: `
    <ellipse cx="32" cy="32" rx="30" ry="19" fill="none" stroke="#d7dde2" stroke-width="3"/>
    <path d="M32 40c-8-10-14-12-18-11 6-4 14-1 18 5 4-6 12-9 18-5-4-1-10 1-18 11z" fill="#d7dde2"/>
  `,

  // Seven-slot grille.
  jeep: `
    <rect x="6" y="16" width="52" height="32" rx="4" fill="none" stroke="#cfd6dc" stroke-width="3"/>
    <g stroke="#cfd6dc" stroke-width="4">
      <line x1="14" y1="22" x2="14" y2="42"/>
      <line x1="21" y1="22" x2="21" y2="42"/>
      <line x1="28" y1="22" x2="28" y2="42"/>
      <line x1="35" y1="22" x2="35" y2="42"/>
      <line x1="42" y1="22" x2="42" y2="42"/>
      <line x1="49" y1="22" x2="49" y2="42"/>
    </g>
  `,

  // Oval with the L.
  lexus: `
    <ellipse cx="32" cy="32" rx="30" ry="20" fill="none" stroke="#d7dde2" stroke-width="3"/>
    <path d="M22 18v22h18" fill="none" stroke="#d7dde2" stroke-width="4"/>
    <path d="M22 18l20 22" fill="none" stroke="#d7dde2" stroke-width="4"/>
  `,

  // Crest.
  porsche: `
    <path d="M32 4l24 6v22c0 14-12 24-24 28C20 56 8 46 8 32V10z" fill="#c9a227" stroke="#3a2f0b" stroke-width="2"/>
    <path d="M32 4v56M8 26h48" stroke="#3a2f0b" stroke-width="2"/>
  `,

  // Winged arrow in a ring.
  skoda: `
    <circle cx="32" cy="32" r="28" fill="none" stroke="#0e3a2f" stroke-width="4"/>
    <path d="M12 40l26-16 4 6-8 2 12 6-30 8z" fill="#0e3a2f"/>
  `,

  // Oval with the cluster of stars.
  subaru: `
    <ellipse cx="32" cy="32" rx="30" ry="19" fill="#0041aa" stroke="#cfd6dc" stroke-width="2"/>
    <g fill="#fff">
      <circle cx="20" cy="32" r="4"/>
      <circle cx="34" cy="24" r="3"/>
      <circle cx="40" cy="31" r="3"/>
      <circle cx="34" cy="39" r="3"/>
      <circle cx="47" cy="26" r="2.5"/>
      <circle cx="47" cy="37" r="2.5"/>
    </g>
  `,

  // Three tuning forks.
  yamaha: `
    <circle cx="32" cy="32" r="29" fill="#0033a0"/>
    <g fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round">
      <path d="M32 12v40"/>
      <path d="M14 44L32 14l18 30"/>
      <path d="M20 34h24"/>
    </g>
  `,

  // The K.
  kawasaki: `
    <circle cx="32" cy="32" r="29" fill="#5a9e00"/>
    <path d="M20 14v36M20 32l20-18M20 32l20 18" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
  `,

  // Wordmark bar.
  ktm: `
    <rect x="2" y="18" width="60" height="28" rx="4" fill="#ff6600"/>
    <text x="32" y="40" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="20" font-weight="900" fill="#111">KTM</text>
  `,

  // Shield.
  ducati: `
    <path d="M32 4c14 2 26 6 26 6v20c0 16-14 26-26 30C20 56 6 46 6 30V10s12-4 26-6z" fill="#cc0000"/>
    <text x="32" y="38" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="18" fill="#fff">D</text>
  `,

  // The triangle-in-wordmark.
  caterpillar: `
    <rect x="2" y="18" width="60" height="28" rx="3" fill="#111"/>
    <text x="26" y="41" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="21" font-weight="900" fill="#ffcd11">CA</text>
    <path d="M42 42l10-18 10 18z" fill="#ffcd11"/>
  `,

  // Octagon.
  mg: `
    <path d="M20 6h24l14 14v24L44 58H20L6 44V20z" fill="#c8102e"/>
    <text x="32" y="40" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#fff">MG</text>
  `,
};

/** Whether a drawn badge exists for this make. */
export function hasMarqueMark(makeId: string | null | undefined): boolean {
  return !!makeId && makeId in MARQUE_MARKS;
}
