import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, signal, computed } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import type { TechnicianJobCardDto, TechnicianMyWorkDto } from "@mop/shared";
import { firstValueFrom } from "rxjs";
import { ApiClient } from "../../core/api/api-client.service";
import { TechnicianMobileNavComponent } from "./technician-mobile-nav.component";
import { getLifecycleStage, LIFECYCLE_STAGES, type LifecycleStageInfo } from "./technician-lifecycle.util";

interface RegroupedJobGroup {
  id: string;
  label: string;
  jobs: TechnicianJobCardDto[];
}

@Component({
  selector: "mop-technician-my-work",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TechnicianMobileNavComponent],
  template: `
    <section class="min-h-screen bg-slate-50 px-4 pb-28 pt-6 font-sans">
      <div class="mx-auto max-w-5xl">
        <!-- Sticky Header -->
        <header class="sticky top-0 z-30 -mx-4 bg-slate-50/95 px-4 pb-4 pt-2 backdrop-blur-md">
          <div class="flex items-center justify-between mb-4">
            <h1 class="text-3xl font-black text-slate-900 tracking-tight">My Work</h1>
            <span class="inline-flex items-center justify-center rounded-full bg-red-100 px-3 py-1 text-sm font-black text-red-800">
              {{ totalJobCount() }} Jobs
            </span>
          </div>

          <!-- Search Input -->
          <div class="relative mb-4">
            <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
              <svg xmlns="http://www.w3.org/2000/svg" class="text-slate-400" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </div>
            <input class="block w-full rounded-xl border-2 border-slate-200 bg-white py-3 pl-11 pr-4 text-base font-bold text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:outline-none focus:ring-0" placeholder="Search WO, Plate, Task..." [ngModel]="search()" (ngModelChange)="search.set($event)" />
          </div>

          <!-- Scrollable Filters -->
          <div class="flex overflow-x-auto pb-2 -mx-4 px-4 snap-x hide-scrollbar">
            <div class="flex gap-2 snap-start">
              <button *ngFor="let filter of filters" 
                class="whitespace-nowrap rounded-xl px-5 py-3 text-sm font-bold transition-colors"
                [ngClass]="activeFilter() === filter.id ? 'bg-red-600 text-white shadow-md' : 'bg-white border-2 border-slate-200 text-slate-600 active:bg-slate-100'"
                (click)="activeFilter.set(filter.id)">
                {{ filter.label }}
              </button>
            </div>
          </div>
        </header>

        <!-- Job Groups -->
        <div class="mt-4 grid gap-8">
          <section *ngFor="let group of regroupedWork()" class="block" [class.hidden]="!groupVisible(group.id)">
            <div class="mb-4 flex items-center gap-3">
              <h2 class="text-lg font-black text-slate-900 border-l-4 border-red-600 pl-3">{{ group.label }}</h2>
              <span class="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-black text-slate-600">{{ visibleJobs(group.jobs).length }}</span>
            </div>
            
            <div class="grid gap-4 md:grid-cols-2" *ngIf="visibleJobs(group.jobs).length; else emptyGroup">
              <div *ngFor="let job of visibleJobs(group.jobs)"
                class="relative block rounded-2xl border-2 border-slate-200 bg-white p-5 overflow-hidden shadow-sm">
                
                <!-- Priority Border -->
                <div class="absolute left-0 top-0 bottom-0 w-1.5" [ngClass]="priorityColor(job.priority)"></div>

                <div class="flex items-start justify-between">
                  <div class="text-sm font-black text-slate-400">{{ job.workOrderNumber }}</div>
                  <span class="inline-flex rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wider" [ngClass]="toneClass(job.statusTone)">
                    {{ job.status }}
                  </span>
                </div>

                <div class="mt-2 text-xl font-black text-slate-900">{{ job.assetName }}</div>
                <div class="mt-0.5 text-base font-bold text-slate-500">{{ job.assetIdentifier }}</div>
                <div class="mt-3 text-sm font-bold text-slate-700">Task: {{ job.taskTitle }}</div>

                <!-- Vehicle Lifecycle Strip inside Job Card -->
                <div class="mt-4 border-t border-slate-100 pt-3">
                  <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Vehicle Stage Tracker</div>
                  <div class="flex items-center gap-1 overflow-x-auto pb-1 hide-scrollbar">
                    <span *ngFor="let stageName of lifecycleStages; let idx = idx" 
                      class="rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-wider shrink-0"
                      [ngClass]="idx === jobLifecycle(job).index ? 'bg-red-600 text-white' : (idx < jobLifecycle(job).index ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-400')">
                      {{ stageName }}
                    </span>
                  </div>
                </div>

                <!-- Next Action Highlight -->
                <div class="mt-4 rounded-xl bg-red-50/50 p-4 border border-red-100">
                  <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Next Action Required</div>
                  <div class="text-sm font-black text-red-950 flex items-center justify-between">
                    <span>{{ jobLifecycle(job).nextAction }}</span>
                    <a [routerLink]="['/work-card']" [queryParams]="{ taskId: job.taskId }" class="rounded-lg bg-red-600 p-2 text-white shadow-sm active:bg-red-700 transition-colors ml-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                    </a>
                  </div>
                </div>

                <!-- Status Pills -->
                <div class="mt-4 flex flex-wrap gap-2">
                  <span *ngIf="job.customerDecisionState !== 'none'" class="inline-flex items-center gap-1 rounded-md bg-orange-50 px-2 py-1 text-xs font-bold text-orange-700 border border-orange-200">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
                    Cust: {{ job.customerDecisionState }}
                  </span>
                  <span *ngIf="job.partsState !== 'none'" class="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700 border border-indigo-200">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                    Parts: {{ job.partsState }}
                  </span>
                  <span *ngIf="job.blockerState !== 'none'" class="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700 border border-red-200 animate-pulse">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
                    Blocked: {{ job.blockerState }}
                  </span>
                </div>
              </div>
            </div>
            <ng-template #emptyGroup>
              <div class="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-6 text-center shadow-sm">
                <p class="text-sm font-bold text-slate-400">No jobs currently in this operational stage.</p>
              </div>
            </ng-template>
          </section>
        </div>
      </div>
      <mop-technician-nav active="work"></mop-technician-nav>
    </section>
  `,
  styles: [`
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  `]
})
export class TechnicianMyWorkComponent implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly route = inject(ActivatedRoute);
  readonly rawWork = signal<TechnicianMyWorkDto | null>(null);
  readonly activeFilter = signal("all");
  readonly search = signal("");
  readonly lifecycleStages = LIFECYCLE_STAGES;

  readonly filters = [
    { id: "all", label: "All Work" },
    { id: "active_now", label: "Active Now" },
    { id: "needs_inspection", label: "Needs Inspection" },
    { id: "due_today", label: "Due Today" },
    { id: "waiting_customer", label: "Waiting Customer" },
    { id: "waiting_parts", label: "Waiting Parts" },
    { id: "blocked", label: "Blocked" },
    { id: "returned_for_rework", label: "Returned for Rework" },
    { id: "ready_to_finish", label: "Ready to Finish" },
    { id: "completed_today", label: "Completed Today" }
  ];

  readonly regroupedWork = computed<RegroupedJobGroup[]>(() => {
    const raw = this.rawWork();
    if (!raw || !raw.groups) return [];
    
    // Flatten all jobs from raw groups
    const allJobs = raw.groups.flatMap(g => g.jobs);

    // Initialize 9 target groups
    const targetGroups: RegroupedJobGroup[] = [
      { id: "active_now", label: "Active Now", jobs: [] },
      { id: "needs_inspection", label: "Needs Inspection", jobs: [] },
      { id: "due_today", label: "Due Today", jobs: [] },
      { id: "waiting_customer", label: "Waiting Customer", jobs: [] },
      { id: "waiting_parts", label: "Waiting Parts", jobs: [] },
      { id: "blocked", label: "Blocked", jobs: [] },
      { id: "returned_for_rework", label: "Returned for Rework", jobs: [] },
      { id: "ready_to_finish", label: "Ready to Finish", jobs: [] },
      { id: "completed_today", label: "Completed Today", jobs: [] }
    ];

    for (const job of allJobs) {
      const stageInfo = getLifecycleStage(job);
      const blocker = (job.blockerState || "").toLowerCase();
      const group = (job.group || "").toLowerCase();
      const parts = (job.partsState || "").toLowerCase();
      const decision = (job.customerDecisionState || "").toLowerCase();

      // Blocker
      if (blocker === "open" || blocker === "critical" || job.status === "blocked") {
        targetGroups.find(g => g.id === "blocked")?.jobs.push(job);
      }
      // Rework
      else if (group === "returned_for_rework" || job.status === "ready_for_qc") {
        targetGroups.find(g => g.id === "returned_for_rework")?.jobs.push(job);
      }
      // Completed / Done
      else if (group === "completed_today" || job.status === "completed" || stageInfo.stage === "Delivery") {
        targetGroups.find(g => g.id === "completed_today")?.jobs.push(job);
      }
      // Waiting Customer
      else if (group === "waiting_customer" || stageInfo.stage === "Approval" || decision === "waiting") {
        targetGroups.find(g => g.id === "waiting_customer")?.jobs.push(job);
      }
      // Waiting Parts
      else if (group === "waiting_parts" || stageInfo.stage === "Parts" || parts === "waiting_manager" || parts === "on_the_way") {
        targetGroups.find(g => g.id === "waiting_parts")?.jobs.push(job);
      }
      // Needs Inspection
      else if (stageInfo.stage === "Inspection" || group === "needs_inspection") {
        targetGroups.find(g => g.id === "needs_inspection")?.jobs.push(job);
      }
      // Active Now / Ready to Finish
      else if (group === "active_now" || job.status === "in_progress") {
        const isReadyToFinish = parts === "used" && decision !== "waiting" && blocker === "none";
        if (isReadyToFinish) {
          targetGroups.find(g => g.id === "ready_to_finish")?.jobs.push(job);
        } else {
          targetGroups.find(g => g.id === "active_now")?.jobs.push(job);
        }
      }
      // Default: Due Today
      else {
        targetGroups.find(g => g.id === "due_today")?.jobs.push(job);
      }
    }

    return targetGroups;
  });

  async ngOnInit() {
    const filter = this.route.snapshot.queryParamMap.get("filter");
    if (filter && this.filters.some((row) => row.id === filter)) this.activeFilter.set(filter);
    this.rawWork.set(await firstValueFrom(this.api.get<TechnicianMyWorkDto>("/technician/my-work")));
  }

  totalJobCount() {
    const raw = this.rawWork();
    if (!raw || !raw.groups) return 0;
    const all = raw.groups.flatMap(g => g.jobs);
    return all.length;
  }

  jobLifecycle(job: TechnicianJobCardDto): LifecycleStageInfo {
    return getLifecycleStage(job);
  }

  groupVisible(groupId: string) {
    return this.activeFilter() === "all" || this.activeFilter() === groupId;
  }

  jobVisible(job: { workOrderNumber: string; assetName: string; assetIdentifier: string; taskTitle: string }) {
    const term = this.search().trim().toLowerCase();
    if (!term) return true;
    return [job.workOrderNumber, job.assetName, job.assetIdentifier, job.taskTitle].some((value) => value.toLowerCase().includes(term));
  }

  visibleJobs(jobs: TechnicianJobCardDto[]) {
    return jobs.filter((job) => this.jobVisible(job));
  }

  priorityColor(priority: string) {
    if (priority === 'Critical') return 'bg-red-600';
    if (priority === 'High') return 'bg-orange-500';
    if (priority === 'Normal') return 'bg-red-500';
    return 'bg-slate-300';
  }

  toneClass(tone: string) {
    if (tone === "red") return "bg-red-100 text-red-800";
    if (tone === "orange") return "bg-orange-100 text-orange-800";
    if (tone === "blue") return "bg-red-100 text-red-800";
    if (tone === "green") return "bg-emerald-100 text-emerald-800";
    return "bg-slate-100 text-slate-800";
  }
}
