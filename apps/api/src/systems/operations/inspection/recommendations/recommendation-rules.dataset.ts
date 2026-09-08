import { ServiceRecommendationRule } from "./recommendation-rule.types";

export const CURRENT_ENGINE_VERSION = "v2.0-rules-engine";

/**
 * Passenger Automotive (CARS) Service Recommendation Rules.
 */
export const CARS_RECOMMENDATION_RULES: readonly ServiceRecommendationRule[] = [
  // Front Brake Pads -> Replacement
  {
    id: "rule-car-pad-front-replace-crit",
    ruleVersion: 1,
    canonicalPartSlug: "brake-pads-front",
    serviceKey: "CAR_BRAKE_PAD_ROTOR_REPLACE_FRONT",
    serviceDisplayName: "Brake Pad & Rotor Replacement (Front)",
    conditions: {
      findingKeys: ["CAR_PAD_THICKNESS_CRITICAL", "CAR_PAD_GLAZED_HEAT_STRESS"],
      severities: ["CRITICAL", "ATTENTION"],
      positions: ["FRONT", "FRONT_LEFT", "FRONT_RIGHT"],
    },
    recommendationLevel: "RECOMMENDED",
    baseScore: 95,
    explanationTemplate: "Front brake friction material critically degraded; immediate axle overhaul required.",
  },
  // Front Brake Pads -> Fluid Bleed (Related)
  {
    id: "rule-car-pad-front-bleed-rel",
    ruleVersion: 1,
    canonicalPartSlug: "brake-pads-front",
    serviceKey: "CAR_BRAKE_SYSTEM_FLUID_BLEED",
    serviceDisplayName: "Brake System Complete Fluid Bleed & Flush",
    conditions: {
      findingKeys: ["CAR_PAD_THICKNESS_CRITICAL", "CAR_PAD_THICKNESS_ATTENTION"],
      positions: ["FRONT", "FRONT_LEFT", "FRONT_RIGHT"],
    },
    recommendationLevel: "RELATED",
    baseScore: 75,
    explanationTemplate: "Hydraulic caliper piston retraction introduces moisture; system bleed recommended.",
  },
  // Front Brake Pads -> Multi-point inspection (Diagnostic)
  {
    id: "rule-car-pad-front-diagnostic",
    ruleVersion: 1,
    canonicalPartSlug: "brake-pads-front",
    serviceKey: "CAR_MULTI_POINT_SAFETY_INSPECTION",
    serviceDisplayName: "Comprehensive Multi-Point Vehicle Safety & Diagnostic Inspection",
    recommendationLevel: "DIAGNOSTIC",
    baseScore: 50,
  },

  // Rear Brake Pads -> Replacement with EPB Calibration
  {
    id: "rule-car-pad-rear-replace-crit",
    ruleVersion: 1,
    canonicalPartSlug: "brake-pads-rear",
    serviceKey: "CAR_BRAKE_PAD_ROTOR_REPLACE_REAR",
    serviceDisplayName: "Brake Pad & Rotor Replacement (Rear with EPB Calibration)",
    conditions: {
      findingKeys: ["CAR_REAR_PAD_THICKNESS_CRITICAL", "CAR_REAR_PAD_UNEVEN_WEAR"],
      severities: ["CRITICAL", "ATTENTION"],
      positions: ["REAR", "REAR_LEFT", "REAR_RIGHT"],
    },
    recommendationLevel: "RECOMMENDED",
    baseScore: 95,
    explanationTemplate: "Rear friction material critically worn; requires EPB service mode calibration.",
  },

  // Brake Rotors Front
  {
    id: "rule-car-rotor-front-replace-crit",
    ruleVersion: 1,
    canonicalPartSlug: "brake-rotors-front",
    serviceKey: "CAR_BRAKE_PAD_ROTOR_REPLACE_FRONT",
    serviceDisplayName: "Brake Pad & Rotor Replacement (Front)",
    conditions: {
      findingKeys: ["CAR_ROTOR_MIN_THICKNESS_EXCEEDED", "CAR_ROTOR_HEAT_SPOTS_WARPING"],
      positions: ["FRONT", "FRONT_LEFT", "FRONT_RIGHT"],
    },
    recommendationLevel: "RECOMMENDED",
    baseScore: 95,
  },

  // 12V Battery -> Replacement & BMS Registration
  {
    id: "rule-car-battery-replace-crit",
    ruleVersion: 1,
    canonicalPartSlug: "battery-12v-starting",
    serviceKey: "CAR_BATTERY_BMS_REPLACEMENT",
    serviceDisplayName: "12V AGM / EFB Battery Replacement & BMS Registration",
    conditions: {
      findingKeys: ["CAR_BATTERY_FAILED_LOAD_TEST"],
      severities: ["CRITICAL"],
      positions: ["ENGINE_BAY", "UNIVERSAL"],
    },
    recommendationLevel: "RECOMMENDED",
    baseScore: 98,
    explanationTemplate: "Battery failed carbon pile load test; internal cell impedance requires fresh unit.",
  },
  // 12V Battery -> Terminal Cleaning & Installation
  {
    id: "rule-car-battery-terminal-att",
    ruleVersion: 1,
    canonicalPartSlug: "battery-12v-starting",
    serviceKey: "CAR_BATTERY_TEST_TERMINAL_CLEAN",
    serviceDisplayName: "12V Battery Testing, Terminal Cleaning & Installation",
    conditions: {
      findingKeys: ["CAR_BATTERY_TERMINAL_CORROSION", "CAR_BATTERY_LOW_STATE_OF_CHARGE"],
      severities: ["ATTENTION"],
      positions: ["ENGINE_BAY", "UNIVERSAL"],
    },
    recommendationLevel: "RECOMMENDED",
    baseScore: 92,
    explanationTemplate: "High lead-sulfate resistance at terminals; requires neutralization and torque.",
  },
  // 12V Battery -> Alternator Charging Test (Related)
  {
    id: "rule-car-battery-alternator-rel",
    ruleVersion: 1,
    canonicalPartSlug: "battery-12v-starting",
    serviceKey: "CAR_ALTERNATOR_CHARGING_TEST",
    serviceDisplayName: "Alternator Replacement & 12V Charging Circuit Output Test",
    conditions: {
      findingKeys: ["CAR_BATTERY_FAILED_LOAD_TEST", "CAR_BATTERY_LOW_STATE_OF_CHARGE"],
    },
    recommendationLevel: "RELATED",
    baseScore: 82,
  },
  // 12V Battery -> OBD Diagnostic Scan (Diagnostic)
  {
    id: "rule-car-battery-obd-diag",
    ruleVersion: 1,
    canonicalPartSlug: "battery-12v-starting",
    serviceKey: "CAR_OBD_COMPUTER_DIAGNOSTIC_SCAN",
    serviceDisplayName: "OBD-II Computer Diagnostic Scan & Live Data Health Report",
    recommendationLevel: "DIAGNOSTIC",
    baseScore: 60,
  },

  // Engine Oil & Filter
  {
    id: "rule-car-oil-service-crit",
    ruleVersion: 1,
    canonicalPartSlug: "engine-oil-filter",
    serviceKey: "CAR_SYNTHETIC_OIL_FILTER_SERVICE",
    serviceDisplayName: "Synthetic Motor Oil & Filter Service (0W-20 / 5W-30)",
    conditions: {
      findingKeys: ["CAR_ENGINE_OIL_LEVEL_CRITICAL_LOW", "CAR_ENGINE_OIL_DEGRADED_DIRTY"],
    },
    recommendationLevel: "RECOMMENDED",
    baseScore: 95,
  },
  {
    id: "rule-car-air-filter-rel",
    ruleVersion: 1,
    canonicalPartSlug: "engine-oil-filter",
    serviceKey: "CAR_ENGINE_CABIN_AIR_FILTER_SERVICE",
    serviceDisplayName: "Engine Air Filter & Cabin HEPA Filter Replacement",
    recommendationLevel: "RELATED",
    baseScore: 75,
  },

  // A/C Compressor
  {
    id: "rule-car-ac-compressor-overhaul",
    ruleVersion: 1,
    canonicalPartSlug: "ac-compressor",
    serviceKey: "CAR_AC_COMPRESSOR_PAG_OIL_OVERHAUL",
    serviceDisplayName: "A/C Compressor Overhaul & Pag Oil Replenishment",
    conditions: {
      findingKeys: ["CAR_AC_COMPRESSOR_SEIZED_NOISY"],
      severities: ["CRITICAL"],
    },
    recommendationLevel: "RECOMMENDED",
    baseScore: 95,
  },
  {
    id: "rule-car-ac-recharge-rel",
    ruleVersion: 1,
    canonicalPartSlug: "ac-compressor",
    serviceKey: "CAR_AC_REFRIGERANT_VACUUM_RECHARGE",
    serviceDisplayName: "A/C Refrigerant Recovery, Deep Vacuum & Precision Recharge (R134a)",
    conditions: {
      findingKeys: ["CAR_AC_REFRIGERANT_LOW_PRESSURE", "CAR_AC_COMPRESSOR_SEIZED_NOISY"],
    },
    recommendationLevel: "RECOMMENDED",
    baseScore: 90,
  },
];

