import { Component, inject, input } from '@angular/core';
import { PROFILE_PRESENTATION, SHIPPED_PROFILES, isCapabilityActive } from '@mop/shared';
import { OnboardingStore } from '../onboarding.store';
import type { CapabilityBlueprint } from '../onboarding.api';

/**
 * The capability stage's opening move: the shapes the platform ships.
 *
 * `SHIPPED_PROFILES` has existed since Phase 2, is validated in CI so a
 * lifecycle change can never silently strand one, and says in its own doc
 * comment that Super Admin "applies one at creation and adjusts after".
 * Nothing has ever applied one.
 *
 * It earns its place beyond convenience. A profile records *deviations*
 * from the full product, so an untouched configuration is the complete
 * twelve-capability platform — correct, and a poor thing to open on:
 * twelve cards all on, with nothing suggesting any is a decision. Naming
 * the shapes makes the differences legible in one press.
 */
@Component({
  selector: 'app-capability-shapes',
  imports: [],
  templateUrl: './capability-shapes.html',
  styleUrl: './capability-shapes.css',
})
export class CapabilityShapes {
  readonly capabilities = input.required<readonly CapabilityBlueprint[]>();
  protected readonly store = inject(OnboardingStore);
  protected readonly shapes = PROFILE_PRESENTATION;

  /** How many capabilities a shape leaves live — the difference as a number, before it is a click. */
  protected activeCountFor(key: string): number {
    const profile = SHIPPED_PROFILES[key] ?? {};
    return this.capabilities().filter((capability) => isCapabilityActive(profile, capability.key)).length;
  }

  protected readonly total = () => this.capabilities().length;
}
