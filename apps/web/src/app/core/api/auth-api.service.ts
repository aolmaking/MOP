import { Injectable, inject } from "@angular/core";
import type { CustomerRegisterDto, LoginResponseDto, SessionContextDto } from "@mop/shared";
import { firstValueFrom } from "rxjs";
import { ApiClient } from "./api-client.service";
import { normalizeApiError } from "./api-errors";

@Injectable({ providedIn: "root" })
export class AuthApiService {
  private readonly api = inject(ApiClient);

  async login(loginIdentifier: string, password: string) {
    return this.request(() => firstValueFrom(this.api.post<LoginResponseDto>("/auth/login", { loginIdentifier, password })), "Login failed.");
  }

  async registerCustomer(input: CustomerRegisterDto) {
    return this.request(() => firstValueFrom(this.api.post<LoginResponseDto>("/auth/register/customer", input)), "Customer registration failed.");
  }

  async me() {
    return this.request(() => firstValueFrom(this.api.get<SessionContextDto>("/auth/me")), "Session refresh failed.");
  }

  private async request<T>(run: () => Promise<T>, fallback: string) {
    try {
      return await run();
    } catch (error) {
      throw normalizeApiError(error, fallback);
    }
  }
}
