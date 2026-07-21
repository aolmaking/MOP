import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, signal, computed } from "@angular/core";
import { RouterLink } from "@angular/router";
import type { TechnicianHomeDto } from "@mop/shared";
import { firstValueFrom } from "rxjs";
import { ApiClient } from "../../core/api/api-client.service";
import { AuthStore } from "../../core/auth/auth.store";
import { TechnicianMobileNavComponent } from "./technician-mobile-nav.component";
import { getLifecycleStage, LIFECYCLE_STAGES } from "./technician-lifecycle.util";

@Component({
  selector: "mop-technician-home",
  standalone: true,
  imports: [CommonModule, RouterLink, TechnicianMobileNavComponent],
  template: `
    <section class="min-h-screen bg-slate-50 px-4 pb-28 pt-6 font-sans">
      <div class="mx-auto max-w-5xl">
        <!-- Header Profile -->
        <header class="flex items-center justify-between mb-8">
          <div>
            <h1 class="text-3xl font-black text-slate-900 tracking-tight">Home</h1>
            <p class="text-slate-500 font-medium mt-1">{{ auth.session()?.workspace?.label || "Workshop" }}</p>
          </div>
          <div class="text-right">
            <div class="font-black text-slate-900">{{ auth.session()?.displayName }}</div>
            <div class="inline-flex items-center gap-1.5 mt-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-800">
              <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span> Active Session
            </div>
          </div>
        </header>

        <!-- Current Job (Massive Execution Cockpit) -->
        <div *ngIf="home()?.currentJob as job; else noActiveJob" class="rounded-2xl border-2 border-slate-200 bg-white p-6 shadow-md">
          <div class="flex items-center justify-between border-b-2 border-slate-100 pb-4">
            <div>
              <span class="rounded bg-red-50 px-2 py-1 text-xs font-black uppercase text-red-700">Active Cockpit</span>
              <span class="ml-2 rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{{ job.workOrderNumber }}</span>
            </div>
            <span class="rounded bg-red-600 px-3 py-1 text-xs font-black uppercase text-white shadow-sm">{{ job.status }}</span>
          </div>

          <div class="mt-4">
            <h2 class="text-3xl font-black text-slate-900 tracking-tight">{{ job.assetName }}</h2>
            <p class="text-lg font-bold text-slate-500 mt-0.5">{{ job.assetIdentifier }} · <span class="text-sm font-semibold text-slate-400">{{ job.taskTitle }}</span></p>
          </div>

          <!-- Vehicle Lifecycle Strip -->
          <div class="mt-6 border-t-2 border-slate-100 pt-4">
            <div class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Vehicle Lifecycle Stage</div>
            <div class="flex items-center justify-between overflow-x-auto py-2 -mx-2 px-2 hide-scrollbar snap-x">
              <div *ngFor="let stageName of lifecycleStages; let idx = idx" class="flex items-center gap-1.5 shrink-0 snap-start">
                <div class="flex items-center gap-1.5">
                  <span class="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black"
                    [ngClass]="idx === currentStageInfo().index ? 'bg-red-600 text-white' : (idx < currentStageInfo().index ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-slate-100 text-slate-400')">
                    {{ idx + 1 }}
                  </span>
                  <span class="text-xs font-bold"
                    [ngClass]="idx === currentStageInfo().index ? 'text-red-700 font-black' : (idx < currentStageInfo().index ? 'text-slate-700' : 'text-slate-400')">
                    {{ stageName }}
                  </span>
                </div>
                <span *ngIf="idx < lifecycleStages.length - 1" class="text-slate-300 font-black text-xs mx-1">→</span>
              </div>
            </div>
          </div>

          <!-- Operational Alert block (Where is it? Next Action? Blocker?) -->
          <div class="mt-4 rounded-xl bg-red-50 p-4 border-2 border-red-200 text-red-950">
            <div class="flex items-center justify-between border-b border-red-200/50 pb-2 mb-2">
              <span class="text-xs font-bold uppercase tracking-wider text-red-800">Current Stage: {{ currentStageInfo().stage }}</span>
              <span *ngIf="currentStageInfo().blockedBy" class="rounded bg-red-100 px-2 py-0.5 text-xs font-black uppercase text-red-900 border border-red-300">
                Blocked By: {{ currentStageInfo().blockedBy }}
              </span>
            </div>
            <div class="text-sm font-black flex items-start gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="shrink-0 mt-0.5 text-red-600" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
              <span>{{ currentStageInfo().nextAction }}</span>
            </div>
          </div>

          <a [routerLink]="['/work-card']" [queryParams]="{ taskId: job.taskId }" class="mt-5 flex items-center justify-center rounded-xl bg-red-600 p-4 text-center text-lg font-black text-white shadow-md active:bg-red-700 transition-colors">
            Open Execution Workbench
            <svg xmlns="http://www.w3.org/2000/svg" class="ml-2" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </a>
        </div>

        <ng-template #noActiveJob>
          <div class="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" class="mx-auto text-slate-400 mb-4" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            <h2 class="text-xl font-black text-slate-900">No active job assigned</h2>
            <p class="mt-2 text-slate-500 font-medium">Please check the My Work tab or scan a work order barcode.</p>
          </div>
        </ng-template>

        <!-- Scan Input (Always visible, large) -->
        <div class="mt-6">
          <div class="relative">
            <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
              <svg xmlns="http://www.w3.org/2000/svg" class="text-slate-400" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </div>
            <input #scanCode class="block w-full rounded-2xl border-2 border-slate-200 bg-white py-4 pl-12 pr-24 text-lg font-bold text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:outline-none focus:ring-0" placeholder="Scan Plate or Work Order..." />
            <a routerLink="/work-card" [queryParams]="{ scan: scanCode.value }" class="absolute inset-y-2 right-2 flex items-center justify-center rounded-xl bg-red-600 px-4 font-bold text-white active:bg-red-700 transition-colors">
              Go
            </a>
          </div>
        </div>

        <!-- Attention Cards / Navigation Grid -->
        <div class="mt-6">
          <h3 class="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">Attention & Actions</h3>
          <div class="grid grid-cols-2 gap-4">
            <a routerLink="/my-work" class="flex flex-col rounded-2xl border-2 border-slate-200 bg-white p-5 transition-colors active:bg-slate-100">
              <div class="flex items-center justify-between">
                <svg xmlns="http://www.w3.org/2000/svg" class="text-slate-600" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                <span class="text-2xl font-black text-slate-900">{{ home()?.counts?.todayJobs || 0 }}</span>
              </div>
              <span class="mt-4 text-sm font-bold text-slate-700">All My Work</span>
            </a>

            <a routerLink="/my-work" [queryParams]="{ filter: 'active_now' }" class="flex flex-col rounded-2xl border-2 border-red-100 bg-white p-5 transition-colors active:bg-red-50">
              <div class="flex items-center justify-between">
                <svg xmlns="http://www.w3.org/2000/svg" class="text-red-600" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                <span class="text-2xl font-black text-red-600">Active Now</span>
              </div>
              <span class="mt-4 text-sm font-bold text-red-900">In Progress</span>
            </a>
            
            <a routerLink="/my-work" [queryParams]="{ filter: 'waiting_customer' }" class="flex flex-col rounded-2xl border-2 border-orange-200 bg-orange-50 p-5 transition-colors active:bg-orange-100">
              <div class="flex items-center justify-between">
                <svg xmlns="http://www.w3.org/2000/svg" class="text-orange-600" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
                <span class="text-2xl font-black text-orange-900">{{ home()?.counts?.waitingCustomer || 0 }}</span>
              </div>
              <span class="mt-4 text-sm font-bold text-orange-800">Waiting Customer</span>
            </a>

            <a routerLink="/my-work" [queryParams]="{ filter: 'waiting_parts' }" class="flex flex-col rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-5 transition-colors active:bg-indigo-100">
              <div class="flex items-center justify-between">
                <svg xmlns="http://www.w3.org/2000/svg" class="text-indigo-600" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                <span class="text-2xl font-black text-indigo-900">{{ partsStatusTotal() }}</span>
              </div>
              <span class="mt-4 text-sm font-bold text-indigo-700">Parts Status</span>
            </a>

            <a routerLink="/my-work" [queryParams]="{ filter: 'blocked' }" class="flex flex-col rounded-2xl border-2 border-red-200 bg-red-50 p-5 transition-colors active:bg-red-100">
              <div class="flex items-center justify-between">
                <svg xmlns="http://www.w3.org/2000/svg" class="text-red-600" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
                <span class="text-2xl font-black text-red-900">{{ home()?.counts?.blocked || 0 }}</span>
              </div>
              <span class="mt-4 text-sm font-bold text-red-700">Blocked Jobs</span>
            </a>

            <a routerLink="/my-work" [queryParams]="{ filter: 'returned_for_rework' }" class="flex flex-col rounded-2xl border-2 border-yellow-200 bg-yellow-50 p-5 transition-colors active:bg-yellow-100">
              <div class="flex items-center justify-between">
                <svg xmlns="http://www.w3.org/2000/svg" class="text-yellow-700" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                <span class="text-2xl font-black text-yellow-950">{{ home()?.counts?.rework || 0 }}</span>
              </div>
              <span class="mt-4 text-sm font-bold text-yellow-800">Rework Needed</span>
            </a>
          </div>
        </div>

        <!-- Quick Inspection / Quick Service Entry -->
        <a routerLink="/work-card" [queryParams]="{ panel: 'quick' }" class="mt-6 flex items-center justify-between rounded-2xl border-2 border-slate-200 bg-white p-5 transition-colors active:bg-slate-100">
          <div class="flex items-center gap-4">
            <div class="rounded-full bg-red-50 p-3">
              <svg xmlns="http://www.w3.org/2000/svg" class="text-red-600" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <div>
              <div class="text-lg font-black text-slate-900">Quick Inspection / Service</div>
              <div class="text-sm font-bold text-slate-500">{{ home()?.quickServices?.length || 0 }} rapid templates ready</div>
            </div>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" class="text-slate-300" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </a>

      </div>
      <mop-technician-nav active="home"></mop-technician-nav>
    </section>
  `,
  styles: [`
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  `]
})
export class TechnicianHomeComponent implements OnInit {
  private readonly api = inject(ApiClient);
  readonly auth = inject(AuthStore);
  readonly home = signal<TechnicianHomeDto | null>(null);
  readonly lifecycleStages = LIFECYCLE_STAGES;

  readonly currentStageInfo = computed(() => {
    return getLifecycleStage(this.home()?.currentJob);
  });

  async ngOnInit() {
    this.home.set(await firstValueFrom(this.api.get<TechnicianHomeDto>("/technician/home")));
  }

  partsStatusTotal() {
    const counts = this.home()?.counts;
    return (counts?.waitingParts || 0) + (counts?.partsOnTheWay || 0) + (counts?.partsArrived || 0) + (counts?.returnsPending || 0);
  }
}
