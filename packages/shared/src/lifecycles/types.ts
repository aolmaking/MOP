export type LifecycleRole = "customer" | "technician" | "inventory_manager" | "branch_manager" | "team_leader" | "tenant_admin";

export type LifecycleTone = "neutral" | "blue" | "green" | "gold" | "red" | "gray";

export interface LifecycleStatusDefinition<TStatus extends string = string> {
  status: TStatus;
  internalLabel: string;
  roleLabels: Partial<Record<LifecycleRole, string>>;
  customerSafeLabel?: string;
  technicianSafeLabel?: string;
  inventoryManagerLabel?: string;
  branchManagerLabel?: string;
  tone: LifecycleTone;
  icon: string;
  terminal?: boolean;
}

export interface LifecycleTransition<TStatus extends string = string> {
  from: TStatus;
  to: TStatus;
  action: string;
  roles: LifecycleRole[];
  blockedWhen?: string[];
  auditEvent: string;
}

export interface LifecycleMap<TStatus extends string = string> {
  name: string;
  statuses: Record<TStatus, LifecycleStatusDefinition<TStatus>>;
  transitions: LifecycleTransition<TStatus>[];
}

export function lifecycleStatus<TStatus extends string>(map: LifecycleMap<TStatus>, status: TStatus) {
  return map.statuses[status];
}

export function lifecycleTransitionsFrom<TStatus extends string>(map: LifecycleMap<TStatus>, status: TStatus) {
  return map.transitions.filter((transition) => transition.from === status);
}
