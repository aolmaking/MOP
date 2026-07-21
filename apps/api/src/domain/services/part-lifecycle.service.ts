import { Injectable } from "@nestjs/common";
import { partRequestLifecycle, type LifecycleRole, type PartRequestLifecycleStatus } from "@mop/shared";
import { LifecycleTransitionService } from "./lifecycle-transition.service";

@Injectable()
export class PartLifecycleService {
  constructor(private readonly transitions: LifecycleTransitionService) {}

  transition(from: PartRequestLifecycleStatus, action: string, role: LifecycleRole) {
    const to = this.transitions.transition(partRequestLifecycle, from, action, role);
    const definition = partRequestLifecycle.statuses[to];
    return { to, definition, auditEvent: partRequestLifecycle.transitions.find((item) => item.from === from && item.to === to && item.action === action)?.auditEvent };
  }

  allowedActions(from: PartRequestLifecycleStatus, role: LifecycleRole) {
    return this.transitions.allowedActions(partRequestLifecycle, from, role);
  }
}
