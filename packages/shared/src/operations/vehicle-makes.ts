/**
 * The vehicles a workshop can record against an asset: every make it might
 * see, and the models each of those makes builds.
 *
 * This exists because the make was never recorded anywhere. The front desk
 * registered a plate and a category, and everything downstream that needed
 * to know what the vehicle *was* had to invent it -- most consequentially
 * `VehicleFitmentService`, which guessed the make from letters inside the
 * licence plate: every car in the system was a Toyota Corolla unless its
 * plate happened to contain "bmw", and the list of parts a technician was
 * offered followed that guess.
 *
 * ## Order is data, not decoration
 *
 * Both lists are ordered by how often a workshop in MOP's market actually
 * sees them -- Toyota before Ducati, Corolla before Century -- because the
 * picker shows them in this order and the operator is standing at a counter
 * with a customer waiting. Alphabetical would be easier to maintain and
 * would put Alfa Romeo first, which is wrong about the world.
 *
 * ## `id` is a contract
 *
 * It is the lower-case key `applicableMakes` in `fitment-rules.dataset.ts`
 * matches on. Changing one means changing the other: a make the fitment
 * rules have never heard of produces a vehicle nothing is compatible with,
 * and nobody would see why.
 *
 * ## Coverage, honestly
 *
 * "Every car that exists" is not a thing a file can be. This covers the
 * makes and the mainstream models a workshop in Egypt or the Gulf sees,
 * which is what the picker is for -- and the model field accepts free text
 * beside the list, so a Bugatti in the bay is recorded rather than refused.
 *
 * ## About the marks
 *
 * `initials` and `tint` are the fallback the interface draws when it has no
 * marque artwork: a two-letter monogram in the marque's own colour. The
 * drawn marks themselves live in the browser
 * (`apps/web/src/app/ui/vehicle-mark/marque-marks.ts`) because they are
 * presentation, and this file is read by the server too.
 */

import type { OperatingCategory } from "./categories";

export interface VehicleMake {
  /** Lower-case, and the key `applicableMakes` in the fitment rules matches. */
  readonly id: string;
  readonly label: string;
  /** Which kinds of vehicle this maker actually builds. */
  readonly categories: readonly OperatingCategory[];
  /** One or two letters, drawn when there is no marque artwork for this make. */
  readonly initials: string;
  /** The marque's own colour. Contrast is handled by the surface behind it. */
  readonly tint: string;
  /** Mainstream models, most common first. Never exhaustive -- see the header. */
  readonly models: readonly string[];
}

