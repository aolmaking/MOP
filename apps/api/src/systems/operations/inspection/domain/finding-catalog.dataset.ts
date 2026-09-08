import { InspectionFindingDef } from "./inspection.types";

/**
 * Standard finding definitions for passenger automotive vehicles (CARS).
 */
export const CARS_FINDING_CATALOG: readonly InspectionFindingDef[] = [
  // Front Brake Pads
  {
    key: "CAR_PAD_THICKNESS_CRITICAL",
    label: "Friction material worn below 2.0 mm (Immediate Replacement Required)",
    labelAr: "سماكة مادة الاحتكاك أقل من 2 مم (يلزم التغيير فوراً)",
    defaultSeverity: "CRITICAL",
    canonicalPartSlug: "brake-pads-front",
  },
  {
    key: "CAR_PAD_THICKNESS_ATTENTION",
    label: "Friction material worn between 2.0 mm and 4.0 mm (Wear Monitoring Required)",
    labelAr: "سماكة مادة الاحتكاك بين 2 و 4 مم (تحتاج مراقبة)",
    defaultSeverity: "ATTENTION",
    canonicalPartSlug: "brake-pads-front",
  },
  {
    key: "CAR_PAD_GLAZED_HEAT_STRESS",
    label: "Brake pad friction surface glazed or contaminated with oil/grease",
    labelAr: "سطح التيل متبلور أو ملوث بالشحم/الزيت نتيجة حرارة مفرطة",
    defaultSeverity: "ATTENTION",
    canonicalPartSlug: "brake-pads-front",
  },

  // Rear Brake Pads (with EPB)
  {
    key: "CAR_REAR_PAD_THICKNESS_CRITICAL",
    label: "Rear brake friction material worn below 2.0 mm (EPB Servicing Required)",
    labelAr: "تيل الفرامل الخلفي متآكل لأقل من 2 مم (يتطلب خدمة فرامل اليد الإلكترونية)",
    defaultSeverity: "CRITICAL",
    canonicalPartSlug: "brake-pads-rear",
  },
  {
    key: "CAR_REAR_PAD_UNEVEN_WEAR",
    label: "Significant thickness discrepancy between inner and outer rear brake pads",
    labelAr: "تآكل غير متساوٍ بين التيل الداخلي والخارجي للخلف",
    defaultSeverity: "ATTENTION",
    canonicalPartSlug: "brake-pads-rear",
  },

  // Brake Rotors / Discs
  {
    key: "CAR_ROTOR_MIN_THICKNESS_EXCEEDED",
    label: "Rotor thickness below manufacturer discard specification (Grooved/Scored)",
    labelAr: "سماكة الطنبورة أقل من الحد الأدنى المسموح به من المصنع (ريجة عميقة)",
    defaultSeverity: "CRITICAL",
    canonicalPartSlug: "brake-rotors-front",
  },
  {
    key: "CAR_ROTOR_HEAT_SPOTS_WARPING",
    label: "Excessive lateral runout or blue heat checking causing brake pulsation",
    labelAr: "اعوجاج بالطنبورة أو بقع حرارية تسبب اهتزاز عند الفرملة",
    defaultSeverity: "ATTENTION",
    canonicalPartSlug: "brake-rotors-front",
  },

  // 12V Battery & Charging
  {
    key: "CAR_BATTERY_FAILED_LOAD_TEST",
    label: "Battery failed carbon pile load test / internal cell open-circuit",
    labelAr: "البطارية فشلت في اختبار الحمل / عطل داخلي بالخلايا",
    defaultSeverity: "CRITICAL",
    canonicalPartSlug: "battery-12v-starting",
  },
  {
    key: "CAR_BATTERY_TERMINAL_CORROSION",
    label: "Heavy lead sulfate corrosion on positive or negative battery posts",
    labelAr: "تأكسد وأملاح كبريتية على أقطاب البطارية تضعف التوصيل",
    defaultSeverity: "ATTENTION",
    canonicalPartSlug: "battery-12v-starting",
  },
  {
    key: "CAR_BATTERY_LOW_STATE_OF_CHARGE",
    label: "Open-circuit resting voltage below 12.2V (Deep Discharge)",
    labelAr: "شحنة البطارية منخفضة أقل من 12.2 فولت (تفريغ عميق)",
    defaultSeverity: "ATTENTION",
    canonicalPartSlug: "battery-12v-starting",
  },

  // Engine Oil & Lubrication
  {
    key: "CAR_ENGINE_OIL_DEGRADED_DIRTY",
    label: "Motor oil severely contaminated, oxidized or past scheduled mileage interval",
    labelAr: "زيت المحرك متهالك وشديد السواد ومتجاوز الكيلومترات المقررة",
    defaultSeverity: "ATTENTION",
    canonicalPartSlug: "engine-oil-filter",
  },
  {
    key: "CAR_ENGINE_OIL_LEVEL_CRITICAL_LOW",
    label: "Oil dipstick level below minimum threshold / risk of oil pressure starvation",
    labelAr: "مستوى الزيت أقل من علامة الحد الأدنى (خطر فقدان ضغط الزيت)",
    defaultSeverity: "CRITICAL",
    canonicalPartSlug: "engine-oil-filter",
  },

  // Spark Plugs & Ignition
  {
    key: "CAR_SPARK_PLUG_ELECTRODE_EROSION",
    label: "Electrode gap enlarged beyond specification or carbon fouled causing misfires",
    labelAr: "تآكل وتفحم شمعة الاحتراق مما يسبب تقطيع المحرك (Misfire)",
    defaultSeverity: "ATTENTION",
    canonicalPartSlug: "spark-plugs-coils",
  },

  // A/C Compressor & Climate
  {
    key: "CAR_AC_COMPRESSOR_SEIZED_NOISY",
    label: "A/C compressor clutch bearing noisy or internal piston seizure detected",
    labelAr: "صوت خشن في رولمان بلي الكومبريسور أو قفش داخلي في البساتم",
    defaultSeverity: "CRITICAL",
    canonicalPartSlug: "ac-compressor",
  },
  {
    key: "CAR_AC_REFRIGERANT_LOW_PRESSURE",
    label: "Static system pressure below 40 PSI, indicating slow refrigerant micro-leak",
    labelAr: "ضغط غاز الفريون منخفض أقل من 40 PSI (تسريب دقيق في الدورة)",
    defaultSeverity: "ATTENTION",
    canonicalPartSlug: "ac-compressor",
    faultProjectionPolicy: "WHEN_ACTIONABLE",
  },
  {
    key: "CAR_BATTERY_LABEL_OBSERVATION_INFO",
    label: "Battery serial number or manufacture batch sticker recorded for technical provenance",
    labelAr: "رقم شحنة وتاريخ إنتاج البطارية مسجل للأرشفة الفنية",
    defaultSeverity: "INFO",
    canonicalPartSlug: "battery-12v-starting",
    faultProjectionPolicy: "NEVER",
  },
];

