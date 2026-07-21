import { Injectable } from "@nestjs/common";
import type { TechnicianFinishGateInput, TechnicianFinishGateResult } from "@mop/shared";

@Injectable()
export class TechnicianFinishGateService {
  evaluate(input: TechnicianFinishGateInput): TechnicianFinishGateResult {
    const checks = input.checks;
    const blockedReasons = [
      checks.customerDecisionsPending ? "Customer decision is still pending." : "",
      checks.partRequestsPending ? "Part request is still pending." : "",
      checks.issuedPartsNotReceived ? "Issued part is not confirmed by technician." : "",
      checks.receivedPartsNotResolved ? "Received part must be used or returned." : "",
      checks.returnPendingInventoryReview ? "Return is pending inventory review." : "",
      checks.blockersOpen ? "Open blocker must be resolved." : "",
      !checks.inspectionRequiredDone ? "Required inspection is not complete." : "",
      checks.criticalRejectedItemExists ? "Critical customer rejection requires follow-up." : "",
      !checks.requiredNotesCompleted ? "Required notes are incomplete." : "",
      !checks.timeTrackingCompleted ? "Required time tracking is incomplete." : ""
    ].filter(Boolean);

    if (blockedReasons.length) {
      return { allowed: false, blockedReasons, auditEvent: "task.finish_blocked" };
    }

    return {
      allowed: true,
      blockedReasons: [],
      nextStatus: input.teamLeaderReviewEnabled ? "team_review" : "qc",
      auditEvent: input.teamLeaderReviewEnabled ? "task.sent_to_team_review" : "task.sent_to_qc"
    };
  }
}
