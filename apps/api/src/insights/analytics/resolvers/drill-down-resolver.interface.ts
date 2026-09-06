import type { AnalyticsScope } from "../analytics-scope.util";
import type { DrillDownQuery, DrillDownResult } from "../drill-down.types";

export interface DrillDownResolver {
  readonly supportedMetrics: readonly string[];

  resolve(
    tenantId: string,
    scope: AnalyticsScope,
    query: DrillDownQuery,
    range: { from: Date; to: Date },
  ): Promise<DrillDownResult>;
}
