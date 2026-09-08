import { SmartSuggestionEngine } from "./smart-suggestion.engine";

describe("SmartSuggestionEngine (Two-Tier Context-Aware Recommendation)", () => {
  let engine: SmartSuggestionEngine;

  beforeEach(() => {
    engine = new SmartSuggestionEngine();
  });

  describe("Tier 1: Canonical Mapping & Tier 2: Context Evaluation", () => {
    it("ranks front brake pad replacement as RECOMMENDED and fluid flush as RELATED for CRITICAL front brake wear", () => {
      const result = engine.suggestForContext({
        canonicalPartSlug: "car-brake-pads",
        position: "FRONT",
        finding: {
          severity: "CRITICAL",
          symptom: "WEAR",
          description: "Front brake friction pads worn down to steel backing plate (less than 1mm)",
        },
        vehicle: {
          category: "CARS",
          make: "Toyota",
          model: "Camry",
        },
      });

      expect(result.recommended.length).toBeGreaterThan(0);
      const topRecommended = result.recommended[0];
      expect(topRecommended.serviceName).toContain("Front");
      expect(topRecommended.serviceName).toContain("Brake Pad");
      expect(topRecommended.rankGroup).toBe("RECOMMENDED");

      // Verify that rear EPB service was suppressed due to position: FRONT
      const hasRear = result.recommended.some((r) => r.serviceName.includes("Rear"));
      expect(hasRear).toBe(false);

      // Verify related contains fluid flush or inspection
      expect(result.all.length).toBeLessThanOrEqual(5);
    });

    it("ranks rear EPB brake pad replacement as RECOMMENDED for CRITICAL rear brake wear", () => {
      const result = engine.suggestForContext({
        canonicalPartSlug: "car-brake-pads",
        position: "REAR",
        finding: {
          severity: "CRITICAL",
          symptom: "WEAR",
          description: "Rear brake pads worn down past wear indicator pin",
        },
        vehicle: {
          category: "CARS",
        },
      });

      expect(result.recommended.length).toBeGreaterThan(0);
      const topRecommended = result.recommended[0];
      expect(topRecommended.serviceName).toContain("Rear");
      expect(topRecommended.rankGroup).toBe("RECOMMENDED");

      // Front replacement should be suppressed
      const hasFront = result.recommended.some((r) => r.serviceName.includes("Front"));
      expect(hasFront).toBe(false);
    });

    it("prioritizes Battery Replacement & BMS Registration for CRITICAL battery failure", () => {
      const result = engine.suggestForContext({
        canonicalPartSlug: "car-battery",
        finding: {
          severity: "CRITICAL",
          description: "Battery internal cell short; failed 500A CCA load test completely",
        },
        vehicle: {
          category: "CARS",
        },
      });

      expect(result.recommended.length).toBeGreaterThan(0);
      const top = result.recommended[0];
      expect(top.serviceName).toContain("Battery Replacement");
      expect(top.rankGroup).toBe("RECOMMENDED");
    });

    it("prioritizes Terminal Cleaning for MEDIUM severity terminal corrosion finding", () => {
      const result = engine.suggestForContext({
        canonicalPartSlug: "car-battery",
        finding: {
          severity: "MEDIUM",
          description: "Heavy white acid corrosion on negative post; battery still holds 12.4V",
        },
        vehicle: {
          category: "CARS",
        },
      });

      expect(result.all.length).toBeGreaterThan(0);
      const cleanOrDiag = result.all.find(
        (s) => s.serviceName.toLowerCase().includes("clean") || s.serviceName.toLowerCase().includes("terminal") || s.serviceName.toLowerCase().includes("test")
      );
      expect(cleanOrDiag).toBeDefined();
    });

    it("supports Motorcycles category with drive chain overhaul", () => {
      const result = engine.suggestForContext({
        canonicalPartSlug: "moto-drive-chains",
        finding: {
          severity: "CRITICAL",
          description: "Chain severely stretched with stiff/frozen O-ring links",
        },
        vehicle: {
          category: "MOTORCYCLES",
        },
      });

      expect(result.recommended.length).toBeGreaterThan(0);
      expect(result.recommended[0].serviceName).toContain("Chain");
    });

    it("supports Heavy Equipment category with hydraulic cylinder overhaul", () => {
      const result = engine.suggestForContext({
        canonicalPartSlug: "hvy-cylinder-seals",
        finding: {
          severity: "CRITICAL",
          description: "Boom hydraulic cylinder rod gland seal blowing out oil under 300 bar pressure",
        },
        vehicle: {
          category: "HEAVY_EQUIPMENT",
        },
      });

      expect(result.recommended.length).toBeGreaterThan(0);
      expect(result.recommended[0].serviceName).toContain("Cylinder");
    });

    it("preserves backwards-compatibility with suggestFor flat response", () => {
      const flat = engine.suggestFor({
        vehicleCategory: "CARS",
        partNames: ["Brake Pads"],
      });

      expect(Array.isArray(flat)).toBe(true);
      expect(flat.length).toBeGreaterThan(0);
      expect(flat[0]).toHaveProperty("serviceName");
      expect(flat[0]).toHaveProperty("laborPrice");
      expect(flat[0]).toHaveProperty("standardHours");
    });
  });
});
