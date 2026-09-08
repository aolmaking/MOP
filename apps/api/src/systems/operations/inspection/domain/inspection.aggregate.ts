import {
  InspectionAggregateDocument,
  InspectionCondition,
  InspectionFinding,
  InspectionLifecycleState,
  InspectionReportSnapshot,
  SnapshotTargetItem,
  SnapshotRecommendationItem,
  InspectionTargetResult,
  GeneratedRecommendation,
  RecommendationDecision,
  RecommendationDecisionStatus,
  TargetInspectionStatus,
} from "./inspection.types";
import { ComponentPosition } from "../../../inventory/master-catalog/cars-catalog.dataset";
import { findFindingDefByKey } from "./finding-catalog.dataset";

export class DomainInvariantViolationError extends Error {
  constructor(message: string) {
    super(`[DomainInvariantViolation] ${message}`);
    this.name = "DomainInvariantViolationError";
  }
}

export interface CreateInspectionParams {
  readonly id: string;
  readonly tenantId: string;
  readonly workOrderId: string;
  readonly technicianStaffId: string;
  readonly catalogVersion: number;
  readonly templateCode: string;
  readonly initialTargets?: readonly {
    readonly targetKey: string;
    readonly canonicalPartSlug: string;
    readonly position: ComponentPosition;
  }[];
}

export interface RecordTargetResultParams {
  readonly targetKey: string;
  readonly canonicalPartSlug: string;
  readonly position: ComponentPosition;
  readonly status: TargetInspectionStatus;
  readonly condition?: InspectionCondition;
  readonly nonInspectionReason?: string;
  readonly findings?: readonly {
    readonly findingKey: string;
    readonly severity: "CRITICAL" | "ATTENTION" | "INFO";
    readonly technicianObservation?: string;
  }[];
  readonly technicianNote?: string;
  readonly measurementValue?: number;
  readonly measurementUnit?: string;
  readonly mediaUrls?: readonly string[];
  readonly inspectedByStaffId?: string;
}

/**
 * Inspection Aggregate Root.
 *
 * Implements strict Domain-Driven Design (DDD) invariants:
 * - INV-1: Completeness on completion/submission (no uninspected targets without valid reason).
 * - INV-2: Condition consistency (strictly present only when status is INSPECTED).
 * - INV-3: Finding containment (findings strictly tied to target results).
 * - INV-4: Severity escalation (CRITICAL finding forces CRITICAL condition; ATTENTION finding forbids GOOD).
 * - INV-5: Recommendation immutability & audit decisions.
 * - INV-6: Frozen immutable snapshot on submission (no mutations after SUBMITTED).
 */
export class InspectionAggregate {
  private _id: string;
  private _tenantId: string;
  private _workOrderId: string;
  private _technicianStaffId: string;
  private _aggregateVersion: number;
  private _catalogVersion: number;
  private _templateCode: string;
  private _state: InspectionLifecycleState;
  private _targets: Map<string, InspectionTargetResult>;
  private _recommendations: Map<string, GeneratedRecommendation>;
  private _decisions: Map<string, RecommendationDecision>;
  private _startedAt: string;
  private _completedAt?: string;
  private _submittedAt?: string;
  private _snapshot?: InspectionReportSnapshot;

  private constructor(params: {
    id: string;
    tenantId: string;
    workOrderId: string;
    technicianStaffId: string;
    aggregateVersion: number;
    catalogVersion: number;
    templateCode: string;
    state: InspectionLifecycleState;
    targets: Map<string, InspectionTargetResult>;
    recommendations: Map<string, GeneratedRecommendation>;
    decisions: Map<string, RecommendationDecision>;
    startedAt: string;
    completedAt?: string;
    submittedAt?: string;
    snapshot?: InspectionReportSnapshot;
  }) {
    this._id = params.id;
    this._tenantId = params.tenantId;
    this._workOrderId = params.workOrderId;
    this._technicianStaffId = params.technicianStaffId;
    this._aggregateVersion = params.aggregateVersion;
    this._catalogVersion = params.catalogVersion;
    this._templateCode = params.templateCode;
    this._state = params.state;
    this._targets = params.targets;
    this._recommendations = params.recommendations;
    this._decisions = params.decisions;
    this._startedAt = params.startedAt;
    this._completedAt = params.completedAt;
    this._submittedAt = params.submittedAt;
    this._snapshot = params.snapshot;
  }

