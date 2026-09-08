import { RuleEvaluatorService } from "./rule-evaluator.service";
import { InspectionAggregate } from "../domain/inspection.aggregate";

describe("RuleEvaluatorService (Phase B Declarative Rules)", () => {
  let evaluator: RuleEvaluatorService;

  beforeEach(() => {
    evaluator = new RuleEvaluatorService();
  });

  describe("Front vs Rear Axle Position Disqualification", () => {
    it("recommends Front Pad Replacement and suppresses Rear EPB when position is FRONT", () => {
      const evaluation = evaluator.evaluateTarget({
        targetResultId: "front_axle_brakes::brake-pads-front::front",
        targetKey: "FRONT_AXLE_BRAKES",
        canonicalPartSlug: "brake-pads-front",
        position: "FRONT",
        findingKeys: ["CAR_PAD_THICKNESS_CRITICAL"],
        severities: ["CRITICAL"],
      });

      expect(evaluation.recommended).toHaveLength(1);
      expect(evaluation.recommended[0].serviceKey).toBe("CAR_BRAKE_PAD_ROTOR_REPLACE_FRONT");
      expect(evaluation.recommended[0].score).toBeGreaterThan(95);

      // Related fluid bleed
      expect(evaluation.related.some((r) => r.serviceKey === "CAR_BRAKE_SYSTEM_FLUID_BLEED")).toBe(true);

      // Diagnostic multi-point scan
      expect(evaluation.diagnostic.some((d) => d.serviceKey === "CAR_MULTI_POINT_SAFETY_INSPECTION")).toBe(true);

      // Crucial check: Rear EPB replacement MUST NOT be present!
      const hasRearService = evaluation.recommendations.some(
        (r) => r.serviceKey === "CAR_BRAKE_PAD_ROTOR_REPLACE_REAR",
      );
      expect(hasRearService).toBe(false);
    });

    it("recommends Rear Pad Replacement with EPB when position is REAR", () => {
      const evaluation = evaluator.evaluateTarget({
        targetResultId: "rear_axle_brakes::brake-pads-rear::rear",
        targetKey: "REAR_AXLE_BRAKES",
        canonicalPartSlug: "brake-pads-rear",
        position: "REAR",
        findingKeys: ["CAR_REAR_PAD_THICKNESS_CRITICAL"],
        severities: ["CRITICAL"],
      });

      expect(evaluation.recommended).toHaveLength(1);
      expect(evaluation.recommended[0].serviceKey).toBe("CAR_BRAKE_PAD_ROTOR_REPLACE_REAR");
      expect(evaluation.recommended[0].score).toBeGreaterThan(95);

      // Crucial check: Front replacement MUST NOT be present on rear!
      const hasFrontService = evaluation.recommendations.some(
        (r) => r.serviceKey === "CAR_BRAKE_PAD_ROTOR_REPLACE_FRONT",
      );
      expect(hasFrontService).toBe(false);
    });
  });

  describe("Symptom & Finding Differentiation (Battery Example)", () => {
    it("recommends Battery Replacement on carbon pile load test failure (CRITICAL)", () => {
      const evaluation = evaluator.evaluateTarget({
        targetResultId: "starting::battery-12v-starting::engine_bay",
        targetKey: "STARTING_CIRCUIT",
        canonicalPartSlug: "battery-12v-starting",
        position: "ENGINE_BAY",
        findingKeys: ["CAR_BATTERY_FAILED_LOAD_TEST"],
        severities: ["CRITICAL"],
      });

      // Top recommendation must be Battery Replacement & BMS registration
      expect(evaluation.recommended[0].serviceKey).toBe("CAR_BATTERY_BMS_REPLACEMENT");
      expect(evaluation.recommended[0].score).toBeGreaterThan(115);

      // Related alternator output test
      expect(evaluation.related.some((r) => r.serviceKey === "CAR_ALTERNATOR_CHARGING_TEST")).toBe(true);

      // Must NOT recommend Terminal Cleaning as top recommendation
      const hasTerminalCleaning = evaluation.recommended.some(
        (r) => r.serviceKey === "CAR_BATTERY_TEST_TERMINAL_CLEAN",
      );
      expect(hasTerminalCleaning).toBe(false);
    });

    it("recommends Terminal Cleaning on sulfate corrosion (ATTENTION) without recommending replacement", () => {
      const evaluation = evaluator.evaluateTarget({
        targetResultId: "starting::battery-12v-starting::engine_bay",
        targetKey: "STARTING_CIRCUIT",
        canonicalPartSlug: "battery-12v-starting",
        position: "ENGINE_BAY",
        findingKeys: ["CAR_BATTERY_TERMINAL_CORROSION"],
        severities: ["ATTENTION"],
      });

      // Recommended must be Terminal Cleaning
      expect(evaluation.recommended[0].serviceKey).toBe("CAR_BATTERY_TEST_TERMINAL_CLEAN");

      // Must NOT recommend expensive Battery Replacement when symptom is only terminal corrosion!
      const hasBatteryReplacement = evaluation.recommendations.some(
        (r) => r.serviceKey === "CAR_BATTERY_BMS_REPLACEMENT",
      );
      expect(hasBatteryReplacement).toBe(false);
    });
  });

  describe("Motorcycles & Heavy Equipment Rules", () => {
    it("evaluates motorcycle drive chain binding rust as overhaul", () => {
      const evaluation = evaluator.evaluateTarget({
        targetResultId: "drive::moto-drive-chain::universal",
        targetKey: "FINAL_DRIVE_CHAIN",
        canonicalPartSlug: "moto-drive-chain",
        position: "UNIVERSAL",
        findingKeys: ["MOTO_CHAIN_BINDING_RUST"],
        severities: ["CRITICAL"],
      });

      expect(evaluation.recommended[0].serviceKey).toBe("MOTO_CHAIN_SPROCKETS_OVERHAUL");
    });

    it("evaluates heavy equipment scored cylinder ram as overhaul", () => {
      const evaluation = evaluator.evaluateTarget({
        targetResultId: "hyd::heavy-hydraulic-cylinders::universal",
        targetKey: "BOOM_HYDRAULIC_CYLINDER",
        canonicalPartSlug: "heavy-hydraulic-cylinders",
        position: "UNIVERSAL",
        findingKeys: ["HEAVY_HYDRAULIC_RAM_SCORED"],
        severities: ["CRITICAL"],
      });

      expect(evaluation.recommended[0].serviceKey).toBe("HEAVY_BOOM_BUCKET_CYLINDER_SEAL_OVERHAUL");
    });
  });

  describe("End-to-End Aggregate Integration", () => {
    it("attaches generated recommendations to InspectionAggregate seamlessly", () => {
      const agg = InspectionAggregate.create({
        id: "insp-e2e",
        tenantId: "t-1",
        workOrderId: "wo-1",
        technicianStaffId: "tech-1",
        catalogVersion: 2,
        templateCode: "CARS_V2",
      });

      const target = agg.recordTargetResult({
        targetKey: "FRONT_AXLE_BRAKES",
        canonicalPartSlug: "brake-pads-front",
        position: "FRONT",
        status: "INSPECTED",
        condition: "CRITICAL",
        findings: [
          {
            findingKey: "CAR_PAD_THICKNESS_CRITICAL",
            severity: "CRITICAL",
            technicianObservation: "Friction pad thickness 1.1mm",
          },
        ],
      });

      const evaluation = evaluator.evaluateTarget({
        targetResultId: target.id,
        targetKey: target.targetKey,
        canonicalPartSlug: target.canonicalPartSlug,
        position: target.position,
        findingKeys: target.findings.map((f) => f.findingKey),
        severities: target.findings.map((f) => f.severity),
      });

      // Attach recommendations directly to Aggregate
      agg.attachRecommendations(evaluation.recommendations);

      expect(agg.recommendations).toHaveLength(evaluation.recommendations.length);
      expect(agg.decisions).toHaveLength(evaluation.recommendations.length);

      // Accept recommended front pad replacement
      const topRec = evaluation.recommended[0];
      const decision = agg.recordDecision(topRec.id, "ACCEPTED");
      expect(decision.decision).toBe("ACCEPTED");

      // Submit and verify deep frozen snapshot
      const snapshot = agg.submit("tech-1");
      expect(snapshot.acceptedServiceKeys).toContain(topRec.serviceKey);
      expect(snapshot.recommendations[0].engineVersion).toBe("v2.0-rules-engine");
    });
  });
});
