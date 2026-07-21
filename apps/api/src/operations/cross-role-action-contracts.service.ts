import { Injectable } from "@nestjs/common";
import {
  crossRoleActionContracts,
  operationEventAliases,
  type CrossRoleActionContractDto,
  type OperationPermissionCheckDto
} from "@mop/shared";

@Injectable()
export class CrossRoleActionContractsService {
  list() {
    return crossRoleActionContracts;
  }

  forEvent(eventKey: string): CrossRoleActionContractDto | undefined {
    const canonicalEventKey = operationEventAliases[eventKey] || eventKey;
    return crossRoleActionContracts.find((contract) => contract.eventsEmitted.includes(canonicalEventKey));
  }

  permissionCheck(
    eventKey: string,
    actorType: "tenant_staff" | "customer" | "platform" | "system",
    permissions: string[] = []
  ): OperationPermissionCheckDto {
    if (actorType === "customer") return { granted: true, source: "customer" };
    if (actorType === "system") return { granted: true, source: "system" };

    const contract = this.forEvent(eventKey);
    const requiredPermission = contract?.requiredPermission;
    return {
      requiredPermission,
      granted: !requiredPermission || permissions.includes(requiredPermission),
      source: actorType === "platform" ? "platform" : "role"
    };
  }
}