  // --- Getters ---
  get id(): string { return this._id; }
  get tenantId(): string { return this._tenantId; }
  get workOrderId(): string { return this._workOrderId; }
  get technicianStaffId(): string { return this._technicianStaffId; }
  get aggregateVersion(): number { return this._aggregateVersion; }
  get catalogVersion(): number { return this._catalogVersion; }
  get templateCode(): string { return this._templateCode; }
  get state(): InspectionLifecycleState { return this._state; }
  get startedAt(): string { return this._startedAt; }
  get completedAt(): string | undefined { return this._completedAt; }
  get submittedAt(): string | undefined { return this._submittedAt; }
  get snapshot(): InspectionReportSnapshot | undefined { return this._snapshot; }

  get targets(): readonly InspectionTargetResult[] {
    return Array.from(this._targets.values());
  }

  public bumpAggregateVersion(): void {
    this._aggregateVersion++;
  }

  get recommendations(): readonly GeneratedRecommendation[] {
    return Array.from(this._recommendations.values());
  }

  get decisions(): readonly RecommendationDecision[] {
    return Array.from(this._decisions.values());
  }

  /**
   * Helper to compute composite unique key for target results.
   */
  public static buildTargetResultId(targetKey: string, canonicalPartSlug: string, position: ComponentPosition): string {
    return `${targetKey}::${canonicalPartSlug}::${position}`.toLowerCase();
  }

  /**
   * Factory method: Initializes a new Inspection Aggregate in IN_PROGRESS state.
   */
  public static create(params: CreateInspectionParams): InspectionAggregate {
    const targets = new Map<string, InspectionTargetResult>();

    if (params.initialTargets && params.initialTargets.length > 0) {
      for (const t of params.initialTargets) {
        const id = InspectionAggregate.buildTargetResultId(t.targetKey, t.canonicalPartSlug, t.position);
        targets.set(id, {
          id,
          targetKey: t.targetKey,
          canonicalPartSlug: t.canonicalPartSlug,
          position: t.position,
          status: "NOT_INSPECTED",
          findings: [],
        });
      }
    }

    return new InspectionAggregate({
      id: params.id,
      tenantId: params.tenantId,
      workOrderId: params.workOrderId,
      technicianStaffId: params.technicianStaffId,
      aggregateVersion: 1,
      catalogVersion: params.catalogVersion,
      templateCode: params.templateCode,
      state: "IN_PROGRESS",
      targets,
      recommendations: new Map(),
      decisions: new Map(),
      startedAt: new Date().toISOString(),
    });
  }

  /**
   * Factory method: Reconstitutes an Aggregate from stored document.
   */
  public static reconstitute(
    id: string,
    tenantId: string,
    workOrderId: string,
    doc: InspectionAggregateDocument,
  ): InspectionAggregate {
    const targets = new Map<string, InspectionTargetResult>();
    if (doc.targets) {
      for (const [k, v] of Object.entries(doc.targets)) {
        targets.set(k, { ...v });
      }
    }

    const recommendations = new Map<string, GeneratedRecommendation>();
    if (doc.recommendations) {
      for (const r of doc.recommendations) {
        recommendations.set(r.id, { ...r });
      }
    }

    const decisions = new Map<string, RecommendationDecision>();
    if (doc.decisions) {
      for (const d of doc.decisions) {
        decisions.set(d.recommendationId, { ...d });
      }
    }

    return new InspectionAggregate({
      id,
      tenantId,
      workOrderId,
      technicianStaffId: doc.technicianStaffId,
      aggregateVersion: doc.aggregateVersion || 1,
      catalogVersion: doc.catalogVersion,
      templateCode: doc.templateCode,
      state: doc.state,
      targets,
      recommendations,
      decisions,
      startedAt: doc.startedAt,
      completedAt: doc.completedAt,
      submittedAt: doc.submittedAt,
      snapshot: doc.snapshot,
    });
  }