/**
 * Motorcycles (MOTORCYCLES) Recommendation Rules.
 */
export const MOTORCYCLES_RECOMMENDATION_RULES: readonly ServiceRecommendationRule[] = [
  {
    id: "rule-moto-chain-overhaul-crit",
    ruleVersion: 1,
    canonicalPartSlug: "moto-drive-chain",
    serviceKey: "MOTO_CHAIN_SPROCKETS_OVERHAUL",
    serviceDisplayName: "Drive Chain & Sprockets Overhaul & Alignment",
    conditions: {
      findingKeys: ["MOTO_CHAIN_BINDING_RUST"],
      severities: ["CRITICAL"],
    },
    recommendationLevel: "RECOMMENDED",
    baseScore: 95,
  },
  {
    id: "rule-moto-chain-lube-att",
    ruleVersion: 1,
    canonicalPartSlug: "moto-drive-chain",
    serviceKey: "MOTO_CHAIN_TENSION_LUBE",
    serviceDisplayName: "Drive Chain Tension Adjustment & Lubrication",
    conditions: {
      findingKeys: ["MOTO_CHAIN_EXCESSIVE_SLACK"],
      severities: ["ATTENTION"],
    },
    recommendationLevel: "RECOMMENDED",
    baseScore: 90,
  },
  {
    id: "rule-moto-fork-seal-crit",
    ruleVersion: 1,
    canonicalPartSlug: "moto-front-fork-seals",
    serviceKey: "MOTO_INVERTED_FORK_SEAL_OVERHAUL",
    serviceDisplayName: "Inverted Front Fork Oil Seal & Bushing Overhaul",
    conditions: {
      findingKeys: ["MOTO_FORK_SEAL_OIL_LEAK"],
      severities: ["CRITICAL"],
    },
    recommendationLevel: "RECOMMENDED",
    baseScore: 95,
  },
];

