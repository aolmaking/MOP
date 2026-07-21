import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import type { InvitationInfoDto } from "@mop/shared";
import { firstValueFrom } from "rxjs";
import { ApiClient } from "../../core/api/api-client.service";
import { AuthStore } from "../../core/auth/auth.store";

@Component({
  selector: "mop-invitation",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="flex min-h-screen items-center justify-center bg-[#f3f5f7] p-5">
      <section class="w-full max-w-lg rounded-md border border-black/10 bg-white p-6 shadow-panel sm:p-8">
        <div class="inline-flex h-12 w-12 items-center justify-center rounded-md bg-[#e43d30] text-xl font-black text-white">M</div>
        <div *ngIf="loading()" class="mt-6 text-sm font-bold text-black/45">Validating invitation...</div>
        <ng-container *ngIf="!loading() && info()?.valid">
          <p class="mt-6 text-xs font-bold uppercase text-emerald-700">{{ info()?.accountType }} invitation</p>
          <h1 class="mt-2 text-3xl font-black">Join {{ info()?.workshopName }}</h1>
          <p class="mt-2 text-sm text-black/50">{{ info()?.displayName }}, set a secure password to activate your account.</p>
          <form class="mt-7" (ngSubmit)="accept()">
            <label class="block text-sm font-bold">New password<input class="mop-input mt-2 w-full" type="password" name="password" [(ngModel)]="password" minlength="10" autocomplete="new-password" required></label>
            <label class="mt-4 block text-sm font-bold">Confirm password<input class="mop-input mt-2 w-full" type="password" name="confirm" [(ngModel)]="confirmPassword" minlength="10" autocomplete="new-password" required></label>
            <p class="mt-2 text-xs text-black/45">Use at least 10 characters with upper-case, lower-case, and a number.</p>
            <div *ngIf="auth.error()" class="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{{ auth.error() }}</div>
            <button class="mop-button-primary mt-6 w-full" type="submit" [disabled]="auth.loading() || password !== confirmPassword || password.length < 10">{{ auth.loading() ? 'Activating...' : 'Activate Account' }}</button>
          </form>
        </ng-container>
        <div *ngIf="!loading() && !info()?.valid" class="mt-6">
          <h1 class="text-2xl font-black">Invitation unavailable</h1>
          <p class="mt-2 text-sm text-black/50">This invitation is invalid, expired, or already used.</p>
          <a routerLink="/" class="mop-button-secondary mt-6 block text-center">Back to Login</a>
        </div>
      </section>
    </main>
  `
})
export class InvitationComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiClient);
  readonly auth = inject(AuthStore);
  readonly info = signal<InvitationInfoDto | null>(null);
  readonly loading = signal(true);
  password = "";
  confirmPassword = "";
  private token = "";

  async ngOnInit() {
    this.token = String(this.route.snapshot.paramMap.get("token") || "");
    try {
      this.info.set(await firstValueFrom(this.api.get<InvitationInfoDto>(`/auth/invitations/${encodeURIComponent(this.token)}`)));
    } finally {
      this.loading.set(false);
    }
  }

  accept() {
    if (this.password !== this.confirmPassword) return;
    void this.auth.acceptInvitation(this.token, this.password);
  }
}