  /**
   * Serializes Aggregate into typed document for persistence in Prisma fields.
   */
  public toDocument(): InspectionAggregateDocument {
    const targetsObj: Record<string, InspectionTargetResult> = {};
    for (const [k, v] of this._targets.entries()) {
      targetsObj[k] = { ...v };
    }

    return {
      schemaVersion: 2,
      aggregateVersion: this._aggregateVersion,
      catalogVersion: this._catalogVersion,
      templateCode: this._templateCode,
      state: this._state,
      targets: targetsObj,
      recommendations: Array.from(this._recommendations.values()),
      decisions: Array.from(this._decisions.values()),
      startedAt: this._startedAt,
      completedAt: this._completedAt,
      submittedAt: this._submittedAt,
      technicianStaffId: this._technicianStaffId,
      snapshot: this._snapshot,
    };
  }

  /**
   * Records the technical inspection result on an individual target.
   * Enforces INV-2 (Condition consistency) & INV-4 (Severity escalation).
   */
  public recordTargetResult(params: RecordTargetResultParams): InspectionTargetResult {
    this.assertMutable("recordTargetResult");

    const targetResultId = InspectionAggregate.buildTargetResultId(
      params.targetKey,
      params.canonicalPartSlug,
      params.position,
    );

    // --- INV-2: Condition Consistency ---
    if (params.status === "INSPECTED") {
      if (!params.condition) {
        throw new DomainInvariantViolationError(
          `Target '${params.targetKey}' has status 'INSPECTED' but missing required technical condition.`,
        );
      }
    } else {
      if (params.condition !== undefined) {
        throw new DomainInvariantViolationError(
          `Target '${params.targetKey}' has status '${params.status}' and must not declare a technical condition.`,
        );
      }
      if ((params.status === "NOT_ACCESSIBLE" || params.status === "NOT_APPLICABLE") && !params.nonInspectionReason) {
        throw new DomainInvariantViolationError(
          `Target '${params.targetKey}' marked '${params.status}' requires an operational nonInspectionReason.`,
        );
      }
    }

    // Process findings
    const nowIso = new Date().toISOString();
    const findings: InspectionFinding[] = (params.findings ?? []).map((f, idx) => ({
      id: `${targetResultId}-f-${idx + 1}-${Date.now()}`,
      findingKey: f.findingKey,
      severity: f.severity,
      technicianObservation: f.technicianObservation?.trim() || undefined,
      recordedAt: nowIso,
    }));

    // --- INV-4: Severity Escalation ---
    let effectiveCondition = params.condition;
    if (params.status === "INSPECTED" && findings.length > 0) {
      const hasCriticalFinding = findings.some((f) => f.severity === "CRITICAL");
      const hasAttentionFinding = findings.some((f) => f.severity === "ATTENTION");

      if (hasCriticalFinding) {
        // Must escalate to CRITICAL
        effectiveCondition = "CRITICAL";
      } else if (hasAttentionFinding && effectiveCondition === "GOOD") {
        // Cannot remain GOOD if an attention-level finding is present
        effectiveCondition = "ATTENTION";
      }
    }

    const updatedResult: InspectionTargetResult = {
      id: targetResultId,
      targetKey: params.targetKey,
      canonicalPartSlug: params.canonicalPartSlug,
      position: params.position,
      status: params.status,
      condition: effectiveCondition,
      nonInspectionReason: params.nonInspectionReason?.trim() || undefined,
      findings,
      technicianNote: params.technicianNote?.trim() || undefined,
      measurementValue: params.measurementValue,
      measurementUnit: params.measurementUnit,
      mediaUrls: params.mediaUrls ? [...params.mediaUrls] : undefined,
      inspectedAt: nowIso,
      inspectedByStaffId: params.inspectedByStaffId || this._technicianStaffId,
    };

    // If an existing placeholder target with the same targetKey was NOT_INSPECTED under a different composite id, clean it up
    for (const [key, existing] of this._targets.entries()) {
      if (existing.targetKey.toUpperCase() === params.targetKey.toUpperCase() && key !== targetResultId) {
        if (existing.status === "NOT_INSPECTED") {
          this._targets.delete(key);
        }
      }
    }

    this._targets.set(targetResultId, updatedResult);

    // Invalidate decisions for this target if findings changed
    this.invalidateDecisionsForTarget(targetResultId);

    return updatedResult;
  }

