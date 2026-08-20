import type { OperatingCategory } from "../operations/categories";

/**
 * Starter specialization packs: the real service cards and measurement
 * forms a workshop begins with, chosen at creation.
 *
 * Phase 17.A shipped this idea as an if-chain over two hardcoded
 * profiles inside `PlatformService`. That was honest for two profiles
 * and stops being honest at six: the onboarding experience shows the
 * super admin exactly which cards a pack creates, and it can only do
 * that if the packs are data it can read rather than branches it cannot.
 *
 * **Everything declared here is really created.** A pack lists the
 * definitions it seeds; the creation transaction writes one
 * `SpecializationDefinition` row per entry, and the onboarding review
 * screen lists those same names. There is no pack that promises a card
 * the seeder does not write -- that is exactly the "preview a page that
 * will not exist after creation" failure this surface must not have.
 *
 * PHASE_17.md's own framing: *not one giant form*. A pack is a starting
 * point a workshop edits, never a ceiling -- every definition here is an
 * ordinary tenant-owned row that the owner can revise or retire on day
 * two, and revising it bumps its version rather than rewriting history.
 */

/** Mirrors `SpecializationFieldType` in the Prisma schema. */
export type SpecializationFieldTypeName = "TEXT" | "DECIMAL" | "ENUM" | "BOOLEAN";

/** Mirrors `SpecializationKind` in the Prisma schema. */
export type SpecializationKindName = "SERVICE_CARD" | "MEASUREMENT_FORM";

export interface PackFieldSpec {
  readonly key: string;
  readonly label: string;
  readonly type: SpecializationFieldTypeName;
  /** Only meaningful on a measurement point -- "bar", "V", "mm". */
  readonly unit?: string;
  readonly enumOptions?: readonly string[];
  readonly required?: boolean;
}

export interface PackDefinition {
  readonly kind: SpecializationKindName;
  readonly name: string;
  readonly fields: readonly PackFieldSpec[];
}

export interface SpecializationPack {
  readonly key: string;
  readonly title: string;
  /** One line. What kind of workshop this is for, in its own words. */
  readonly summary: string;
  /**
   * Categories this pack makes sense for. A motorcycle shop is not
   * offered a hydraulic-pressure diagnostic; offering it and letting
   * them pick it would be a worse experience than not offering it, and
   * the category is already known by the time this stage is reached.
   */
  readonly categories: readonly OperatingCategory[];
  readonly definitions: readonly PackDefinition[];
}

