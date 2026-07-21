import { CommonModule } from "@angular/common";
import { Component, inject } from "@angular/core";
import { RouterLink, RouterLinkActive } from "@angular/router";
import { AuthStore } from "../auth/auth.store";

@Component({
  selector: "mop-shell",
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <aside class="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-black/10 bg-ink-950 text-white lg:block">
      <div class="flex h-full flex-col p-5">
        <div class="mb-7">
          <div class="text-xs font-semibold uppercase text-white/50">MOP Product Platform</div>
          <div class="mt-2 text-2xl font-black tracking-normal">Operations OS</div>
        </div>

        <div class="mb-5 rounded-lg border border-white/10 bg-white/10 p-4">
          <div class="text-sm font-bold">{{ auth.session()?.displayName }}</div>
          <div class="mt-1 text-xs text-white/60">{{ auth.session()?.roleLabel }}</div>
          <div class="mt-3 text-xs text-white/70">{{ auth.session()?.workspace?.label }}</div>
          <div *ngIf="auth.session()?.readOnly" class="mt-3 rounded bg-amber-300/15 px-2 py-1 text-xs font-bold text-amber-200">Read-only workspace</div>
        </div>

        <nav class="grid min-h-0 gap-2 overflow-y-auto pr-1">
          <a
            *ngFor="let item of auth.allowedNavigation()"
            [routerLink]="['/', item.id]"
            routerLinkActive="bg-white text-ink-950"
            class="rounded-md px-3 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            {{ item.label }}
          </a>
        </nav>

        <button class="mop-button-secondary mt-auto border-white/15 bg-white/10 text-white hover:bg-white/20" (click)="auth.logout()">
          Logout
        </button>
      </div>
    </aside>
  `
})
export class ShellComponent {
  readonly auth = inject(AuthStore);
}