  /**
   * Attaches service recommendations generated by suggestion engine.
   */
  public attachRecommendations(recommendations: readonly GeneratedRecommendation[]): void {
    this.assertMutable("attachRecommendations");
    for (const rec of recommendations) {
      this._recommendations.set(rec.id, rec);
      if (!this._decisions.has(rec.id)) {
        this._decisions.set(rec.id, {
          recommendationId: rec.id,
          decision: "PENDING",
        });
      }
    }
  }

  /**
   * Records technician's decision on a generated service recommendation.
   * Enforces INV-5 (Decision tracking without price tampering).
   */
  public recordDecision(
    recommendationId: string,
    decision: RecommendationDecisionStatus,
    dismissalReason?: string,
    scopeModificationNote?: string,
  ): RecommendationDecision {
    this.assertMutable("recordDecision");

    const recommendation = this._recommendations.get(recommendationId);
    if (!recommendation) {
      throw new DomainInvariantViolationError(
        `Recommendation with ID '${recommendationId}' does not exist on this inspection.`,
      );
    }

    if (decision === "DISMISSED" && !dismissalReason?.trim()) {
      throw new DomainInvariantViolationError(
        `Dismissing recommendation '${recommendation.serviceKey}' requires an explicit dismissalReason.`,
      );
    }

    const decisionRecord: RecommendationDecision = {
      recommendationId,
      decision,
      decidedAt: new Date().toISOString(),
      dismissalReason: dismissalReason?.trim() || undefined,
      scopeModificationNote: scopeModificationNote?.trim() || undefined,
    };

    this._decisions.set(recommendationId, decisionRecord);
    return decisionRecord;
  }

  /**
   * Marks inspection as COMPLETED (technician finished physical examination).
   * Enforces INV-1 (Completeness check).
   */
  public complete(): void {
    this.assertMutable("complete");
    this.verifyCompleteness();
    this._state = "COMPLETED";
    this._completedAt = new Date().toISOString();
  }

