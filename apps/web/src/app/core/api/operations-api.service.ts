import { Injectable, inject } from "@angular/core";
import type { CrossRoleActionContractDto, WorkflowHealthResultDto } from "@mop/shared";
import { ApiClient } from "./api-client.service";

@Injectable({ providedIn: "root" })
export class OperationsApiService {
  private readonly api = inject(ApiClient);

  health() {
    return this.api.get<WorkflowHealthResultDto>("/operations/health");
  }

  contracts() {
    return this.api.get<CrossRoleActionContractDto[]>("/operations/contracts");
  }
}
