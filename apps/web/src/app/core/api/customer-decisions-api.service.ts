import { Injectable, inject } from "@angular/core";
import type { CreateDecisionRequestDto, CustomerDecisionPublicDto, CustomerDecisionRequestDto, SubmitCustomerDecisionDto } from "@mop/shared";
import { firstValueFrom } from "rxjs";
import { ApiClient } from "./api-client.service";
import { normalizeApiError } from "./api-errors";

@Injectable({ providedIn: "root" })
export class CustomerDecisionsApiService {
  private readonly api = inject(ApiClient);

  list() { return this.request(() => firstValueFrom(this.api.get<CustomerDecisionRequestDto[]>("/customer-decisions")), "Customer decisions failed."); }
  my() { return this.request(() => firstValueFrom(this.api.get<CustomerDecisionRequestDto[]>("/customer-decisions/my")), "Customer portal decisions failed."); }
  create(input: CreateDecisionRequestDto) { return this.request(() => firstValueFrom(this.api.post<CustomerDecisionRequestDto>("/customer-decisions", input)), "Create decision failed."); }
  send(id: string) { return this.request(() => firstValueFrom(this.api.post<CustomerDecisionRequestDto>(`/customer-decisions/${id}/send`, {})), "Send decision failed."); }
  publicDecision(token: string) { return this.request(() => firstValueFrom(this.api.get<CustomerDecisionPublicDto>(`/customer-decisions/public/${token}`)), "Decision link failed."); }
  submitPublic(token: string, input: SubmitCustomerDecisionDto) { return this.request(() => firstValueFrom(this.api.post(`/customer-decisions/public/${token}/submit`, input)), "Submit decision failed."); }

  private async request<T>(run: () => Promise<T>, fallback: string) {
    try {
      return await run();
    } catch (error) {
      throw normalizeApiError(error, fallback);
    }
  }
}
