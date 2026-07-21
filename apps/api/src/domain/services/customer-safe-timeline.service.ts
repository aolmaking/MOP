import { Injectable } from "@nestjs/common";

export interface InternalTimelineEventInput {
  title: string;
  message: string;
  source: string;
  visibility?: "CUSTOMER_VISIBLE" | "STAFF_ONLY";
  metadata?: Record<string, unknown>;
}

@Injectable()
export class CustomerSafeTimelineService {
  toCustomerSafe(input: InternalTimelineEventInput) {
    const hiddenSources = ["inventory.internal_note", "branch.manual_note", "stock.adjustment", "asset.old_owner_private_data"];
    if (input.visibility === "STAFF_ONLY" || hiddenSources.includes(input.source)) return null;
    return {
      title: input.title,
      message: this.stripInternalDetails(input.message),
      source: input.source,
      visibility: "CUSTOMER_VISIBLE" as const
    };
  }

  private stripInternalDetails(message: string) {
    return message.replace(/warehouse|supplier|internal|cost/gi, "service").slice(0, 240);
  }
}
