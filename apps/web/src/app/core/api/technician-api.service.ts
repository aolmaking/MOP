import { Injectable, inject } from "@angular/core";
import type { DiagnosticCodeSuggestionDto, TechnicianHomeDto, TechnicianMyWorkDto, TechnicianWorkCardDto } from "@mop/shared";
import { firstValueFrom } from "rxjs";
import { ApiClient } from "./api-client.service";
import { normalizeApiError } from "./api-errors";

@Injectable({ providedIn: "root" })
export class TechnicianApiService {
  private readonly api = inject(ApiClient);

  home() { return this.request(() => firstValueFrom(this.api.get<TechnicianHomeDto>("/technician/home")), "Technician home failed."); }
  myWork() { return this.request(() => firstValueFrom(this.api.get<TechnicianMyWorkDto>("/technician/my-work")), "Technician work list failed."); }
  workCard(taskId?: string) {
    const query = taskId ? `?taskId=${encodeURIComponent(taskId)}` : "";
    return this.request(() => firstValueFrom(this.api.get<TechnicianWorkCardDto>(`/technician/work-card${query}`)), "Work card failed.");
  }
  recordAction(body: Record<string, unknown>) { return this.request(() => firstValueFrom(this.api.post("/technician/action", body)), "Technician action failed."); }
  diagnosticCode(code: string) {
    return this.request(() => firstValueFrom(this.api.get<DiagnosticCodeSuggestionDto>(`/technician/diagnostic-code?code=${encodeURIComponent(code)}`)), "Diagnostic lookup failed.");
  }

  private async request<T>(run: () => Promise<T>, fallback: string) {
    try {
      return await run();
    } catch (error) {
      throw normalizeApiError(error, fallback);
    }
  }
}
