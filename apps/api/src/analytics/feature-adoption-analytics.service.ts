import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { resolveDateRange, type ReportQueryParams } from "../reports/date-range.util";

export interface FeatureUsageRow {
  readonly feature: string;
  readonly usageCount: number;
  /** True when usageCount is 0 for a feature that IS enabled -- distinct from a disabled feature, which never appears here at all. */
  readonly zeroUsage: boolean;
}

export interface FeatureAdoptionReport {
  readonly range: { from: string; to: string };
  readonly features: readonly FeatureUsageRow[];
  /** Enabled features this page cannot honestly report usage for yet, and why -- see the doc comment below. */
  readonly notTrackable: readonly { readonly feature: string; readonly reason: string }[];
}

/**
 * Data Analyst -- Feature Adoption Analytics
 * (docs/detailed-specs/data-analyst.md). "This page did not exist at
 * all in the previous build" -- genuinely new. Only reports a usage
 * count for features that actually emit a countable fact today.
 *
 * Two of the spec's named examples are NOT reported as usage counts,
 * honestly, rather than faked:
 * - Builder-configured custom fields: CustomFieldDefinition rows exist
 *   (Forms & Fields), but no consuming form UI captures values into them
 *   yet (see forms.module.ts's own doc comment) -- there is nothing to
 *   count.
 * - Message templates: MessageTemplate publish events are countable, but
 *   "usage" per the spec means actual sends, and no message-sending code
 *   exists anywhere in the product yet (see messages.module.ts) --
 *   publish count is reported separately, not conflated with "usage."
 */
@Injectable()
export class FeatureAdoptionAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, params: ReportQueryParams): Promise<FeatureAdoptionReport> {
    const range = resolveDateRange(params);

    const [config, quickInspections, fullInspections, decisionRequests, templatesPublished] = await Promise.all([
      this.prisma.tenantConfiguration.findUnique({ where: { tenantId }, select: { enabledFeatures: true, enabledModules: true } }),
      this.prisma.inspection.count({ where: { tenantId, type: "QUICK", createdAt: { gte: range.from, lte: range.to } } }),
      this.prisma.inspection.count({ where: { tenantId, type: "FULL", createdAt: { gte: range.from, lte: range.to } } }),
      this.prisma.customerDecisionRequest.count({ where: { tenantId, createdAt: { gte: range.from, lte: range.to } } }),
      this.prisma.messageTemplate.count({ where: { tenantId, publishedAt: { gte: range.from, lte: range.to } } }),
    ]);

    const enabled = new Set([...(config?.enabledFeatures ?? []), ...(config?.enabledModules ?? [])]);
    const features: FeatureUsageRow[] = [];

    if (enabled.has("OPERATIONS") || enabled.size === 0) {
      features.push({ feature: "Quick Inspection", usageCount: quickInspections, zeroUsage: quickInspections === 0 });
      features.push({ feature: "Full Inspection", usageCount: fullInspections, zeroUsage: fullInspections === 0 });
      features.push({
        feature: "Customer Decision Request",
        usageCount: decisionRequests,
        zeroUsage: decisionRequests === 0,
      });
    }

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      features,
      notTrackable: [
        {
          feature: "Custom Fields",
          reason: "Definitions exist (Forms & Fields) but no consuming form yet captures values into them.",
        },
        {
          feature: "Message Templates",
          reason: `${templatesPublished} published this period, but real usage means actual sends -- no message-sending code exists anywhere in the product yet.`,
        },
      ],
    };
  }
}
