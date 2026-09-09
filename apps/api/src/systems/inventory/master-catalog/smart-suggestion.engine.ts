import { Injectable } from "@nestjs/common";
import {
  CARS_SERVICES,
  CARS_CANONICAL_PARTS,
  type MasterServiceDef,
  type MasterCanonicalPartDef,
  type ComponentPosition,
} from "./cars-catalog.dataset";
import { MOTORCYCLES_SERVICES, MOTORCYCLES_CANONICAL_PARTS } from "./motorcycles-catalog.dataset";
import { HEAVY_EQUIPMENT_SERVICES, HEAVY_EQUIPMENT_CANONICAL_PARTS } from "./heavy-equipment-catalog.dataset";

export type SuggestionRankGroup = "RECOMMENDED" | "RELATED" | "DIAGNOSTIC";

export interface RankedServiceItem {
  readonly serviceKey: string;
  readonly serviceName: string;
  readonly category: string;
  readonly laborPrice: string;
  readonly standardHours: number;
  readonly rankGroup: SuggestionRankGroup;
  readonly score: number;
  readonly rationale: string;
  readonly isPrimary: boolean;
}

export interface GroupedSuggestionsResponse {
  readonly recommended: readonly RankedServiceItem[];
  readonly related: readonly RankedServiceItem[];
  readonly diagnostic: readonly RankedServiceItem[];
  readonly all: readonly RankedServiceItem[];
}

export interface SuggestionContext {
  readonly workOrderId?: string;
  readonly canonicalPartSlug?: string;
  readonly position?: ComponentPosition;
  readonly finding?: {
    readonly key?: string;
    readonly symptom?: "WEAR" | "LEAK" | "NOISE" | "ELECTRICAL_FAILURE" | "VIBRATION" | "INTERVAL_DUE" | string;
    readonly severity?: "CRITICAL" | "MEDIUM" | "LOW" | "HIGH";
    readonly description?: string;
  };
  readonly vehicle?: {
    readonly category?: "CARS" | "MOTORCYCLES" | "HEAVY_EQUIPMENT";
    readonly make?: string;
    readonly model?: string;
    readonly year?: number;
    readonly mileage?: number;
  };

  // Backwards compatibility properties
  readonly vehicleCategory?: "CARS" | "MOTORCYCLES" | "HEAVY_EQUIPMENT";
  readonly partSkus?: readonly string[];
  readonly partNames?: readonly string[];
  readonly categorySlugs?: readonly string[];
  readonly findingKeys?: readonly string[];
}

export interface SuggestedService {
  readonly serviceName: string;
  readonly category: string;
  readonly laborPrice: string;
  readonly standardHours: number;
  readonly isPrimary: boolean;
  readonly rationale: string;
}

export type SuggestionQuery = SuggestionContext;

@Injectable()
export class SmartSuggestionEngine {
  private readonly allServices: readonly MasterServiceDef[] = [
    ...CARS_SERVICES,
    ...MOTORCYCLES_SERVICES,
    ...HEAVY_EQUIPMENT_SERVICES,
  ];

