import { BadRequestException, Injectable } from "@nestjs/common";
import type { LifecycleMap, LifecycleRole } from "@mop/shared";

@Injectable()
export class LifecycleTransitionService {
  transition<TStatus extends string>(map: LifecycleMap<TStatus>, from: TStatus, action: string, role: LifecycleRole): TStatus {
    const transition = map.transitions.find((item) => item.from === from && item.action === action && item.roles.includes(role));
    if (!transition) {
      throw new BadRequestException(`Transition ${map.name}.${action} is not allowed from ${from} for ${role}.`);
    }
    return transition.to;
  }

  allowedActions<TStatus extends string>(map: LifecycleMap<TStatus>, from: TStatus, role: LifecycleRole) {
    return map.transitions.filter((item) => item.from === from && item.roles.includes(role)).map((item) => item.action);
  }
}
