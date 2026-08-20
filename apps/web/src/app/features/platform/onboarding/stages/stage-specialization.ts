import { Component, computed, inject, input } from '@angular/core';
import { definitionsSeededBy } from '@mop/shared';
import { OnboardingStore } from '../onboarding.store';
import type { OnboardingBlueprint } from '../onboarding.api';

/**
 * What kind of work this workshop does, and the cards it records it on.
 *
 * A pack is not a tag. Each one lists the exact service cards and
 * measurement forms the creation transaction will write, and this stage
 * shows those names and their fields — so the promise on screen and the
 * rows in the database are the same list, read from the same place.
 *
 * Only packs that suit the chosen category are offered. A motorcycle
 * shop is never shown a hydraulic-pressure diagnostic, because offering
 * it and then refusing it at publish would be worse than not offering it.
 */
@Component({
  selector: 'app-stage-specialization',
  imports: [],
  templateUrl: './stage-specialization.html',
  styleUrl: './stage-specialization.css',
})
export class StageSpecialization {
  readonly blueprint = input.required<OnboardingBlueprint>();
  protected readonly store = inject(OnboardingStore);

  protected readonly packs = computed(() => this.store.availablePacks());

  /** Exactly what will be created, de-duplicated the way the seeder does it. */
  protected readonly willCreate = computed(() => definitionsSeededBy(this.store.draft().specializationPacks));

  protected isSelected(key: string): boolean {
    return this.store.draft().specializationPacks.includes(key);
  }

  protected toggle(key: string): void {
    this.store.togglePack(key);
  }

  protected kindWords(kind: string): string {
    return kind === 'SERVICE_CARD' ? 'Service card' : 'Measurement form';
  }

  protected fieldSummary(field: { label: string; type: string; unit?: string; required?: boolean }): string {
    const unit = field.unit ? ` in ${field.unit}` : '';
    const required = field.required ? ', required' : '';
    return `${field.type.toLowerCase()}${unit}${required}`;
  }
}
