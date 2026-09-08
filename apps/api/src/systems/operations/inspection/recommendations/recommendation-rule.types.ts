import { ComponentPosition } from "../../../inventory/master-catalog/cars-catalog.dataset";
import { FindingSeverity, GeneratedRecommendation } from "../domain/inspection.types";

/**
 * Declarative rule defining when a specific canonical service should be recommended.
 * Decoupled from hardcoded if-else logic into a transparent, data-driven domain object.
 */
export interface ServiceRecommendationRule {
  readonly id: string;
  readonly ruleVersion: number;
  readonly canonicalPartSlug: string;
  readonly serviceKey: string;
  readonly serviceDisplayName: string;

  // Matching conditions
  readonly conditions?: {
    readonly findingKeys?: readonly string[];
    readonly severities?: readonly FindingSeverity[];
    readonly positions?: readonly ComponentPosition[];
    readonly vehicleCategories?: readonly string[];
  };

  readonly recommendationLevel: "RECOMMENDED" | "RELATED" | "DIAGNOSTIC";
  readonly baseScore: number;
  readonly explanationTemplate?: string;
}

/**
 * Context supplied to the Rule Evaluator for matching.
 */
export interface TargetEvaluationContext {
  readonly targetResultId: string;
  readonly targetKey: string;
  readonly canonicalPartSlug: string;
  readonly position: ComponentPosition;
  readonly findingKeys: readonly string[];
  readonly severities: readonly FindingSeverity[];
  readonly vehicleCategory?: string;
}

/**
 * Grouped evaluation output ready for UI display or aggregate attachment.
 */
export interface GroupedRuleEvaluation {
  readonly targetResultId: string;
  readonly recommendations: readonly GeneratedRecommendation[];
  readonly recommended: readonly GeneratedRecommendation[];
  readonly related: readonly GeneratedRecommendation[];
  readonly diagnostic: readonly GeneratedRecommendation[];
}