  /**
   * Submits inspection report to Operator Hub.
   * Enforces INV-1 (Completeness) and INV-6 (Freezes into Immutable Snapshot).
   */
  public submit(submittingStaffId: string): InspectionReportSnapshot {
    this.assertMutable("submit");
    this.verifyCompleteness();

    const nowIso = new Date().toISOString();
    this._state = "SUBMITTED";
    this._completedAt = this._completedAt || nowIso;
    this._submittedAt = nowIso;

    // Build immutable snapshot
    const targetResults = Array.from(this._targets.values());
    let criticalCount = 0;
    let attentionCount = 0;
    let passedCount = 0;
    let inaccessibleCount = 0;

    for (const t of targetResults) {
      if (t.status === "INSPECTED") {
        if (t.condition === "CRITICAL") criticalCount++;
        else if (t.condition === "ATTENTION") attentionCount++;
        else if (t.condition === "GOOD") passedCount++;
      } else if (t.status === "NOT_ACCESSIBLE") {
        inaccessibleCount++;
      }
    }

    const acceptedServiceKeys: string[] = [];
    for (const d of this._decisions.values()) {
      if (d.decision === "ACCEPTED" || d.decision === "MODIFIED_SCOPE") {
        const rec = this._recommendations.get(d.recommendationId);
        if (rec) acceptedServiceKeys.push(rec.serviceKey);
      }
    }

    // GAP-A3: Construct deep presentation-ready historical data for targets
    const snapshotTargets: readonly SnapshotTargetItem[] = Object.freeze(
      targetResults.map((t) => {
        const findings = t.findings.map((f) => {
          const def = findFindingDefByKey(f.findingKey);
          return {
            findingKey: f.findingKey,
            label: def?.label || f.findingKey,
            labelAr: def?.labelAr || f.findingKey,
            severity: f.severity,
            technicianObservation: f.technicianObservation,
          };
        });

        return {
          targetResultId: t.id,
          targetKey: t.targetKey,
          targetLabel: t.targetKey.replace(/_/g, " "),
          canonicalPartSlug: t.canonicalPartSlug,
          canonicalPartName: t.canonicalPartSlug.replace(/-/g, " "),
          position: t.position,
          status: t.status,
          condition: t.condition,
          nonInspectionReason: t.nonInspectionReason,
          technicianNote: t.technicianNote,
          measurementDisplay:
            t.measurementValue !== undefined
              ? `${t.measurementValue} ${t.measurementUnit || ""}`.trim()
              : undefined,
          findings: Object.freeze(findings),
        };
      }),
    );

    // GAP-A3: Construct deep presentation-ready historical data for recommendations & decisions
    const snapshotRecommendations: readonly SnapshotRecommendationItem[] = Object.freeze(
      Array.from(this._recommendations.values()).map((rec) => {
        const decision = this._decisions.get(rec.id);
        return {
          recommendationId: rec.id,
          ruleId: rec.ruleId,
          ruleVersion: rec.ruleVersion,
          engineVersion: rec.engineVersion || "v2.0-rules-engine",
          serviceKey: rec.serviceKey,
          serviceDisplayName: rec.serviceDisplayName,
          recommendationLevel: rec.recommendationLevel,
          score: rec.score,
          decision: decision?.decision || "PENDING",
          dismissalReason: decision?.dismissalReason,
          scopeModificationNote: decision?.scopeModificationNote,
        };
      }),
    );

    const snapshot: InspectionReportSnapshot = {
      snapshotId: `snap-${this._id}-${Date.now()}`,
      catalogVersion: this._catalogVersion,
      templateCode: this._templateCode,
      submittedAt: nowIso,
      submittedByStaffId: submittingStaffId || this._technicianStaffId,
      targets: snapshotTargets,
      recommendations: snapshotRecommendations,
      findingsSummary: {
        criticalCount,
        attentionCount,
        passedCount,
        inaccessibleCount,
      },
      acceptedServiceKeys: Object.freeze(acceptedServiceKeys),
    };

    this._snapshot = snapshot;
    return snapshot;
  }

  // --- Internal Validation Invariants ---

  private assertMutable(action: string): void {
    if (this._state === "SUBMITTED" || this._state === "OPERATOR_REVIEW" || this._state === "LOCKED") {
      throw new DomainInvariantViolationError(
        `Cannot execute '${action}': Inspection is already '${this._state}' and is strictly frozen (INV-6).`,
      );
    }
  }

  /**
   * INV-1: Verifies that every target has been explicitly dealt with.
   */
  private verifyCompleteness(): void {
    if (this._targets.size === 0) {
      throw new DomainInvariantViolationError("Inspection must contain at least one target component to be submitted.");
    }

    const uninspected = Array.from(this._targets.values()).filter((t) => t.status === "NOT_INSPECTED");
    if (uninspected.length > 0) {
      const names = uninspected.map((u) => u.targetKey).join(", ");
      throw new DomainInvariantViolationError(
        `Inspection cannot be completed/submitted: ${uninspected.length} target(s) are still NOT_INSPECTED: [${names}] (INV-1).`,
      );
    }
  }

  /**
   * Invalidate decisions if target result changed.
   */
  private invalidateDecisionsForTarget(targetResultId: string): void {
    for (const rec of this._recommendations.values()) {
      if (rec.targetResultId === targetResultId) {
        const existingDecision = this._decisions.get(rec.id);
        if (existingDecision && existingDecision.decision !== "PENDING") {
          // Reset to pending because finding changed
          this._decisions.set(rec.id, {
            recommendationId: rec.id,
            decision: "PENDING",
            dismissalReason: undefined,
            scopeModificationNote: undefined,
          });
        }
      }
    }
  }
}
