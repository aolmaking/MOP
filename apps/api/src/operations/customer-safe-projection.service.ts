import { Injectable } from "@nestjs/common";
import {
  operationEventAliases,
  type OperationCustomerSafeOutputDto
} from "@mop/shared";

const SAFE_DEFAULTS: Record<string, { title: string; message: string }> = {
  "work_order.created": {
    title: "Service request registered",
    message: "Your service request has been registered and the branch will keep you updated."
  },
  "customer_decision.requested": {
    title: "Your decision is required",
    message: "The workshop has sent items for your review. Open the secure decision link to respond."
  },
  "customer_decision.responded": {
    title: "Decision received",
    message: "Your response was received and the workshop will continue with the approved scope."
  },
  "part.requested": {
    title: "Waiting for a required part",
    message: "We are waiting for a required part. The branch will update you when work can continue."
  },
  "inventory.request.unavailable": {
    title: "Part availability update",
    message: "A required part is not currently available. The branch will contact you with the next update."
  },
  "inventory.request.transfer": {
    title: "Part transfer in progress",
    message: "A required part is being transferred. The branch will update you when it is ready."
  },
  "inventory.request.supplier": {
    title: "Waiting for a required part",
    message: "We are waiting for a required part. The branch will update you when it is available."
  },
  "task.sent_to_qc": {
    title: "Service review in progress",
    message: "The completed work is being reviewed before the next step."
  },
  "delivery.ready": {
    title: "Ready for delivery",
    message: "Your service is complete and the branch will confirm the delivery details."
  }
};

@Injectable()
export class CustomerSafeProjectionService {
  project(
    eventKey: string,
    supplied?: OperationCustomerSafeOutputDto,
    context?: {
      customerId?: string;
      assetId?: string;
      workOrderId?: string;
      payload?: Record<string, unknown>;
    }
  ): OperationCustomerSafeOutputDto | undefined {
    const canonicalEventKey = operationEventAliases[eventKey] || eventKey;
    const fallback = SAFE_DEFAULTS[canonicalEventKey] || SAFE_DEFAULTS[eventKey];
    if (!supplied && !fallback) return undefined;

    const candidate = supplied || {
      ...fallback,
      source: canonicalEventKey
    };

    return {
      title: this.safeText(candidate.title, fallback?.title || "Service update"),
      message: this.safeText(candidate.message, fallback?.message || "The branch has updated your service status."),
      source: canonicalEventKey,
      customerId: candidate.customerId || context?.customerId,
      assetId: candidate.assetId || context?.assetId,
      workOrderId: candidate.workOrderId || context?.workOrderId
    };
  }

  private safeText(value: string, fallback: string) {
    const text = String(value || "").trim();
    if (!text) return fallback;
    const normalized = text
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 280)
      .trim();
    if (!/^[A-Za-z0-9\s.,:;!?'"()/%+-]+$/.test(normalized)) return fallback;
    const unsafe = [
      /\bsupplier\b/i,
      /\bstock\s*(qty|quantity|count|number)?\b/i,
      /\binternal\s+note\b/i,
      /\btechnician\s+(score|performance|rating)\b/i,
      /\bmargin\b/i,
      /\bcost\s+price\b/i,
      /\bplatform\s+control\b/i
    ];
    return unsafe.some((pattern) => pattern.test(normalized)) ? fallback : normalized;
  }
}
