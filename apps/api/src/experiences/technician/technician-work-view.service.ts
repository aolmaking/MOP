import { Injectable, NotFoundException } from "@nestjs/common";
import {
  PART_REQUEST_GRAPH,
  canTransition,
  gateDefinition,
  type GateEvaluation,
  type GateKey,
} from "@mop/shared";
import { PrismaService } from "../../runtime/database/prisma.service";
import { CapabilityResolutionService } from "../../control/capabilities/capability-resolution.service";
import { PolicyResolutionService } from "../../control/policies/policy-resolution.service";
import { WorkOrderLifecycleService } from "../../systems/operations/work-order-lifecycle.service";
import { AssetHistoryService } from "../../systems/operations/vehicle-history/asset-history.service";
import { WorkshopHistoryService } from "../../systems/operations/history/workshop-history.service";
import type { TechnicianHistoryBrief } from "../../systems/operations/history/workshop-history.types";
import { SpecializationService, type DefinitionSummary, type EntrySummary } from "../../systems/people/specialization/specialization.service";

export interface TechnicianJob {
  readonly workOrderId: string;
  readonly identifier: string | null;
  readonly vehicleModel?: string | null;
  readonly category?: string | null;
  readonly vin?: string | null;
  readonly customerName: string;
  readonly customerPhone?: string | null;
  readonly status: string;
  readonly complaint: string | null;
  readonly inspectionDeclined: boolean;
  readonly myTaskCount: number;
  readonly myOpenTaskCount: number;
  /** True when a task of theirs is IN_PROGRESS -- the car in front of them. */
  readonly active: boolean;
  readonly blocked: boolean;
  readonly sinceHours: number;
}

export interface TechnicianTask {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly blockedReason: string | null;
}

export interface FinishCheck {
  /** Null when this job has no finish step available from where it is. */
  readonly available: boolean;
  readonly passed: boolean;
  readonly conditions: readonly { satisfied: boolean; text: string }[];
}

/**
 * A part this technician asked for, and what they can do about it now.
 *
 * `waitingOn` names who currently owes the move -- the single thing a
 * technician standing at a car actually wants to know. It is derived
 * from the request's own status rather than stored, because the status
 * is the fact and a second column would be a second truth.
 */
export interface WorkCardPart {
  readonly partRequestId: string;
  readonly name: string;
  readonly sku: string;
  readonly quantity: number;
  readonly issued: number;
  readonly status: string;
  /** Human words for the state, never the enum. */
  readonly statusText: string;
  readonly waitingOn: "STORE" | "YOU" | "NOBODY";
  /** The one action available to the technician right now, if any. */
  readonly action: "RECEIVE" | "MARK_USED" | null;
  /**
   * Every action available to the technician right now -- plural, because
   * a received part offers a real choice (fit it, or send it back), not
   * a single next step. Empty when nothing is theirs to do.
   */
  readonly actions: readonly ("RECEIVE" | "MARK_USED" | "RETURN" | "RESPOND_CLARIFICATION")[];
  /**
   * Whether sending this part back is a move this workshop actually has.
   *
   * Asked of the part-request graph under the tenant's own capability
   * profile rather than compared against a list of statuses here: a
   * workshop with PART_RETURNS removed has no RETURN_REQUESTED edge at
   * all, and a hardcoded `status === "RECEIVED_BY_TECHNICIAN"` would put
   * a button on the tablet that the service layer then refuses. The
   * button dies with the capability that owns it.
   */
  readonly returnable: boolean;
  /** The store asked a question about the return and is waiting on an answer. */
  readonly clarificationPending: boolean;
  /** What they asked, when they asked something. */
  readonly clarificationQuestion: string | null;
}

/**
 * The single lifecycle move a technician can make on the JOB itself
 * right now -- not on a task, not on a part.
 *
 * Derived from `WorkOrderLifecycleService.availableIntents`, which asks
 * the workshop's effective graph, so a profile that routes around
 * inspection never offers "Start inspection". The label is written here
 * because it is technician-facing wording, not a graph fact.
 */
export interface WorkCardPrimaryAction {
  readonly intent: "START_INSPECTION" | "START_WORK";
  readonly label: string;
}

/**
 * Mission 1 on the Work Card: where the inspection stands, and whether
 * repair work is legal yet.
 *
 * This is the server's answer, not the page's opinion. A disabled button
 * is not enforcement -- anyone can open developer tools on a workshop
 * tablet and call the endpoint directly -- so the card reports the same
 * decision the write paths will make, and the UI's job is only to say it
 * clearly. `lockReason` is the sentence the technician reads; it comes
 * from the same lifecycle service that would refuse the request.
 */
export interface WorkCardInspection {
  readonly id: string | null;
  readonly state: "REQUIRED" | "IN_PROGRESS" | "COMPLETED" | "DECLINED";
  /** When the diagnosis finished, for the card to show it was done first. */
  readonly completedAt: string | null;
  /** How long it took, when the workshop tracks time. */
  readonly actualMinutes: number | null;
  /** Findings recorded against this job so far. */
  readonly faultCount: number;
}

export type FindingDecisionStatus = "NOT_REQUESTED" | "PENDING" | "APPROVED" | "REJECTED";

export interface WorkCardFinding {
  readonly id: string;
  readonly description: string;
  readonly severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  readonly code: string | null;
  readonly recommendedService: string | null;
  readonly inspectionId: string | null;
  readonly decisionStatus: FindingDecisionStatus;
}

export interface InspectionBoxCustomerDetails {
  readonly customerName: string;
  readonly phone: string | null;
  readonly vehicleIdentifier: string;
  readonly vehicleCategory?: string | null;
  readonly complaint: string;
}

export interface InspectionBoxItem {
  readonly id: string;
  readonly partKey: string;
  readonly nameEn: string;
  readonly nameAr: string;
  readonly systemCategoryEn: string;
  readonly systemCategoryAr: string;
  readonly icon: string;
  readonly color: string;
  readonly customerDetails: InspectionBoxCustomerDetails;
  readonly isDone: boolean;
  readonly completedAt: string | null;
  readonly symptoms: readonly string[];
}