  /**
   * Two-Tier Context-Aware Suggestion Engine:
   * Level 1: Canonical Mapping (Canonical Part -> Eligible Candidate Services Pool)
   * Level 2: Context Evaluation & Scoring (Severity, Finding, Vehicle Context -> Recommended, Related, Diagnostic)
   */
  suggestForContext(context: SuggestionContext): GroupedSuggestionsResponse {
    const targetCategory = context.vehicle?.category ?? context.vehicleCategory ?? "CARS";

    const servicePool: readonly MasterServiceDef[] =
      targetCategory === "MOTORCYCLES"
        ? MOTORCYCLES_SERVICES
        : targetCategory === "HEAVY_EQUIPMENT"
          ? HEAVY_EQUIPMENT_SERVICES
          : CARS_SERVICES;

    const canonicalPool: readonly MasterCanonicalPartDef[] =
      targetCategory === "MOTORCYCLES"
        ? MOTORCYCLES_CANONICAL_PARTS
        : targetCategory === "HEAVY_EQUIPMENT"
          ? HEAVY_EQUIPMENT_CANONICAL_PARTS
          : CARS_CANONICAL_PARTS;

    // 1. Resolve Target Canonical Part
    let targetCanonical: MasterCanonicalPartDef | undefined;
    const directSlug = (context.canonicalPartSlug ?? "").toLowerCase().trim();

    if (directSlug) {
      targetCanonical = canonicalPool.find(
        (cp) => cp.slug.toLowerCase() === directSlug || cp.slug.toLowerCase().includes(directSlug) || directSlug.includes(cp.slug.toLowerCase())
      );
    }

    const queryTerms: string[] = [
      ...(context.partSkus ?? []),
      ...(context.partNames ?? []),
      ...(context.categorySlugs ?? []),
      ...(context.findingKeys ?? []),
    ]
      .map((t) => t.toLowerCase().trim())
      .filter(Boolean);

    if (!targetCanonical && queryTerms.length > 0) {
      for (const term of queryTerms) {
        targetCanonical = canonicalPool.find(
          (cp) =>
            cp.slug.toLowerCase() === term ||
            cp.slug.toLowerCase().includes(term) ||
            term.includes(cp.slug.toLowerCase()) ||
            cp.name.toLowerCase().includes(term) ||
            term.includes(cp.name.toLowerCase()) ||
            cp.systemSlug.toLowerCase() === term ||
            term.includes(cp.systemSlug.toLowerCase())
        );
        if (targetCanonical) break;
      }
    }

    // 2. Candidate Eligible Services Pool (Tier 1)
    const eligibleServices: MasterServiceDef[] = [];
    if (targetCanonical) {
      for (const srvKey of targetCanonical.linkedServiceKeys) {
        const srv = servicePool.find((s) => (s.serviceKey ?? s.itemKey).toLowerCase() === srvKey.toLowerCase() || s.itemKey.toLowerCase() === srvKey.toLowerCase());
        if (srv && !eligibleServices.some((e) => e.itemKey === srv.itemKey)) {
          eligibleServices.push(srv);
        }
      }
    }

    // Fallback if no specific canonical part matched
    if (eligibleServices.length === 0) {
      const defaultDiag = servicePool.find((s) => s.category === "INSPECTION" || s.category === "DIAGNOSTICS") ?? servicePool[0];
      if (defaultDiag) {
        const item: RankedServiceItem = {
          serviceKey: defaultDiag.serviceKey ?? defaultDiag.itemKey,
          serviceName: defaultDiag.displayName ?? defaultDiag.itemKey,
          category: defaultDiag.category,
          laborPrice: defaultDiag.laborPrice,
          standardHours: defaultDiag.standardHours,
          rankGroup: "RECOMMENDED",
          score: 100,
          rationale: "Standard multi-point inspection recommended for all incoming vehicles.",
          isPrimary: true,
        };
        return {
          recommended: [item],
          related: [],
          diagnostic: [],
          all: [item],
        };
      }
      return { recommended: [], related: [], diagnostic: [], all: [] };
    }

    // 3. Context Evaluation & Scoring (Tier 2)
    const severity = (context.finding?.severity ?? "MEDIUM").toUpperCase();
    const isCritical = severity === "CRITICAL" || severity === "HIGH";
    const isLow = severity === "LOW" || severity === "GOOD";
    const position = context.position ?? "UNIVERSAL";
    const findingDesc = (context.finding?.description ?? "").toLowerCase();
    const symptom = (context.finding?.symptom ?? "").toUpperCase();

    const scoredItems: Array<{ service: MasterServiceDef; score: number; rationale: string; isPrimary: boolean }> = [];

    for (const srv of eligibleServices) {
      let score = 50;
      let rationale = `Standard procedure for ${targetCanonical?.name ?? "component"}.`;
      let isPrimary = false;
      const srvName = (srv.displayName ?? srv.itemKey).toLowerCase();

      // Severity & Procedure type weighting
      const isReplacementOrOverhaul =
        srvName.includes("replacement") ||
        srvName.includes("replace") ||
        srvName.includes("overhaul") ||
        srvName.includes("mount") ||
        srvName.includes("install");

      const isFlushOrClean =
        srvName.includes("flush") ||
        srvName.includes("bleed") ||
        srvName.includes("clean") ||
        srvName.includes("de-corrosion") ||
        srvName.includes("adjust") ||
        srvName.includes("tune");

      const isDiagnosticOrTest =
        srvName.includes("test") ||
        srvName.includes("diagnostic") ||
        srvName.includes("scan") ||
        srvName.includes("measurement") ||
        srvName.includes("inspection") ||
        srvName.includes("runout") ||
        srvName.includes("quiescent") ||
        srvName.includes("draw");

      if (isCritical) {
        if (isReplacementOrOverhaul) {
          score += 40;
          isPrimary = true;
          rationale = `Critical finding requires direct component replacement/overhaul.`;
        } else if (isFlushOrClean) {
          score += 15;
          rationale = `Complementary maintenance recommended during critical repair.`;
        } else if (isDiagnosticOrTest) {
          score += 5;
          rationale = `Diagnostic verification following replacement.`;
        }
      } else if (isLow) {
        if (isDiagnosticOrTest) {
          score += 35;
          isPrimary = true;
          rationale = `Good status verified; routine diagnostic check recommended.`;
        } else if (isFlushOrClean) {
          score += 20;
          rationale = `Routine preventative maintenance.`;
        } else {
          score -= 20;
        }
      } else {
        // Medium / Attention Needed
        if (findingDesc.includes("corrosion") || findingDesc.includes("clean") || symptom === "ELECTRICAL_FAILURE") {
          if (srvName.includes("clean") || srvName.includes("terminal")) {
            score += 45;
            isPrimary = true;
            rationale = `Addresses terminal corrosion finding directly.`;
          } else if (isDiagnosticOrTest) {
            score += 25;
            rationale = `Verification of electrical circuit post-cleaning.`;
          }
        } else if (findingDesc.includes("wear") || findingDesc.includes("worn") || symptom === "WEAR") {
          if (isReplacementOrOverhaul) {
            score += 35;
            isPrimary = true;
            rationale = `Recommended to replace components displaying significant wear.`;
          } else if (isFlushOrClean) {
            score += 20;
            rationale = `Associated hydraulic fluid refresh.`;
          }
        } else {
          score += 20;
        }
      }

      // Position Match Boost & Demotion
      if (position === "FRONT") {
        if (srvName.includes("front")) {
          score += 30;
        } else if (srvName.includes("rear")) {
          score -= 60; // Suppress rear services when inspecting front
        }
      } else if (position === "REAR") {
        if (srvName.includes("rear") || srvName.includes("epb")) {
          score += 30;
        } else if (srvName.includes("front")) {
          score -= 60; // Suppress front services when inspecting rear
        }
      }

      scoredItems.push({ service: srv, score, rationale, isPrimary });
    }

    // Sort by descending score
    scoredItems.sort((a, b) => b.score - a.score);

    // Grouping: Recommended (Top 1-2), Related (1-2), Diagnostic (1)
    const recommended: RankedServiceItem[] = [];
    const related: RankedServiceItem[] = [];
    const diagnostic: RankedServiceItem[] = [];

    for (const item of scoredItems) {
      if (item.score < 20) continue; // Skip heavily penalized/irrelevant items

      const srvName = (item.service.displayName ?? item.service.itemKey).toLowerCase();
      const isDiag =
        srvName.includes("test") ||
        srvName.includes("diagnostic") ||
        srvName.includes("measurement") ||
        srvName.includes("inspection") ||
        srvName.includes("scan") ||
        srvName.includes("runout") ||
        srvName.includes("quiescent");

      const rankedItem: RankedServiceItem = {
        serviceKey: item.service.serviceKey ?? item.service.itemKey,
        serviceName: item.service.displayName ?? item.service.itemKey,
        category: item.service.category,
        laborPrice: item.service.laborPrice,
        standardHours: item.service.standardHours,
        rankGroup: "RECOMMENDED",
        score: item.score,
        rationale: item.rationale,
        isPrimary: item.isPrimary,
      };

      if (isDiag && diagnostic.length === 0) {
        diagnostic.push({ ...rankedItem, rankGroup: "DIAGNOSTIC" });
      } else if (recommended.length < 2 && (item.score >= 70 || (recommended.length === 0 && !isDiag))) {
        recommended.push({ ...rankedItem, rankGroup: "RECOMMENDED" });
      } else if (related.length < 2) {
        related.push({ ...rankedItem, rankGroup: "RELATED" });
      }
    }

    // If recommended is still empty, promote top scored item
    if (recommended.length === 0 && scoredItems.length > 0) {
      const top = scoredItems[0];
      recommended.push({
        serviceKey: top.service.serviceKey ?? top.service.itemKey,
        serviceName: top.service.displayName ?? top.service.itemKey,
        category: top.service.category,
        laborPrice: top.service.laborPrice,
        standardHours: top.service.standardHours,
        rankGroup: "RECOMMENDED",
        score: top.score,
        rationale: top.rationale,
        isPrimary: true,
      });
    }

    const all = [...recommended, ...related, ...diagnostic];

    return {
      recommended,
      related,
      diagnostic,
      all,
    };
  }

  /**
   * Backwards-compatible facade: returns flat array of SuggestedService
   */
  suggestFor(query: SuggestionQuery): readonly SuggestedService[] {
    const grouped = this.suggestForContext(query);
    return grouped.all.map((item) => ({
      serviceName: item.serviceName,
      category: item.category,
      laborPrice: item.laborPrice,
      standardHours: item.standardHours,
      isPrimary: item.isPrimary,
      rationale: item.rationale,
    }));
  }
}
