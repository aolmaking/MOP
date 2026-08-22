import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  CapabilityConsequence,
  CapabilityPresentation,
  CountryEntry,
  DraftFinding,
  OnboardingStage,
  SpecializationPack,
} from '@mop/shared';

/**
 * The onboarding endpoints.
 *
 * The types below are the server's response shapes, not a second opinion
 * about them -- the domain pieces (`CapabilityConsequence`,
 * `DraftFinding`, `SpecializationPack`) are imported from `@mop/shared`
 * rather than redeclared, so a change to the engine breaks this file at
 * compile time instead of silently at runtime.
 */

export interface GateWords {
  readonly key: string;
  readonly checkpoint: string;
  readonly blocked: string;
  readonly satisfied: string;
}

export interface CapabilityBlueprint extends CapabilityPresentation {
  readonly consequence: CapabilityConsequence;
  readonly gateWords: readonly GateWords[];
}

export interface PolicyOptionBlueprint {
  readonly key: string;
  readonly label: string;
  readonly meaning: string;
}

export interface PolicyBlueprint {
  readonly key: string;
  readonly question: string;
  readonly options: readonly PolicyOptionBlueprint[];
  readonly default: string;
  readonly defaultReason: string;
  readonly mutability: string;
  readonly buildPosture: string;
  readonly dependsOnCapabilities: readonly string[];
  readonly dependsOnPolicies: readonly string[];
  readonly enforcement: { readonly status: string; readonly where: string };
  readonly group: string;
  readonly impact: {
    readonly capabilities: readonly string[];
    readonly roles: readonly string[];
    readonly workflowStates: readonly string[];
    readonly permissions: readonly string[];
    readonly pages: readonly string[];
    readonly changesVisibility: boolean;
    readonly changesBilling: boolean;
    readonly summary: string;
  };
}

export interface ResponsibilityBlueprint {
  readonly capability: string;
  readonly dedicatedRole: string;
  readonly question: string;
  readonly why: string;
  readonly fallbackRoles: readonly string[];
  readonly defaultAnswer: string;
}

export interface PlanBlueprint {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly maxBranches: number;
  readonly maxUsers: number;
  readonly maxWarehouses: number;
  readonly monthlyPrice: string;
}

export interface OnboardingBlueprint {
  readonly stages: readonly OnboardingStage[];
  readonly capabilities: readonly CapabilityBlueprint[];
  readonly owningSystems: Readonly<Record<string, { title: string; summary: string }>>;
  readonly policies: readonly PolicyBlueprint[];
  readonly policyGroups: readonly { key: string; title: string; summary: string }[];
  readonly specializationPacks: readonly SpecializationPack[];
  readonly responsibilities: readonly ResponsibilityBlueprint[];
  readonly countries: readonly CountryEntry[];
  readonly currencies: readonly string[];
  readonly categories: readonly { value: string; label: string }[];
  readonly businessTypes: readonly string[];
  readonly initialStatuses: readonly { key: string; help: string }[];
  readonly plans: readonly PlanBlueprint[];
}

export interface DraftValidationResponse {
  readonly publishable: boolean;
  readonly findings: readonly DraftFinding[];
  readonly blockerCount: number;
  readonly warningCount: number;
}

/** One real thing the creation transaction did, with the count it really wrote. */
export interface ProvisioningStep {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly detail: string;
}

export interface CreateWorkshopResponse {
  readonly tenant: { id: string; name: string; slug: string };
  readonly steps: readonly ProvisioningStep[];
  readonly inviteLink: string;
  readonly demoDataEnqueued: boolean;
}

@Injectable({ providedIn: 'root' })
export class OnboardingApi {
  private readonly http = inject(HttpClient);

  blueprint(): Observable<OnboardingBlueprint> {
    return this.http.get<OnboardingBlueprint>('/api/v1/platform/onboarding/blueprint');
  }

  validate(draft: Record<string, unknown>): Observable<DraftValidationResponse> {
    return this.http.post<DraftValidationResponse>('/api/v1/platform/onboarding/validate', draft);
  }

  publish(payload: Record<string, unknown>): Observable<CreateWorkshopResponse> {
    return this.http.post<CreateWorkshopResponse>('/api/v1/platform/workshops', payload);
  }
}