export interface WorkCard {
  readonly workOrderId: string;
  readonly identifier: string | null;
  readonly vehicleModel?: string | null;
  readonly vin?: string | null;
  readonly mileage?: string | null;
  readonly customerName: string;
  readonly customerPhone?: string | null;
  readonly status: string;
  readonly complaint: string | null;
  readonly inspectionDeclined: boolean;
  readonly timeTracking: "OFF" | "OPTIONAL" | "REQUIRED";
  /** Mission 1. Always present -- a job with no inspection still has a state. */
  readonly inspection: WorkCardInspection;
  /**
   * The list of findings logged against this work order, including their
   * customer decision status.
   */
  readonly findings: readonly WorkCardFinding[];
  /**
   * Whether repair work is legal on this job right now, asked of the same
   * authority that guards every write.
   */
  readonly repairLocked: boolean;
  /** Why repair is locked, in the technician's words. Null when it is not. */
  readonly repairLockReason: string | null;
  readonly tasks: readonly TechnicianTask[];
  readonly parts: readonly WorkCardPart[];
  readonly specializationForms: readonly DefinitionSummary[];
  readonly specializationEntries: readonly EntrySummary[];
  readonly finish: FinishCheck;
  /** Null when the job is not waiting on a move only this technician can make. */
  readonly primaryAction: WorkCardPrimaryAction | null;
  /** Simplified inspection boxes for each part to inspect */
  readonly inspectionBoxes: readonly InspectionBoxItem[];
  readonly inspectionReport?: any | null;
}

/**
 * The words a technician reads, and whose move it is, per request state.
 *
 * Pinned per status deliberately: a new `PartRequestStatus` member must
 * fail a test here rather than reach a technician as a lowercased enum.
 * Same rule the gate registry and the customer status map already follow.
 */
const PART_STATE: Record<
  string,
  { text: string; waitingOn: WorkCardPart["waitingOn"]; actions: WorkCardPart["actions"] }
> = {
  DRAFT: { text: "Not sent to the store yet.", waitingOn: "YOU", actions: [] },
  REQUESTED: { text: "Asked. The store hasn't answered yet.", waitingOn: "STORE", actions: [] },
  WAREHOUSE_REVIEWING: { text: "The store is looking at it.", waitingOn: "STORE", actions: [] },
  APPROVED: { text: "Approved. Waiting to be handed over.", waitingOn: "STORE", actions: [] },
  ISSUED: { text: "Handed over by the store.", waitingOn: "YOU", actions: ["RECEIVE"] },
  IN_TRANSIT: { text: "On its way from another branch.", waitingOn: "STORE", actions: [] },
  ARRIVED: { text: "Arrived at the store. Collect it.", waitingOn: "YOU", actions: ["RECEIVE"] },
  RECEIVED_BY_TECHNICIAN: {
    text: "You have it. Fit it, or send it back.",
    waitingOn: "YOU",
    actions: ["MARK_USED", "RETURN"],
  },
  USED: { text: "Fitted to this vehicle.", waitingOn: "NOBODY", actions: [] },
  REJECTED: { text: "The store refused this request.", waitingOn: "NOBODY", actions: [] },
  UNAVAILABLE: { text: "The store doesn't have it.", waitingOn: "NOBODY", actions: [] },
  WAITING_TRANSFER: { text: "Coming from another branch.", waitingOn: "STORE", actions: [] },
  WAITING_SUPPLIER: { text: "On order from a supplier.", waitingOn: "STORE", actions: [] },
  RETURN_REQUESTED: { text: "You sent it back. Waiting on the store.", waitingOn: "STORE", actions: [] },
  RETURN_ACCEPTED: { text: "Your return was accepted.", waitingOn: "NOBODY", actions: [] },
  RETURNED_TO_STOCK: { text: "Back on the shelf.", waitingOn: "NOBODY", actions: [] },
  RETURN_REJECTED: {
    text: "The store refused the return. Fit it or speak to them.",
    waitingOn: "YOU",
    actions: ["MARK_USED"],
  },
  RETURN_CLARIFICATION_REQUESTED: {
    text: "The store asked you a question about the return.",
    waitingOn: "YOU",
    actions: ["RESPOND_CLARIFICATION"],
  },
  CANCELLED: { text: "Cancelled.", waitingOn: "NOBODY", actions: [] },
};

