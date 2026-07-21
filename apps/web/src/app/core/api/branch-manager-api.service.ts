import { Injectable, inject } from "@angular/core";
import type {
  BranchDeliveryStatusDto,
  BranchDecisionQueueDto,
  BranchIntakeCreateDto,
  BranchIntakeOptionsDto,
  BranchIntakeResultDto,
  BranchManagerHomeDto,
  BranchWorkspaceDto,
  BranchWorkOrdersBoardDto
} from "@mop/shared";
import { firstValueFrom } from "rxjs";
import { ApiClient } from "./api-client.service";
import { normalizeApiError } from "./api-errors";

@Injectable({ providedIn: "root" })
export class BranchManagerApiService {
  private readonly api = inject(ApiClient);

  home() { return this.request(() => firstValueFrom(this.api.get<BranchManagerHomeDto>("/branch-manager/home")), "Branch home failed."); }
  intakeOptions() { return this.request(() => firstValueFrom(this.api.get<BranchIntakeOptionsDto>("/branch-manager/intake-options")), "Intake options failed."); }
  createIntake(input: BranchIntakeCreateDto) { return this.request(() => firstValueFrom(this.api.post<BranchIntakeResultDto>("/branch-manager/intake", input)), "Intake failed."); }
  workOrders() { return this.request(() => firstValueFrom(this.api.get<BranchWorkOrdersBoardDto>("/branch-manager/work-orders")), "Branch work orders failed."); }
  workspace(id: string) { return this.request(() => firstValueFrom(this.api.get<BranchWorkspaceDto>(`/branch-manager/work-orders/${id}`)), "Branch workspace failed."); }
  workOrderAction(id: string, body: Record<string, unknown>) { return this.request(() => firstValueFrom(this.api.post(`/branch-manager/work-orders/${id}/action`, body)), "Workspace action failed."); }
  decisions() { return this.request(() => firstValueFrom(this.api.get<BranchDecisionQueueDto>("/branch-manager/decisions")), "Branch decisions failed."); }
  decisionAction(id: string, body: Record<string, unknown>) { return this.request(() => firstValueFrom(this.api.post(`/branch-manager/decisions/${id}/action`, body)), "Decision action failed."); }
  delivery() { return this.request(() => firstValueFrom(this.api.get<BranchDeliveryStatusDto>("/branch-manager/delivery")), "Delivery status failed."); }
  deliveryAction(id: string, body: Record<string, unknown>) { return this.request(() => firstValueFrom(this.api.post(`/branch-manager/delivery/${id}/action`, body)), "Delivery action failed."); }

  private async request<T>(run: () => Promise<T>, fallback: string) {
    try {
      return await run();
    } catch (error) {
      throw normalizeApiError(error, fallback);
    }
  }
}
