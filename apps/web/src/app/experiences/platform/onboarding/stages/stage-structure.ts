import { Component, computed, inject, input } from '@angular/core';
import { isCapabilityActive } from '@mop/shared';
import { OnboardingStore } from '../onboarding.store';
import type { OnboardingBlueprint } from '../onboarding.api';

/**
 * The branches this workshop trades from and the stores its parts live in.
 *
 * Both sections appear only when the capabilities above make them
 * meaningful: a workshop with no stock is never shown a store editor,
 * because it has no stock and the section would be a question with no
 * answer.
 *
 * The branch-to-store grants are the part that is easy to get wrong. A
 * store granted to nothing is a store no branch may draw from, which is
 * the same trap as no store at all -- so an empty grant list is read as
 * "every branch" rather than "none".
 */
@Component({
  selector: 'app-stage-structure',
  imports: [],
  templateUrl: './stage-structure.html',
  styleUrl: './stage-structure.css',
})
export class StageStructure {
  readonly blueprint = input.required<OnboardingBlueprint>();
  protected readonly store = inject(OnboardingStore);

  protected readonly multiBranch = computed(() => isCapabilityActive(this.store.draft().capabilities, 'MULTI_BRANCH'));
  protected readonly hasInventory = computed(() => isCapabilityActive(this.store.draft().capabilities, 'INVENTORY'));
  protected readonly multiWarehouse = computed(() =>
    isCapabilityActive(this.store.draft().capabilities, 'MULTI_WAREHOUSE'),
  );

  protected addBranch(): void {
    const index = this.store.draft().branches.length + 1;
    this.store.addBranch({ name: '', code: `BR${index}`, city: this.store.draft().identity.city });
  }

  protected addWarehouse(): void {
    const index = this.store.draft().warehouses.length + 1;
    this.store.addWarehouse({ name: '', code: `WH${index}`, branchCodes: [] });
  }

  /** Upper-cased as typed: a code is compared exactly, and a lowercase one silently fails to match a grant. */
  protected setBranchCode(index: number, value: string): void {
    this.store.updateBranch(index, { code: value.toUpperCase() });
  }

  protected setWarehouseCode(index: number, value: string): void {
    this.store.updateWarehouse(index, { code: value.toUpperCase() });
  }
}