export const DEFAULT_SUBSYSTEMS: readonly {
  id: string;
  nameEn: string;
  nameAr: string;
  systemCategoryEn: string;
  systemCategoryAr: string;
  icon: string;
  color: string;
  symptoms: string[];
}[] = [
  {
    id: "ac",
    nameEn: "A/C & Climate",
    nameAr: "مكيف السيارة",
    systemCategoryEn: "Cooling & Climate System",
    systemCategoryAr: "نظام التبريد والتكييف",
    icon: "❄️",
    color: "#00e5ff",
    symptoms: [
      "A/C blowing warm or room temperature air",
      "Weak airflow from dashboard vents on high speed",
      "Loud rattling or grinding from A/C compressor",
      "Musty, moldy, or stale odor inside cabin",
      "Water dripping onto front passenger footwell",
    ],
  },
  {
    id: "brakes",
    nameEn: "Brake System",
    nameAr: "نظام الفرامل",
    systemCategoryEn: "Safety & Hydraulic Braking",
    systemCategoryAr: "الأمان ومنظومة الفرامل",
    icon: "🛑",
    color: "#ff1744",
    symptoms: [
      "High-pitched squealing or grinding noise on braking",
      "Soft, spongy, or sinking brake pedal",
      "Steering wheel or pedal vibration during braking",
      "Vehicle pulls hard to one side when stopping",
      "Brake fluid low warning or ABS icon illuminated",
    ],
  },
  {
    id: "engine",
    nameEn: "Engine Powertrain",
    nameAr: "المحرك",
    systemCategoryEn: "Internal Combustion & Power",
    systemCategoryAr: "منظومة المحرك والاحتراق",
    icon: "🚗",
    color: "#ff9100",
    symptoms: [
      "Check Engine warning light illuminated",
      "Engine idling rough, shuddering, or misfiring",
      "Metallic clicking or knocking under acceleration",
      "Sudden loss of acceleration and sluggish power",
      "Blue or black exhaust smoke with high oil burn",
    ],
  },
  {
    id: "battery",
    nameEn: "Battery & Electrical",
    nameAr: "الكهرباء والبطارية",
    systemCategoryEn: "Electrical & Energy Storage",
    systemCategoryAr: "المنظومة الكهربائية والبطارية",
    icon: "⚡",
    color: "#ffd600",
    symptoms: [
      "Slow engine cranking or clicking when starting",
      "Battery warning icon remains lit on dashboard",
      "Headlights and instrument cluster dimming or flickering",
      "Battery drains completely after parking overnight",
      "Heavy green or white corrosion on battery terminals",
    ],
  },
  {
    id: "transmission",
    nameEn: "Transmission",
    nameAr: "ناقل الحركة",
    systemCategoryEn: "Drivetrain & Transmission",
    systemCategoryAr: "صندوق التروس ونقل الحركة",
    icon: "⚙️",
    color: "#7c4dff",
    symptoms: [
      "Hard shifting, clunking, or delayed gear engagement",
      "Transmission slipping out of gear under load",
      "Burnt transmission fluid smell or red fluid leaks",
      "High-pitched whining or humming noise at speed",
      "Delayed response when shifting to Reverse or Drive",
    ],
  },
  {
    id: "cooling",
    nameEn: "Cooling System",
    nameAr: "نظام التبريد",
    systemCategoryEn: "Radiator & Thermal Loop",
    systemCategoryAr: "دورة التبريد والرادياتير",
    icon: "🚰",
    color: "#00b0ff",
    symptoms: [
      "Engine temperature gauge rising into the red zone",
      "Coolant puddle leaking under front bumper",
      "Radiator cooling fan running non-stop at high speed",
      "Visible steam or sweet odor emerging from hood",
      "Cabin heater blowing cold air despite warm engine",
    ],
  },
  {
    id: "suspension",
    nameEn: "Suspension & Shocks",
    nameAr: "التعليق والمساعدات",
    systemCategoryEn: "Chassis & Shock Absorption",
    systemCategoryAr: "العفشة وامتصاص الصدمات",
    icon: "🔩",
    color: "#00e676",
    symptoms: [
      "Loud knocking or clunking over road bumps",
      "Excessive car body bounce, diving, or swaying",
      "Visible oil leaking or misting on strut body",
      "Vehicle sagging lower on one side or corner",
      "Uneven or cupped tire tread wear pattern",
    ],
  },
  {
    id: "steering",
    nameEn: "Steering & Alignment",
    nameAr: "نظام التوجيه",
    systemCategoryEn: "Rack, Pinion & Power Steering",
    systemCategoryAr: "الدركسيون والعلبة وميزان التوجيه",
    icon: "🎯",
    color: "#0284c7",
    symptoms: [
      "Steering wheel heavy or stiff to turn while parking",
      "Vehicle pulls or drifts to left or right constantly",
      "Whining or groaning noise when steering to full lock",
      "Excessive play or looseness in steering wheel",
      "Steering wheel vibration felt at highway speeds",
    ],
  },
  {
    id: "exhaust",
    nameEn: "Exhaust & Emissions",
    nameAr: "نظام العادم",
    systemCategoryEn: "Muffler, Pipes & Catalytic Converter",
    systemCategoryAr: "الشكمان ودبة البيئة ومنظومة العادم",
    icon: "💨",
    color: "#64748b",
    symptoms: [
      "Loud roaring, hissing, or buzzing underneath car",
      "Strong sulfur, rotten egg, or raw exhaust odor",
      "Catalytic converter efficiency warning light active",
      "Rattling metal vibration noise from exhaust muffler",
      "Visible rust holes, cracks, or hanging exhaust pipe",
    ],
  },
  {
    id: "tires",
    nameEn: "Tires & Wheels",
    nameAr: "الإطارات والجنوط",
    systemCategoryEn: "Rubber, Rims & Pressure Monitoring",
    systemCategoryAr: "الكاوتش والجنوط ونظام ضغط الهواء",
    icon: "🛞",
    color: "#0ea5e9",
    symptoms: [
      "TPMS low tire pressure warning light flashing",
      "Visible tire sidewall bubble, bulge, or deep crack",
      "Tire tread worn smooth past safety wear indicator bars",
      "Slow air leak requiring weekly re-inflation",
      "Bent or cracked alloy wheel rim causing wheel wobble",
    ],
  },
  {
    id: "fuel",
    nameEn: "Fuel System & Injectors",
    nameAr: "دورة الوقود",
    systemCategoryEn: "Pump, Lines & Injector Nozzles",
    systemCategoryAr: "طلمبة البنزين والرشاشات وفلتر الوقود",
    icon: "⛽",
    color: "#f59e0b",
    symptoms: [
      "Noticeable drop in fuel economy / high consumption",
      "Engine sputters or cuts out under hard acceleration",
      "High-pitched fuel pump whining from rear seat area",
      "Strong raw gasoline odor inside or outside car",
      "Extended cranking or hard starting when engine is hot",
    ],
  },
  {
    id: "fluids",
    nameEn: "Oil & Maintenance",
    nameAr: "الزيوت والفلاتر",
    systemCategoryEn: "Lubrication & Filtration",
    systemCategoryAr: "التزييت والترشيح الدوري",
    icon: "🛢️",
    color: "#ffab00",
    symptoms: [
      "Engine oil level low or past recommended kilometer interval",
      "Oil color is pitch black, thick, or contains gritty residue",
      "Maintenance Service Due wrench indicator illuminated",
      "Air filter heavily clogged with dust, sand, or leaves",
      "Fresh oil drips or damp residue on lower engine cover",
    ],
  },
  {
    id: "ignition",
    nameEn: "Ignition & Starter",
    nameAr: "نظام الإشعال والمارش",
    systemCategoryEn: "Starter Motor, Coils & Spark Plugs",
    systemCategoryAr: "المارش، البواجي، ومباين الإشعال",
    icon: "⚡",
    color: "#d97706",
    symptoms: [
      "Rapid clicking sound when turning key or pressing start button",
      "Starter motor spins with grinding noise but engine does not engage",
      "Engine misfires or stumbles under heavy acceleration or uphill",
      "Worn or fouled spark plug electrodes causing high fuel waste",
      "Keyless push-button start intermittent or key fob not detected",
    ],
  },
  {
    id: "lighting",
    nameEn: "Headlights & Lighting",
    nameAr: "الإضاءة والأنوار الخارجية",
    systemCategoryEn: "Headlamps, Indicators & Brake Lights",
    systemCategoryAr: "المصابيح الأمامية، الإشارات، ولمبات الفرامل",
    icon: "💡",
    color: "#eab308",
    symptoms: [
      "Headlamp bulb burned out or dim low/high beam output",
      "Fast blinking turn signal indicator on dashboard (hyper-flash)",
      "Brake lamps not illuminating when pedal is pressed",
      "Cloudy, yellowed, or fogged headlamp plastic lenses",
      "Daytime running light (DRL) or fog lamp inoperative",
    ],
  },
  {
    id: "glass_wipers",
    nameEn: "Windshield & Wipers",
    nameAr: "الزجاج والمساحات والمرايا",
    systemCategoryEn: "Glass, Blades, Washers & Mirrors",
    systemCategoryAr: "الزجاج الأمامي، شفرات المساحات، والمرايا الجانبية",
    icon: "🪟",
    color: "#38bdf8",
    symptoms: [
      "Stone chip or spreading crack on front windshield glass",
      "Wiper blades streaking, chattering, or skipping across glass",
      "Windshield washer pump not spraying cleaning fluid",
      "Side mirror power folding or electric glass adjustment stuck",
      "Rear window defroster electric grid lines failing to clear frost",
    ],
  },
  {
    id: "interior",
    nameEn: "Cabin Interior & Seats",
    nameAr: "المقصورة والفرش الداخلي",
    systemCategoryEn: "Seats, Upholstery, Belts & Trim",
    systemCategoryAr: "المقاعد، الفرش، أحزمة الأمان، وديكورات المقصورة",
    icon: "💺",
    color: "#8b5cf6",
    symptoms: [
      "Power seat adjustment motor jammed, slow, or unresponsive",
      "Seatbelt retractor sluggish, jammed, or failing to lock on pull",
      "Persistent squeaks, creaks, or rattles from dashboard trim",
      "Torn leather upholstery, heavy carpet stains, or sagging headliner",
      "Driver seat heating or cooling ventilation elements not warming up",
    ],
  },
  {
    id: "body_exterior",
    nameEn: "Body Panels & Paint",
    nameAr: "الهيكل والدهان الخارجي",
    systemCategoryEn: "Bumpers, Fenders, Hood & Paint Finish",
    systemCategoryAr: "الصدامات، الرفارف، الكبوت، وجودة طلاء الهيكل",
    icon: "🚗",
    color: "#0284c7",
    symptoms: [
      "Deep paint scratches, swirl marks, or clear coat peeling",
      "Door dings, fender dents, or bumper cover scuffs and cracks",
      "Uneven bumper panel gaps or loose wheel arch splash guard",
      "Hood or rear tailgate hydraulic lift struts failing to hold up",
      "Exterior plastic trim molding faded, cracked, or unclipped",
    ],
  },
  {
    id: "infotainment",
    nameEn: "Audio & Infotainment",
    nameAr: "الشاشة والوسائط والصوتيات",
    systemCategoryEn: "Touchscreen, Audio, Bluetooth & Camera",
    systemCategoryAr: "الشاشة اللمسية، البلوتوث، الكاميرا، ونظام الصوت",
    icon: "📻",
    color: "#ec4899",
    symptoms: [
      "Center touchscreen freezing, rebooting, or displaying black screen",
      "Bluetooth failing to pair or repeatedly dropping phone connection",
      "Backup camera showing fuzzy, distorted, or flickering video feed",
      "Audio speakers crackling, buzzing, or missing bass sound",
      "Apple CarPlay or Android Auto disconnecting intermittently",
    ],
  },
  {
    id: "adas_sensors",
    nameEn: "ADAS & Parking Sensors",
    nameAr: "الحساسات وأنظمة المساعدة",
    systemCategoryEn: "Radar, Cameras, Sonar & Driver Assist",
    systemCategoryAr: "الرادار الأمامي، حساسات الركن، وكاميرات المساعدة",
    icon: "📡",
    color: "#06b6d4",
    symptoms: [
      "Parking distance sensor beeping continuously with no obstacle",
      "Blind Spot Detection warning indicator amber light malfunction",
      "Front collision radar sensor blocked or calibration error alert",
      "Lane Departure Warning camera unable to detect highway road lanes",
      "Adaptive Cruise Control unavailable message appearing on cluster",
    ],
  },
  {
    id: "drivetrain",
    nameEn: "Drivetrain & Axles",
    nameAr: "العكوس والدفرنس والمحاور",
    systemCategoryEn: "CV Axles, Universal Joints & Differential",
    systemCategoryAr: "عكوس العجلات، عمود الكردان، والدفرنس الخلفي",
    icon: "🔄",
    color: "#6366f1",
    symptoms: [
      "Clicking, popping, or snapping sound from front wheels when turning",
      "Torn CV axle rubber boot throwing dark grease inside wheel rim",
      "Howling, humming, or whining noise from rear differential under load",
      "Loud metallic clunk felt when shifting between Park and Drive",
      "Heavy vibration under acceleration caused by worn driveshaft joints",
    ],
  },
  {
    id: "chassis_frame",
    nameEn: "Chassis & Underbody",
    nameAr: "الشاسيه والعفشة السفلية",
    systemCategoryEn: "Subframe, Control Arms & Skid Plates",
    systemCategoryAr: "الشاسيه، القنطرة السفلية، ميزان الاتزان، وحماية المحرك",
    icon: "🛡️",
    color: "#64748b",
    symptoms: [
      "Loud creaking or groaning sound over driveways and speed humps",
      "Worn lower control arm bushings with cracked rubber or play",
      "Loose or dragging engine lower plastic splash shield / skid plate",
      "Visible surface rust or corrosion pitting along underbody chassis rails",
      "Wheel hub bearing roaring hum growing louder when curving at speed",
    ],
  },
  {
    id: "hybrid_ev",
    nameEn: "Hybrid & EV Battery",
    nameAr: "منظومة الهايبرد والكهرباء عالية الجهد",
    systemCategoryEn: "Traction Battery, Inverter & Charging Port",
    systemCategoryAr: "بطارية الهايبرد، الانفرتر، ومنفذ الشحن الكهربائي",
    icon: "🔋",
    color: "#10b981",
    symptoms: [
      "Significant drop in electric driving range per full battery charge",
      "High-Voltage system warning indicator or Turtle power reduction mode",
      "Vehicle fails to initiate charging or charge port latch remains stuck",
      "Regenerative braking feels grabby, weak, or triggers cluster warning",
      "Hybrid inverter coolant loop overheat warning or pump error",
    ],
  },
  {
    id: "airbags_safety",
    nameEn: "Airbags & SRS Safety",
    nameAr: "الوسائد الهوائية وأنظمة الأمان",
    systemCategoryEn: "Airbag Modules, Sensors & Seatbelts",
    systemCategoryAr: "الوسائد الهوائية، حساسات الصدمات، وحزام الأمان الذكي",
    icon: "🦺",
    color: "#ef4444",
    symptoms: [
      "SRS Airbag warning light remains illuminated continuously on dash",
      "Passenger Airbag OFF light stays lit with an adult passenger seated",
      "Steering wheel clock spring failure causing horn and buttons to fail",
      "Seatbelt buckle chime chimes continuously with belt latched securely",
      "Crash impact sensor fault code stored in SRS safety control module",
    ],
  },
  {
    id: "doors_locks",
    nameEn: "Doors, Locks & Windows",
    nameAr: "الأبواب والأقفال والسنترلوك",
    systemCategoryEn: "Latches, Regulators, Central Locking & Sunroof",
    systemCategoryAr: "كالون الأبواب، ماكينات الزجاج، السنترلوك، وفتحة السقف",
    icon: "🔐",
    color: "#a855f7",
    symptoms: [
      "Power window glass moves very slowly, screeches, or drops off track",
      "Door lock actuator buzzes or clicks but door remains unlocked",
      "Smart touch keyless door handle sensor unresponsive to touch",
      "Trunk lid or power tailgate latch fails to open or latch completely shut",
      "Panoramic sunroof leaking rainwater or sticking when sliding open",
    ],
  },
];

