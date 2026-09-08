import {
  InspectionAggregate,
  DomainInvariantViolationError,
} from "./inspection.aggregate";
import {
  GeneratedRecommendation,
  InspectionTargetResult,
  SnapshotTargetItem,
} from "./inspection.types";

describe("InspectionAggregate (Domain Invariants)", () => {
  const defaultParams = {
    id: "insp-101",
    tenantId: "tenant-apex",
    workOrderId: "wo-500",
    technicianStaffId: "tech-user-1",
    catalogVersion: 2,
    templateCode: "CARS_MULTI_POINT_V2",
    initialTargets: [
      {
        targetKey: "FRONT_AXLE_BRAKES",
        canonicalPartSlug: "brake-pads-front",
        position: "FRONT" as const,
      },
      {
        targetKey: "STARTING_CIRCUIT",
        canonicalPartSlug: "battery-12v-starting",
        position: "ENGINE_BAY" as const,
      },
    ],
  };

  describe("Factory & Reconstitution", () => {
    it("creates an aggregate in IN_PROGRESS state with initial targets set to NOT_INSPECTED", () => {
      const agg = InspectionAggregate.create(defaultParams);

      expect(agg.id).toBe("insp-101");
      expect(agg.state).toBe("IN_PROGRESS");
      expect(agg.targets).toHaveLength(2);
      expect(agg.targets[0].status).toBe("NOT_INSPECTED");
      expect(agg.targets[1].status).toBe("NOT_INSPECTED");
    });

    it("serializes to document and reconstitutes perfectly without data loss", () => {
      const agg = InspectionAggregate.create(defaultParams);
      agg.recordTargetResult({
        targetKey: "FRONT_AXLE_BRAKES",
        canonicalPartSlug: "brake-pads-front",
        position: "FRONT",
        status: "INSPECTED",
        condition: "GOOD",
        technicianNote: "Clean brake assembly",
      });

      const doc = agg.toDocument();
      const reconstituted = InspectionAggregate.reconstitute(agg.id, agg.tenantId, agg.workOrderId, doc);

      expect(reconstituted.id).toBe(agg.id);
      expect(reconstituted.state).toBe("IN_PROGRESS");
      expect(reconstituted.targets).toHaveLength(2);

      const front = reconstituted.targets.find((t: InspectionTargetResult) => t.targetKey === "FRONT_AXLE_BRAKES");
      expect(front?.status).toBe("INSPECTED");
      expect(front?.condition).toBe("GOOD");
      expect(front?.technicianNote).toBe("Clean brake assembly");
    });
  });

  describe("INV-2: Condition Consistency", () => {
    it("throws violation if status is INSPECTED but condition is omitted", () => {
      const agg = InspectionAggregate.create(defaultParams);

      expect(() => {
        agg.recordTargetResult({
          targetKey: "FRONT_AXLE_BRAKES",
          canonicalPartSlug: "brake-pads-front",
          position: "FRONT",
          status: "INSPECTED",
          // condition omitted!
        });
      }).toThrow(DomainInvariantViolationError);
    });

    it("throws violation if status is NOT_ACCESSIBLE but condition is supplied", () => {
      const agg = InspectionAggregate.create(defaultParams);

      expect(() => {
        agg.recordTargetResult({
          targetKey: "FRONT_AXLE_BRAKES",
          canonicalPartSlug: "brake-pads-front",
          position: "FRONT",
          status: "NOT_ACCESSIBLE",
          condition: "GOOD", // invalid!
          nonInspectionReason: "Wheel lock key missing",
        });
      }).toThrow(DomainInvariantViolationError);
    });

    it("throws violation if status is NOT_ACCESSIBLE or NOT_APPLICABLE without a nonInspectionReason", () => {
      const agg = InspectionAggregate.create(defaultParams);

      expect(() => {
        agg.recordTargetResult({
          targetKey: "FRONT_AXLE_BRAKES",
          canonicalPartSlug: "brake-pads-front",
          position: "FRONT",
          status: "NOT_ACCESSIBLE",
          // nonInspectionReason omitted!
        });
      }).toThrow(DomainInvariantViolationError);
    });

    it("accepts valid NOT_ACCESSIBLE with nonInspectionReason and undefined condition", () => {
      const agg = InspectionAggregate.create(defaultParams);

      const res = agg.recordTargetResult({
        targetKey: "FRONT_AXLE_BRAKES",
        canonicalPartSlug: "brake-pads-front",
        position: "FRONT",
        status: "NOT_ACCESSIBLE",
        nonInspectionReason: "Customer forgot wheel lock key",
      });

      expect(res.status).toBe("NOT_ACCESSIBLE");
      expect(res.condition).toBeUndefined();
      expect(res.nonInspectionReason).toBe("Customer forgot wheel lock key");
    });
  });

  describe("INV-4: Severity Escalation", () => {
    it("escalates condition to CRITICAL when a CRITICAL finding is recorded even if technician inputted GOOD", () => {
      const agg = InspectionAggregate.create(defaultParams);

      const res = agg.recordTargetResult({
        targetKey: "FRONT_AXLE_BRAKES",
        canonicalPartSlug: "brake-pads-front",
        position: "FRONT",
        status: "INSPECTED",
        condition: "GOOD", // technician tried to pass it
        findings: [
          {
            findingKey: "CAR_PAD_THICKNESS_CRITICAL",
            severity: "CRITICAL",
            technicianObservation: "Friction material below 1.2mm",
          },
        ],
      });

      expect(res.condition).toBe("CRITICAL");
      expect(res.findings).toHaveLength(1);
      expect(res.findings[0].technicianObservation).toBe("Friction material below 1.2mm");
    });

    it("escalates condition from GOOD to ATTENTION when an ATTENTION finding is recorded", () => {
      const agg = InspectionAggregate.create(defaultParams);

      const res = agg.recordTargetResult({
        targetKey: "STARTING_CIRCUIT",
        canonicalPartSlug: "battery-12v-starting",
        position: "ENGINE_BAY",
        status: "INSPECTED",
        condition: "GOOD",
        findings: [
          {
            findingKey: "CAR_BATTERY_TERMINAL_CORROSION",
            severity: "ATTENTION",
            technicianObservation: "Minor white sulfate buildup on negative terminal",
          },
        ],
      });

      expect(res.condition).toBe("ATTENTION");
      expect(res.findings).toHaveLength(1);
    });
  });

  describe("INV-1: Completeness on Completion & Submission", () => {
    it("throws violation on complete() if any target is still NOT_INSPECTED", () => {
      const agg = InspectionAggregate.create(defaultParams);

      // Inspect only the first target
      agg.recordTargetResult({
        targetKey: "FRONT_AXLE_BRAKES",
        canonicalPartSlug: "brake-pads-front",
        position: "FRONT",
        status: "INSPECTED",
        condition: "GOOD",
      });

      expect(() => {
        agg.complete();
      }).toThrow(/NOT_INSPECTED/);
    });

    it("succeeds complete() when all targets are either INSPECTED, NOT_ACCESSIBLE, or NOT_APPLICABLE", () => {
      const agg = InspectionAggregate.create(defaultParams);

      agg.recordTargetResult({
        targetKey: "FRONT_AXLE_BRAKES",
        canonicalPartSlug: "brake-pads-front",
        position: "FRONT",
        status: "INSPECTED",
        condition: "GOOD",
      });

      agg.recordTargetResult({
        targetKey: "STARTING_CIRCUIT",
        canonicalPartSlug: "battery-12v-starting",
        position: "ENGINE_BAY",
        status: "NOT_ACCESSIBLE",
        nonInspectionReason: "Aftermarket battery box bolted shut",
      });

      agg.complete();
      expect(agg.state).toBe("COMPLETED");
      expect(agg.completedAt).toBeDefined();
    });
  });

  describe("INV-5: Recommendation & Decision Tracking", () => {
    it("attaches generated recommendations and defaults decision to PENDING", () => {
      const agg = InspectionAggregate.create(defaultParams);

      const rec: GeneratedRecommendation = {
        id: "rec-1",
        ruleId: "rule-front-pad-rep",
        ruleVersion: 1,
        engineVersion: "v2.0-rules-engine",
        targetResultId: "front_axle_brakes::brake-pads-front::front",
        serviceKey: "CAR_BRAKE_PAD_REPLACE_FRONT",
        serviceDisplayName: "Front Brake Pad Replacement",
        recommendationLevel: "RECOMMENDED",
        score: 95,
        generatedAt: new Date().toISOString(),
        evaluationContext: {
          findingKeys: ["CAR_PAD_THICKNESS_CRITICAL"],
          severities: ["CRITICAL"],
          position: "FRONT",
        },
      };

      agg.attachRecommendations([rec]);

      expect(agg.recommendations).toHaveLength(1);
      expect(agg.decisions).toHaveLength(1);
      expect(agg.decisions[0].decision).toBe("PENDING");
    });

    it("records ACCEPTED decision without requiring dismissal reason", () => {
      const agg = InspectionAggregate.create(defaultParams);
      agg.attachRecommendations([
        {
          id: "rec-1",
          ruleId: "rule-1",
          ruleVersion: 1,
          engineVersion: "v2.0-rules-engine",
          targetResultId: "target-1",
          serviceKey: "CAR_BRAKE_PAD_REPLACE_FRONT",
          serviceDisplayName: "Front Pad Replacement",
          recommendationLevel: "RECOMMENDED",
          score: 90,
          generatedAt: new Date().toISOString(),
          evaluationContext: { findingKeys: [], severities: [], position: "FRONT" },
        },
      ]);

      const decision = agg.recordDecision("rec-1", "ACCEPTED");
      expect(decision.decision).toBe("ACCEPTED");
      expect(decision.decidedAt).toBeDefined();
    });

    it("throws violation if DISMISSED decision is recorded without a dismissalReason", () => {
      const agg = InspectionAggregate.create(defaultParams);
      agg.attachRecommendations([
        {
          id: "rec-1",
          ruleId: "rule-1",
          ruleVersion: 1,
          engineVersion: "v2.0-rules-engine",
          targetResultId: "target-1",
          serviceKey: "CAR_BRAKE_PAD_REPLACE_FRONT",
          serviceDisplayName: "Front Pad Replacement",
          recommendationLevel: "RECOMMENDED",
          score: 90,
          generatedAt: new Date().toISOString(),
          evaluationContext: { findingKeys: [], severities: [], position: "FRONT" },
        },
      ]);

      expect(() => {
        agg.recordDecision("rec-1", "DISMISSED"); // missing reason!
      }).toThrow(/dismissalReason/);
    });

    it("records MODIFIED_SCOPE with technician note", () => {
      const agg = InspectionAggregate.create(defaultParams);
      agg.attachRecommendations([
        {
          id: "rec-1",
          ruleId: "rule-1",
          ruleVersion: 1,
          engineVersion: "v2.0-rules-engine",
          targetResultId: "target-1",
          serviceKey: "CAR_BRAKE_PAD_REPLACE_FRONT",
          serviceDisplayName: "Front Pad Replacement",
          recommendationLevel: "RECOMMENDED",
          score: 90,
          generatedAt: new Date().toISOString(),
          evaluationContext: { findingKeys: [], severities: [], position: "FRONT" },
        },
      ]);

      const decision = agg.recordDecision(
        "rec-1",
        "MODIFIED_SCOPE",
        undefined,
        "Requires deep caliper pin lubrication and rust removal",
      );

      expect(decision.decision).toBe("MODIFIED_SCOPE");
      expect(decision.scopeModificationNote).toBe("Requires deep caliper pin lubrication and rust removal");
    });
  });

  describe("INV-6 & GAP-A3: Submitted Means Frozen (Deep Immutable Snapshot)", () => {
    it("freezes aggregate into deep presentation-ready snapshot upon submit and rejects further mutations", () => {
      const agg = InspectionAggregate.create(defaultParams);

      agg.recordTargetResult({
        targetKey: "FRONT_AXLE_BRAKES",
        canonicalPartSlug: "brake-pads-front",
        position: "FRONT",
        status: "INSPECTED",
        condition: "CRITICAL",
        measurementValue: 1.8,
        measurementUnit: "mm",
        findings: [
          {
            findingKey: "CAR_PAD_THICKNESS_CRITICAL",
            severity: "CRITICAL",
            technicianObservation: "Under 2mm wear limit",
          },
        ],
      });

      agg.recordTargetResult({
        targetKey: "STARTING_CIRCUIT",
        canonicalPartSlug: "battery-12v-starting",
        position: "ENGINE_BAY",
        status: "INSPECTED",
        condition: "GOOD",
      });

      agg.attachRecommendations([
        {
          id: "rec-front-rep",
          ruleId: "rule-pad-rep",
          ruleVersion: 1,
          engineVersion: "v2.0-rules-engine",
          targetResultId: "front_axle_brakes::brake-pads-front::front",
          serviceKey: "CAR_BRAKE_PAD_REPLACE_FRONT",
          serviceDisplayName: "Front Brake Pad Replacement",
          recommendationLevel: "RECOMMENDED",
          score: 95,
          generatedAt: new Date().toISOString(),
          evaluationContext: {
            findingKeys: ["CAR_PAD_THICKNESS_CRITICAL"],
            severities: ["CRITICAL"],
            position: "FRONT",
          },
        },
      ]);

      agg.recordDecision("rec-front-rep", "ACCEPTED");

      const snapshot = agg.submit("tech-user-1");

      expect(agg.state).toBe("SUBMITTED");
      expect(snapshot).toBeDefined();
      expect(snapshot.findingsSummary.criticalCount).toBe(1);
      expect(snapshot.findingsSummary.passedCount).toBe(1);
      expect(snapshot.catalogVersion).toBe(2);

      // GAP-A3: Verify presentation-ready historical labels without catalog resolution
      expect(snapshot.targets).toHaveLength(2);
      const frontTarget = snapshot.targets.find((t: SnapshotTargetItem) => t.targetKey === "FRONT_AXLE_BRAKES");
      expect(frontTarget?.targetLabel).toBe("FRONT AXLE BRAKES");
      expect(frontTarget?.canonicalPartName).toBe("brake pads front");
      expect(frontTarget?.measurementDisplay).toBe("1.8 mm");
      expect(frontTarget?.findings).toHaveLength(1);
      expect(frontTarget?.findings[0].label).toContain("Friction material worn below 2.0 mm");
      expect(frontTarget?.findings[0].labelAr).toContain("سماكة مادة الاحتكاك أقل من 2 مم");
      expect(frontTarget?.findings[0].technicianObservation).toBe("Under 2mm wear limit");

      // Verify recommendation snapshot
      expect(snapshot.recommendations).toHaveLength(1);
      expect(snapshot.recommendations[0].serviceDisplayName).toBe("Front Brake Pad Replacement");
      expect(snapshot.recommendations[0].decision).toBe("ACCEPTED");
      expect(snapshot.acceptedServiceKeys).toEqual(["CAR_BRAKE_PAD_REPLACE_FRONT"]);

      // Attempting any mutation after submission must fail!
      expect(() => {
        agg.recordTargetResult({
          targetKey: "FRONT_AXLE_BRAKES",
          canonicalPartSlug: "brake-pads-front",
          position: "FRONT",
          status: "INSPECTED",
          condition: "GOOD",
        });
      }).toThrow(/strictly frozen \(INV-6\)/);
    });
  });
});
