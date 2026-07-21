import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
import { RouterLink } from "@angular/router";

@Component({
  selector: "mop-technician-nav",
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <nav class="fixed inset-x-0 bottom-0 z-40 border-t-2 border-slate-200 bg-white px-2 py-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] pb-safe">
      <div class="mx-auto grid max-w-md grid-cols-3 gap-2">
        <a routerLink="/technician" class="flex flex-col items-center justify-center rounded-xl p-3 transition-colors min-h-[64px]" [ngClass]="active === 'home' ? 'bg-red-600 text-white' : 'text-slate-500 hover:bg-slate-100'">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span class="mt-1 text-[11px] font-bold uppercase tracking-wider">Home</span>
        </a>
        <a routerLink="/my-work" class="flex flex-col items-center justify-center rounded-xl p-3 transition-colors min-h-[64px]" [ngClass]="active === 'work' ? 'bg-red-600 text-white' : 'text-slate-500 hover:bg-slate-100'">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>
          <span class="mt-1 text-[11px] font-bold uppercase tracking-wider">My Work</span>
        </a>
        <a routerLink="/work-card" class="flex flex-col items-center justify-center rounded-xl p-3 transition-colors min-h-[64px]" [ngClass]="active === 'card' ? 'bg-red-600 text-white' : 'text-slate-500 hover:bg-slate-100'">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          <span class="mt-1 text-[11px] font-bold uppercase tracking-wider">Work Card</span>
        </a>
      </div>
    </nav>
  `
})
export class TechnicianMobileNavComponent {
  @Input({ required: true }) active: "home" | "work" | "card" = "home";
}
