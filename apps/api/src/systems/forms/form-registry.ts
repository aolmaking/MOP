/**
 * Forms & Fields (docs/detailed-specs/tenant-owner.md) -- the 9 forms a
 * workshop may extend with custom fields, and each one's *core* fields
 * (locked, shown for reference, never editable or deletable here). Fixed
 * by the spec, not configurable.
 */
export const FORM_KEYS = [
  "CUSTOMER_INTAKE",
  "ASSET_REGISTRATION",
  "QUICK_INSPECTION",
  "FULL_INSPECTION",
  "PART_REQUEST",
  "RETURN_UNUSED",
  "CUSTOMER_DECISION_REQUEST",
  "WORK_ORDER",
  "INVOICE_NOTES",
] as const;

export type FormKey = (typeof FORM_KEYS)[number];

export interface FormDefinition {
  readonly key: FormKey;
  readonly label: string;
  readonly coreFields: readonly string[];
  /**
   * Where an answer to a custom field on this form is actually stored, or null
   * when the product has nowhere to put one.
   *
   * This is the fact that kept Forms & Fields from ever working. The
   * definitions, the validation, the archive semantics and the owner's page
   * were all built; eight of the nine forms write to models with no JSON
   * column and no other home for a captured value, so a field added to them
   * could be defined, listed, archived and restored, and never filled in by
   * anybody. Naming the capture site here is what lets addField() say so at
   * the moment somebody tries, instead of accepting a field that goes nowhere.
   */
  readonly captureSite: "INSPECTION_FIELDS" | null;
  /** Why there is no capture site, in the words the owner sees. */
  readonly captureNote?: string;
}

const NO_STORAGE =
  "This form has nowhere to keep an extra answer yet, so a field added here could never be filled in.";

export const FORM_REGISTRY: Readonly<Record<FormKey, FormDefinition>> = {
  CUSTOMER_INTAKE: {
    key: "CUSTOMER_INTAKE",
    label: "Customer Intake",
    coreFields: ["Full name", "Phone", "Email"],
    captureSite: null,
    captureNote: NO_STORAGE,
  },
  ASSET_REGISTRATION: {
    key: "ASSET_REGISTRATION",
    label: "Asset Registration",
    coreFields: ["Category", "Plate/Serial number", "Make", "Model", "Year"],
    captureSite: null,
    captureNote: NO_STORAGE,
  },
  // The two that work. `Inspection.fields` is a real JSON bucket the
  // technician's inspection already writes, which is why these two are the
  // forms the chain could be completed for.
  QUICK_INSPECTION: {
    key: "QUICK_INSPECTION",
    label: "Quick Inspection",
    coreFields: ["Odometer/hours", "Note"],
    captureSite: "INSPECTION_FIELDS",
  },
  FULL_INSPECTION: {
    key: "FULL_INSPECTION",
    label: "Full Inspection",
    coreFields: ["Odometer/hours", "Note"],
    captureSite: "INSPECTION_FIELDS",
  },
  PART_REQUEST: {
    key: "PART_REQUEST",
    label: "Part Request",
    coreFields: ["Item", "Quantity", "Urgency"],
    captureSite: null,
    captureNote: NO_STORAGE,
  },
  RETURN_UNUSED: {
    key: "RETURN_UNUSED",
    label: "Return Unused",
    coreFields: ["Item", "Quantity", "Reason"],
    captureSite: null,
    captureNote: NO_STORAGE,
  },
  CUSTOMER_DECISION_REQUEST: {
    key: "CUSTOMER_DECISION_REQUEST",
    label: "Customer Decision Request",
    coreFields: ["Question", "Options", "Critical"],
    captureSite: null,
    captureNote: NO_STORAGE,
  },
  WORK_ORDER: {
    key: "WORK_ORDER",
    label: "Work Order",
    coreFields: ["Branch", "Asset", "Customer", "Status"],
    captureSite: null,
    captureNote: NO_STORAGE,
  },
  INVOICE_NOTES: {
    key: "INVOICE_NOTES",
    label: "Invoice Notes",
    coreFields: ["Line items", "Total"],
    captureSite: null,
    captureNote: NO_STORAGE,
  },
};

export const CUSTOM_FIELD_TYPES = ["TEXT", "NUMBER", "SELECT", "CHECKBOX", "DATE", "TEXTAREA"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export function isFormKey(value: string): value is FormKey {
  return (FORM_KEYS as readonly string[]).includes(value);
}

/** "Battery Voltage" -> "battery_voltage" -- deterministic, so the same name always produces the same key. */
export function slugifyFieldKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
