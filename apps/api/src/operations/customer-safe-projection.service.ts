import { Injectable } from "@nestjs/common";

/**
 * Canned, safe message per event key -- used whenever no caller-supplied
 * text is given, or the supplied text fails the blocklist check below.
 * Matches the canonical spec's own worked example almost verbatim:
 * "Inventory Manager created supplier order for unavailable brake pads"
 * projects to the part.requested default here.
 */
const SAFE_DEFAULTS: Record<string, string> = {
  "work_order.created": "Your service request has been received.",
  "technician.assigned": "A technician has been assigned to your vehicle.",
  "inspection.saved": "Your vehicle is being inspected.",
  "fault.created": "We found something that needs your attention. Check your pending decisions.",
  "customer_decision.requested": "We've sent you a decision to review.",
  "customer_decision.responded": "Thanks -- we've received your decision.",
  "part.requested": "We are waiting for a required part. The branch will update you when it is available.",
  "part.issued": "The required part is on its way to your vehicle.",
  "part.arrived_confirmed": "The required part has arrived and work is continuing.",
  "part.used": "Work on your vehicle is progressing.",
  "blocker.reported": "We've run into something that needs a closer look before continuing.",
  "task.finish_blocked": "We're finishing a few remaining steps before your vehicle is ready.",
  "task.sent_to_review": "Your vehicle is undergoing a final quality check.",
  "invoice.issued": "Your final invoice is ready.",
  "payment.recorded": "We've recorded your payment.",
};

const DEFAULT_FALLBACK = "Your service is being updated. We'll notify you of any changes.";

/**
 * Caller-supplied text is blocked (falls back to the safe default above)
 * if it mentions anything internal-operational -- defense in depth beyond
 * "only call this with text you already know is safe."
 */
const BLOCKLIST_PATTERNS: RegExp[] = [
  /supplier/i,
  /stock quantity/i,
  /internal note/i,
  /technician\s+(score|performance|rating)/i,
  /\bmargin\b/i,
  /cost price/i,
  /platform control/i,
];

@Injectable()
export class CustomerSafeProjectionService {
  /**
   * Produces the text that's safe to show a customer for a given event.
   * Prefers the caller-supplied text (e.g. a technician's customer-visible
   * note) if it passes the blocklist; otherwise falls back to the canned
   * per-event message, and finally to a generic fallback for an event key
   * with no canned message at all.
   */
  project(eventKey: string, suppliedText?: string | null): string {
    if (suppliedText && !this.containsBlockedContent(suppliedText)) {
      return suppliedText;
    }
    return SAFE_DEFAULTS[eventKey] ?? DEFAULT_FALLBACK;
  }

  private containsBlockedContent(text: string): boolean {
    return BLOCKLIST_PATTERNS.some((pattern) => pattern.test(text));
  }
}
