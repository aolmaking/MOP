import { FitmentCompatibilityRule } from "./fitment.types";

/**
 * Multi-Vehicle Domain Fitment Rules.
 *
 * Maps abstract diagnostic findings (Canonical Part Slug + Position)
 * to real physical inventory SKUs based on vehicle make, model, and year range.
 */
export const MASTER_FITMENT_RULES: readonly FitmentCompatibilityRule[] = [
  // ── 1. TOYOTA BRAKE PADS (FRONT) ─────────────────────────────────────────
  {
    id: "fit-toy-brake-pad-front",
    canonicalPartSlug: "brake-pads-front",
    supportedPositions: ["FRONT", "FRONT_LEFT", "FRONT_RIGHT"],
    applicableVehicleCategory: "CARS",
    applicableMakes: ["toyota", "lexus"],
    applicableModels: ["corolla", "camry", "rav4", "yaris", "avalon", "highlander", "es350"],
    yearFrom: 2012,
    yearTo: 2026,
    compatibleSkus: [
      {
        sku: "BRK-PAD-TOY-01",
        fitmentQuality: "EXACT_MATCH",
        grade: "OEM",
        brand: "Toyota Genuine Parts",
        fitmentNotes: "Factory ceramic friction compound with noise-damping stainless hardware clips.",
      },
    ],
  },

  // ── 2. TOYOTA BRAKE PADS (REAR) ──────────────────────────────────────────
  {
    id: "fit-toy-brake-pad-rear",
    canonicalPartSlug: "brake-pads-rear",
    supportedPositions: ["REAR", "REAR_LEFT", "REAR_RIGHT"],
    applicableVehicleCategory: "CARS",
    applicableMakes: ["toyota", "lexus"],
    applicableModels: ["corolla", "camry", "rav4", "yaris", "highlander"],
    yearFrom: 2012,
    yearTo: 2026,
    compatibleSkus: [
      {
        sku: "BRK-PAD-TOY-02",
        fitmentQuality: "EXACT_MATCH",
        grade: "OEM",
        brand: "Toyota Genuine Parts",
        fitmentNotes: "Factory rear ceramic pads calibrated for electronic parking brake (EPB) calipers.",
      },
      {
        sku: "BRK-PAD-REAR-03",
        fitmentQuality: "CROSS_COMPATIBLE",
        grade: "PREMIUM",
        brand: "Bosch Automotive",
        fitmentNotes: "Bosch QuietCast premium ceramic rear pads with multilayer rubber shims.",
      },
    ],
  },

  // ── 3. HYUNDAI / KIA BRAKE PADS (FRONT) ──────────────────────────────────
  {
    id: "fit-hyu-brake-pad-front",
    canonicalPartSlug: "brake-pads-front",
    supportedPositions: ["FRONT", "FRONT_LEFT", "FRONT_RIGHT"],
    applicableVehicleCategory: "CARS",
    applicableMakes: ["hyundai", "kia"],
    applicableModels: ["elantra", "tucson", "sonata", "sportage", "cerato", "optima", "sorento"],
    yearFrom: 2014,
    yearTo: 2026,
    compatibleSkus: [
      {
        sku: "BRK-PAD-HYU-01",
        fitmentQuality: "EXACT_MATCH",
        grade: "PREMIUM",
        brand: "Brembo North America",
        fitmentNotes: "Brembo red-shim high-temperature ceramic front pads for Hyundai/Kia GDI platforms.",
      },
    ],
  },

  // ── 4. HONDA BRAKE PADS (FRONT) ──────────────────────────────────────────
  {
    id: "fit-hon-brake-pad-front",
    canonicalPartSlug: "brake-pads-front",
    supportedPositions: ["FRONT", "FRONT_LEFT", "FRONT_RIGHT"],
    applicableVehicleCategory: "CARS",
    applicableMakes: ["honda"],
    applicableModels: ["civic", "accord", "cr-v", "hr-v", "pilot"],
    yearFrom: 2013,
    yearTo: 2026,
    compatibleSkus: [
      {
        sku: "BRK-PAD-HON-01",
        fitmentQuality: "EXACT_MATCH",
        grade: "OEM",
        brand: "Honda Motors Co.",
        fitmentNotes: "Honda genuine ceramic formulation with pre-fitted anti-rattle spring clips.",
      },
    ],
  },

  // ── 5. NISSAN BRAKE PADS (FRONT) ─────────────────────────────────────────
  {
    id: "fit-nis-brake-pad-front",
    canonicalPartSlug: "brake-pads-front",
    supportedPositions: ["FRONT", "FRONT_LEFT", "FRONT_RIGHT"],
    applicableVehicleCategory: "CARS",
    applicableMakes: ["nissan", "infiniti"],
    applicableModels: ["altima", "sentra", "maxima", "rogue", "q50"],
    yearFrom: 2013,
    yearTo: 2026,
    compatibleSkus: [
      {
        sku: "BRK-PAD-NIS-01",
        fitmentQuality: "EXACT_MATCH",
        grade: "PREMIUM",
        brand: "Akebono Brake Corporation",
        fitmentNotes: "Akebono ProACT ultra-premium ceramic front pads with OE rotor preservation.",
      },
    ],
  },

  // ── 6. GERMAN CARS BRAKE PADS (BMW / MERCEDES / AUDI) ────────────────────
  {
    id: "fit-ger-brake-pad-front",
    canonicalPartSlug: "brake-pads-front",
    supportedPositions: ["FRONT", "FRONT_LEFT", "FRONT_RIGHT"],
    applicableVehicleCategory: "CARS",
    applicableMakes: ["bmw", "mercedes", "audi", "volkswagen"],
    yearFrom: 2012,
    yearTo: 2026,
    compatibleSkus: [
      {
        sku: "BRK-PAD-GER-01",
        fitmentQuality: "EXACT_MATCH",
        grade: "PREMIUM",
        brand: "TMD Friction Germany",
        fitmentNotes: "Textar ECE R90 low-metallic high-friction compound for autobahn braking.",
      },
    ],
  },

  // ── 7. TOYOTA BRAKE ROTORS (FRONT & REAR) ────────────────────────────────
  {
    id: "fit-toy-brake-rotor-front",
    canonicalPartSlug: "brake-rotors-front",
    supportedPositions: ["FRONT", "FRONT_LEFT", "FRONT_RIGHT"],
    applicableVehicleCategory: "CARS",
    applicableMakes: ["toyota", "lexus"],
    applicableModels: ["corolla", "camry", "rav4"],
    yearFrom: 2015,
    yearTo: 2026,
    compatibleSkus: [
      {
        sku: "BRK-ROT-FR-04",
        fitmentQuality: "EXACT_MATCH",
        grade: "PREMIUM",
        brand: "Brembo North America",
        fitmentNotes: "Brembo UV-coated anti-corrosion pillar vented front brake rotors.",
      },
    ],
  },
  {
    id: "fit-toy-brake-rotor-rear",
    canonicalPartSlug: "brake-rotors-rear",
    supportedPositions: ["REAR", "REAR_LEFT", "REAR_RIGHT"],
    applicableVehicleCategory: "CARS",
    applicableMakes: ["toyota", "lexus"],
    applicableModels: ["corolla", "camry", "rav4"],
    yearFrom: 2015,
    yearTo: 2026,
    compatibleSkus: [
      {
        sku: "BRK-ROT-RR-05",
        fitmentQuality: "EXACT_MATCH",
        grade: "PREMIUM",
        brand: "Brembo North America",
        fitmentNotes: "Brembo precision balanced solid rear brake rotors with zinc coating.",
      },
    ],
  },

  // ── 8. 12V STARTING BATTERY (PASSENGER CARS - MULTI-TIER) ────────────────
  {
    id: "fit-car-battery-starting",
    canonicalPartSlug: "12v-starting-battery",
    applicableVehicleCategory: "CARS",
    applicableMakes: ["toyota", "hyundai", "honda", "nissan", "ford", "bmw", "mercedes", "kia", "volkswagen", "audi", "chevrolet"],
    compatibleSkus: [
      {
        sku: "BAT-AGM-BOSCH-H6",
        fitmentQuality: "EXACT_MATCH",
        grade: "PREMIUM",
        brand: "Bosch Automotive",
        fitmentNotes: "Bosch S6 High Performance AGM 12V 70Ah 760CCA (Group 48/H6). Ideal for start-stop.",
      },
      {
        sku: "BAT-EFB-VARTA",
        fitmentQuality: "CROSS_COMPATIBLE",
        grade: "STANDARD",
        brand: "Clarios Varta Germany",
        fitmentNotes: "Varta Blue Dynamic EFB 12V 60Ah 640CCA entry-level start-stop battery.",
      },
      {
        sku: "BAT-AGM-OPTIMA",
        fitmentQuality: "CROSS_COMPATIBLE",
        grade: "PERFORMANCE",
        brand: "Clarios Optima",
        fitmentNotes: "Optima YellowTop dual-purpose deep cycle AGM with 620CCA.",
      },
    ],
  },
  // Alias for canonicalPartSlug: "car-battery"
  {
    id: "fit-car-battery-starting-alias",
    canonicalPartSlug: "car-battery",
    applicableVehicleCategory: "CARS",
    applicableMakes: ["toyota", "hyundai", "honda", "nissan", "ford", "bmw", "mercedes", "kia", "volkswagen", "audi", "chevrolet"],
    compatibleSkus: [
      {
        sku: "BAT-AGM-BOSCH-H6",
        fitmentQuality: "EXACT_MATCH",
        grade: "PREMIUM",
        brand: "Bosch Automotive",
        fitmentNotes: "Bosch S6 High Performance AGM 12V 70Ah 760CCA (Group 48/H6).",
      },
      {
        sku: "BAT-EFB-VARTA",
        fitmentQuality: "CROSS_COMPATIBLE",
        grade: "STANDARD",
        brand: "Clarios Varta Germany",
        fitmentNotes: "Varta Blue Dynamic EFB 12V 60Ah 640CCA.",
      },
    ],
  },

  // ── 9. ENGINE OIL FILTERS ────────────────────────────────────────────────
  {
    id: "fit-toy-oil-filter",
    canonicalPartSlug: "engine-oil-filter",
    applicableVehicleCategory: "CARS",
    applicableMakes: ["toyota", "lexus"],
    applicableModels: ["corolla", "camry", "rav4", "yaris", "avalon"],
    compatibleSkus: [
      {
        sku: "FLT-OIL-TOY-01",
        fitmentQuality: "EXACT_MATCH",
        grade: "OEM",
        brand: "Toyota Genuine Parts",
        fitmentNotes: "OEM spin-on oil filter with pre-lubricated silicone anti-drainback valve.",
      },
    ],
  },
  {
    id: "fit-hyu-oil-filter",
    canonicalPartSlug: "engine-oil-filter",
    applicableVehicleCategory: "CARS",
    applicableMakes: ["hyundai", "kia"],
    compatibleSkus: [
      {
        sku: "FLT-OIL-HYU",
        fitmentQuality: "EXACT_MATCH",
        grade: "OEM",
        brand: "Mobis Hyundai Parts",
        fitmentNotes: "Factory calibrated 14 PSI bypass valve for GDI engine platforms.",
      },
    ],
  },
  {
    id: "fit-ger-oil-filter",
    canonicalPartSlug: "engine-oil-filter",
    applicableVehicleCategory: "CARS",
    applicableMakes: ["bmw", "mercedes", "audi", "volkswagen"],
    compatibleSkus: [
      {
        sku: "FLT-OIL-MANN",
        fitmentQuality: "EXACT_MATCH",
        grade: "OEM",
        brand: "Mann+Hummel Germany",
        fitmentNotes: "Pleated cellulose cartridge element with synthetic reinforced end caps.",
      },
    ],
  },

  // ── 10. ENGINE AIR FILTERS ───────────────────────────────────────────────
  {
    id: "fit-toy-air-filter",
    canonicalPartSlug: "engine-air-filter",
    applicableVehicleCategory: "CARS",
    applicableMakes: ["toyota", "lexus"],
    applicableModels: ["corolla", "camry", "rav4"],
    compatibleSkus: [
      {
        sku: "FLT-AIR-TOY",
        fitmentQuality: "EXACT_MATCH",
        grade: "OEM",
        brand: "Denso Corporation",
        fitmentNotes: "Denso factory triple-layer high efficiency air intake filter.",
      },
    ],
  },

  // ── 11. MOTORCYCLE DRIVE CHAIN ───────────────────────────────────────────
  {
    id: "fit-moto-drive-chain",
    canonicalPartSlug: "moto-drive-chain",
    supportedPositions: ["REAR", "UNIVERSAL"],
    applicableVehicleCategory: "MOTORCYCLES",
    applicableMakes: ["yamaha", "honda", "kawasaki", "suzuki", "ktm", "bmw", "ducati"],
    compatibleSkus: [
      {
        sku: "DID-CHN-520VX3-120",
        fitmentQuality: "EXACT_MATCH",
        grade: "PREMIUM",
        brand: "D.I.D Japan",
        fitmentNotes: "D.I.D 520VX3 Pro-Street X-Ring Gold Drive Chain (120 Links). Includes rivet master link.",
      },
    ],
  },

  // ── 12. HEAVY EQUIPMENT FUEL FILTRATION ──────────────────────────────────
  {
    id: "fit-heavy-fuel-filter",
    canonicalPartSlug: "heavy-fuel-filter",
    applicableVehicleCategory: "HEAVY_EQUIPMENT",
    applicableMakes: ["caterpillar", "komatsu", "jcb", "volvo", "hitachi"],
    compatibleSkus: [
      {
        sku: "CAT-FLT-1R0716",
        fitmentQuality: "EXACT_MATCH",
        grade: "OEM",
        brand: "Caterpillar Inc.",
        fitmentNotes: "2-micron high efficiency secondary fuel filter for commercial diesel engines.",
      },
    ],
  },
];
