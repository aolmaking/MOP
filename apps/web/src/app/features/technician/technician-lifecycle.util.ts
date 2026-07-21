import type { TechnicianJobCardDto } from "@mop/shared";

export interface LifecycleStageInfo {
  stage: string;
  index: number;
  nextAction: string;
  blockedBy?: string;
}

export const LIFECYCLE_STAGES = [
  "Intake",
  "Assigned",
  "Inspection",
  "Approval",
  "Parts",
  "In Progress",
  "Review/QC",
  "Invoice/Payment",
  "Delivery"
];

export function getLifecycleStage(job: any): LifecycleStageInfo {
  if (!job) {
    return { stage: "Intake", index: 0, nextAction: "Awaiting creation" };
  }

  const status = (job.status || "").toLowerCase();
  const parts = (job.partsState || "").toLowerCase();
  const decision = (job.customerDecisionState || "").toLowerCase();
  const blocker = (job.blockerState || "").toLowerCase();
  const group = (job.group || "").toLowerCase();

  let index = 0;
  let stage = "Intake";
  let nextAction = "Work order is being prepared.";
  let blockedBy: string | undefined = undefined;

  // 1. Intake
  if (status === "draft") {
    index = 0;
    stage = "Intake";
    nextAction = "Branch manager is finalizing the work order details.";
  }
  // 2. Assigned
  else if (status === "assigned" || group === "due_today") {
    index = 1;
    stage = "Assigned";
    nextAction = "Open Work Card to start the quick check or inspection.";
  }
  // 3. Inspection
  else if (group === "needs_inspection" || (status === "in_progress" && !job.inspectionDone)) {
    index = 2;
    stage = "Inspection";
    nextAction = "Complete the Quick or Full Inspection to save diagnostic findings.";
  }
  // 4. Approval
  else if (decision === "waiting" || status === "awaiting_customer_approval" || group === "waiting_customer") {
    index = 3;
    stage = "Approval";
    nextAction = "Awaiting customer approval on recommended services/parts.";
    blockedBy = "Customer";
  }
  // 5. Parts
  else if (group === "waiting_parts" || parts === "waiting_manager" || parts === "on_the_way" || parts === "arrived") {
    index = 4;
    stage = "Parts";
    if (parts === "waiting_manager") {
      nextAction = "Awaiting warehouse manager to issue requested parts.";
      blockedBy = "Inventory";
    } else if (parts === "on_the_way") {
      nextAction = "Parts are on the way. Confirm arrival when they reach the bay.";
      blockedBy = "Inventory";
    } else if (parts === "arrived") {
      nextAction = "Parts arrived. Open Parts panel to mark them as Used.";
    } else {
      nextAction = "Parts requested. Awaiting warehouse issue.";
      blockedBy = "Inventory";
    }
  }
  // 6. In Progress
  else if (status === "in_progress" || group === "active_now") {
    index = 5;
    stage = "In Progress";
    nextAction = "Execute repair tasks. Mark checklist items complete.";
  }
  // 7. Review/QC
  else if (status === "ready_for_qc" || group === "returned_for_rework") {
    index = 6;
    stage = "Review/QC";
    if (group === "returned_for_rework") {
      nextAction = "Rework needed. Review comments from Team Leader/QC and fix.";
      blockedBy = "QC / Team Leader";
    } else {
      nextAction = "Awaiting Team Leader review or QC validation.";
      blockedBy = "Team Leader";
    }
  }
  // 8. Invoice/Payment
  else if (status === "payment_pending" || status === "ready_for_invoice") {
    index = 7;
    stage = "Invoice/Payment";
    nextAction = "Awaiting final invoice and payment processing.";
    blockedBy = "Customer / Cashier";
  }
  // 9. Delivery
  else if (status === "ready_for_delivery" || status === "completed" || status === "closed" || status === "delivered") {
    index = 8;
    stage = "Delivery";
    nextAction = "Vehicle is ready for delivery to customer.";
  }

  // Blocker override
  if (blocker === "open" || blocker === "critical" || status === "blocked" || group === "blocked") {
    blockedBy = blocker === "critical" ? "Safety Blocker" : "General Blocker";
    nextAction = "Resolve reported blocker in Work Card to resume.";
  }

  return { stage, index, nextAction, blockedBy };
}
