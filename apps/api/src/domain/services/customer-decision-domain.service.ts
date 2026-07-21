import { Injectable } from "@nestjs/common";

@Injectable()
export class CustomerDecisionDomainService {
  criticalRejected(items: Array<{ criticalWarningRequired: boolean; decisionStatus: string }>) {
    return items.some((item) => item.criticalWarningRequired && item.decisionStatus.toLowerCase() === "rejected");
  }

  pendingItems(items: Array<{ decisionStatus: string }>) {
    return items.filter((item) => item.decisionStatus.toLowerCase() === "pending").length;
  }

  canSendReminder(status: string, expiresAt: Date) {
    return ["sent", "viewed"].includes(status.toLowerCase()) && expiresAt > new Date();
  }
}
