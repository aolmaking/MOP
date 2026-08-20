import { Component, computed, inject, input, signal } from '@angular/core';
import { isCapabilityActive, type CapabilityKey } from '@mop/shared';
import { OnboardingStore } from '../onboarding.store';
import type { CapabilityBlueprint, OnboardingBlueprint } from '../onboarding.api';

/**
 * The capability stage.
 *
 * Two things make this different from a list of switches.
 *
 * **A card states real consequences.** Which pages it unlocks, which
 * roles it gives work to, which check it adds before a job can finish,
 * which later questions it raises — all of it read from the capability
 * registry, the gate registry and the page registry, none of it written
 * for this screen. That is what lets the card say "this adds a check
 * before a job can finish: *A received part is neither marked used nor
 * returned*" in the gate's own words.
 *
 * **Turning one off resolves its own consequences immediately.** The
 * store cascades dependents down, pulls dependencies up, and drops
 * answers to questions the change makes meaningless — then this stage
 * says exactly what moved. Discovering that at publish is what makes a
 * configuration screen feel like a form with a validator bolted on.
 */
@Component({
  selector: 'app-stage-capabilities',
  imports: [],
  templateUrl: './stage-capabilities.html',
  styleUrl: './stage-capabilities.css',
})
export class StageCapabilities {
  readonly blueprint = input.required<OnboardingBlueprint>();
  protected readonly store = inject(OnboardingStore);

  /** The card whose full preview is open. Only one at a time. */
  protected readonly expanded = signal<CapabilityKey | null>(null);

  /**
   * Capabilities grouped by the system that owns them.
   *
   * The grouping is the registry's own `owningSystem`, not a second
   * opinion about it, so a capability moved between systems moves here
   * too without anyone editing a list.
   */
  protected readonly groups = computed(() => {
    const bySystem = new Map<string, CapabilityBlueprint[]>();
    for (const capability of this.blueprint().capabilities) {
      const system = capability.consequence.owningSystem;
      if (!bySystem.has(system)) bySystem.set(system, []);
      bySystem.get(system)!.push(capability);
    }
    return [...bySystem.entries()].map(([system, capabilities]) => ({
      system,
      title: this.blueprint().owningSystems[system]?.title ?? system,
      summary: this.blueprint().owningSystems[system]?.summary ?? '',
      capabilities,
    }));
  });

  protected isOn(key: string): boolean {
    return isCapabilityActive(this.store.draft().capabilities, key);
  }

  protected isExternal(key: string): boolean {
    return this.store.draft().capabilities[key as CapabilityKey] === 'EXTERNAL';
  }

  /**
   * A capability with no removal policy is CORE and may never be turned
   * off — enforced by the engine, so the switch is simply not offered
   * rather than offered and then refused.
   */
  protected isCore(capability: CapabilityBlueprint): boolean {
    return capability.consequence.removalBehavior === null;
  }

  /**
   * Whether "handled outside MOP" is a real option for this capability.
   *
   * Only where the registry declares EXTERNALIZE as the removal
   * behaviour: Finance Core and Billing are the two where the business
   * function still happens and MOP simply does not perform it. Offering
   * it anywhere else would be inventing a mode.
   */
  protected supportsExternal(capability: CapabilityBlueprint): boolean {
    return capability.consequence.removalBehavior === 'EXTERNALIZE';
  }

  protected toggle(capability: CapabilityBlueprint): void {
    const key = capability.key;
    this.store.setCapability(key, this.isOn(key) ? 'DISABLED' : 'ENABLED');
  }

  protected setExternal(capability: CapabilityBlueprint): void {
    this.store.setCapability(capability.key, 'EXTERNAL');
  }

  protected togglePreview(key: CapabilityKey): void {
    this.expanded.update((current) => (current === key ? null : key));
  }

  /** The human title for a capability key, for dependency lists. */
  protected titleOf(key: string): string {
    return this.blueprint().capabilities.find((capability) => capability.key === key)?.title ?? key;
  }

  /** A policy key as its question, so a dependency reads as a real consequence. */
  protected questionOf(policyKey: string): string {
    return this.blueprint().policies.find((policy) => policy.key === policyKey)?.question ?? policyKey;
  }
}