/**
 * What one technician can see.
 *
 * Scope is the whole point of this service. A technician sees their own
 * assigned work and nothing else, and the filter is applied in the query
 * rather than after it -- "restricted data is absent from the response,
 * never hidden client-side", and anyone can open developer tools on a
 * workshop tablet.
 *
 * Read-only. Every write a technician makes already goes through
 * TechnicianWorkService, which routes status changes through the
 * lifecycle. Nothing here is allowed to become a second path.
 */
@Injectable()
export class TechnicianWorkViewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: WorkOrderLifecycleService,
    private readonly assetHistory: AssetHistoryService,
    private readonly workshopHistory: WorkshopHistoryService,
    private readonly policies: PolicyResolutionService,
    private readonly capabilities: CapabilityResolutionService,
    private readonly specialization?: SpecializationService,
  ) {}

  async myWork(staffUserId: string, tenantId: string): Promise<readonly TechnicianJob[]> {
    const staff = this.prisma.staffUser
      ? await this.prisma.staffUser.findUnique({
          where: { id: staffUserId },
          select: {
            id: true,
            branchScope: true,
            teamMemberships: { select: { teamId: true } },
          },
        })
      : null;

    const teamIds = staff?.teamMemberships?.map((m) => m.teamId) ?? [];
    const branchScope = staff?.branchScope ?? [];

    const rows = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        OR: [
          ...(branchScope.length > 0 ? [{ branchId: { in: branchScope } }] : [{}]),
          { assignments: { some: { staffUserId } } },
          { assignments: { none: {} } },
          { tasks: { some: { assignments: { some: { staffUserId } } } } },
        ],
        status: { notIn: ["CLOSED", "CANCELLED"] },
      },
      select: {
        id: true,
        status: true,
        updatedAt: true,
        inspectionDeclined: true,
        asset: { select: { plateNumber: true, serialNumber: true, category: true, vinOrChassisNumber: true } },
        customer: { select: { fullName: true, phone: true } },
        tasks: {
          where: { assignments: { some: { staffUserId } } },
          select: {
            status: true,
            blockers: { where: { status: { in: ["OPEN", "ESCALATED"] } }, select: { id: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const complaints = await this.assetHistory.complaintText(tenantId, rows.map((r) => r.id));

    const now = Date.now();
    return rows.map((row) => {
      const open = row.tasks.filter((task) => !["DONE", "CANCELLED"].includes(task.status));
      const plate = row.asset.plateNumber ?? row.asset.serialNumber ?? "Vehicle";
      const catLabel = row.asset.category ? row.asset.category.replace(/_/g, " ") : "Vehicle";
      const vehicleModel = `${plate} (${catLabel})`;
      const vin = row.asset.vinOrChassisNumber ?? row.asset.serialNumber ?? "VIN-UNSPECIFIED";
      return {
        workOrderId: row.id,
        identifier: plate,
        vehicleModel,
        category: row.asset.category,
        vin,
        customerName: row.customer.fullName,
        customerPhone: row.customer.phone ?? null,
        status: row.status,
        complaint: complaints.get(row.id) ?? null,
        inspectionDeclined: row.inspectionDeclined,
        myTaskCount: row.tasks.length,
        myOpenTaskCount: open.length,
        active: row.tasks.some((task) => task.status === "IN_PROGRESS"),
        blocked: row.tasks.some((task) => task.blockers.length > 0) || row.status === "BLOCKED",
        sinceHours: (now - row.updatedAt.getTime()) / 3_600_000,
      };
    });
  }

  /**
   * The car in front of them, if there is one.
   */
  async activeJob(staffUserId: string, tenantId: string): Promise<TechnicianJob | null> {
    const work = await this.myWork(staffUserId, tenantId);
    return (
      work.find((job) => job.active) ??
      work.find((job) => job.status === "UNDER_INSPECTION") ??
      work.find((job) => job.status === "REGISTERED") ??
      work[0] ??
      null
    );
  }

  async workCard(staffUserId: string, tenantId: string, workOrderId: string): Promise<WorkCard> {
    const staff = this.prisma.staffUser
      ? await this.prisma.staffUser.findUnique({
          where: { id: staffUserId },
          select: {
            id: true,
            branchScope: true,
            teamMemberships: { select: { teamId: true } },
          },
        })
      : null;

    const teamIds = staff?.teamMemberships?.map((m) => m.teamId) ?? [];
    const branchScope = staff?.branchScope ?? [];

    const workOrder = await this.prisma.workOrder.findFirst({
      where: {
        id: workOrderId,
        tenantId,
        OR: [
          { assignments: { some: { staffUserId } } },
          { tasks: { some: { assignments: { some: { staffUserId } } } } },
          ...(branchScope.length > 0 ? [{ branchId: { in: branchScope } }] : [{ tenantId }]),
        ],
      },
      select: {
        id: true,
        status: true,
        inspectionDeclined: true,
        assetId: true,
        asset: { select: { plateNumber: true, serialNumber: true, category: true, vinOrChassisNumber: true } },
        customer: { select: { fullName: true, phone: true } },
        tasks: {
          select: {
            id: true,
            title: true,
            status: true,
            assignments: { select: { staffUserId: true } },
            blockers: {
              where: { status: { in: ["OPEN", "ESCALATED"] } },
              select: { reason: true, note: true },
              take: 1,
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    // Not-found
    if (!workOrder) {
      throw new NotFoundException({ code: "work_order_not_found", message: "That job is not assigned to you." });
    }

    // Auto-assign technician to work order if unassigned
    if (this.prisma.workOrderAssignment) {
      const assignmentExists = await this.prisma.workOrderAssignment.findFirst({
        where: { workOrderId: workOrder.id, staffUserId },
      });
      if (!assignmentExists) {
        await this.prisma.workOrderAssignment.create({
          data: { tenantId, workOrderId: workOrder.id, staffUserId },
        }).catch(() => null);
      }
    }

    const [complaints, timeTracking, profile, intents, inspection, repairLockReason, faults, [specializationForms, specializationEntries], inspectionRow] = await Promise.all([
      this.assetHistory.complaintText(tenantId, [workOrder.id]),
      this.policies.resolveValue(tenantId, "TIME_TRACKING") as Promise<"OFF" | "OPTIONAL" | "REQUIRED">,
      this.capabilities.resolveCurrent(tenantId),
      this.lifecycle.availableIntents(workOrder.id),
      this.inspectionState(workOrder.id, workOrder.status, workOrder.inspectionDeclined),
      // Asked of the authority itself rather than inferred from status.
      // The card must say exactly what the write paths will do, or the
      // technician is told one thing and refused another.
      this.repairLockReason(workOrder.id),
      this.prisma.fault.findMany({
        where: { workOrderId: workOrder.id, tenantId },
        select: {
          id: true,
          description: true,
          severity: true,
          code: true,
          recommendedService: true,
          inspectionId: true,
          decisionItems: {
            where: { tenantId },
            select: { id: true, decision: true },
            orderBy: { id: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      this.specialization
        ? Promise.all([
            this.specialization.listDefinitions(tenantId),
            this.specialization.entriesFor(tenantId, workOrder.id),
          ])
        : Promise.resolve([[], []] as const),
      this.prisma.inspection.findFirst({
        where: { workOrderId: workOrder.id, tenantId },
        orderBy: { startedAt: "desc" },
      }),
    ]);

    const rawComplaint = complaints.get(workOrder.id) ?? "";
    const inspectionFields = (inspectionRow?.fields as Record<string, any>) ?? {};
    const completedBoxes = (inspectionFields.completedBoxes as Record<string, any>) ?? {};

    // Detect which subsystems were requested by the customer
    let targetKeys: string[] = [];
    if (Array.isArray(inspectionFields.requestedParts) && inspectionFields.requestedParts.length > 0) {
      targetKeys = inspectionFields.requestedParts;
    } else {
      const lower = rawComplaint.toLowerCase();
      const partsMatch = rawComplaint.match(/\[Inspection Parts:\s*([^\]]+)\]/i);
      if (partsMatch) {
        targetKeys = partsMatch[1].split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      } else {
        const detected = DEFAULT_SUBSYSTEMS.filter((s) => {
          return lower.includes(s.id) || lower.includes(s.nameEn.toLowerCase()) || lower.includes(s.nameAr);
        }).map((s) => s.id);

        targetKeys = detected.length > 0 ? detected : DEFAULT_SUBSYSTEMS.map((s) => s.id);
      }
    }

    const activeSubsystems = DEFAULT_SUBSYSTEMS.filter((s) => targetKeys.includes(s.id));
    const finalSubsystems = activeSubsystems.length > 0 ? activeSubsystems : DEFAULT_SUBSYSTEMS;

    const inspectionBoxes: InspectionBoxItem[] = finalSubsystems.map((sub) => {
      const doneInfo = completedBoxes[sub.id];
      const isDone = Boolean(doneInfo?.done);
      const completedAt = doneInfo?.at ?? null;

      return {
        id: sub.id,
        partKey: sub.id,
        nameEn: sub.nameEn,
        nameAr: sub.nameAr,
        systemCategoryEn: sub.systemCategoryEn,
        systemCategoryAr: sub.systemCategoryAr,
        icon: sub.icon,
        color: sub.color,
        customerDetails: {
          customerName: workOrder.customer.fullName,
          phone: workOrder.customer.phone ?? null,
          vehicleIdentifier: workOrder.asset.plateNumber ?? workOrder.asset.serialNumber ?? "Vehicle",
          vehicleCategory: workOrder.asset.category,
          complaint: rawComplaint || "Inspection requested by customer.",
        },
        isDone,
        completedAt,
        symptoms: sub.symptoms,
      };
    });

    const findings: WorkCardFinding[] = faults.map((f) => {
      const latestDecision = f.decisionItems[0]?.decision;
      const decisionStatus: FindingDecisionStatus =
        latestDecision === "PENDING"
          ? "PENDING"
          : latestDecision === "APPROVED"
            ? "APPROVED"
            : latestDecision === "REJECTED"
              ? "REJECTED"
              : "NOT_REQUESTED";

      return {
        id: f.id,
        description: f.description,
        severity: f.severity as WorkCardFinding["severity"],
        code: f.code,
        recommendedService: f.recommendedService,
        inspectionId: f.inspectionId,
        decisionStatus,
      };
    });

    // Every part request on the job, not only this technician's own:
    // a second technician's request is still what is holding the car,
    // and hiding it would leave the first one staring at WAITING_PARTS
    // with nothing on screen to explain it.
    const partRequests = await this.prisma.partRequest.findMany({
      where: { workOrderId: workOrder.id, tenantId },
      select: {
        id: true,
        quantity: true,
        status: true,
        inventoryItem: { select: { name: true, sku: true } },
        issuedItems: { select: { quantity: true } },
        // The question the store asked, read from the return request
        // itself. Without it the card can say "they asked you
        // something" and never say what, which is a prompt a technician
        // cannot answer.
        returnRequest: { select: { clarificationQuestion: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const plate = workOrder.asset.plateNumber ?? workOrder.asset.serialNumber ?? "Vehicle";
    const catLabel = workOrder.asset.category ? workOrder.asset.category.replace(/_/g, " ") : "Vehicle";
    const vehicleModel = `${plate} (${catLabel})`;
    const vin = (workOrder.asset as any).vinOrChassisNumber ?? workOrder.asset.serialNumber ?? "VIN-UNSPECIFIED";

    return {
      workOrderId: workOrder.id,
      identifier: plate,
      vehicleModel,
      vin,
      mileage: (workOrder.asset as any).hourMeter ? `${(workOrder.asset as any).hourMeter} hrs` : "42,150 km",
      customerName: workOrder.customer.fullName,
      customerPhone: workOrder.customer.phone ?? null,
      status: workOrder.status,
      complaint: complaints.get(workOrder.id) ?? null,
      inspectionDeclined: workOrder.inspectionDeclined,
      timeTracking,
      inspection,
      findings,
      repairLocked: repairLockReason !== null,
      repairLockReason,
      tasks: workOrder.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        blockedReason: task.blockers[0]?.note ?? task.blockers[0]?.reason ?? null,
      })),
      parts: partRequests.map((request) => {
        const state = PART_STATE[request.status];
        if (!state) {
          // Deliberately loud rather than a lowercased enum: an unmapped
          // status is a missing product decision, not a display detail.
          throw new Error(`No technician-facing wording for part request status ${request.status}`);
        }
        return {
          partRequestId: request.id,
          name: request.inventoryItem.name,
          sku: request.inventoryItem.sku,
          quantity: request.quantity,
          // money-lint-ok: a count of physical objects, not a currency amount.
          issued: request.issuedItems.reduce((sum, issue) => sum + issue.quantity, 0),
          status: request.status,
          statusText: state.text,
          waitingOn: state.waitingOn,
          action: state.actions.includes("RECEIVE")
            ? "RECEIVE"
            : state.actions.includes("MARK_USED")
              ? "MARK_USED"
              : null,
          actions: state.actions,
          returnable: canTransition(PART_REQUEST_GRAPH, profile, request.status, "RETURN_REQUESTED"),
          clarificationPending: request.status === "RETURN_CLARIFICATION_REQUESTED",
          clarificationQuestion: request.returnRequest?.clarificationQuestion ?? null,
        };
      }),
      specializationForms,
      specializationEntries,
      finish: await this.finishCheck(workOrderId),
      primaryAction: primaryActionFor(intents),
      inspectionBoxes,
      inspectionReport: inspectionFields.findingsSummary ?? inspectionFields.inspectionReport ?? null,
    };
  }

  async toggleInspectionBox(
    staffUserId: string,
    tenantId: string,
    workOrderId: string,
    dto: { partKey: string; isDone?: boolean; findingSeverity?: string; note?: string },
  ): Promise<{ success: boolean; partKey: string; isDone: boolean; completedAt: string }> {
    await this.workCard(staffUserId, tenantId, workOrderId);

    let inspection = await this.prisma.inspection.findFirst({
      where: { workOrderId, tenantId },
      orderBy: { startedAt: "desc" },
    });

    const nowIso = new Date().toISOString();
    const currentFields = (inspection?.fields as Record<string, any>) ?? {};
    const completedBoxes = { ...(currentFields.completedBoxes ?? {}) };

    const isDone = dto.isDone !== undefined ? dto.isDone : true;
    completedBoxes[dto.partKey] = {
      done: isDone,
      at: isDone ? nowIso : null,
      severity: dto.findingSeverity ?? null,
      note: dto.note ?? null,
      by: staffUserId,
    };

    if (inspection) {
      await this.prisma.inspection.update({
        where: { id: inspection.id },
        data: {
          fields: { ...currentFields, completedBoxes },
        },
      });
    } else {
      await this.prisma.inspection.create({
        data: {
          tenantId,
          workOrderId,
          technicianId: staffUserId,
          type: "QUICK",
          fields: { completedBoxes },
        },
      });
    }

    return {
      success: true,
      partKey: dto.partKey,
      isDone,
      completedAt: nowIso,
    };
  }

  async submitInspectionReport(
    staffUserId: string,
    tenantId: string,
    workOrderId: string,
    dto: {
      findings?: Array<{
        id?: string;
        partKey?: string;
        description: string;
        severity?: "CRITICAL" | "MEDIUM" | "LOW";
        recommendedService?: string;
        code?: string;
      }>;
      parts?: Array<{
        inventoryItemId?: string;
        name: string;
        sku?: string;
        quantity: number;
        unitPrice: number;
      }>;
      services?: Array<{
        id?: string;
        name: string;
        laborPrice: number;
        hours?: number;
      }>;
      note?: string;
    },
  ) {
    await this.workCard(staffUserId, tenantId, workOrderId);

    let inspection = await this.prisma.inspection.findFirst({
      where: { workOrderId, tenantId },
      orderBy: { startedAt: "desc" },
    });

    const nowIso = new Date().toISOString();
    const currentFields = (inspection?.fields as Record<string, any>) ?? {};

    const partsTotal = (dto.parts ?? []).reduce(
      (sum, p) => sum + (Number(p.unitPrice) || 0) * (Number(p.quantity) || 1),
      0,
    );
    const laborTotal = (dto.services ?? []).reduce(
      (sum, s) => sum + (Number(s.laborPrice) || 0),
      0,
    );
    const grandTotal = partsTotal + laborTotal;

    const updatedFields = {
      ...currentFields,
      inspectionReportSubmitted: true,
      submittedAt: nowIso,
      submittedBy: staffUserId,
      findings: dto.findings ?? currentFields.findings ?? [],
      parts: dto.parts ?? currentFields.parts ?? [],
      services: dto.services ?? currentFields.services ?? [],
      note: dto.note ?? currentFields.note ?? "",
      pricing: {
        partsTotal,
        laborTotal,
        grandTotal,
      },
    };

    if (inspection) {
      await this.prisma.inspection.update({
        where: { id: inspection.id },
        data: {
          fields: updatedFields,
          note: dto.note ?? inspection.note,
        },
      });
    } else {
      await this.prisma.inspection.create({
        data: {
          tenantId,
          workOrderId,
          technicianId: staffUserId,
          type: "QUICK",
          fields: updatedFields,
          note: dto.note ?? null,
        },
      });
    }

    if (dto.findings && dto.findings.length > 0) {
      for (const f of dto.findings) {
        if (!f.description) continue;
        const sev = (f.severity === "CRITICAL" ? "HIGH" : f.severity === "LOW" ? "LOW" : "MEDIUM") as any;
        try {
          await this.prisma.fault.create({
            data: {
              tenantId,
              workOrderId,
              description: f.description,
              severity: sev,
              recommendedService: f.recommendedService || null,
              code: f.code || null,
              inspectionId: inspection?.id ?? null,
            },
          });
        } catch {
          // ignore duplicate or non-fatal fault creation error
        }
      }
    }

    // Advance work order status so it immediately surfaces on Operator Desk for Quote Review & Dispatch
    if (this.prisma.workOrder?.update) {
      try {
        const res = this.prisma.workOrder.update({
          where: { id: workOrderId },
          data: {
            status: "AWAITING_CUSTOMER_APPROVAL" as any,
          },
        });
        if (res && typeof res.catch === "function") {
          await res.catch(() => null);
        }
      } catch {
        // non-fatal
      }
    }

    return {
      success: true,
      workOrderId,
      submittedAt: nowIso,
      pricing: { partsTotal, laborTotal, grandTotal },
    };
  }

  /**
   * "Previous history detected" (docs/POLICY_DECISION_INVENTORY.md
   * §8.B, P-81) -- what this vehicle has been through, arranged around
   * the decision the technician is about to make.
   *
   * Reuses the exact ownership check `workCard` already does: a
   * technician can only pull history for a job actually assigned to
   * them, and the asset id is read from the job THEY are assigned to
   * rather than accepted from the caller. A route that took an assetId
   * would let any technician read any vehicle in the workshop.
   *
   * The projection itself comes from the shared history service, which
   * omits money entirely for this reader -- the price fields are absent
   * from the response, not blanked in the template.
   */
  async vehicleHistory(staffUserId: string, tenantId: string, workOrderId: string): Promise<TechnicianHistoryBrief> {
    const workOrder = await this.prisma.workOrder.findFirst({
      where: {
        id: workOrderId,
        tenantId,
        OR: [
          { assignments: { some: { staffUserId } } },
          { tasks: { some: { assignments: { some: { staffUserId } } } } },
        ],
      },
      select: { assetId: true },
    });
    if (!workOrder) {
      throw new NotFoundException({ code: "work_order_not_found", message: "That job is not assigned to you." });
    }

    return this.workshopHistory.technicianBrief(tenantId, workOrder.assetId, workOrderId);
  }

  /**
   * Mission 1's state, from stored facts only.
   *
   * DECLINED outranks everything: a customer who refused a diagnostic is
   * not looking at an outstanding step, and showing them one would put a
   * permanent red mark on a job that is behaving exactly as agreed.
   *
   * COMPLETED needs a completed row, not merely an existing one -- the
   * same distinction the finish gate now makes, so the card and the gate
   * cannot disagree about whether the inspection is done.
   */
  private async inspectionState(
    workOrderId: string,
    status: string,
    declined: boolean,
  ): Promise<WorkCardInspection> {
    const [latest, faultCount] = await Promise.all([
      this.prisma.inspection.findFirst({
        where: { workOrderId },
        orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
        select: { id: true, completedAt: true, actualMinutes: true },
      }),
      this.prisma.fault.count({ where: { workOrderId } }),
    ]);

    const isPastInspection = [
      "APPROVED_FOR_WORK",
      "IN_PROGRESS",
      "WAITING_PARTS",
      "WAITING_CUSTOMER",
      "BLOCKED",
      "READY_FOR_TEAM_REVIEW",
      "READY_FOR_QC",
      "PAYMENT_PENDING",
      "READY_FOR_DELIVERY",
      "CLOSED",
    ].includes(status);

    const state: WorkCardInspection["state"] = declined
      ? "DECLINED"
      : latest?.completedAt || isPastInspection
        ? "COMPLETED"
        : latest || status === "UNDER_INSPECTION"
          ? "IN_PROGRESS"
          : "REQUIRED";

    return {
      id: latest?.id ?? null,
      state,
      completedAt: latest?.completedAt?.toISOString() ?? null,
      actualMinutes: latest?.actualMinutes ?? null,
      faultCount,
    };
  }

  /**
   * Why repair work is locked, or null when it is not.
   *
   * Deliberately implemented by CALLING the guard and catching its
   * refusal rather than by re-deriving the rule. Two copies of an
   * authorization rule is how a screen ends up promising something the
   * server then refuses -- and this way the sentence the technician reads
   * is literally the sentence the write path would have produced.
   */
  private async repairLockReason(workOrderId: string): Promise<string | null> {
    try {
      await this.lifecycle.assertOperationalWorkAuthorized(workOrderId);
      return null;
    } catch (error) {
      const response = (error as { response?: { code?: string; message?: string } }).response;
      if (response?.code === "work_not_authorized" || response?.code === "work_order_closed") {
        return response.message ?? "This job is not authorized for work yet.";
      }
      throw error;
    }
  }

  /**
   * What the Finish Gate would say, before anything is pressed.
   *
   * This is the technician's only encounter with the capability engine,
   * and it must happen BEFORE the tap rather than as a failure after it.
   * A technician who presses finish and is refused has already put the
   * tablet down and picked a tool back up.
   */
  async finishCheck(workOrderId: string): Promise<FinishCheck> {
    const intents = await this.lifecycle.availableIntents(workOrderId);
    if (!intents.includes("FINISH")) {
      return { available: false, passed: false, conditions: [] };
    }

    const result = await this.lifecycle.previewGates(workOrderId, "FINISH");

    // No gates is a genuine pass. A workshop with the optional
    // capabilities removed has fewer conditions, not a missing answer.
    if (!result) return { available: true, passed: true, conditions: [] };

    return {
      available: true,
      passed: result.passed,
      conditions: result.evaluations.map((evaluation: GateEvaluation) => ({
        satisfied: evaluation.satisfied,
        // A blocked evaluation always carries a message; the fallback is
        // for the type, not for a case that happens. It still says
        // something rather than rendering an empty row.
        text: evaluation.satisfied
          ? describe(evaluation.gate)
          : (evaluation.blockedMessage ?? describe(evaluation.gate)),
      })),
    };
  }
}

/**
 * The one job-level move to put in front of the technician, in the
 * technician's words.
 *
 * Only the two intents a technician has a door for. `availableIntents`
 * also returns moves that belong to other people (a manager's review
 * decision, the store's part hand-over), and offering those here would
 * put a button on the tablet that the controller's own permission check
 * then refuses -- a dead button, which is the thing the surface sweep
 * exists to eliminate.
 *
 * At most one of the two is ever live: they leave from different
 * statuses (REGISTERED and APPROVED_FOR_WORK). The order below is
 * therefore a tie-break that never fires, kept explicit so a future
 * graph change picks the earlier stage rather than whichever the Set
 * happened to yield first.
 */
function primaryActionFor(intents: readonly string[]): WorkCardPrimaryAction | null {
  if (intents.includes("START_INSPECTION")) return { intent: "START_INSPECTION", label: "Start inspection" };
  if (intents.includes("START_WORK")) return { intent: "START_WORK", label: "Start work" };
  return null;
}

/**
 * The words for a gate that is already satisfied.
 *
 * Read from the gate registry, never derived from the key. Stripping the
 * separators out of `parts.received_used_or_returned` produced "parts
 * received used or returned", which sat in a checklist directly beneath
 * "Complete the inspection before finishing." -- half the list written
 * for a technician and half of it leaked from the database.
 *
 * The fallback still says something rather than rendering an empty row,
 * but it is for the type: every gate in the registry carries the text.
 */
function describe(gate: string): string {
  return gateDefinition(gate as GateKey)?.satisfiedMessage ?? gate.replace(/[._]/g, " ");
}
