import { Component, input } from '@angular/core';

export type PillTone = 'success' | 'warning' | 'danger' | 'neutral';

/**
 * A colored status badge -- e.g. Tenant Status (Active/Frozen/...),
 * Health (Healthy/At Risk/Critical), Builder Status. Deliberately takes a
 * plain `tone`, not a status enum: which specific status maps to which
 * tone is a business decision each caller makes (e.g. "Trial" is a
 * warning tone for Tenant Status but wouldn't exist at all for Health),
 * not something this component should hardcode.
 */
@Component({
  selector: 'app-status-pill',
  templateUrl: './status-pill.html',
})
export class StatusPill {
  readonly tone = input<PillTone>('neutral');
}