/**
 * Heavy Commercial Machinery (HEAVY_EQUIPMENT) Recommendation Rules.
 */
export const HEAVY_EQUIPMENT_RECOMMENDATION_RULES: readonly ServiceRecommendationRule[] = [
  {
    id: "rule-heavy-cylinder-seal-crit",
    ruleVersion: 1,
    canonicalPartSlug: "heavy-hydraulic-cylinders",
    serviceKey: "HEAVY_BOOM_BUCKET_CYLINDER_SEAL_OVERHAUL",
    serviceDisplayName: "Boom / Bucket Hydraulic Cylinder Seal Kit Overhaul",
    conditions: {
      findingKeys: ["HEAVY_HYDRAULIC_RAM_SCORED"],
      severities: ["CRITICAL"],
    },
    recommendationLevel: "RECOMMENDED",
    baseScore: 98,
  },
  {
    id: "rule-heavy-track-roller-crit",
    ruleVersion: 1,
    canonicalPartSlug: "heavy-track-rollers",
    serviceKey: "HEAVY_UNDERCARRIAGE_TRACK_ROLLER_REPLACE",
    serviceDisplayName: "Undercarriage Bottom Track Roller & Idler Replacement",
    conditions: {
      findingKeys: ["HEAVY_TRACK_ROLLER_BEARING_PLAY"],
      severities: ["CRITICAL"],
    },
    recommendationLevel: "RECOMMENDED",
    baseScore: 95,
  },
  {
    id: "rule-heavy-bucket-tooth-att",
    ruleVersion: 1,
    canonicalPartSlug: "heavy-bucket-teeth",
    serviceKey: "HEAVY_BUCKET_TEETH_CUTTING_EDGE_REPLACE",
    serviceDisplayName: "Bucket Teeth & Cutting Edge Field Replacement Service",
    conditions: {
      findingKeys: ["HEAVY_BUCKET_TOOTH_BLUNTED"],
      severities: ["ATTENTION"],
    },
    recommendationLevel: "RECOMMENDED",
    baseScore: 90,
  },
];

export const ALL_MASTER_RECOMMENDATION_RULES: readonly ServiceRecommendationRule[] = [
  ...CARS_RECOMMENDATION_RULES,
  ...MOTORCYCLES_RECOMMENDATION_RULES,
  ...HEAVY_EQUIPMENT_RECOMMENDATION_RULES,
];
