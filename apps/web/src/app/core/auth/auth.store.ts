import { Injectable, computed, inject, signal } from "@angular/core";
import { Router } from "@angular/router";
import type { CustomerRegisterDto, LoginResponseDto, SessionContextDto } from "@mop/shared";
import { firstValueFrom } from "rxjs";
import { ApiClient } from "../api/api-client.service";
import { normalizeApiError } from "../api/api-errors";

@Injectable({ providedIn: "root" })
export class AuthStore {
  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  private restorePromise?: Promise<void>;

  readonly session = signal<SessionContextDto | null>(null);
  readonly loading = signal(false);
  readonly error = signal("");

  readonly allowedNavigation = computed(() => (this.session()?.navigation || []).filter((item) => item.allowed));

  ready() {
    if (!this.restorePromise) this.restorePromise = this.restore();
    return this.restorePromise;
  }

  async login(loginIdentifier: string, password: string) {
    this.loading.set(true);
    this.error.set("");
    try {
      const response = await firstValueFrom(this.api.post<LoginResponseDto>("/auth/login", { loginIdentifier, password }));
      await this.acceptSession(response);
    } catch (error: any) {
      this.error.set(normalizeApiError(error, "Login failed. Check your identifier and password.").message);
    } finally {
      this.loading.set(false);
    }
  }

  async registerCustomer(input: CustomerRegisterDto) {
    this.loading.set(true);
    this.error.set("");
    try {
      const response = await firstValueFrom(this.api.post<LoginResponseDto>("/auth/register/customer", input));
      await this.acceptSession(response);
    } catch (error: any) {
      this.error.set(normalizeApiError(error, "Customer registration failed.").message);
    } finally {
      this.loading.set(false);
    }
  }

  async acceptInvitation(token: string, password: string) {
    this.loading.set(true);
    this.error.set("");
    try {
      const response = await firstValueFrom(this.api.post<LoginResponseDto>("/auth/invitations/accept", { token, password }));
      await this.acceptSession(response);
    } catch (error: any) {
      this.error.set(normalizeApiError(error, "Invitation could not be accepted.").message);
    } finally {
      this.loading.set(false);
    }
  }

  async restore() {
    const token = localStorage.getItem("mop_access_token");
    if (!token) return;
    try {
      this.session.set(await firstValueFrom(this.api.get<SessionContextDto>("/auth/me")));
    } catch {
      this.logout(false);
    }
  }

  async refreshContext() {
    const token = localStorage.getItem("mop_access_token");
    if (!token) return;
    try {
      this.session.set(await firstValueFrom(this.api.get<SessionContextDto>("/auth/me")));
    } catch {
      this.logout(false);
    }
  }

  canRoute(routeId: string) {
    return Boolean(this.session()?.navigation.find((item) => item.id === routeId && item.allowed));
  }

  hasPermission(permission: string) {
    return Boolean(this.session()?.permissions.includes(permission));
  }

  hasAnyPermission(permissions: string[]) {
    return permissions.some((permission) => this.hasPermission(permission));
  }

  hasAllPermissions(permissions: string[]) {
    return permissions.every((permission) => this.hasPermission(permission));
  }

  logout(redirect = true) {
    const token = localStorage.getItem("mop_access_token");
    if (token) void firstValueFrom(this.api.post("/auth/logout", {})).catch(() => undefined);
    localStorage.removeItem("mop_access_token");
    localStorage.removeItem("mop_refresh_token");
    this.session.set(null);
    if (redirect) void this.router.navigateByUrl("/");
  }

  private async acceptSession(response: LoginResponseDto) {
    localStorage.setItem("mop_access_token", response.accessToken);
    localStorage.setItem("mop_refresh_token", response.refreshToken);
    this.session.set(response.session);
    await this.router.navigateByUrl(`/${response.session.landingPage || "access-denied"}`);
  }
}
