import { Component, input } from '@angular/core';
import type { PolicyBlueprint } from '../onboarding.api';

/**
 * The consequence strip shown on every policy question, prominently
 * rather than behind a disclosure -- "a Policy is a decision that
 * changes how the workshop operates", so what it touches belongs beside
 * the question, not filed under "why".
 *
 * A separate component rather than more markup in StagePolicies:
 * apps/web's anyComponentStyle budget is 8kB, and stage-policies.css was
 * already close to it before this existed.
 */
@Component({
  selector: 'app-policy-impact',
  imports: [],
  templateUrl: './policy-impact.html',
  styleUrl: './policy-impact.css',
})
export class PolicyImpact {
  readonly impact = input.required<PolicyBlueprint['impact']>();

  protected roleLabel(role: string): string {
    return role.toLowerCase().replace(/_/g, ' ');
  }
}