export const VEHICLE_MAKES: readonly VehicleMake[] = [
  // ── Cars, in the order a workshop in this market meets them ────────
  {
    id: "toyota",
    label: "Toyota",
    categories: ["CARS"],
    initials: "TO",
    tint: "#eb0a1e",
    models: [
      "Corolla", "Yaris", "Hilux", "Land Cruiser", "Camry", "RAV4", "Fortuner",
      "Prado", "Avanza", "Rush", "Hiace", "C-HR", "Prius", "Highlander",
      "Innova", "Coaster", "Supra", "86",
    ],
  },
  {
    id: "hyundai",
    label: "Hyundai",
    categories: ["CARS"],
    initials: "HY",
    tint: "#002c5f",
    models: [
      "Elantra", "Accent", "Tucson", "Creta", "i10", "i30", "Sonata",
      "Santa Fe", "Verna", "Kona", "Venue", "H-1", "Palisade", "Bayon",
    ],
  },
  {
    id: "kia",
    label: "Kia",
    categories: ["CARS"],
    initials: "KI",
    tint: "#05141f",
    models: [
      "Cerato", "Sportage", "Picanto", "Rio", "Sorento", "Seltos", "Pegas",
      "Carnival", "Soul", "Optima", "Stonic", "K5", "Telluride",
    ],
  },
  {
    id: "nissan",
    label: "Nissan",
    categories: ["CARS"],
    initials: "NI",
    tint: "#c3002f",
    models: [
      "Sunny", "Qashqai", "Patrol", "Sentra", "X-Trail", "Micra", "Altima",
      "Juke", "Navara", "Kicks", "Pathfinder", "Urvan", "Maxima", "GT-R",
    ],
  },
  {
    id: "chevrolet",
    label: "Chevrolet",
    categories: ["CARS"],
    initials: "CH",
    tint: "#d1a53f",
    models: [
      "Optra", "Aveo", "Captiva", "Cruze", "Tahoe", "Silverado", "Malibu",
      "Spark", "Groove", "Traverse", "Camaro", "Blazer", "N300",
    ],
  },
  {
    id: "mercedes",
    label: "Mercedes-Benz",
    categories: ["CARS"],
    initials: "MB",
    tint: "#00adef",
    models: [
      "C-Class", "E-Class", "S-Class", "GLC", "GLE", "A-Class", "CLA",
      "GLA", "G-Class", "Sprinter", "Vito", "GLS", "CLS", "SL",
    ],
  },
  {
    id: "bmw",
    label: "BMW",
    categories: ["CARS", "MOTORCYCLES"],
    initials: "BM",
    tint: "#0066b1",
    models: [
      "3 Series", "5 Series", "X5", "X3", "1 Series", "7 Series", "X1",
      "X6", "4 Series", "2 Series", "X7", "i4", "iX", "M3", "Z4",
      "R 1250 GS", "S 1000 RR", "F 900 R",
    ],
  },
  {
    id: "volkswagen",
    label: "Volkswagen",
    categories: ["CARS"],
    initials: "VW",
    tint: "#001e50",
    models: [
      "Golf", "Passat", "Polo", "Tiguan", "Jetta", "Touareg", "T-Roc",
      "Caddy", "Transporter", "Arteon", "ID.4", "Amarok",
    ],
  },
  {
    id: "honda",
    label: "Honda",
    categories: ["CARS", "MOTORCYCLES"],
    initials: "HO",
    tint: "#e40521",
    models: [
      "Civic", "Accord", "CR-V", "City", "HR-V", "Jazz", "Pilot",
      "Odyssey", "BR-V", "CB500", "CBR600RR", "Africa Twin", "PCX",
    ],
  },
  {
    id: "mitsubishi",
    label: "Mitsubishi",
    categories: ["CARS"],
    initials: "MI",
    tint: "#e60012",
    models: [
      "Lancer", "Pajero", "Outlander", "L200", "Attrage", "Eclipse Cross",
      "Xpander", "Montero Sport", "ASX", "Canter",
    ],
  },
  {
    id: "renault",
    label: "Renault",
    categories: ["CARS"],
    initials: "RE",
    tint: "#ffcc33",
    models: [
      "Logan", "Duster", "Sandero", "Megane", "Clio", "Captur", "Kadjar",
      "Fluence", "Symbol", "Talisman", "Trafic",
    ],
  },
  {
    id: "peugeot",
    label: "Peugeot",
    categories: ["CARS"],
    initials: "PE",
    tint: "#00305e",
    models: ["208", "301", "308", "2008", "3008", "5008", "508", "Partner", "Boxer", "406"],
  },
  {
    id: "ford",
    label: "Ford",
    categories: ["CARS"],
    initials: "FO",
    tint: "#00274e",
    models: [
      "Focus", "Ranger", "Explorer", "Fiesta", "EcoSport", "F-150", "Escape",
      "Edge", "Transit", "Everest", "Mustang", "Expedition",
    ],
  },
  {
    id: "skoda",
    label: "Škoda",
    categories: ["CARS"],
    initials: "SK",
    tint: "#0e3a2f",
    models: ["Octavia", "Fabia", "Superb", "Kodiaq", "Karoq", "Rapid", "Scala", "Kamiq"],
  },
  {
    id: "audi",
    label: "Audi",
    categories: ["CARS"],
    initials: "AU",
    tint: "#bb0a30",
    models: ["A4", "A6", "Q5", "A3", "Q7", "Q3", "A5", "A8", "Q8", "e-tron", "TT", "RS6"],
  },
  {
    id: "suzuki",
    label: "Suzuki",
    categories: ["CARS", "MOTORCYCLES"],
    initials: "SU",
    tint: "#e10a1e",
    models: [
      "Swift", "Vitara", "Dzire", "Alto", "Baleno", "Jimny", "Ertiga",
      "Ciaz", "Celerio", "GSX-R750", "V-Strom 650", "Hayabusa",
    ],
  },
  {
    id: "mg",
    label: "MG",
    categories: ["CARS"],
    initials: "MG",
    tint: "#c8102e",
    models: ["MG5", "ZS", "HS", "RX5", "MG6", "MG3", "GT", "Marvel R"],
  },
  {
    id: "jeep",
    label: "Jeep",
    categories: ["CARS"],
    initials: "JE",
    tint: "#3c4a35",
    models: ["Grand Cherokee", "Wrangler", "Cherokee", "Compass", "Renegade", "Gladiator"],
  },
  {
    id: "lexus",
    label: "Lexus",
    categories: ["CARS"],
    initials: "LX",
    tint: "#1a1a1a",
    models: ["ES", "RX", "LX", "NX", "IS", "GX", "UX", "LS", "LC"],
  },
  {
    id: "mazda",
    label: "Mazda",
    categories: ["CARS"],
    initials: "MA",
    tint: "#101010",
    models: ["Mazda 3", "Mazda 6", "CX-5", "CX-30", "CX-9", "Mazda 2", "BT-50", "MX-5"],
  },
  {
    id: "fiat",
    label: "Fiat",
    categories: ["CARS"],
    initials: "FI",
    tint: "#8c2131",
    models: ["Tipo", "500", "Punto", "Doblo", "Panda", "Ducato", "Fiorino"],
  },
  {
    id: "opel",
    label: "Opel",
    categories: ["CARS"],
    initials: "OP",
    tint: "#f7ff14",
    models: ["Astra", "Corsa", "Insignia", "Grandland", "Crossland", "Mokka", "Vivaro"],
  },
  {
    id: "citroen",
    label: "Citroën",
    categories: ["CARS"],
    initials: "CI",
    tint: "#a61b2b",
    models: ["C4", "C3", "C5 Aircross", "Berlingo", "C-Elysee", "Jumper"],
  },
  {
    id: "seat",
    label: "SEAT",
    categories: ["CARS"],
    initials: "SE",
    tint: "#b32639",
    models: ["Leon", "Ibiza", "Ateca", "Arona", "Toledo", "Tarraco"],
  },
  {
    id: "volvo",
    label: "Volvo",
    categories: ["CARS"],
    initials: "VO",
    tint: "#1a3f6f",
    models: ["XC60", "XC90", "S60", "S90", "XC40", "V60", "V90"],
  },
  {
    id: "infiniti",
    label: "Infiniti",
    categories: ["CARS"],
    initials: "IN",
    tint: "#1f2a44",
    models: ["Q50", "QX60", "QX80", "QX50", "Q60", "QX70"],
  },
  {
    id: "land-rover",
    label: "Land Rover",
    categories: ["CARS"],
    initials: "LR",
    tint: "#005a2b",
    models: ["Range Rover", "Range Rover Sport", "Discovery", "Defender", "Evoque", "Velar"],
  },
  {
    id: "porsche",
    label: "Porsche",
    categories: ["CARS"],
    initials: "PO",
    tint: "#c9a227",
    models: ["Cayenne", "Macan", "911", "Panamera", "Taycan", "Boxster"],
  },
  {
    id: "chery",
    label: "Chery",
    categories: ["CARS"],
    initials: "CY",
    tint: "#b01c24",
    models: ["Tiggo 4", "Tiggo 7", "Tiggo 8", "Arrizo 5", "Envy", "QQ"],
  },
  {
    id: "geely",
    label: "Geely",
    categories: ["CARS"],
    initials: "GE",
    tint: "#0b3d91",
    models: ["Emgrand", "Coolray", "Azkarra", "Okavango", "Tugella"],
  },
  {
    id: "byd",
    label: "BYD",
    categories: ["CARS"],
    initials: "BY",
    tint: "#c8102e",
    models: ["Song Plus", "Atto 3", "Han", "Seal", "Dolphin", "F3"],
  },
  {
    id: "daihatsu",
    label: "Daihatsu",
    categories: ["CARS"],
    initials: "DA",
    tint: "#d0021b",
    models: ["Terios", "Gran Max", "Sirion", "Xenia", "Ayla"],
  },
  {
    id: "isuzu",
    label: "Isuzu",
    categories: ["CARS", "HEAVY_EQUIPMENT"],
    initials: "IS",
    tint: "#c8102e",
    models: ["D-Max", "MU-X", "N-Series", "F-Series", "Forward"],
  },
  {
    id: "gmc",
    label: "GMC",
    categories: ["CARS"],
    initials: "GM",
    tint: "#c8102e",
    models: ["Sierra", "Yukon", "Acadia", "Terrain", "Savana"],
  },
  {
    id: "dodge",
    label: "Dodge",
    categories: ["CARS"],
    initials: "DO",
    tint: "#b3121a",
    models: ["Charger", "Challenger", "Durango", "Ram 1500", "Journey"],
  },
  {
    id: "cadillac",
    label: "Cadillac",
    categories: ["CARS"],
    initials: "CA",
    tint: "#1c1c1c",
    models: ["Escalade", "XT5", "CT5", "XT4", "CT6"],
  },
  {
    id: "subaru",
    label: "Subaru",
    categories: ["CARS"],
    initials: "SB",
    tint: "#0041aa",
    models: ["Impreza", "Forester", "Outback", "XV", "Legacy", "WRX"],
  },
  {
    id: "jetour",
    label: "Jetour",
    categories: ["CARS"],
    initials: "JT",
    tint: "#1f3a5f",
    models: ["X70", "X70 Plus", "Dashing", "T2", "X90"],
  },
  {
    id: "haval",
    label: "Haval",
    categories: ["CARS"],
    initials: "HA",
    tint: "#c8102e",
    models: ["Jolion", "H6", "Dargo", "H9", "Big Dog"],
  },

  // ── Motorcycles ───────────────────────────────────────────────────
  {
    id: "yamaha",
    label: "Yamaha",
    categories: ["MOTORCYCLES"],
    initials: "YA",
    tint: "#0033a0",
    models: ["YZF-R3", "MT-07", "MT-09", "YZF-R1", "Tenere 700", "NMAX", "XMAX", "Crypton"],
  },
  {
    id: "kawasaki",
    label: "Kawasaki",
    categories: ["MOTORCYCLES"],
    initials: "KW",
    tint: "#5a9e00",
    models: ["Ninja 400", "Z900", "Ninja ZX-10R", "Versys 650", "Z650", "Vulcan S", "KLX"],
  },
  {
    id: "ktm",
    label: "KTM",
    categories: ["MOTORCYCLES"],
    initials: "KT",
    tint: "#ff6600",
    models: ["Duke 390", "Duke 200", "RC 390", "Adventure 890", "EXC 300", "SX-F 450"],
  },
  {
    id: "ducati",
    label: "Ducati",
    categories: ["MOTORCYCLES"],
    initials: "DU",
    tint: "#cc0000",
    models: ["Monster", "Panigale V4", "Multistrada", "Scrambler", "Diavel", "Streetfighter"],
  },
  {
    id: "harley-davidson",
    label: "Harley-Davidson",
    categories: ["MOTORCYCLES"],
    initials: "HD",
    tint: "#f60",
    models: ["Iron 883", "Street Glide", "Fat Boy", "Sportster S", "Road King", "Pan America"],
  },
  {
    id: "bajaj",
    label: "Bajaj",
    categories: ["MOTORCYCLES"],
    initials: "BA",
    tint: "#0057a8",
    models: ["Pulsar 180", "Pulsar NS200", "Boxer", "Dominar 400", "Avenger", "RE Tuk Tuk"],
  },
  {
    id: "vespa",
    label: "Vespa",
    categories: ["MOTORCYCLES"],
    initials: "VE",
    tint: "#0f9d58",
    models: ["Primavera", "Sprint", "GTS 300", "LX 150", "Elettrica"],
  },

  // ── Heavy equipment ───────────────────────────────────────────────
  {
    id: "caterpillar",
    label: "Caterpillar",
    categories: ["HEAVY_EQUIPMENT"],
    initials: "CA",
    tint: "#ffcd11",
    models: ["320 Excavator", "336 Excavator", "950 Loader", "D6 Dozer", "428 Backhoe", "745 Truck"],
  },
  {
    id: "komatsu",
    label: "Komatsu",
    categories: ["HEAVY_EQUIPMENT"],
    initials: "KO",
    tint: "#0a4c95",
    models: ["PC200", "PC300", "WA320 Loader", "D65 Dozer", "HD465 Truck"],
  },
  {
    id: "jcb",
    label: "JCB",
    categories: ["HEAVY_EQUIPMENT"],
    initials: "JC",
    tint: "#fcb316",
    models: ["3CX Backhoe", "JS205 Excavator", "540 Telehandler", "426 Loader"],
  },
  {
    id: "hitachi",
    label: "Hitachi",
    categories: ["HEAVY_EQUIPMENT"],
    initials: "HI",
    tint: "#e60027",
    models: ["ZX200", "ZX350", "ZW180 Loader", "EX1200"],
  },
  {
    id: "volvo-ce",
    label: "Volvo CE",
    categories: ["HEAVY_EQUIPMENT"],
    initials: "VO",
    tint: "#1a3f6f",
    models: ["EC220 Excavator", "L120 Loader", "A40 Hauler", "BL71 Backhoe"],
  },
  {
    id: "hyundai-ce",
    label: "Hyundai CE",
    categories: ["HEAVY_EQUIPMENT"],
    initials: "HY",
    tint: "#002c5f",
    models: ["R220 Excavator", "R300 Excavator", "HL940 Loader"],
  },
  {
    id: "liebherr",
    label: "Liebherr",
    categories: ["HEAVY_EQUIPMENT"],
    initials: "LI",
    tint: "#f2c200",
    models: ["R 926 Excavator", "L 538 Loader", "LTM Crane", "PR 736 Dozer"],
  },
] as const;

/** The makes worth offering for one kind of vehicle, most common first. */
export function makesForCategory(category: OperatingCategory): readonly VehicleMake[] {
  return VEHICLE_MAKES.filter((make) => make.categories.includes(category));
}

/**
 * Resolves a stored value back to a known make.
 *
 * Tolerant of case and of a label being stored where an id belongs,
 * because assets predate this field and a workshop importing its own
 * records will not have normalised anything.
 */
export function findVehicleMake(value: string | null | undefined): VehicleMake | null {
  if (!value) return null;
  const needle = value.trim().toLowerCase();
  if (!needle) return null;
  return (
    VEHICLE_MAKES.find((make) => make.id === needle) ??
    VEHICLE_MAKES.find((make) => make.label.toLowerCase() === needle) ??
    null
  );
}

/** The models this make builds, most common first. Empty for an unknown make. */
export function modelsForMake(makeId: string | null | undefined): readonly string[] {
  return findVehicleMake(makeId)?.models ?? [];
}

export function isVehicleMake(value: string): boolean {
  return findVehicleMake(value) !== null;
}