/**
 * Standard finding definitions for motorcycles (MOTORCYCLES).
 */
export const MOTORCYCLES_FINDING_CATALOG: readonly InspectionFindingDef[] = [
  {
    key: "MOTO_CHAIN_EXCESSIVE_SLACK",
    label: "Drive chain free play exceeds 45mm, loose links or sprocket tooth hooking",
    labelAr: "ارتخاء شديد في جنزير السحب أو تآكل وتحدب في أسنان التروس",
    defaultSeverity: "ATTENTION",
    canonicalPartSlug: "moto-drive-chain",
  },
  {
    key: "MOTO_CHAIN_BINDING_RUST",
    label: "Kinked/frozen chain links with red rust and torn O-rings / X-rings",
    labelAr: "عقد متصلبة ومتحجرة بالجنزير مع تلف الأورنجات وتآكل صدئ",
    defaultSeverity: "CRITICAL",
    canonicalPartSlug: "moto-drive-chain",
  },
  {
    key: "MOTO_FRONT_PAD_THICKNESS_LOW",
    label: "Sintered brake pad compound below 1.5mm wear indicator groove",
    labelAr: "تيل الفرامل الأمامي أقل من مؤشر الأمان 1.5 مم",
    defaultSeverity: "CRITICAL",
    canonicalPartSlug: "moto-front-brake-pads",
  },
  {
    key: "MOTO_FORK_SEAL_OIL_LEAK",
    label: "Fork tube stanchion coated with hydraulic fork oil dripping toward calipers",
    labelAr: "تسريب زيت من أولسيهات المساعد الأمامي باتجاه كليبر الفرامل",
    defaultSeverity: "CRITICAL",
    canonicalPartSlug: "moto-front-fork-seals",
  },
];

/**
 * Standard finding definitions for heavy commercial machinery (HEAVY_EQUIPMENT).
 */
export const HEAVY_EQUIPMENT_FINDING_CATALOG: readonly InspectionFindingDef[] = [
  {
    key: "HEAVY_HYDRAULIC_RAM_SCORED",
    label: "Cylinder chrome rod scored, wiper seal extrusion and active hydraulic fluid drip",
    labelAr: "تجريح في بستم الهيدروليك وتلف مانع الغبار مع تسريب زيت هيدروليكي نشط",
    defaultSeverity: "CRITICAL",
    canonicalPartSlug: "heavy-hydraulic-cylinders",
  },
  {
    key: "HEAVY_TRACK_ROLLER_BEARING_PLAY",
    label: "Bottom track roller seized or bearing radial play exceeding 5mm",
    labelAr: "تصلب أو بوش مفرط في رولمان بلي عجلات الجنزير السفلية",
    defaultSeverity: "CRITICAL",
    canonicalPartSlug: "heavy-track-rollers",
  },
  {
    key: "HEAVY_BUCKET_TOOTH_BLUNTED",
    label: "Ground engaging tool tooth worn to adapter shank or missing lock pin",
    labelAr: "تآكل سن الباكت حتى قاعدة التثبيت أو فقدان بنز التثبيت",
    defaultSeverity: "ATTENTION",
    canonicalPartSlug: "heavy-bucket-teeth",
  },
];

/**
 * Unified Master Finding Catalog.
 */
export const ALL_MASTER_FINDINGS: readonly InspectionFindingDef[] = [
  ...CARS_FINDING_CATALOG,
  ...MOTORCYCLES_FINDING_CATALOG,
  ...HEAVY_EQUIPMENT_FINDING_CATALOG,
];

/**
 * Helper to look up a finding definition by its unique key.
 */
export function findFindingDefByKey(key: string): InspectionFindingDef | undefined {
  return ALL_MASTER_FINDINGS.find((f) => f.key === key);
}
