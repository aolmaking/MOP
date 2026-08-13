/**
 * Messages & Templates (docs/detailed-specs/tenant-owner.md) -- the 8
 * message types the product sends, and the variables each one's body
 * must reference before it can be published. Not configurable per
 * tenant: the spec fixes this list, workshops only edit the wording.
 */
export const MESSAGE_TEMPLATE_KEYS = [
  "WHATSAPP_DECISION",
  "APPROVAL_REQUEST",
  "WAITING_PARTS",
  "READY_FOR_DELIVERY",
  "PAYMENT_PENDING",
  "CRITICAL_WARNING",
  "INVOICE_MESSAGE",
  "REMINDER",
] as const;

export type MessageTemplateKey = (typeof MESSAGE_TEMPLATE_KEYS)[number];

export interface MessageTemplateDefinition {
  readonly key: MessageTemplateKey;
  readonly label: string;
  readonly requiredVariables: readonly string[];
  /** All variables the insertion toolbar offers, a superset of required. */
  readonly availableVariables: readonly string[];
}

const CORE = ["customer_name", "work_order_id", "branch_name"] as const;

export const MESSAGE_TEMPLATE_REGISTRY: Readonly<Record<MessageTemplateKey, MessageTemplateDefinition>> = {
  WHATSAPP_DECISION: {
    key: "WHATSAPP_DECISION",
    label: "WhatsApp decision message",
    requiredVariables: [...CORE, "decision_link"],
    availableVariables: [...CORE, "decision_link"],
  },
  APPROVAL_REQUEST: {
    key: "APPROVAL_REQUEST",
    label: "Approval request message",
    requiredVariables: [...CORE],
    availableVariables: [...CORE, "decision_link"],
  },
  WAITING_PARTS: {
    key: "WAITING_PARTS",
    label: "Waiting parts message",
    requiredVariables: [...CORE],
    availableVariables: [...CORE],
  },
  READY_FOR_DELIVERY: {
    key: "READY_FOR_DELIVERY",
    label: "Ready for delivery message",
    requiredVariables: [...CORE],
    availableVariables: [...CORE, "total_amount"],
  },
  PAYMENT_PENDING: {
    key: "PAYMENT_PENDING",
    label: "Payment pending message",
    requiredVariables: [...CORE, "total_amount"],
    availableVariables: [...CORE, "total_amount"],
  },
  CRITICAL_WARNING: {
    key: "CRITICAL_WARNING",
    label: "Critical warning text",
    requiredVariables: [...CORE],
    availableVariables: [...CORE],
  },
  INVOICE_MESSAGE: {
    key: "INVOICE_MESSAGE",
    label: "Invoice message",
    requiredVariables: [...CORE, "total_amount"],
    availableVariables: [...CORE, "total_amount"],
  },
  REMINDER: {
    key: "REMINDER",
    label: "Reminder message",
    requiredVariables: [...CORE],
    availableVariables: [...CORE],
  },
};

export function isMessageTemplateKey(value: string): value is MessageTemplateKey {
  return (MESSAGE_TEMPLATE_KEYS as readonly string[]).includes(value);
}

/** `{{variable_name}}` tokens actually referenced in a draft body. */
export function variablesReferencedIn(body: string): Set<string> {
  const found = new Set<string>();
  const pattern = /\{\{\s*([a-z_]+)\s*\}\}/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    found.add(match[1]!.toLowerCase());
  }
  return found;
}

/** Names the first missing required variable, or null if the draft has them all. */
export function firstMissingRequiredVariable(key: MessageTemplateKey, body: string): string | null {
  const referenced = variablesReferencedIn(body);
  for (const required of MESSAGE_TEMPLATE_REGISTRY[key].requiredVariables) {
    if (!referenced.has(required)) return required;
  }
  return null;
}

/**
 * Substitutes `{{variable_name}}` tokens with the supplied sample/real
 * data. Throws if the body references a variable that isn't in `data` --
 * a template can never render into text that silently drops a variable
 * it claims to use.
 */
export function renderTemplate(body: string, data: Readonly<Record<string, string>>): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, name: string) => {
    const key = name.toLowerCase();
    if (!(key in data)) {
      throw new Error(`Missing value for template variable "${key}"`);
    }
    return data[key]!;
  });
}
