import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { AuthStore } from "../../core/auth/auth.store";

@Component({
  selector: "mop-identity-gateway",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="grid min-h-screen bg-[#f3f5f7] lg:grid-cols-[minmax(360px,0.8fr)_minmax(520px,1.2fr)]">
      <section class="relative flex min-h-72 flex-col justify-between overflow-hidden bg-[#111820] p-7 text-white sm:p-10 lg:min-h-screen lg:p-14">
        <div class="relative z-10">
          <div class="inline-flex h-12 w-12 items-center justify-center rounded-md bg-[#e43d30] text-xl font-black">M</div>
          <p class="mt-5 text-sm font-bold uppercase text-white/50">MOP Product Platform</p>
          <h1 class="mt-4 max-w-xl text-4xl font-black leading-tight sm:text-5xl">Workshop operations, under one trusted identity.</h1>
        </div>
        <div class="relative z-10 mt-12 border-l-2 border-[#e43d30] pl-5">
          <p class="max-w-lg text-base leading-7 text-white/65">Sign in to your workshop workspace or create customer portal access using a workshop registration code.</p>
        </div>
        <div class="absolute -bottom-24 -right-16 h-72 w-72 rotate-12 border-[44px] border-white/[0.04]"></div>
      </section>

      <section class="flex items-center justify-center px-5 py-10 sm:px-10 lg:px-16">
        <div class="w-full max-w-xl">
          <div class="flex border-b border-black/10">
            <button type="button" class="min-h-12 flex-1 border-b-2 px-4 text-sm font-black transition" [class.border-[#e43d30]]="mode() === 'login'" [class.text-[#e43d30]]="mode() === 'login'" [class.border-transparent]="mode() !== 'login'" (click)="setMode('login')">Login</button>
            <button type="button" class="min-h-12 flex-1 border-b-2 px-4 text-sm font-black transition" [class.border-[#e43d30]]="mode() === 'register'" [class.text-[#e43d30]]="mode() === 'register'" [class.border-transparent]="mode() !== 'register'" (click)="setMode('register')">Register as Customer</button>
          </div>

          <form *ngIf="mode() === 'login'" class="mt-8" (ngSubmit)="login()">
            <h2 class="text-3xl font-black">Welcome back</h2>
            <p class="mt-2 text-sm text-black/50">Use the email or phone attached to your MOP account.</p>
            <label class="mt-7 block text-sm font-bold">Email or phone
              <input class="mop-input mt-2 w-full" name="identifier" [(ngModel)]="loginForm.identifier" autocomplete="username" required>
            </label>
            <label class="mt-5 block text-sm font-bold">Password
              <input class="mop-input mt-2 w-full" type="password" name="password" [(ngModel)]="loginForm.password" autocomplete="current-password" required>
            </label>
            <div *ngIf="auth.error()" class="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{{ auth.error() }}</div>
            <button class="mop-button-primary mt-6 w-full" type="submit" [disabled]="auth.loading() || !loginForm.identifier || !loginForm.password">
              {{ auth.loading() ? 'Signing in...' : 'Login' }}
            </button>
          </form>

          <form *ngIf="mode() === 'register'" class="mt-8" (ngSubmit)="register()">
            <h2 class="text-3xl font-black">Customer portal access</h2>
            <p class="mt-2 text-sm text-black/50">A valid workshop code is required. Staff and Owner accounts are created internally.</p>
            <label class="mt-7 block text-sm font-bold">Workshop code
              <input class="mop-input mt-2 w-full uppercase" name="workshopCode" [(ngModel)]="registerForm.workshopCode" autocomplete="off" required>
            </label>
            <div class="mt-5 grid gap-5 sm:grid-cols-2">
              <label class="block text-sm font-bold">Full name<input class="mop-input mt-2 w-full" name="fullName" [(ngModel)]="registerForm.fullName" autocomplete="name" required></label>
              <label class="block text-sm font-bold">Phone<input class="mop-input mt-2 w-full" name="phone" [(ngModel)]="registerForm.phone" autocomplete="tel" required></label>
            </div>
            <label class="mt-5 block text-sm font-bold">Email <span class="font-normal text-black/40">(optional)</span>
              <input class="mop-input mt-2 w-full" type="email" name="email" [(ngModel)]="registerForm.email" autocomplete="email">
            </label>
            <label class="mt-5 block text-sm font-bold">Password
              <input class="mop-input mt-2 w-full" type="password" name="registerPassword" [(ngModel)]="registerForm.password" autocomplete="new-password" minlength="10" required>
              <span class="mt-2 block text-xs font-normal text-black/45">At least 10 characters with upper-case, lower-case, and a number.</span>
            </label>
            <label class="mt-5 flex items-start gap-3 text-sm">
              <input class="mt-1" type="checkbox" name="consent" [(ngModel)]="registerForm.communicationConsent">
              <span>I agree to receive service updates from this workshop.</span>
            </label>
            <div *ngIf="auth.error()" class="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{{ auth.error() }}</div>
            <button class="mop-button-primary mt-6 w-full" type="submit" [disabled]="auth.loading() || !registrationReady()">
              {{ auth.loading() ? 'Creating portal...' : 'Create Customer Account' }}
            </button>
          </form>
        </div>
      </section>
    </main>
  `
})
export class IdentityGatewayComponent implements OnInit {
  readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  readonly mode = signal<"login" | "register">("login");
  loginForm = { identifier: "", password: "" };
  registerForm = { workshopCode: "", fullName: "", phone: "", email: "", password: "", communicationConsent: false };

  ngOnInit() {
    const code = this.route.snapshot.queryParamMap.get("workshop") || this.route.snapshot.queryParamMap.get("code");
    if (code) {
      this.registerForm.workshopCode = code;
      this.mode.set("register");
    }
  }

  setMode(mode: "login" | "register") {
    this.mode.set(mode);
    this.auth.error.set("");
  }

  login() {
    if (!this.loginForm.identifier || !this.loginForm.password) return;
    void this.auth.login(this.loginForm.identifier, this.loginForm.password);
  }

  register() {
    if (!this.registrationReady()) return;
    void this.auth.registerCustomer({
      ...this.registerForm,
      email: this.registerForm.email || undefined
    });
  }

  registrationReady() {
    return Boolean(
      this.registerForm.workshopCode.trim()
      && this.registerForm.fullName.trim()
      && this.registerForm.phone.trim()
      && this.registerForm.password.length >= 10
    );
  }
}
