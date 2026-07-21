import { Injectable } from "@nestjs/common";
import { returnLifecycle, type LifecycleRole, type ReturnLifecycleStatus } from "@mop/shared";
import { LifecycleTransitionService } from "./lifecycle-transition.service";

@Injectable()
export class ReturnLifecycleService {
  constructor(private readonly transitions: LifecycleTransitionService) {}

  transition(from: ReturnLifecycleStatus, action: string, role: LifecycleRole) {
    const to = this.transitions.transition(returnLifecycle, from, action, role);
    const definition = returnLifecycle.statuses[to];
    return { to, definition, auditEvent: returnLifecycle.transitions.find((item) => item.from === from && item.to === to && item.action === action)?.auditEvent };
  }
}
