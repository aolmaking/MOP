import { Component, computed, inject, input, signal } from '@angular/core';
import { country, searchCountries, type CountryEntry, type OperatingCategory } from '@mop/shared';
import { OnboardingStore } from '../onboarding.store';
import type { OnboardingBlueprint } from '../onboarding.api';

function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
}

/**
 * Who this workshop is, where it trades, and in what money and time.
 *
 * The country field carries more weight than it looks: it is not
 * decoration on an address, it is what the currency, the timezone and
 * the working week are derived from. It was free text, which made
 * "egypt", "Egypt" and "EG" three different countries and let the
 * currency contradict all of them.
 */
@Component({
  selector: 'app-stage-identity',
  imports: [],
  templateUrl: './stage-identity.html',
  styleUrl: './stage-identity.css',
})
export class StageIdentity {
  readonly blueprint = input.required<OnboardingBlueprint>();
  protected readonly store = inject(OnboardingStore);

  protected readonly countryQuery = signal('');
  protected readonly countryOpen = signal(false);
  /** Keyboard position in the results list. -1 means nothing is highlighted. */
  protected readonly activeIndex = signal(-1);

  /** Whether the operator has taken the slug over from the name. */
  private readonly slugEdited = signal(false);

  protected readonly matches = computed<readonly CountryEntry[]>(() => searchCountries(this.countryQuery(), 8));

  protected readonly selectedCountry = computed(() => country(this.store.draft().identity.country));

  /**
   * Whether the currency differs from what the country normally uses.
   *
   * Shown as an observation, not a correction: a Cairo workshop
   * invoicing fleet customers in USD is a real business.
   */
  protected readonly currencyIsUnusual = computed(() => {
    const entry = this.selectedCountry();
    const chosen = this.store.draft().identity.currency;
    return entry !== undefined && chosen.length === 3 && entry.currency !== chosen;
  });

  protected readonly weekendWords = computed(() => {
    const entry = this.selectedCountry();
    if (!entry) return null;
    switch (entry.weekend) {
      case 'FRI_SAT':
        return 'Friday and Saturday';
      case 'THU_FRI':
        return 'Thursday and Friday';
      case 'FRI_SUN':
        return 'Friday and Sunday';
      default:
        return 'Saturday and Sunday';
    }
  });

  protected onName(value: string): void {
    this.store.patchIdentity({ name: value });
    if (!this.slugEdited()) this.store.patchIdentity({ slug: deriveSlug(value) });
  }

  protected onSlug(value: string): void {
    this.slugEdited.set(true);
    this.store.patchIdentity({ slug: value });
  }

  protected openCountries(): void {
    this.countryOpen.set(true);
    this.activeIndex.set(-1);
  }

  protected chooseCountry(entry: CountryEntry): void {
    this.store.selectCountry(entry.code);
    this.countryQuery.set(entry.name);
    this.countryOpen.set(false);
    this.activeIndex.set(-1);
  }

  /**
   * Arrow keys move through the results, Enter takes the highlighted one,
   * Escape closes without choosing.
   *
   * Without this the picker is a search box that only a mouse can
   * operate, which would make the single most consequential field on this
   * stage the least accessible one.
   */
  protected onCountryKey(event: KeyboardEvent): void {
    const results = this.matches();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.countryOpen.set(true);
      this.activeIndex.update((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.update((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      const chosen = results[this.activeIndex()];
      if (chosen) {
        event.preventDefault();
        this.chooseCountry(chosen);
      }
    } else if (event.key === 'Escape') {
      this.countryOpen.set(false);
      this.activeIndex.set(-1);
    }
  }

  protected setCategory(value: string): void {
    this.store.setCategory(value as OperatingCategory);
  }
}
