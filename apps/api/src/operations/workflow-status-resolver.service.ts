import { Injectable } from "@nestjs/common";
import {
  operationEventAliases,
  type OperationStatusChangeDto,
  type WorkflowStatusResolutionDto
} from "@mop/shared";

interface WorkflowResolutionContext {
  workOrderId?: string;
  taskId?: string;
  targetType: string;
  targetId?: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class WorkflowStatusResolverService {
  resolve(
    eventKey: string,
    context: WorkflowResolutionContext,
    suppliedChanges: OperationStatusChangeDto[] = []
  ): WorkflowStatusResolutionDto {
    const canonicalEventKey = operationEventAliases[eventKey] || eventKey;
    const inferred = this.infer(canonicalEventKey, context);
    const blockedReasons = this.blockedReasons(canonicalEventKey, context.payload);

    return {
      eventKey: canonicalEventKey,
      statusChanges: this.unique([...suppliedChanges, ...inferred]),
      blocked: blockedReasons.length > 0,
      blockedReasons
    };
  }

  private infer(eventKey: string, context: WorkflowResolutionContext): OperationStatusChangeDto[] {
    const changes: OperationStatusChangeDto[] = [];
    const addTask = (toStatus: string, label: string) => {
      if (context.taskId) changes.push({ entityType: "task", entityId: context.taskId, toStatus, label });
    };
    const addWorkOrder = (toStatus: string, label: string) => {
      if (context.workOrderId) changes.push({ entityType: "work_order", entityId: context.workOrderId, toStatus, label });
    };
    const addTarget = (entityType: OperationStatusChangeDto["entityType"], toStatus: string, label: string) => {
      if (context.targetId) changes.push({ entityType, entityId: context.targetId, toStatus, label });
    };

    switch (eventKey) {
      case "work_order.created":
        addWorkOrder("REGISTERED", "Registered");
        break;
      case "technician.assigned":
        addTask("NOT_STARTED", "Not Started");
        break;
      case "task.started":
        addTask("IN_PROGRESS", "In Progress");
        addWorkOrder("IN_PROGRESS", "In Progress");
        break;
      case "customer_decision.requested":
        addTask("WAITING_CUSTOMER", "Waiting Customer");
        addWorkOrder("AWAITING_CUSTOMER_APPROVAL", "Awaiting Customer Approval");
        break;
      case "customer_decision.responded":
        addTarget("customer_decision", "RESPONDED", "Responded");
        addTask("IN_PROGRESS", "In Progress");
        addWorkOrder("IN_PROGRESS", "In Progress");
        break;
      case "part.requested":
        addTarget("part_request", "PENDING_INVENTORY_REVIEW", "Pending Inventory Review");
        addTask("WAITING_PARTS", "Waiting Parts");
        addWorkOrder("WAITING_FOR_PARTS", "Waiting Parts");
        break;
      case "part.issued":
        addTarget("part_request", "ISSUED", "Issued");
        break;
      case "part.arrived_confirmed":
        addTarget("issued_item", "RECEIVED_BY_TECHNICIAN", "Received by Technician");
        break;
      case "part.used":
        addTarget("issued_item", "USED", "Used");
        addTask("IN_PROGRESS", "In Progress");
        addWorkOrder("IN_PROGRESS", "In Progress");
        break;
      case "part.return_requested":
        addTarget("return_request", "PENDING_INVENTORY_REVIEW", "Return Pending");
        break;
      case "part.return_accepted":
        addTarget("return_request", "ACCEPTED_TO_STOCK", "Returned to Stock");
        break;
      case "blocker.reported":
        addTask("BLOCKED", "Blocked");
        addWorkOrder("BLOCKED", "Blocked");
        break;
      case "task.finish_blocked":
        addTask("BLOCKED", "Finish Blocked");
        break;
      case "task.sent_to_team_review":
        addTask("READY_FOR_TEAM_REVIEW", "Ready for Team Review");
        addWorkOrder("READY_FOR_TEAM_REVIEW", "Ready for Team Review");
        break;
      case "task.sent_to_qc":
        addTask("READY_FOR_QC", "Ready for QC");
        addWorkOrder("READY_FOR_QC", "Ready for QC");
        break;
    }

    return changes;
  }

  private blockedReasons(eventKey: string, payload?: Record<string, unknown>) {
    if (eventKey !== "task.finish_attempted" && eventKey !== "task.finish_blocked") return [];
    const reasons = payload?.finishGateBlockedReasons;
    return Array.isArray(reasons) ? reasons.map(String).filter(Boolean) : [];
  }

  private unique(changes: OperationStatusChangeDto[]) {
    const result = new Map<string, OperationStatusChangeDto>();
    for (const change of changes) {
      if (!change.entityId || !change.entityType) continue;
      result.set(`${change.entityType}:${change.entityId}:${change.toStatus || ""}`, change);
    }
    return [...result.values()];
  }
}
