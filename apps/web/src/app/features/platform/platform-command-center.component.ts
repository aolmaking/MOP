import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink, Router } from "@angular/router";
import type {
  PlatformAddWorkshopOwnerDto,
  PlatformCommandCenterDto,
  PlatformControlDomain,
  PlatformControlRequestDto,
  PlatformControlType,
  PlatformImpactPreviewDto,
  PlatformLiveViewRoleDto,
  PlatformWorkshopCardDto,
  PlatformWorkshopReportDto,
  PlatformWorkshopStatus
} from "@mop/shared";
import { firstValueFrom } from "rxjs";
import { ApiClient } from "../../core/api/api-client.service";

type PlatformPage = "workshops" | "add-workshop" | "reports" | "live-view" | "control";

@Component({
  selector: "mop-platform-command-center",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="min-h-screen bg-[#0f172a] text-slate-100 px-4 py-6 md:px-8">
      <div class="mx-auto max-w-7xl">
        <!-- Main Top Bar -->
        <header class="rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-rose-600 text-white shadow-lg font-black text-xl">
                MOP
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-extrabold uppercase tracking-widest text-amber-400">Platform Control Plane</span>
                  <span class="inline-flex items-center rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-300 border border-slate-700">
                    Super Admin Console
                  </span>
                </div>
                <h1 class="mt-1 text-2xl md:text-3xl font-black text-white tracking-tight">{{ title() }}</h1>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white"
                (click)="load()"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                Sync Platform Data
              </button>
            </div>
          </div>

          <!-- Navigation Tabs -->
          <nav class="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <a
              *ngFor="let nav of navItems"
              [routerLink]="['/' + nav.route]"
              class="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-extrabold transition-all"
              [ngClass]="page() === nav.id ? 'bg-gradient-to-r from-amber-500 to-rose-600 text-white shadow-lg shadow-rose-950/40' : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-white'"
            >
              <span>{{ nav.label }}</span>
            </a>
          </nav>
        </header>

        <!-- Status Alerts -->
        <div *ngIf="message()" class="mt-4 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-4 text-sm font-bold text-emerald-300 backdrop-blur-md">
          <div class="flex items-center gap-2">
            <svg class="h-5 w-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span>{{ message() }}</span>
          </div>
          <button type="button" class="text-xs text-emerald-400 hover:underline" (click)="message.set('')">Dismiss</button>
        </div>
        <div *ngIf="error()" class="mt-4 flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-sm font-bold text-rose-300 backdrop-blur-md">
          <div class="flex items-center gap-2">
            <svg class="h-5 w-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span>{{ error() }}</span>
          </div>
          <button type="button" class="text-xs text-rose-400 hover:underline" (click)="error.set('')">Dismiss</button>
        </div>
        <div *ngIf="loading()" class="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-center text-sm font-bold text-slate-400">
          <span class="inline-block animate-pulse">Loading Platform Engine data...</span>
        </div>

        <ng-container [ngSwitch]="page()">
          <!-- PAGE 1: WORKSHOPS -->
          <section *ngSwitchCase="'workshops'" class="mt-6 space-y-6">
            <!-- Metrics Summary Cards -->
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div class="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl backdrop-blur-sm">
                <div class="text-xs font-bold uppercase tracking-wider text-slate-400">Total Client Workshops</div>
                <div class="mt-2 flex items-baseline justify-between">
                  <div class="text-3xl font-black text-white">{{ workshops().length }}</div>
                  <span class="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">Sold tenants</span>
                </div>
              </div>

              <div class="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl backdrop-blur-sm">
                <div class="text-xs font-bold uppercase tracking-wider text-slate-400">Active / Trial Workshops</div>
                <div class="mt-2 flex items-baseline justify-between">
                  <div class="text-3xl font-black text-emerald-400">{{ countByStatus(["active", "trial"]) }}</div>
                  <span class="rounded-full bg-emerald-950 px-2 py-0.5 text-xs text-emerald-300 border border-emerald-800/50">Operating</span>
                </div>
              </div>

              <div class="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl backdrop-blur-sm">
                <div class="text-xs font-bold uppercase tracking-wider text-slate-400">Frozen / Suspended</div>
                <div class="mt-2 flex items-baseline justify-between">
                  <div class="text-3xl font-black text-rose-400">{{ countByStatus(["frozen", "suspended"]) }}</div>
                  <span class="rounded-full bg-rose-950 px-2 py-0.5 text-xs text-rose-300 border border-rose-800/50">Locked</span>
                </div>
              </div>

              <a [routerLink]="['/platform-add-workshop']" class="group flex flex-col justify-between rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-rose-500/10 p-5 shadow-xl transition hover:border-amber-500/60">
                <div class="text-xs font-bold uppercase tracking-wider text-amber-400">Onboard New Client</div>
                <div class="mt-2 flex items-center justify-between text-xl font-black text-white group-hover:text-amber-300">
                  <span>Add Workshop Owner</span>
                  <svg class="h-6 w-6 transform transition group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                </div>
              </a>
            </div>

            <!-- Filters & Search -->
            <div class="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div class="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  placeholder="Search workshop name, owner..."
                  class="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-white placeholder-slate-400 focus:border-amber-500 focus:outline-none"
                  [ngModel]="workshopSearchQuery()"
                  (ngModelChange)="workshopSearchQuery.set($event)"
                />
                <select
                  class="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                  [ngModel]="statusFilter()"
                  (ngModelChange)="statusFilter.set($event)"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="trial">Trial</option>
                  <option value="pending_setup">Pending Setup</option>
                  <option value="frozen">Frozen</option>
                  <option value="suspended">Suspended</option>
                  <option value="read_only">Read Only</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div class="text-xs text-slate-400">Showing <b>{{ filteredWorkshops().length }}</b> of <b>{{ workshops().length }}</b> workshops</div>
            </div>

            <!-- Workshop Cards List -->
            <div class="grid gap-4">
              <article *ngFor="let workshop of filteredWorkshops()" class="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur-md transition hover:border-slate-700">
                <div class="flex flex-wrap items-start justify-between gap-6">
                  <div class="min-w-0 space-y-3 flex-1">
                    <!-- Badges Row -->
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider" [ngClass]="statusBadgeClass(workshop.status)">
                        {{ workshop.status }}
                      </span>
                      <span class="rounded-full bg-slate-800 px-3 py-1 text-xs font-bold text-slate-300 border border-slate-700">
                        Plan: {{ workshop.plan }}
                      </span>
                      <span class="rounded-full bg-slate-800 px-3 py-1 text-xs font-bold text-slate-300 border border-slate-700">
                        Payment: {{ workshop.paymentStatus }}
                      </span>
                      <span class="rounded-full px-3 py-1 text-xs font-bold border" [ngClass]="healthBadgeClass(workshop.healthStatus)">
                        Health: {{ workshop.healthStatus }}
                      </span>
                    </div>

                    <!-- Workshop Name & Owner -->
                    <div>
                      <h2 class="text-2xl font-black text-white tracking-tight">{{ workshop.name }}</h2>
                      <p class="mt-1 text-sm font-medium text-slate-400 flex flex-wrap items-center gap-2">
                        <span>Owner: <b class="text-slate-200">{{ workshop.ownerName }}</b></span>
                        <span>•</span>
                        <span>{{ workshop.ownerEmail }}</span>
                        <span *ngIf="workshop.ownerPhone">• {{ workshop.ownerPhone }}</span>
                      </p>
                    </div>

                    <!-- Metrics Grid -->
                    <div class="grid gap-3 text-xs sm:grid-cols-5">
                      <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <span class="text-slate-400">Branches</span>
                        <div class="mt-1 text-base font-black text-white">{{ workshop.branchesCount }}</div>
                      </div>
                      <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <span class="text-slate-400">Total Users</span>
                        <div class="mt-1 text-base font-black text-white">{{ workshop.usersCount }}</div>
                      </div>
                      <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <span class="text-slate-400">Active Users</span>
                        <div class="mt-1 text-base font-black text-emerald-400">{{ workshop.activeUsers }}</div>
                      </div>
                      <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <span class="text-slate-400">Builder Config</span>
                        <div class="mt-1 text-base font-black text-amber-400">{{ workshop.builderStatus }}</div>
                      </div>
                      <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <span class="text-slate-400">Usage Score</span>
                        <div class="mt-1 text-base font-black text-sky-400">{{ workshop.usageScore }}%</div>
                      </div>
                    </div>
                  </div>

                  <!-- Action Buttons Side Bar -->
                  <div class="flex flex-col gap-2 min-w-[190px]">
                    <button type="button" class="w-full rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-black text-slate-200 hover:bg-slate-700 transition" (click)="openWorkshopDetails(workshop)">
                      Open Details
                    </button>
                    <button type="button" class="w-full rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-black text-slate-200 hover:bg-slate-700 transition" (click)="openReports(workshop.id)">
                      Open Reports
                    </button>
                    <button type="button" class="w-full rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-black text-slate-200 hover:bg-slate-700 transition" (click)="openLiveView(workshop.id)">
                      Open Live View
                    </button>
                    <button type="button" class="w-full rounded-xl bg-amber-500/20 border border-amber-500/30 px-4 py-2.5 text-xs font-black text-amber-300 hover:bg-amber-500/30 transition" (click)="selectForControl(workshop.id)">
                      Control Center
                    </button>
                    <button *ngIf="!isFrozen(workshop)" type="button" class="w-full rounded-xl bg-rose-500/20 border border-rose-500/30 px-4 py-2.5 text-xs font-black text-rose-300 hover:bg-rose-500/30 transition" (click)="promptFreezeModal(workshop)">
                      Freeze Workshop
                    </button>
                    <button *ngIf="isFrozen(workshop)" type="button" class="w-full rounded-xl bg-emerald-500/20 border border-emerald-500/30 px-4 py-2.5 text-xs font-black text-emerald-300 hover:bg-emerald-500/30 transition" (click)="promptReactivateModal(workshop)">
                      Reactivate Workshop
                    </button>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <!-- PAGE 2: ADD WORKSHOP OWNER -->
          <section *ngSwitchCase="'add-workshop'" class="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div class="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-6">
              <div>
                <h2 class="text-2xl font-black text-white">Add New Workshop Owner</h2>
                <p class="mt-1 text-sm text-slate-400">
                  Onboards a new workshop tenant into MOP. Performs atomic creation of Tenant + Owner Account + Initial Plan + Starter Builder Template + Default Permissions + Platform Audit Event.
                </p>
              </div>
              <button type="button" class="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700" (click)="resetAddDraft()">
                Reset Form
              </button>
            </div>

            <!-- Form -->
            <form class="mt-6 space-y-6" (ngSubmit)="createWorkshop()">
              <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label class="block text-xs font-extrabold uppercase text-slate-400 mb-1">Workshop / Company Name *</label>
                  <input class="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none" name="workshopName" placeholder="e.g. Apex Motors Center" [ngModel]="addDraft().workshopName" (ngModelChange)="patchAdd({ workshopName: $event })" required />
                </div>

                <div>
                  <label class="block text-xs font-extrabold uppercase text-slate-400 mb-1">Owner Full Name *</label>
                  <input class="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none" name="ownerFullName" placeholder="e.g. Mohamed Ali" [ngModel]="addDraft().ownerFullName" (ngModelChange)="patchAdd({ ownerFullName: $event })" required />
                </div>

                <div>
                  <label class="block text-xs font-extrabold uppercase text-slate-400 mb-1">Owner Email *</label>
                  <input class="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none" type="email" name="ownerEmail" placeholder="owner@example.com" [ngModel]="addDraft().ownerEmail" (ngModelChange)="patchAdd({ ownerEmail: $event })" required />
                </div>

                <div>
                  <label class="block text-xs font-extrabold uppercase text-slate-400 mb-1">Owner Phone</label>
                  <input class="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none" name="ownerPhone" placeholder="+20 100 000 0000" [ngModel]="addDraft().ownerPhone" (ngModelChange)="patchAdd({ ownerPhone: $event })" />
                </div>

                <div>
                  <label class="block text-xs font-extrabold uppercase text-slate-400 mb-1">Country</label>
                  <input class="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none" name="country" placeholder="Egypt" [ngModel]="addDraft().country" (ngModelChange)="patchAdd({ country: $event })" />
                </div>

                <div>
                  <label class="block text-xs font-extrabold uppercase text-slate-400 mb-1">City</label>
                  <input class="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none" name="city" placeholder="Cairo" [ngModel]="addDraft().city" (ngModelChange)="patchAdd({ city: $event })" />
                </div>

                <div>
                  <label class="block text-xs font-extrabold uppercase text-slate-400 mb-1">Business Type</label>
                  <select class="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white focus:border-amber-500 focus:outline-none" name="businessType" [ngModel]="addDraft().businessType" (ngModelChange)="patchAdd({ businessType: $event })">
                    <option value="Car Service Center">Car Service Center</option>
                    <option value="Motorcycle Workshop">Motorcycle Workshop</option>
                    <option value="Heavy Equipment Service">Heavy Equipment Service</option>
                    <option value="Mixed Workshop">Mixed Workshop</option>
                  </select>
                </div>

                <div>
                  <label class="block text-xs font-extrabold uppercase text-slate-400 mb-1">Initial Operating Category</label>
                  <select class="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white focus:border-amber-500 focus:outline-none" name="initialCategory" [ngModel]="addDraft().initialCategory" (ngModelChange)="patchAdd({ initialCategory: $event })">
                    <option value="Cars">Cars</option>
                    <option value="Motorcycles">Motorcycles</option>
                    <option value="Heavy Equipment">Heavy / Agricultural Equipment</option>
                    <option value="Multiple Categories">Multiple Categories</option>
                  </select>
                </div>

                <div>
                  <label class="block text-xs font-extrabold uppercase text-slate-400 mb-1">Initial Plan / Package</label>
                  <select class="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white focus:border-amber-500 focus:outline-none" name="initialPackage" [ngModel]="addDraft().initialPackage" (ngModelChange)="patchAdd({ initialPackage: $event })">
                    <option value="Starter">Starter Package</option>
                    <option value="Growth">Growth Package</option>
                    <option value="Enterprise">Enterprise Package</option>
                  </select>
                </div>

                <div>
                  <label class="block text-xs font-extrabold uppercase text-slate-400 mb-1">Allowed Branches</label>
                  <input class="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white focus:border-amber-500 focus:outline-none" type="number" min="1" name="branchesAllowed" [ngModel]="addDraft().branchesAllowed" (ngModelChange)="patchAdd({ branchesAllowed: numberValue($event) })" />
                </div>

                <div>
                  <label class="block text-xs font-extrabold uppercase text-slate-400 mb-1">Allowed Staff Users</label>
                  <input class="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white focus:border-amber-500 focus:outline-none" type="number" min="1" name="usersAllowed" [ngModel]="addDraft().usersAllowed" (ngModelChange)="patchAdd({ usersAllowed: numberValue($event) })" />
                </div>

                <div>
                  <label class="block text-xs font-extrabold uppercase text-slate-400 mb-1">Starter Builder Template</label>
                  <select class="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white focus:border-amber-500 focus:outline-none" name="starterTemplate" [ngModel]="addDraft().starterTemplate" (ngModelChange)="patchAdd({ starterTemplate: $event })">
                    <option value="mop-standard-workshop">MOP Standard Workshop Template</option>
                    <option value="mop-heavy-equipment">MOP Heavy Equipment Template</option>
                    <option value="mop-express-quick-service">MOP Express Quick Service Template</option>
                  </select>
                </div>

                <div>
                  <label class="block text-xs font-extrabold uppercase text-slate-400 mb-1">Initial Status</label>
                  <select class="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white focus:border-amber-500 focus:outline-none" name="status" [ngModel]="addDraft().status" (ngModelChange)="patchAdd({ status: $event })">
                    <option value="active">Active</option>
                    <option value="trial">Trial</option>
                    <option value="pending_setup">Pending Setup</option>
                  </select>
                </div>

                <div class="flex items-center pt-5">
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="h-5 w-5 rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-amber-500" [checked]="addDraft().enableDemoData" (change)="patchAdd({ enableDemoData: !addDraft().enableDemoData })" />
                    <span class="text-sm font-bold text-slate-200">Seed Initial Demo Data</span>
                  </label>
                </div>
              </div>

              <!-- Transactional Notice -->
              <div class="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-xs text-amber-300">
                <b>Strict Onboarding Rule:</b> Creation is completely transactional. If any step fails (e.g. invalid owner email), no partial workshop or owner account is created.
              </div>

              <div class="flex justify-end gap-3 pt-2">
                <button type="button" class="rounded-xl border border-slate-700 bg-slate-800 px-6 py-3 text-sm font-bold text-slate-300 hover:bg-slate-700" (click)="resetAddDraft()">
                  Cancel
                </button>
                <button type="submit" class="rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 px-8 py-3 text-sm font-black text-white shadow-lg hover:brightness-110">
                  Create Workshop & Provision Access
                </button>
              </div>
            </form>
          </section>

          <!-- PAGE 3: PLATFORM REPORTS -->
          <section *ngSwitchCase="'reports'" class="mt-6 grid gap-6 xl:grid-cols-[340px_1fr]">
            <!-- Workshop Selection Sidebar -->
            <div class="space-y-3">
              <div class="text-xs font-black uppercase tracking-wider text-slate-400 px-1">Platform Clients</div>
              <article
                *ngFor="let report of reports()"
                class="rounded-2xl border bg-slate-900 p-4 cursor-pointer transition hover:border-slate-700"
                [ngClass]="selectedReportId() === report.workshop.id ? 'border-amber-500 bg-slate-900 shadow-xl' : 'border-slate-800 opacity-80'"
                (click)="selectedReportId.set(report.workshop.id)"
              >
                <div class="flex items-center justify-between">
                  <span class="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase" [ngClass]="statusBadgeClass(report.workshop.status)">
                    {{ report.workshop.status }}
                  </span>
                  <span class="text-xs font-extrabold text-amber-400">Score: {{ report.workshop.usageScore }}%</span>
                </div>
                <h3 class="mt-2 text-lg font-black text-white">{{ report.workshop.name }}</h3>
                <p class="text-xs text-slate-400">{{ report.workshop.ownerName }} • {{ report.workshop.plan }}</p>
              </article>
            </div>

            <!-- Deep Dive Report View -->
            <article class="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-6">
              <ng-container *ngIf="selectedReport() as report; else noReport">
                <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                  <div>
                    <h2 class="text-2xl font-black text-white">{{ report.workshop.name }} — Platform Performance Report</h2>
                    <p class="text-xs text-slate-400">Aggregated platform metrics. Customer private service records remain strictly protected.</p>
                  </div>
                  <div class="flex gap-2">
                    <button type="button" class="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700" (click)="openLiveView(report.workshop.id)">
                      Open Live View
                    </button>
                    <button type="button" class="rounded-xl bg-amber-500/20 border border-amber-500/30 px-4 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/30" (click)="selectForControl(report.workshop.id)">
                      Control Center
                    </button>
                  </div>
                </div>

                <!-- 6 Report Sub-Sections -->
                <div class="grid gap-6 md:grid-cols-2">
                  <!-- A. Usage Overview -->
                  <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                    <h3 class="text-sm font-extrabold text-amber-400 uppercase tracking-wider">A. Usage Overview</h3>
                    <div *ngFor="let row of report.businessSuccess" class="flex justify-between text-xs py-1.5 border-b border-slate-800/60 last:border-0">
                      <span class="text-slate-400">{{ row.label }}</span>
                      <span class="font-bold text-white">{{ row.value }}</span>
                    </div>
                  </div>

                  <!-- B. Feature Usage -->
                  <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                    <h3 class="text-sm font-extrabold text-amber-400 uppercase tracking-wider">B. Feature Usage & Adoption</h3>
                    <div *ngFor="let row of report.featureUsage" class="space-y-1">
                      <div class="flex justify-between text-xs">
                        <span class="text-slate-300">{{ row.feature }}</span>
                        <span class="font-extrabold text-amber-400">{{ row.usage }}%</span>
                      </div>
                      <div class="h-1.5 w-full rounded-full bg-slate-800">
                        <div class="h-1.5 rounded-full bg-gradient-to-r from-amber-500 to-rose-500" [style.width.%]="row.usage"></div>
                      </div>
                    </div>
                  </div>

                  <!-- C. Builder Adoption -->
                  <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                    <h3 class="text-sm font-extrabold text-amber-400 uppercase tracking-wider">C. Builder Adoption</h3>
                    <div *ngFor="let row of report.builderAdoption" class="flex justify-between text-xs py-1.5 border-b border-slate-800/60 last:border-0">
                      <span class="text-slate-400">{{ row.label }}</span>
                      <span class="font-bold text-white">{{ row.value }}</span>
                    </div>
                  </div>

                  <!-- D. Operational Activity -->
                  <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                    <h3 class="text-sm font-extrabold text-amber-400 uppercase tracking-wider">D. Operational Activity</h3>
                    <div *ngFor="let row of report.operations" class="flex justify-between text-xs py-1.5 border-b border-slate-800/60 last:border-0">
                      <span class="text-slate-400">{{ row.label }}</span>
                      <span class="font-bold text-white">{{ row.value }}</span>
                    </div>
                  </div>

                  <!-- E. Commercial Snapshot -->
                  <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                    <h3 class="text-sm font-extrabold text-amber-400 uppercase tracking-wider">E. Commercial & Subscription</h3>
                    <div *ngFor="let row of report.financialSnapshot" class="flex justify-between text-xs py-1.5 border-b border-slate-800/60 last:border-0">
                      <span class="text-slate-400">{{ row.label }}</span>
                      <span class="font-bold text-white">{{ row.value }}</span>
                    </div>
                  </div>

                  <!-- F. Health & Risk Assessment -->
                  <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                    <h3 class="text-sm font-extrabold text-amber-400 uppercase tracking-wider">F. Health & Risk Assessment</h3>
                    <div *ngFor="let row of report.healthRisks" class="rounded-lg p-3 text-xs border" [ngClass]="riskBoxClass(row.risk)">
                      <div class="font-black uppercase tracking-wide">{{ row.label }} (Risk: {{ row.risk }})</div>
                      <div class="mt-1 font-medium opacity-90">{{ row.message }}</div>
                    </div>
                  </div>
                </div>
              </ng-container>
              <ng-template #noReport>
                <div class="p-12 text-center text-slate-500 font-bold">Select a workshop to view platform report.</div>
              </ng-template>
            </article>
          </section>

          <!-- PAGE 4: WORKSHOP LIVE VIEW -->
          <section *ngSwitchCase="'live-view'" class="mt-6 grid gap-6 xl:grid-cols-[320px_1fr]">
            <!-- Workshop Selector -->
            <div class="space-y-3">
              <div class="text-xs font-black uppercase tracking-wider text-slate-400 px-1">Select Workshop for Live View</div>
              <article
                *ngFor="let workshop of workshops()"
                class="rounded-2xl border bg-slate-900 p-4 cursor-pointer transition hover:border-slate-700"
                [ngClass]="selectedLiveTenantId() === workshop.id ? 'border-amber-500 shadow-xl' : 'border-slate-800 opacity-80'"
                (click)="selectedLiveTenantId.set(workshop.id)"
              >
                <div class="flex items-center justify-between">
                  <span class="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase" [ngClass]="statusBadgeClass(workshop.status)">
                    {{ workshop.status }}
                  </span>
                  <span class="text-xs font-bold text-slate-400">{{ workshop.plan }}</span>
                </div>
                <h3 class="mt-2 text-lg font-black text-white">{{ workshop.name }}</h3>
                <p class="text-xs text-slate-400">Builder: {{ workshop.builderStatus }}</p>
              </article>
            </div>

            <!-- Live View Panel -->
            <article class="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-6">
              <ng-container *ngIf="selectedLiveWorkshop() as workshop; else noLive">
                <!-- Persistent Read-Only Warning Banner -->
                <div class="rounded-xl border border-sky-500/40 bg-sky-950/40 p-4 text-xs font-bold text-sky-200 flex items-center justify-between backdrop-blur-md">
                  <div class="flex items-center gap-3">
                    <span class="flex h-3 w-3 relative">
                      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                      <span class="relative inline-flex rounded-full h-3 w-3 bg-sky-500"></span>
                    </span>
                    <span><b>Platform Live View — Read-only Mode:</b> Viewing {{ workshop.name }} configuration without mutating operational data.</span>
                  </div>
                  <span class="rounded-md bg-sky-900/80 px-2 py-1 text-[10px] uppercase font-extrabold tracking-wider text-sky-300">Audited Session</span>
                </div>

                <!-- Header Info -->
                <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                  <div>
                    <h2 class="text-2xl font-black text-white">{{ workshop.name }} — Live View</h2>
                    <p class="text-xs text-slate-400">Owner: {{ workshop.ownerName }} • Plan: {{ workshop.plan }} • Builder Version: {{ workshop.builderStatus }}</p>
                  </div>
                  <button type="button" class="rounded-xl bg-amber-500/20 border border-amber-500/30 px-4 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/30" (click)="selectForControl(workshop.id)">
                    Open Control Center
                  </button>
                </div>

                <!-- Role View Selector -->
                <div>
                  <h3 class="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-3">Select Role View Persona</h3>
                  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <button
                      *ngFor="let role of liveRoles(workshop.id)"
                      type="button"
                      class="rounded-xl border p-4 text-left transition"
                      [ngClass]="selectedLiveRole()?.role === role.role ? 'border-amber-500 bg-slate-800/80 shadow-lg' : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'"
                      (click)="startLiveRole(workshop, role)"
                    >
                      <div class="flex items-center justify-between">
                        <span class="text-sm font-black text-white">{{ role.label }}</span>
                        <span class="text-[10px] font-black text-emerald-400 uppercase">READ ONLY</span>
                      </div>
                      <p class="mt-1 text-xs text-slate-400">{{ role.userPersona }}</p>
                      <div class="mt-3 flex flex-wrap gap-1">
                        <span *ngFor="let p of role.pages" class="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 border border-slate-700">
                          {{ p }}
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                <!-- Simulated Role Sandbox Workspace -->
                <div *ngIf="selectedLiveRole() as currentRole" class="rounded-2xl border border-slate-800 bg-slate-950/80 p-6 space-y-4">
                  <div class="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-black text-white">{{ currentRole.label }} Workspace Context</span>
                      <span class="rounded bg-rose-950 text-rose-300 border border-rose-800 text-[10px] px-2 py-0.5 font-bold">Mutations Disabled</span>
                    </div>
                    <span class="text-xs text-slate-400">Inspecting pages for role: <b>{{ currentRole.role }}</b></span>
                  </div>

                  <div class="grid gap-3 sm:grid-cols-3">
                    <button *ngFor="let pageId of currentRole.pages" type="button" class="rounded-xl border border-slate-800 bg-slate-900 p-4 text-left hover:border-slate-700" (click)="triggerReadOnlyNotice(pageId)">
                      <div class="text-xs font-bold text-amber-400 uppercase">Page Screen</div>
                      <div class="text-sm font-black text-white mt-1">{{ pageId }}</div>
                      <div class="mt-2 text-[10px] text-slate-400">Click to view simulated read-only interface</div>
                    </button>
                  </div>

                  <div *ngIf="readOnlyNotice()" class="rounded-xl border border-rose-500/30 bg-rose-950/30 p-4 text-xs font-bold text-rose-300 flex items-center justify-between">
                    <span><b>Disabled Action Notice:</b> {{ readOnlyNotice() }}</span>
                    <button type="button" class="text-rose-400 hover:underline text-[10px]" (click)="readOnlyNotice.set('')">Dismiss</button>
                  </div>
                </div>
              </ng-container>
              <ng-template #noLive>
                <div class="p-12 text-center text-slate-500 font-bold">Select a workshop for live view inspection.</div>
              </ng-template>
            </article>
          </section>

          <!-- PAGE 5: SUPER ADMIN CONTROL CENTER -->
          <section *ngSwitchCase="'control'" class="mt-6 grid gap-6 xl:grid-cols-[280px_1fr_360px]">
            <!-- Left Domain Navigation -->
            <aside class="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-4">
              <div>
                <label class="block text-xs font-extrabold uppercase text-slate-400 mb-1">Target Selector</label>
                <select class="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs text-white focus:border-amber-500 focus:outline-none" [ngModel]="controlDraft().targetType" (ngModelChange)="patchControl({ targetType: $event })">
                  <option value="tenant">Specific Workshop</option>
                  <option value="global">Global Platform</option>
                  <option value="all_workshops">All Workshops</option>
                  <option value="plan">Plan Group</option>
                  <option value="branch">Specific Branch</option>
                  <option value="role">Specific Role</option>
                  <option value="user">Specific User</option>
                  <option value="module">Specific Module</option>
                  <option value="feature">Specific Feature</option>
                </select>
                <select *ngIf="controlDraft().targetType === 'tenant'" class="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs text-white mt-2 focus:border-amber-500 focus:outline-none" [ngModel]="controlDraft().targetId" (ngModelChange)="patchControl({ targetId: $event })">
                  <option value="">Select workshop</option>
                  <option *ngFor="let w of workshops()" [value]="w.id">{{ w.name }}</option>
                </select>
              </div>

              <div class="space-y-1">
                <div class="text-[10px] font-black uppercase tracking-wider text-slate-400 px-1 mb-2">Control Domains</div>
                <button
                  *ngFor="let domain of controlDomains"
                  type="button"
                  class="w-full rounded-xl px-3 py-2.5 text-left text-xs font-extrabold transition flex items-center justify-between"
                  [ngClass]="controlDraft().controlDomain === domain.id ? 'bg-gradient-to-r from-amber-500 to-rose-600 text-white shadow-lg' : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-white'"
                  (click)="chooseDomain(domain.id, domain.defaultKey)"
                >
                  <span>{{ domain.label }}</span>
                </button>
              </div>
            </aside>

            <!-- Main Control Configuration Panel -->
            <main class="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-6">
              <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h2 class="text-2xl font-black text-white">Platform Control Plane</h2>
                  <p class="text-xs text-slate-400">Configure target policies, preview live impact, confirm reasons, apply, and rollback.</p>
                </div>
                <button type="button" class="rounded-xl bg-amber-500/20 border border-amber-500/30 px-5 py-2.5 text-xs font-black text-amber-300 hover:bg-amber-500/30" (click)="previewControl()">
                  Preview Impact
                </button>
              </div>

              <!-- Quick Presets -->
              <div class="space-y-2">
                <div class="text-xs font-extrabold uppercase tracking-wider text-slate-400">Quick High-Impact Presets</div>
                <div class="flex flex-wrap gap-2">
                  <button type="button" class="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700" (click)="preset('module', 'inventory_management', 'hard_disable', false)">Disable Inventory</button>
                  <button type="button" class="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700" (click)="preset('feature', 'customer_portal', 'hard_disable', false)">Lock Customer Portal</button>
                  <button type="button" class="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700" (click)="preset('builder', 'publishing', 'locked', 'locked')">Lock Builder Publish</button>
                  <button type="button" class="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700" (click)="preset('lifecycle', 'tenant_status', 'frozen', 'frozen')">Freeze Tenant</button>
                  <button type="button" class="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700" (click)="preset('lifecycle', 'tenant_status', 'read_only', 'read_only')">Set Read-only</button>
                  <button type="button" class="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700" (click)="preset('module', 'finance_module', 'hard_disable', false)">Disable Finance</button>
                </div>
              </div>

              <!-- Control Inputs -->
              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label class="block text-xs font-extrabold uppercase text-slate-400 mb-1">Control Key</label>
                  <input class="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white focus:border-amber-500 focus:outline-none" placeholder="e.g. inventory_management" [ngModel]="controlDraft().controlKey" (ngModelChange)="patchControl({ controlKey: $event })" />
                </div>
                <div>
                  <label class="block text-xs font-extrabold uppercase text-slate-400 mb-1">Control Type</label>
                  <select class="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white focus:border-amber-500 focus:outline-none" [ngModel]="controlDraft().controlType" (ngModelChange)="patchControl({ controlType: $event })">
                    <option value="enabled">Enabled</option>
                    <option value="hard_disable">Hard Disable</option>
                    <option value="soft_disable">Soft Disable</option>
                    <option value="read_only">Read Only</option>
                    <option value="hidden">Hidden</option>
                    <option value="locked">Locked</option>
                    <option value="frozen">Frozen</option>
                  </select>
                </div>

                <div class="sm:col-span-2">
                  <label class="block text-xs font-extrabold uppercase text-slate-400 mb-1">Action Reason (Required for Audit & Rollback)</label>
                  <textarea class="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none" rows="2" placeholder="State reason for policy application..." [ngModel]="controlDraft().reason" (ngModelChange)="patchControl({ reason: $event })"></textarea>
                </div>

                <div class="sm:col-span-2 flex items-center gap-3">
                  <input type="checkbox" id="confirmHighRisk" class="h-5 w-5 rounded border-slate-700 bg-slate-800 text-rose-500 focus:ring-rose-500" [checked]="controlDraft().confirmed" (change)="patchControl({ confirmed: !controlDraft().confirmed })" />
                  <label for="confirmHighRisk" class="text-xs font-bold text-slate-200 cursor-pointer">
                    Confirm high-risk control change (Required for execution)
                  </label>
                </div>
              </div>

              <!-- Active Policies & Rollback History -->
              <div class="space-y-4 pt-4 border-t border-slate-800">
                <h3 class="text-sm font-extrabold text-white uppercase tracking-wider">Active Control Policies</h3>
                <div *ngFor="let control of command()?.controls || []" class="rounded-xl border border-slate-800 bg-slate-950/60 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <span class="font-extrabold text-amber-400">{{ control.controlDomain }} / {{ control.controlKey }}</span>
                    <p class="text-slate-400 mt-0.5">Target: {{ control.targetType }} {{ control.targetId || 'global' }} • Risk: {{ control.riskLevel }}</p>
                  </div>
                  <button type="button" class="rounded-xl border border-rose-500/30 bg-rose-500/20 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/30" [disabled]="!control.rollbackAvailable || !control.active" (click)="rollbackControl(control.id)">
                    Rollback Policy
                  </button>
                </div>
              </div>
            </main>

            <!-- Right Impact Preview Panel -->
            <aside class="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
              <div class="text-xs font-extrabold uppercase tracking-wider text-slate-400">Live Impact Preview</div>
              <ng-container *ngIf="impact() as preview; else emptyImpact">
                <div class="rounded-xl p-4 border" [ngClass]="riskBoxClass(preview.riskLevel)">
                  <div class="text-sm font-black uppercase">Risk Level: {{ preview.riskLevel }}</div>
                  <div class="text-xs mt-1">Rollback Path: {{ preview.rollbackAvailable ? 'Available' : 'None' }}</div>
                </div>

                <div class="grid gap-2 text-xs">
                  <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <span class="text-slate-400">Affected Users</span>
                    <div class="text-base font-black text-white">{{ preview.affectedUsers }}</div>
                  </div>
                  <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <span class="text-slate-400">Active Work Orders</span>
                    <div class="text-base font-black text-amber-400">{{ preview.affectedActiveWorkOrders }}</div>
                  </div>
                  <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <span class="text-slate-400">Historical Data</span>
                    <div class="text-base font-black text-emerald-400">{{ preview.historicalData }}</div>
                  </div>
                </div>

                <div class="space-y-1">
                  <span class="text-xs font-bold text-slate-400">Affected Roles</span>
                  <div class="flex flex-wrap gap-1">
                    <span *ngFor="let r of preview.affectedRoles" class="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">{{ r }}</span>
                  </div>
                </div>

                <div class="space-y-1">
                  <span class="text-xs font-bold text-slate-400">Affected Pages</span>
                  <div class="flex flex-wrap gap-1">
                    <span *ngFor="let p of preview.affectedPages" class="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">{{ p }}</span>
                  </div>
                </div>

                <button type="button" class="w-full rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 py-3 text-sm font-black text-white shadow-lg hover:brightness-110" (click)="applyControl()">
                  Apply Platform Control
                </button>
              </ng-container>
              <ng-template #emptyImpact>
                <div class="p-8 text-center text-xs text-slate-500 font-bold border border-dashed border-slate-800 rounded-xl">
                  Configure control parameters and click Preview Impact.
                </div>
              </ng-template>
            </aside>
          </section>
        </ng-container>
      </div>

      <!-- Workshop Details Drawer Overlay -->
      <div *ngIf="activeDetailsWorkshop()" class="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
        <div class="w-full max-w-xl bg-slate-900 border-l border-slate-800 p-6 overflow-y-auto space-y-6 text-slate-100">
          <div class="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <span class="rounded-full px-3 py-0.5 text-[10px] font-black uppercase" [ngClass]="statusBadgeClass(activeDetailsWorkshop()!.status)">
                {{ activeDetailsWorkshop()!.status }}
              </span>
              <h2 class="text-2xl font-black text-white mt-1">{{ activeDetailsWorkshop()!.name }}</h2>
            </div>
            <button type="button" class="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" (click)="activeDetailsWorkshop.set(null)">✕</button>
          </div>

          <div class="grid gap-4 sm:grid-cols-2 text-xs">
            <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
              <span class="text-xs font-bold text-amber-400 uppercase">Owner Information</span>
              <div><b>Name:</b> {{ activeDetailsWorkshop()!.ownerName }}</div>
              <div><b>Email:</b> {{ activeDetailsWorkshop()!.ownerEmail }}</div>
              <div><b>Phone:</b> {{ activeDetailsWorkshop()!.ownerPhone || 'N/A' }}</div>
            </div>

            <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
              <span class="text-xs font-bold text-amber-400 uppercase">Plan & Subscription</span>
              <div><b>Package:</b> {{ activeDetailsWorkshop()!.plan }}</div>
              <div><b>Payment Status:</b> {{ activeDetailsWorkshop()!.paymentStatus }}</div>
              <div><b>Monthly Revenue:</b> \${{ activeDetailsWorkshop()!.monthlyRevenue }}</div>
            </div>

            <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
              <span class="text-xs font-bold text-amber-400 uppercase">Branches & Usage</span>
              <div><b>Branches:</b> {{ activeDetailsWorkshop()!.branchesCount }}</div>
              <div><b>Users:</b> {{ activeDetailsWorkshop()!.usersCount }} (Active: {{ activeDetailsWorkshop()!.activeUsers }})</div>
              <div><b>Usage Score:</b> {{ activeDetailsWorkshop()!.usageScore }}%</div>
            </div>

            <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
              <span class="text-xs font-bold text-amber-400 uppercase">System Status</span>
              <div><b>Health:</b> {{ activeDetailsWorkshop()!.healthStatus }}</div>
              <div><b>Builder Status:</b> {{ activeDetailsWorkshop()!.builderStatus }}</div>
              <div><b>Last Activity:</b> {{ activeDetailsWorkshop()!.lastActivity }}</div>
            </div>
          </div>

          <div class="flex gap-2 pt-4 border-t border-slate-800">
            <button type="button" class="w-full rounded-xl bg-slate-800 py-3 text-xs font-bold text-slate-200 hover:bg-slate-700" (click)="openReports(activeDetailsWorkshop()!.id); activeDetailsWorkshop.set(null)">
              View Reports
            </button>
            <button type="button" class="w-full rounded-xl bg-amber-500/20 border border-amber-500/30 py-3 text-xs font-bold text-amber-300 hover:bg-amber-500/30" (click)="selectForControl(activeDetailsWorkshop()!.id); activeDetailsWorkshop.set(null)">
              Control Plane
            </button>
          </div>
          <div class="flex gap-2 pt-2">
            <button *ngIf="!isFrozen(activeDetailsWorkshop()!)" type="button" class="w-full rounded-xl bg-rose-500/20 border border-rose-500/30 py-3 text-xs font-bold text-rose-300 hover:bg-rose-500/30" (click)="promptFreezeModal(activeDetailsWorkshop()!); activeDetailsWorkshop.set(null)">
              Freeze Workshop
            </button>
            <button *ngIf="isFrozen(activeDetailsWorkshop()!)" type="button" class="w-full rounded-xl bg-emerald-500/20 border border-emerald-500/30 py-3 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30" (click)="promptReactivateModal(activeDetailsWorkshop()!); activeDetailsWorkshop.set(null)">
              Reactivate Workshop
            </button>
          </div>
        </div>
      </div>

      <!-- Freeze Workshop Confirmation Modal -->
      <div *ngIf="activeFreezeWorkshop()" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div class="w-full max-w-md bg-slate-900 border border-rose-500/40 p-6 rounded-2xl space-y-4 shadow-2xl">
          <h3 class="text-xl font-black text-rose-400">Freeze {{ activeFreezeWorkshop()!.name }}?</h3>
          <p class="text-xs text-slate-300">
            Freezing will instantly block Owner, Staff, and Customer Portal logins. Data will be preserved and Platform Live View will remain accessible in read-only mode.
          </p>
          <div>
            <label class="block text-xs font-bold text-slate-400 mb-1">Reason for Freezing (Required)</label>
            <textarea class="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-xs text-white focus:border-rose-500 focus:outline-none" rows="3" placeholder="Enter freeze justification..." [ngModel]="freezeReason()" (ngModelChange)="freezeReason.set($event)"></textarea>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300" (click)="activeFreezeWorkshop.set(null)">Cancel</button>
            <button type="button" class="rounded-xl bg-rose-600 px-4 py-2 text-xs font-black text-white hover:bg-rose-500" (click)="executeFreeze()">Confirm Freeze Workshop</button>
          </div>
        </div>
      </div>
      <!-- Reactivate Workshop Confirmation Modal -->
      <div *ngIf="activeReactivateWorkshop()" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div class="w-full max-w-md bg-slate-900 border border-emerald-500/40 p-6 rounded-2xl space-y-4 shadow-2xl">
          <h3 class="text-xl font-black text-emerald-400">Reactivate {{ activeReactivateWorkshop()!.name }}?</h3>
          <p class="text-xs text-slate-300">
            Reactivating will restore Owner, Staff, and Customer Portal logins, and re-enable operational functionality.
          </p>
          <div>
            <label class="block text-xs font-bold text-slate-400 mb-1">Reason for Reactivating (Required)</label>
            <textarea class="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-xs text-white focus:border-emerald-500 focus:outline-none" rows="3" placeholder="Enter reactivate justification..." [ngModel]="reactivateReason()" (ngModelChange)="reactivateReason.set($event)"></textarea>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300" (click)="activeReactivateWorkshop.set(null)">Cancel</button>
            <button type="button" class="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-500" (click)="executeReactivate()">Confirm Reactivate</button>
          </div>
        </div>
      </div>
    </section>
  `
})
export class PlatformCommandCenterComponent implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly navItems: Array<{ id: PlatformPage; route: string; label: string }> = [
    { id: "workshops", route: "platform", label: "1. Workshops" },
    { id: "add-workshop", route: "platform-add-workshop", label: "2. Add Workshop" },
    { id: "reports", route: "platform-reports", label: "3. Reports" },
    { id: "live-view", route: "platform-live-view", label: "4. Live View" },
    { id: "control", route: "platform-control", label: "5. Control Center" }
  ];

  readonly controlDomains: Array<{ id: PlatformControlDomain; label: string; defaultKey: string }> = [
    { id: "lifecycle", label: "Tenant Status", defaultKey: "tenant_status" },
    { id: "module", label: "Module Control", defaultKey: "inventory_management" },
    { id: "feature", label: "Feature Control", defaultKey: "customer_decision_requests" },
    { id: "role", label: "Role Control", defaultKey: "technician" },
    { id: "builder", label: "Builder Control", defaultKey: "publishing" },
    { id: "access", label: "Access & Accounts", defaultKey: "owner_login" },
    { id: "limits", label: "Limits & Entitlements", defaultKey: "max_users" },
    { id: "emergency", label: "Emergency Control", defaultKey: "freeze_workshop" },
    { id: "reports_visibility", label: "Reports Control", defaultKey: "export" },
    { id: "data_visibility", label: "Finance Control", defaultKey: "finance_module" }
  ];

  readonly page = signal<PlatformPage>("workshops");
  readonly loading = signal(false);
  readonly message = signal("");
  readonly error = signal("");
  readonly command = signal<PlatformCommandCenterDto | null>(null);

  // Search & Filter
  readonly workshopSearchQuery = signal("");
  readonly statusFilter = signal("all");

  // Selection states
  readonly selectedReportId = signal("");
  readonly selectedLiveTenantId = signal("");
  readonly selectedLiveRole = signal<PlatformLiveViewRoleDto | null>(null);
  readonly readOnlyNotice = signal("");

  // Drawers & Modals
  readonly activeDetailsWorkshop = signal<PlatformWorkshopCardDto | null>(null);
  readonly activeFreezeWorkshop = signal<PlatformWorkshopCardDto | null>(null);
  readonly freezeReason = signal("");
  readonly activeReactivateWorkshop = signal<PlatformWorkshopCardDto | null>(null);
  readonly reactivateReason = signal("");

  readonly impact = signal<PlatformImpactPreviewDto | null>(null);
  readonly addDraft = signal<PlatformAddWorkshopOwnerDto>(this.emptyAddDraft());
  readonly controlDraft = signal<PlatformControlRequestDto>(this.emptyControlDraft());

  async ngOnInit() {
    this.page.set((this.route.snapshot.data["platformPage"] as PlatformPage) || "workshops");
    await this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set("");
    try {
      const data = await firstValueFrom(this.api.get<PlatformCommandCenterDto>("/platform/command-center"));
      this.command.set(data);
      if (!this.selectedReportId() && data.workshops[0]) this.selectedReportId.set(data.workshops[0].id);
      if (!this.selectedLiveTenantId() && data.workshops[0]) this.selectedLiveTenantId.set(data.workshops[0].id);
    } catch {
      this.error.set("Platform command center API is not reachable.");
    } finally {
      this.loading.set(false);
    }
  }

  workshops() {
    return this.command()?.workshops || [];
  }

  filteredWorkshops() {
    let list = this.workshops();
    const query = this.workshopSearchQuery().toLowerCase().trim();
    if (query) {
      list = list.filter((w) => w.name.toLowerCase().includes(query) || w.ownerName.toLowerCase().includes(query) || w.ownerEmail.toLowerCase().includes(query));
    }
    const status = this.statusFilter();
    if (status !== "all") {
      list = list.filter((w) => w.status === status);
    }
    return list;
  }

  reports() {
    return this.command()?.reports || [];
  }

  selectedReport(): PlatformWorkshopReportDto | undefined {
    return this.reports().find((report) => report.workshop.id === this.selectedReportId()) || this.reports()[0];
  }

  selectedLiveWorkshop(): PlatformWorkshopCardDto | undefined {
    return this.workshops().find((workshop) => workshop.id === this.selectedLiveTenantId()) || this.workshops()[0];
  }

  liveRoles(tenantId: string) {
    return this.command()?.liveViewRoles?.[tenantId] || [];
  }

  title() {
    return {
      workshops: "Workshops Management",
      "add-workshop": "Add Workshop Owner",
      reports: "Platform Reports & Analytics",
      "live-view": "Workshop Live View (Read-Only)",
      control: "Super Admin Control Center"
    }[this.page()];
  }

  countByStatus(statuses: PlatformWorkshopStatus[]) {
    return this.workshops().filter((w) => statuses.includes(w.status)).length;
  }

  isFrozen(workshop: PlatformWorkshopCardDto) {
    return ["frozen", "suspended", "archived"].includes(workshop.status);
  }

  openWorkshopDetails(workshop: PlatformWorkshopCardDto) {
    this.activeDetailsWorkshop.set(workshop);
  }

  promptFreezeModal(workshop: PlatformWorkshopCardDto) {
    this.freezeReason.set(`Platform freeze requested for ${workshop.name}`);
    this.activeFreezeWorkshop.set(workshop);
  }

  async executeFreeze() {
    const workshop = this.activeFreezeWorkshop();
    if (!workshop) return;
    const reason = this.freezeReason() || `Platform freeze requested for ${workshop.name}.`;
    await firstValueFrom(this.api.post(`/platform/workshops/${workshop.id}/freeze`, { reason, freezeType: "Manual admin decision", internalNote: "Action from Workshops console.", notifyOwner: false, confirmed: true }));
    this.message.set(`${workshop.name} has been frozen. Data preserved.`);
    this.activeFreezeWorkshop.set(null);
    await this.load();
  }

  openReports(tenantId: string) {
    this.selectedReportId.set(tenantId);
    this.page.set("reports");
    this.router.navigate(['/platform-reports']);
  }

  openLiveView(tenantId: string) {
    this.selectedLiveTenantId.set(tenantId);
    this.page.set("live-view");
    this.router.navigate(['/platform-live-view']);
  }

  selectForControl(tenantId: string) {
    this.patchControl({ targetType: "tenant", targetId: tenantId });
    this.page.set("control");
    this.impact.set(null);
    this.router.navigate(['/platform-control']);
  }

  promptReactivateModal(workshop: PlatformWorkshopCardDto) {
    this.reactivateReason.set(`Platform reactivation requested for ${workshop.name}`);
    this.activeReactivateWorkshop.set(workshop);
  }

  async executeReactivate() {
    const workshop = this.activeReactivateWorkshop();
    if (!workshop) return;
    const reason = this.reactivateReason() || `Platform reactivation requested for ${workshop.name}.`;
    await firstValueFrom(this.api.post(`/platform/workshops/${workshop.id}/reactivate`, { reason, confirmed: true }));
    this.message.set(`${workshop.name} reactivated successfully.`);
    this.activeReactivateWorkshop.set(null);
    await this.load();
  }

  async createWorkshop() {
    const draft = this.addDraft();
    const missing = ["workshopName", "ownerFullName", "ownerEmail"].filter((field) => !String((draft as any)[field] || "").trim());
    if (missing.length) {
      this.error.set(`Missing required fields: ${missing.join(", ")}`);
      return;
    }
    const result = await firstValueFrom(this.api.post<any>("/platform/workshops", draft));
    this.message.set(`Workshop created! Invitation link: ${result?.invitation?.inviteLink || "generated"}.`);
    this.resetAddDraft();
    await this.load();
    this.page.set("workshops");
  }

  patchAdd(patch: Partial<PlatformAddWorkshopOwnerDto>) {
    this.addDraft.set({ ...this.addDraft(), ...patch });
  }

  resetAddDraft() {
    this.addDraft.set(this.emptyAddDraft());
  }

  async startLiveRole(workshop: PlatformWorkshopCardDto, role: PlatformLiveViewRoleDto) {
    this.selectedLiveRole.set(role);
    this.readOnlyNotice.set("");
    await firstValueFrom(this.api.post("/platform/live-view/session", { tenantId: workshop.id, roleViewed: role.role, userPersona: role.userPersona }));
    this.message.set(`Opened Live View for ${workshop.name} as ${role.label}. All operational actions are disabled.`);
    await this.load();
  }

  triggerReadOnlyNotice(pageId: string) {
    this.readOnlyNotice.set(`This action is disabled in Platform Live View for screen [${pageId}]. Super Admin is inspecting in read-only mode.`);
  }

  chooseDomain(controlDomain: PlatformControlDomain, controlKey: string) {
    this.patchControl({ controlDomain, controlKey });
    this.impact.set(null);
  }

  preset(controlDomain: PlatformControlDomain, controlKey: string, controlType: PlatformControlType, value: PlatformControlRequestDto["value"]) {
    this.patchControl({ controlDomain, controlKey, controlType, value, confirmed: false });
    this.impact.set(null);
  }

  patchControl(patch: Partial<PlatformControlRequestDto>) {
    this.controlDraft.set({ ...this.controlDraft(), ...patch });
  }

  async previewControl() {
    const draft = this.normalizedControlDraft();
    const preview = await firstValueFrom(this.api.post<PlatformImpactPreviewDto>("/platform/control/preview", draft));
    this.impact.set(preview);
  }

  async applyControl() {
    const draft = this.normalizedControlDraft();
    if (!draft.confirmed) {
      this.error.set("Please check the confirmation box before applying high-risk control policy.");
      return;
    }
    await firstValueFrom(this.api.post("/platform/control/apply", draft));
    this.message.set("Platform control policy applied and audited with rollback path.");
    this.impact.set(null);
    await this.load();
  }

  async rollbackControl(policyId: string) {
    await firstValueFrom(this.api.post("/platform/control/rollback", { policyId, reason: "Rollback requested by Super Admin.", confirmed: true }));
    this.message.set("Control policy rolled back successfully.");
    await this.load();
  }

  statusBadgeClass(status: PlatformWorkshopStatus) {
    if (status === "active") return "bg-emerald-950 text-emerald-300 border border-emerald-800";
    if (status === "trial" || status === "pending_setup") return "bg-amber-950 text-amber-300 border border-amber-800";
    if (status === "read_only") return "bg-sky-950 text-sky-300 border border-sky-800";
    return "bg-rose-950 text-rose-300 border border-rose-800";
  }

  healthBadgeClass(status: string) {
    if (status === "healthy") return "bg-emerald-950 text-emerald-300 border-emerald-800";
    if (status === "watch") return "bg-amber-950 text-amber-300 border-amber-800";
    return "bg-rose-950 text-rose-300 border-rose-800";
  }

  riskBoxClass(risk: string) {
    if (risk === "low") return "bg-emerald-950/40 text-emerald-300 border-emerald-800";
    if (risk === "medium") return "bg-amber-950/40 text-amber-300 border-amber-800";
    return "bg-rose-950/40 text-rose-300 border-rose-800";
  }

  numberValue(value: unknown) {
    return Number(value || 0);
  }

  private normalizedControlDraft(): PlatformControlRequestDto {
    const draft = this.controlDraft();
    return {
      ...draft,
      targetId: draft.targetType === "tenant" ? draft.targetId || this.workshops()[0]?.id : draft.targetId,
      confirmed: Boolean(draft.confirmed)
    };
  }

  private emptyAddDraft(): PlatformAddWorkshopOwnerDto {
    return {
      workshopName: "",
      ownerFullName: "",
      ownerEmail: "",
      ownerPhone: "",
      country: "Egypt",
      city: "Cairo",
      businessType: "Car Service Center",
      initialCategory: "Cars",
      initialPackage: "Starter",
      branchesAllowed: 1,
      usersAllowed: 10,
      enableDemoData: true,
      starterTemplate: "mop-standard-workshop",
      status: "trial"
    };
  }

  private emptyControlDraft(): PlatformControlRequestDto {
    return {
      targetType: "tenant",
      targetId: "",
      controlDomain: "module",
      controlKey: "inventory_management",
      controlType: "hard_disable",
      value: false,
      reason: "",
      confirmed: false
    };
  }
}
