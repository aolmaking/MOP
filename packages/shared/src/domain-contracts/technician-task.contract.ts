import type { CategoryCode } from "../contracts";

export interface TechnicianFinishGateInput {
  workOrderId: string;
  taskId: string;
  technicianId: string;
  teamLeaderReviewEnabled: boolean;
  checks: {
    customerDecisionsPending: boolean;
    partRequestsPending: boolean;
    issuedPartsNotReceived: boolean;
    receivedPartsNotResolved: boolean;
    returnPendingInventoryReview: boolean;
    blockersOpen: boolean;
    inspectionRequiredDone: boolean;
    criticalRejectedItemExists: boolean;
    requiredNotesCompleted: boolean;
    timeTrackingCompleted: boolean;
  };
}

export interface TechnicianFinishGateResult {
  allowed: boolean;
  blockedReasons: string[];
  nextStatus?: "team_review" | "qc";
  auditEvent: "task.finish_blocked" | "task.sent_to_team_review" | "task.sent_to_qc";
}

export interface TechnicianTaskContract {
  taskId: string;
  workOrderId: string;
  branchId?: string;
  assetId: string;
  customerId: string;
  category: CategoryCode;
  status: string;
  severity: "low" | "normal" | "high" | "critical";
}