const PACKS: readonly SpecializationPack[] = [
  {
    key: "QUICK_SERVICE",
    title: "Quick service",
    summary: "Oil, filters, fluids — short jobs, done many times a day, recorded the same way each time.",
    categories: ["CARS", "MOTORCYCLES"],
    definitions: [
      {
        kind: "SERVICE_CARD",
        name: "Oil Change",
        fields: [
          { key: "viscosity", label: "Viscosity", type: "ENUM", enumOptions: ["5W-30", "5W-40", "10W-40", "20W-50"], required: true },
          { key: "litres", label: "Litres", type: "DECIMAL", unit: "L", required: true },
          { key: "filterType", label: "Filter type", type: "TEXT" },
          { key: "nextServiceKm", label: "Next service at", type: "DECIMAL", unit: "km" },
        ],
      },
      {
        kind: "SERVICE_CARD",
        name: "Fluid Top-Up",
        fields: [
          {
            key: "fluid",
            label: "Fluid",
            type: "ENUM",
            enumOptions: ["Coolant", "Brake", "Power steering", "Washer", "Transmission"],
            required: true,
          },
          { key: "quantity", label: "Quantity", type: "DECIMAL", unit: "L", required: true },
        ],
      },
    ],
  },
  {
    key: "BRAKES_AND_SUSPENSION",
    title: "Brakes & suspension",
    summary: "Measured wear, per wheel — the readings that decide whether a part is replaced or passed.",
    categories: ["CARS", "MOTORCYCLES"],
    definitions: [
      {
        kind: "MEASUREMENT_FORM",
        name: "Brake Wear Measurement",
        fields: [
          { key: "pad_fl", label: "Pad — front left", type: "DECIMAL", unit: "mm", required: true },
          { key: "pad_fr", label: "Pad — front right", type: "DECIMAL", unit: "mm", required: true },
          { key: "pad_rl", label: "Pad — rear left", type: "DECIMAL", unit: "mm" },
          { key: "pad_rr", label: "Pad — rear right", type: "DECIMAL", unit: "mm" },
          { key: "disc_min_spec", label: "Disc at or above minimum spec", type: "BOOLEAN", required: true },
        ],
      },
      {
        kind: "SERVICE_CARD",
        name: "Brake Service",
        fields: [
          { key: "axle", label: "Axle", type: "ENUM", enumOptions: ["Front", "Rear", "Both"], required: true },
          { key: "padsReplaced", label: "Pads replaced", type: "BOOLEAN", required: true },
          { key: "discsReplaced", label: "Discs replaced", type: "BOOLEAN", required: true },
          { key: "fluidBled", label: "Fluid bled", type: "BOOLEAN" },
        ],
      },
    ],
  },
  {
    key: "DIAGNOSTICS",
    title: "Diagnostics",
    summary: "The workshop sells the answer, not only the repair — fault codes and readings are the deliverable.",
    categories: ["CARS", "MOTORCYCLES", "HEAVY_EQUIPMENT"],
    definitions: [
      {
        kind: "MEASUREMENT_FORM",
        name: "Diagnostic Scan",
        fields: [
          { key: "tool", label: "Scan tool", type: "TEXT", required: true },
          { key: "codes", label: "Fault codes read", type: "TEXT", required: true },
          { key: "livePassed", label: "Live data within range", type: "BOOLEAN", required: true },
          { key: "batteryVoltage", label: "Battery voltage", type: "DECIMAL", unit: "V" },
          { key: "conclusion", label: "Conclusion", type: "TEXT", required: true },
        ],
      },
    ],
  },
  {
    key: "ELECTRICAL",
    title: "Electrical",
    summary: "Charging, starting and parasitic-draw work, where the readings are the evidence.",
    categories: ["CARS", "MOTORCYCLES", "HEAVY_EQUIPMENT"],
    definitions: [
      {
        kind: "MEASUREMENT_FORM",
        name: "Charging System Test",
        fields: [
          { key: "restingVoltage", label: "Resting voltage", type: "DECIMAL", unit: "V", required: true },
          { key: "chargingVoltage", label: "Charging voltage", type: "DECIMAL", unit: "V", required: true },
          { key: "crankingVoltage", label: "Cranking voltage", type: "DECIMAL", unit: "V", required: true },
          { key: "parasiticDraw", label: "Parasitic draw", type: "DECIMAL", unit: "mA" },
          {
            key: "verdict",
            label: "Verdict",
            type: "ENUM",
            enumOptions: ["Healthy", "Battery suspect", "Alternator suspect", "Draw present"],
            required: true,
          },
        ],
      },
    ],
  },
  {
    key: "FIELD_SERVICE",
    title: "Field service & heavy equipment",
    summary: "Work happens on the customer's site, on machines whose pressures and hours are the record.",
    categories: ["HEAVY_EQUIPMENT"],
    definitions: [
      {
        kind: "MEASUREMENT_FORM",
        name: "Hydraulic Pressure Diagnostic",
        fields: [
          { key: "main_pump", label: "Main pump", type: "DECIMAL", unit: "bar", required: true },
          { key: "return_line", label: "Return line", type: "DECIMAL", unit: "bar", required: true },
          { key: "pilot_circuit", label: "Pilot circuit", type: "DECIMAL", unit: "bar" },
          { key: "oil_temp", label: "Oil temperature", type: "DECIMAL", unit: "C" },
          { key: "within_spec", label: "Within spec", type: "BOOLEAN", required: true },
        ],
      },
      {
        kind: "SERVICE_CARD",
        name: "Scheduled Machine Service",
        fields: [
          { key: "hourMeter", label: "Hour meter", type: "DECIMAL", unit: "h", required: true },
          {
            key: "interval",
            label: "Service interval",
            type: "ENUM",
            enumOptions: ["250h", "500h", "1000h", "2000h"],
            required: true,
          },
          { key: "siteReference", label: "Site reference", type: "TEXT" },
          { key: "nextDueHours", label: "Next due at", type: "DECIMAL", unit: "h" },
        ],
      },
    ],
  },
  {
    key: "TYRES_AND_WHEELS",
    title: "Tyres & wheels",
    summary: "Tread depth and pressure per wheel, recorded the same way every time so wear is comparable.",
    categories: ["CARS", "MOTORCYCLES", "HEAVY_EQUIPMENT"],
    definitions: [
      {
        kind: "MEASUREMENT_FORM",
        name: "Tread & Pressure Check",
        fields: [
          { key: "tread_fl", label: "Tread — front left", type: "DECIMAL", unit: "mm", required: true },
          { key: "tread_fr", label: "Tread — front right", type: "DECIMAL", unit: "mm", required: true },
          { key: "tread_rl", label: "Tread — rear left", type: "DECIMAL", unit: "mm" },
          { key: "tread_rr", label: "Tread — rear right", type: "DECIMAL", unit: "mm" },
          { key: "pressureSetTo", label: "Pressure set to", type: "DECIMAL", unit: "bar" },
        ],
      },
    ],
  },
  {
    key: "BODY_AND_PAINT",
    title: "Body & paint",
    summary: "Panel work, where the colour code and the number of coats are what a comeback is judged against.",
    categories: ["CARS", "MOTORCYCLES"],
    definitions: [
      {
        kind: "SERVICE_CARD",
        name: "Panel Repair & Refinish",
        fields: [
          { key: "panel", label: "Panel", type: "TEXT", required: true },
          { key: "colourCode", label: "Colour code", type: "TEXT", required: true },
          {
            key: "process",
            label: "Process",
            type: "ENUM",
            enumOptions: ["Touch-in", "Blend", "Full panel respray", "Replace and refinish"],
            required: true,
          },
          { key: "coats", label: "Coats", type: "DECIMAL" },
          { key: "bakeMinutes", label: "Bake time", type: "DECIMAL", unit: "min" },
        ],
      },
    ],
  },
];

