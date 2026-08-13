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
}

export const FORM_REGISTRY: Readonly<Record<FormKey, FormDefinition>> = {
  CUSTOMER_INTAKE: { key: "CUSTOMER_INTAKE", label: "Customer Intake", coreFields: ["Full name", "Phone", "Email"] },
  ASSET_REGISTRATION: {
    key: "ASSET_REGISTRATION",
    label: "Asset Registration",
    coreFields: ["Category", "Plate/Serial number", "Make", "Model", "Year"],
  },
  QUICK_INSPECTION: {
    key: "QUICK_INSPECTION",
    label: "Quick Inspection",
    coreFields: ["Odometer/hours", "Note"],
  },
  FULL_INSPECTION: {
    key: "FULL_INSPECTION",
    label: "Full Inspection",
    coreFields: ["Odometer/hours", "Note"],
  },
  PART_REQUEST: { key: "PART_REQUEST", label: "Part Request", coreFields: ["Item", "Quantity", "Urgency"] },
  RETURN_UNUSED: { key: "RETURN_UNUSED", label: "Return Unused", coreFields: ["Item", "Quantity", "Reason"] },
  CUSTOMER_DECISION_REQUEST: {
    key: "CUSTOMER_DECISION_REQUEST",
    label: "Customer Decision Request",
    coreFields: ["Question", "Options", "Critical"],
  },
  WORK_ORDER: { key: "WORK_ORDER", label: "Work Order", coreFields: ["Branch", "Asset", "Customer", "Status"] },
  INVOICE_NOTES: { key: "INVOICE_NOTES", label: "Invoice Notes", coreFields: ["Line items", "Total"] },
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
