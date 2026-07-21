import { Injectable, inject } from "@angular/core";
import type { CustomerDecisionRequestDto, WorkOrderDto } from "@mop/shared";
import { firstValueFrom } from "rxjs";
import { ApiClient } from "./api-client.service";
import { normalizeApiError } from "./api-errors";

@Injectable({ providedIn: "root" })
export class CustomerPortalApiService {
  private readonly api = inject(ApiClient);

  workOrders() {
    return this.request(() => firstValueFrom(this.api.get<WorkOrderDto[]>("/work-orders")), "Customer work orders failed.");
  }

  decisions() {
    return this.request(() => firstValueFrom(this.api.get<CustomerDecisionRequestDto[]>("/customer-decisions/my")), "Customer decisions failed.");
  }

  private async request<T>(run: () => Promise<T>, fallback: string) {
    try {
      return await run();
    } catch (error) {
      throw normalizeApiError(error, fallback);
    }
  }
}