export const SPECIALIZATION_PACKS: readonly SpecializationPack[] = PACKS;

export const SPECIALIZATION_PACK_KEYS: readonly string[] = PACKS.map((pack) => pack.key);

export function specializationPack(key: string): SpecializationPack | undefined {
  return PACKS.find((pack) => pack.key === key);
}

/** The packs offered for a category. The category is known before this stage is reached, so an irrelevant pack is never shown. */
export function packsForCategory(category: OperatingCategory): readonly SpecializationPack[] {
  return PACKS.filter((pack) => pack.categories.includes(category));
}

/**
 * How many definitions a set of packs will really create. Used by the
 * live summary, which must never state a number the seeder will not
 * produce.
 */
export function definitionsSeededBy(packKeys: readonly string[]): readonly PackDefinition[] {
  const seen = new Set<string>();
  const definitions: PackDefinition[] = [];
  for (const key of packKeys) {
    const pack = specializationPack(key);
    if (!pack) continue;
    for (const definition of pack.definitions) {
      // Two packs can legitimately want the same card (Diagnostics and
      // Electrical both suit an auto-electrician). Seeding it twice would
      // give the workshop two identical cards to pick between on the
      // work card, which is worse than either pack alone.
      const identity = `${definition.kind}:${definition.name}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      definitions.push(definition);
    }
  }
  return definitions;
}
