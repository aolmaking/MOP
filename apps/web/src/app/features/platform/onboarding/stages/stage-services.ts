import { Component, computed, inject, input } from '@angular/core';
import { isCapabilityActive } from '@mop/shared';
import { OnboardingStore } from '../onboarding.store';
import type { OnboardingBlueprint } from '../onboarding.api';

/**
 * The named jobs this workshop sells, and what each one costs.
 *
 * These become real `PriceCatalogEntry` rows -- the same table the
 * running invoice resolves a line's price from -- so a service declared
 * here can be charged on the workshop's first job. Deliberately not an
 * onboarding-only list.
 *
 * Prices are entered in major units and stored as minor. The conversion
 * happens once, here, on a string: money crosses every API boundary in
 * MOP as text and never as a JS number, because a float between a
 * customer and their invoice is a rounding error waiting for a decimal.
 */
@Component({
  selector: 'app-stage-services',
  imports: [],
  templateUrl: './stage-services.html',
  styleUrl: './stage-services.css',
})
export class StageServices {
  readonly blueprint = input.required<OnboardingBlueprint>();
  protected readonly store = inject(OnboardingStore);

  protected readonly pricesMoney = computed(() => isCapabilityActive(this.store.draft().capabilities, 'FINANCE_CORE'));
  protected readonly currency = computed(() => this.store.draft().identity.currency || 'the workshop currency');

  protected addService(): void {
    this.store.addService({ name: '', price: '' });
  }

  /** Major units as typed -> minor units stored. "450.5" becomes "45050". */
  protected setPrice(index: number, typed: string): void {
    const cleaned = typed.replace(/[^\d.]/g, '');
    if (cleaned === '') {
      this.store.updateService(index, { price: '' });
      return;
    }
    const [major, minor = ''] = cleaned.split('.');
    const paddedMinor = (minor + '00').slice(0, 2);
    this.store.updateService(index, { price: `${major || '0'}${paddedMinor}`.replace(/^0+(?=\d)/, '') });
  }

  /** Minor units back to a readable major figure for the input's value. */
  protected displayPrice(price: string): string {
    if (!/^\d+$/.test(price)) return price;
    const padded = price.padStart(3, '0');
    return `${padded.slice(0, -2)}.${padded.slice(-2)}`;
  }
}
