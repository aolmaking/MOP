import { Injectable } from "@nestjs/common";
import {
  operationEventAliases,
  type NotificationRouteDto,
  type OperationNotificationTarget
} from "@mop/shared";

const ROUTES: Record<string, NotificationRouteDto> = {
  "work_order.created": {
    eventKey: "work_order.created",
    targets: ["technician", "branch_manager", "customer", "reports_engine", "work_order_timeline"],
    pageUpdates: ["branch-work-orders", "my-work", "customer", "reports"]
  },
  "customer_decision.requested": {
    eventKey: "customer_decision.requested",
    targets: ["customer", "technician", "branch_manager", "team_leader", "reports_engine", "work_order_timeline"],
    pageUpdates: ["work-card", "branch-decisions", "team-review", "customer", "reports"]
  },
  "customer_decision.responded": {
    eventKey: "customer_decision.responded",
    targets: ["technician", "branch_manager", "team_leader", "customer", "reports_engine", "work_order_timeline"],
    pageUpdates: ["work-card", "branch-decisions", "team-review", "customer", "reports"]
  },
  "part.requested": {
    eventKey: "part.requested",
    targets: ["inventory_manager", "branch_manager", "team_leader", "customer", "reports_engine", "work_order_timeline"],
    pageUpdates: ["inventory-requests", "work-card", "branch-workspace", "team-review", "customer", "analytics-inventory-customer"]
  },
  "part.issued": {
    eventKey: "part.issued",
    targets: ["technician", "branch_manager", "team_leader", "reports_engine", "work_order_timeline"],
    pageUpdates: ["inventory-requests", "work-card", "branch-workspace", "team-review", "analytics-inventory-customer"]
  },
  "part.arrived_confirmed": {
    eventKey: "part.arrived_confirmed",
    targets: ["inventory_manager", "branch_manager", "team_leader", "reports_engine", "work_order_timeline"],
    pageUpdates: ["inventory-requests", "work-card", "branch-workspace", "team-review"]
  },
  "part.used": {
    eventKey: "part.used",
    targets: ["inventory_manager", "branch_manager", "team_leader", "reports_engine", "work_order_timeline"],
    pageUpdates: ["inventory-requests", "work-card", "branch-workspace", "team-review", "analytics-inventory-customer"]
  },
  "part.return_requested": {
    eventKey: "part.return_requested",
    targets: ["inventory_manager", "branch_manager", "team_leader", "reports_engine", "work_order_timeline"],
    pageUpdates: ["inventory-returns", "work-card", "branch-workspace", "team-review"]
  },
  "part.return_accepted": {
    eventKey: "part.return_accepted",
    targets: ["technician", "branch_manager", "team_leader", "reports_engine", "work_order_timeline"],
    pageUpdates: ["inventory-returns", "work-card", "branch-workspace", "analytics-inventory-customer"]
  },
  "task.finish_blocked": {
    eventKey: "task.finish_blocked",
    targets: ["technician", "branch_manager", "team_leader", "reports_engine", "work_order_timeline"],
    pageUpdates: ["work-card", "branch-workspace", "team-review", "analytics-operations"]
  },
  "task.sent_to_team_review": {
    eventKey: "task.sent_to_team_review",
    targets: ["team_leader", "branch_manager", "reports_engine", "work_order_timeline"],
    pageUpdates: ["work-card", "team-review", "branch-workspace", "analytics-people"]
  },
  "task.sent_to_qc": {
    eventKey: "task.sent_to_qc",
    targets: ["qc_queue", "branch_manager", "team_leader", "reports_engine", "work_order_timeline"],
    pageUpdates: ["work-card", "team-review", "branch-workspace", "analytics-operations"]
  },
  "owner.permission_changed": {
    eventKey: "owner.permission_changed",
    targets: ["tenant_owner", "data_analyst", "reports_engine"],
    pageUpdates: ["permissions", "builder-configuration-permissions", "audit", "reports"]
  },
  "builder.published": {
    eventKey: "builder.published",
    targets: ["tenant_owner", "reports_engine"],
    pageUpdates: ["builder-publish-center", "audit"]
  },
  "platform_control.changed": {
    eventKey: "platform_control.changed",
    targets: ["platform_super_admin", "tenant_owner", "reports_engine"],
    pageUpdates: ["platform-control", "platform-live-view", "builder-home", "reports"]
  },
  "workshop.frozen": {
    eventKey: "workshop.frozen",
    targets: ["platform_super_admin", "tenant_owner", "reports_engine"],
    pageUpdates: ["platform-live-view", "platform-reports"]
  },
  "workshop.reactivated": {
    eventKey: "workshop.reactivated",
    targets: ["platform_super_admin", "tenant_owner", "reports_engine"],
    pageUpdates: ["platform-live-view", "platform-reports"]
  }
};

@Injectable()
export class NotificationRoutingService {
  route(
    eventKey: string,
    suppliedTargets: OperationNotificationTarget[] = [],
    suppliedPages: string[] = [],
    payload?: Record<string, unknown>
  ): NotificationRouteDto {
    const canonicalEventKey = operationEventAliases[eventKey] || eventKey;
    const route = ROUTES[canonicalEventKey] || {
      eventKey: canonicalEventKey,
      targets: ["work_order_timeline"] as OperationNotificationTarget[],
      pageUpdates: []
    };
    const blockerRoute = canonicalEventKey === "blocker.reported"
      ? this.blockerTargets(String(payload?.blockerType || payload?.reason || ""))
      : [];

    return {
      eventKey: canonicalEventKey,
      targets: [...new Set([...route.targets, ...blockerRoute, ...suppliedTargets])],
      pageUpdates: [...new Set([...route.pageUpdates, ...suppliedPages])]
    };
  }

  private blockerTargets(value: string): OperationNotificationTarget[] {
    const blocker = value.toLowerCase();
    if (blocker.includes("part")) return ["inventory_manager", "branch_manager", "team_leader"];
    if (blocker.includes("customer")) return ["branch_manager", "customer", "team_leader"];
    if (blocker.includes("safety")) return ["branch_manager", "team_leader"];
    if (blocker.includes("team")) return ["team_leader", "branch_manager"];
    return ["branch_manager", "team_leader"];
  }
}
