import { Injectable, inject } from "@angular/core";
import type { WorkOrderDto } from "@mop/shared";
import { firstValueFrom } from "rxjs";
import { ApiClient } from "./api-client.service";
import { normalizeApiError } from "./api-errors";

@Injectable({ providedIn: "root" })
export class WorkOrdersApiService {
  private readonly api = inject(ApiClient);

  list() {
    return this.request(() => firstValueFrom(this.api.get<WorkOrderDto[]>("/work-orders")), "Work orders failed.");
  }

  private async request<T>(run: () => Promise<T>, fallback: string) {
    try {
      return await run();
    } catch (error) {
      throw normalizeApiError(error, fallback);
    }
  }
}
