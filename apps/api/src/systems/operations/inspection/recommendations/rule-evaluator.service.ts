import { Injectable, Logger, Optional } from "@nestjs/common";
import {
  GroupedRuleEvaluation,
  ServiceRecommendationRule,
  TargetEvaluationContext,
} from "./recommendation-rule.types";
import {
  ALL_MASTER_RECOMMENDATION_RULES,
  CURRENT_ENGINE_VERSION,
} from "./recommendation-rules.dataset";
import { GeneratedRecommendation } from "../domain/inspection.types";

/**
 * Generic Rule Evaluator Service.
 *
 * Implements the Phase B Data-Driven Recommendation Architecture:
 * - Decouples rule definitions from execution logic.
 * - Evaluates declarative ServiceRecommendationRule definitions against target context.
 * - Produces immutable GeneratedRecommendation snapshots ready for InspectionAggregate attachment.
 */
@Injectable()
export class RuleEvaluatorService {
  private readonly logger = new Logger(RuleEvaluatorService.name);
  private readonly rules: readonly ServiceRecommendationRule[];

  constructor(@Optional() customRules?: ServiceRecommendationRule[]) {
    this.rules = customRules || ALL_MASTER_RECOMMENDATION_RULES;
  }

  /**
   * Evaluates rules for an individual target component and groups recommendations.
   */
  evaluateTarget(context: TargetEvaluationContext): GroupedRuleEvaluation {
    const candidateRules = this.rules.filter(
      (r) => r.canonicalPartSlug.toLowerCase() === context.canonicalPartSlug.toLowerCase(),
    );

    const generatedRecs: GeneratedRecommendation[] = [];

    for (const rule of candidateRules) {
      const matchResult = this.evaluateRuleConditions(rule, context);
      if (!matchResult.isMatch) {
        continue;
      }

      const rec: GeneratedRecommendation = {
        id: `rec-${context.targetResultId}-${rule.id}`.toLowerCase(),
        ruleId: rule.id,
        ruleVersion: rule.ruleVersion,
        engineVersion: CURRENT_ENGINE_VERSION,
        targetResultId: context.targetResultId,
        serviceKey: rule.serviceKey,
        serviceDisplayName: rule.serviceDisplayName,
        recommendationLevel: rule.recommendationLevel,
        score: matchResult.computedScore,
        generatedAt: new Date().toISOString(),
        evaluationContext: {
          findingKeys: [...context.findingKeys],
          severities: [...context.severities],
          position: context.position,
        },
      };

      generatedRecs.push(rec);
    }

    // Sort descending by score
    generatedRecs.sort((a, b) => b.score - a.score);

    const recommended = generatedRecs.filter((r) => r.recommendationLevel === "RECOMMENDED");
    const related = generatedRecs.filter((r) => r.recommendationLevel === "RELATED");
    const diagnostic = generatedRecs.filter((r) => r.recommendationLevel === "DIAGNOSTIC");

    return {
      targetResultId: context.targetResultId,
      recommendations: generatedRecs,
      recommended,
      related,
      diagnostic,
    };
  }

  /**
   * Internal condition evaluator.
   */
  private evaluateRuleConditions(
    rule: ServiceRecommendationRule,
    context: TargetEvaluationContext,
  ): { isMatch: boolean; computedScore: number } {
    let score = rule.baseScore;

    if (!rule.conditions) {
      // Unconditional fallback rule (e.g. general diagnostic scan)
      return { isMatch: true, computedScore: score };
    }

    const { positions, findingKeys, severities, vehicleCategories } = rule.conditions;

    // 1. Position match / suppression
    if (positions && positions.length > 0) {
      const positionMatches = positions.includes(context.position);
      if (!positionMatches) {
        // Position mismatch disqualifies the rule (e.g. rear EPB service on front axle)
        return { isMatch: false, computedScore: 0 };
      }
      score += 5; // Position alignment bonus
    }

    // 2. Vehicle category filter
    if (vehicleCategories && vehicleCategories.length > 0 && context.vehicleCategory) {
      if (!vehicleCategories.includes(context.vehicleCategory)) {
        return { isMatch: false, computedScore: 0 };
      }
    }

    // 3. Finding keys match
    let findingMatched = false;
    if (findingKeys && findingKeys.length > 0) {
      const hasKeyMatch = context.findingKeys.some((fk) => findingKeys.includes(fk));
      if (hasKeyMatch) {
        findingMatched = true;
        score += 15; // Finding match bonus
      }
    }

    // 4. Severity match
    let severityMatched = false;
    if (severities && severities.length > 0) {
      const hasSeverityMatch = context.severities.some((s) => severities.includes(s));
      if (hasSeverityMatch) {
        severityMatched = true;
        score += 10; // Severity match bonus
      }
    }

    // If rule required findingKeys, at least one must have matched
    if (findingKeys && findingKeys.length > 0 && !findingMatched) {
      return { isMatch: false, computedScore: 0 };
    }

    // If rule required severities, at least one must have matched
    if (severities && severities.length > 0 && !severityMatched) {
      return { isMatch: false, computedScore: 0 };
    }

    return { isMatch: true, computedScore: score };
  }
}
