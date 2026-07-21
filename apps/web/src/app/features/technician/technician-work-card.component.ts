import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, signal, computed } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import type { DiagnosticCodeSuggestionDto, InventoryItemDto, TechnicianIssuedPartDto, TechnicianWorkCardDto } from "@mop/shared";
import { firstValueFrom } from "rxjs";
import { ApiClient } from "../../core/api/api-client.service";
import { TechnicianMobileNavComponent } from "./technician-mobile-nav.component";
import type { WorkCardPanel } from "./technician.types";
import { getLifecycleStage, LIFECYCLE_STAGES, type LifecycleStageInfo } from "./technician-lifecycle.util";

interface SellableItemDto {
  id: string;
  name: string;
  type: "service" | "part" | "labor" | "package";
  description?: string;
  basePrice: number;
  approvalRequired: boolean;
  stock?: number;
}

@Component({
  selector: "mop-technician-work-card",
  standalone: true,
  imports: [CommonModule, FormsModule, TechnicianMobileNavComponent],
  template: `
    <section class="min-h-screen bg-slate-50 font-sans pb-28">
      <!-- Sticky Context Header -->
      <header *ngIf="card()?.job as job" class="sticky top-0 z-30 bg-slate-900 px-4 py-4 text-white shadow-md">
        <div class="mx-auto max-w-6xl">
          <div class="flex items-start justify-between">
            <div>
              <div class="flex items-center gap-2">
                <span class="rounded bg-slate-800 px-2 py-0.5 text-xs font-black tracking-wider text-slate-300">{{ job.workOrderNumber }}</span>
                <span class="rounded bg-red-600 px-2 py-0.5 text-xs font-black tracking-wider text-white">{{ job.priority }}</span>
              </div>
              <h1 class="mt-1 text-2xl font-black tracking-tight">{{ job.assetName }} — {{ job.assetIdentifier }}</h1>
              <p class="mt-0.5 text-sm font-medium text-slate-400">{{ job.taskTitle }}</p>
            </div>
            <span class="inline-flex rounded-lg bg-red-600 px-3 py-1.5 text-sm font-black text-white shadow-sm">{{ job.status }}</span>
          </div>

          <!-- Vehicle Lifecycle Tracker Strip -->
          <div class="mt-4 border-t border-slate-800 pt-3">
            <div class="flex items-center justify-between overflow-x-auto py-1 -mx-2 px-2 hide-scrollbar snap-x">
              <div *ngFor="let stageName of lifecycleStages; let idx = idx" class="flex items-center gap-1 shrink-0 snap-start">
                <span class="rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider"
                  [ngClass]="idx === lifecycleInfo().index ? 'bg-red-600 text-white' : (idx < lifecycleInfo().index ? 'bg-slate-800 text-slate-400' : 'bg-slate-900 text-slate-600')">
                  {{ stageName }}
                </span>
                <span *ngIf="idx < lifecycleStages.length - 1" class="text-slate-700 font-bold text-xs mx-0.5">→</span>
              </div>
            </div>
          </div>
          
          <!-- Next Required Action bar -->
          <div class="mt-3 flex items-center justify-between rounded-lg bg-red-600 px-4 py-3 shadow-inner">
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-red-200 block">Next Action Stage: {{ lifecycleInfo().stage }}</span>
              <span class="text-sm font-black text-white">{{ lifecycleInfo().nextAction }}</span>
            </div>
            <span *ngIf="lifecycleInfo().blockedBy" class="rounded bg-black/30 px-2.5 py-1 text-xs font-black uppercase text-red-100 border border-red-400">
              Blocked: {{ lifecycleInfo().blockedBy }}
            </span>
          </div>
        </div>
      </header>

      <div class="mx-auto max-w-6xl px-4 pt-4">
        <!-- Horizontal Tool Ribbon -->
        <div class="flex overflow-x-auto pb-4 -mx-4 px-4 snap-x hide-scrollbar">
          <div class="flex gap-2 snap-start">
            <button *ngFor="let action of actions" 
              class="flex flex-col items-center justify-center rounded-xl min-w-[88px] p-3 transition-colors border-2"
              [ngClass]="panel() === action.id ? 'bg-red-50 border-red-600 text-red-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'" 
              (click)="open(action.id)">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" [innerHTML]="action.svgPath"></svg>
              <div class="mt-2 text-[11px] font-bold uppercase tracking-wider text-center leading-tight" [ngClass]="panel() === action.id ? 'text-red-900 font-black' : 'text-slate-700'">{{ action.label }}</div>
            </button>
          </div>
        </div>

        <!-- Feedback alert message box -->
        <div *ngIf="actionMessage()" class="mt-2 mb-4 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3 text-emerald-800 shadow-sm animate-fade-in">
          <svg xmlns="http://www.w3.org/2000/svg" class="shrink-0 mt-0.5 text-emerald-600" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
          <span class="text-sm font-bold">{{ actionMessage() }}</span>
        </div>

        <!-- Main Panel Content -->
        <section class="mt-2">
          <ng-container [ngSwitch]="panel()">
            
            <!-- INSPECT (Full Checklist) -->
            <div *ngSwitchCase="'inspect'">
              <div class="mb-4">
                <h2 class="text-2xl font-black text-slate-900">Full Inspection</h2>
                <p class="text-sm font-medium text-slate-500">Conduct deep category-based diagnostic checks.</p>
              </div>

              <div class="grid gap-4 md:grid-cols-2">
                <article *ngFor="let system of checklistSystems()" class="rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm">
                  <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-black text-slate-900">{{ system }}</h3>
                    <button class="rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-xs font-black text-red-700 active:bg-red-100" (click)="setChecklistState(system, 'OK')">Mark OK</button>
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <button *ngFor="let state of checklistStates" 
                      class="rounded-xl border-2 py-2 text-sm font-bold transition-colors" 
                      [ngClass]="checklistSelection(system) === state ? 'border-red-600 bg-red-50 text-red-800' : 'border-slate-100 bg-slate-50 text-slate-600'" 
                      (click)="setChecklistState(system, state)">
                      {{ state }}
                    </button>
                  </div>
                </article>
              </div>
              <button class="mt-6 w-full rounded-xl bg-red-600 py-4 text-center text-lg font-black text-white active:bg-red-700 shadow-md transition-colors" (click)="saveFullCheck()">
                Submit Full Inspection
              </button>
            </div>

            <!-- QUICK INSPECTION (Triage flow) -->
            <div *ngSwitchCase="'quick'">
              <div class="mb-4">
                <h2 class="text-2xl font-black text-slate-900">Quick Inspection (Triage)</h2>
                <p class="text-sm font-medium text-slate-500">Initial vehicle assessment upon bay entry.</p>
              </div>

              <div class="space-y-4 rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm">
                <!-- Complaint Confirmation -->
                <div>
                  <label class="mb-1.5 block text-sm font-bold text-slate-700">Customer Complaint Confirmed?</label>
                  <div class="grid grid-cols-2 gap-3">
                    <button class="rounded-xl border-2 py-3 text-base font-black transition-colors" [ngClass]="complaintConfirmed() ? 'border-red-600 bg-red-50 text-red-800' : 'border-slate-200 bg-slate-50 text-slate-600'" (click)="complaintConfirmed.set(true)">Yes, Confirmed</button>
                    <button class="rounded-xl border-2 py-3 text-base font-black transition-colors" [ngClass]="!complaintConfirmed() ? 'border-red-600 bg-red-50 text-red-800' : 'border-slate-200 bg-slate-50 text-slate-600'" (click)="complaintConfirmed.set(false)">No Issue Found</button>
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="mb-1.5 block text-sm font-bold text-slate-700">Odometer / Hours</label>
                    <input class="block w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-base font-bold focus:border-red-500 focus:bg-white focus:ring-0" type="number" [(ngModel)]="quickOdometer" />
                  </div>
                  <div>
                    <label class="mb-1.5 block text-sm font-bold text-slate-700">Visual Condition</label>
                    <select class="block w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-base font-bold focus:border-red-500 focus:bg-white focus:ring-0" [(ngModel)]="quickVisual">
                      <option>Good</option><option>Fair</option><option>Needs Attention</option><option>Damaged</option>
                    </select>
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="mb-1.5 block text-sm font-bold text-slate-700">Warning Lights On?</label>
                    <div class="grid grid-cols-2 gap-2">
                      <button class="rounded-xl border py-2 text-sm font-bold" [ngClass]="quickWarnings() ? 'bg-red-600 text-white border-red-600' : 'bg-slate-50 text-slate-600 border-slate-200'" (click)="quickWarnings.set(true)">Yes</button>
                      <button class="rounded-xl border py-2 text-sm font-bold" [ngClass]="!quickWarnings() ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-600 border-slate-200'" (click)="quickWarnings.set(false)">No</button>
                    </div>
                  </div>
                  <div>
                    <label class="mb-1.5 block text-sm font-bold text-slate-700">Fluid Leak Visible?</label>
                    <div class="grid grid-cols-2 gap-2">
                      <button class="rounded-xl border py-2 text-sm font-bold" [ngClass]="quickLeaks() ? 'bg-red-600 text-white border-red-600' : 'bg-slate-50 text-slate-600 border-slate-200'" (click)="quickLeaks.set(true)">Yes</button>
                      <button class="rounded-xl border py-2 text-sm font-bold" [ngClass]="!quickLeaks() ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-600 border-slate-200'" (click)="quickLeaks.set(false)">No</button>
                    </div>
                  </div>
                </div>

                <div>
                  <label class="mb-1.5 block text-sm font-bold text-slate-700">Technician Quick Note</label>
                  <textarea class="block w-full min-h-[80px] rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-base font-medium focus:border-red-500 focus:bg-white focus:ring-0" placeholder="Observations..." [(ngModel)]="quickTechNote"></textarea>
                </div>

                <!-- Next Recommended Step (Downstream Lifecycle Triggers) -->
                <div class="border-t-2 border-slate-100 pt-4">
                  <label class="mb-1.5 block text-sm font-black text-slate-900">Recommended Next Step (Outputs)</label>
                  <select class="block w-full rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-base font-black text-red-950 focus:border-red-500 focus:bg-white focus:ring-0" [(ngModel)]="quickNextStep">
                    <option value="none">No issue found</option>
                    <option value="quick_service">Proceed to quick service</option>
                    <option value="fault">Create fault</option>
                    <option value="full_inspection">Full inspection required</option>
                    <option value="pos">Add service/part to quotation</option>
                    <option value="customer">Ask customer approval</option>
                    <option value="blocker">Report blocker</option>
                  </select>
                </div>

                <button class="w-full rounded-xl bg-red-600 py-4 text-center text-lg font-black text-white active:bg-red-700 shadow-md transition-colors" (click)="submitQuickInspection()">
                  Submit Quick Inspection & Execute Effect
                </button>
              </div>
            </div>

            <!-- CODES -->
            <div *ngSwitchCase="'codes'">
              <div class="mb-4">
                <h2 class="text-2xl font-black text-slate-900">Computer Codes</h2>
                <p class="text-sm font-medium text-slate-500">Lookup OBD codes for quick diagnosis.</p>
              </div>
              <div class="flex gap-2">
                <input class="block w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-lg font-black uppercase placeholder:text-slate-300 focus:border-red-500 focus:ring-0" placeholder="E.G. P0301" [(ngModel)]="diagnosticInput" />
                <button class="rounded-xl bg-red-600 px-6 font-black text-white active:bg-red-700" (click)="loadCode()">Lookup</button>
              </div>
              
              <article *ngIf="diagnostic() as code" class="mt-6 rounded-2xl border-2 border-slate-200 bg-white p-6 shadow-sm">
                <div class="inline-block rounded bg-red-100 px-2 py-1 text-xs font-black uppercase tracking-wider text-red-800">{{ code.system }}</div>
                <h3 class="mt-2 text-3xl font-black text-slate-900">{{ code.code }}</h3>
                <p class="mt-1 text-lg font-bold text-slate-600">{{ code.possibleIssue }}</p>
                
                <div class="mt-6 grid gap-4 md:grid-cols-2">
                  <div class="rounded-xl bg-slate-50 p-4 border border-slate-100">
                    <div class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Checks</div>
                    <div class="font-medium text-slate-900">{{ code.suggestedChecks.join(" / ") }}</div>
                  </div>
                  <div class="rounded-xl bg-slate-50 p-4 border border-slate-100">
                    <div class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Fix</div>
                    <div class="font-medium text-slate-900">{{ code.suggestedFix }}</div>
                  </div>
                </div>
                
                <div class="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <button class="rounded-xl bg-red-600 py-3 text-sm font-black text-white" (click)="recordAction('diagnostic_code.added', 'Code saved to history.')">Save to History</button>
                  <button class="rounded-xl border-2 border-slate-200 bg-white py-3 text-sm font-black text-slate-700" (click)="openFaultFromCode()">Create Fault</button>
                  <button class="rounded-xl border-2 border-red-200 bg-red-50 py-3 text-sm font-black text-red-700" (click)="open('parts')">Add Part</button>
                  <button class="rounded-xl border-2 border-orange-200 bg-orange-50 py-3 text-sm font-black text-orange-700" (click)="open('customer')">Ask Customer</button>
                </div>
              </article>
              
              <div class="mt-6">
                <p class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Sample Codes</p>
                <div class="flex flex-wrap gap-2">
                  <button *ngFor="let sample of diagnosticSamples()" class="rounded-lg bg-slate-200 px-4 py-2 text-sm font-bold text-slate-700 active:bg-slate-300" (click)="diagnosticInput = sample; loadCode()">{{ sample }}</button>
                </div>
              </div>
            </div>

            <!-- SERVICES / POS (Work Order POS) -->
            <div *ngSwitchCase="'pos'">
              <div class="mb-4">
                <h2 class="text-2xl font-black text-slate-900">Services / POS (Work Order POS)</h2>
                <p class="text-sm font-medium text-slate-500">Technician cockpit to add billable work lines to the Work Order (Read-only Catalog).</p>
              </div>

              <!-- POS Catalog -->
              <div class="grid gap-4 md:grid-cols-2">
                <article *ngFor="let item of catalog()" class="rounded-2xl border-2 border-slate-200 bg-white p-5 flex flex-col justify-between shadow-sm">
                  <div>
                    <div class="flex items-center justify-between">
                      <span class="rounded bg-red-50 px-2.5 py-0.5 text-xs font-black uppercase text-red-700">{{ item.type }}</span>
                      <span *ngIf="item.approvalRequired" class="rounded bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700 border border-orange-200">Approval Required</span>
                    </div>
                    <h3 class="mt-3 text-lg font-black text-slate-900">{{ item.name }}</h3>
                    <p class="mt-1 text-sm font-medium text-slate-500">{{ item.description || "No catalog description available." }}</p>
                  </div>

                  <div class="mt-6 border-t border-slate-100 pt-4 flex items-center justify-between">
                    <div>
                      <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Base Price</div>
                      <div class="text-lg font-black text-slate-900">
                        {{ hasPricingPermission() ? (item.basePrice | currency) : 'Price hidden' }}
                      </div>
                    </div>
                    <!-- Technician only uses the catalog; cannot edit it -->
                    <button class="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-black text-white active:bg-red-700 shadow-sm" (click)="addPosItem(item)">
                      Add to WO
                    </button>
                  </div>
                </article>
              </div>
            </div>

            <!-- PARTS -->
            <div *ngSwitchCase="'parts'">
              <div class="mb-4">
                <h2 class="text-2xl font-black text-slate-900">Parts Control</h2>
                <p class="text-sm font-medium text-slate-500">Request parts from warehouse, confirm arrival, or mark used.</p>
              </div>
              
              <div class="relative mb-6">
                <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <svg xmlns="http://www.w3.org/2000/svg" class="text-slate-400" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                </div>
                <input class="block w-full rounded-2xl border-2 border-slate-200 bg-white py-4 pl-11 pr-32 text-base font-bold placeholder:text-slate-400 focus:border-red-500 focus:ring-0" placeholder="Search SKU or name..." />
                <button class="absolute inset-y-2 right-2 flex items-center justify-center rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700" (click)="markAction('Barcode scanner opened.')">
                  <svg xmlns="http://www.w3.org/2000/svg" class="mr-1.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect width="10" height="14" x="7" y="5" rx="1"/></svg>
                  Scan Part
                </button>
              </div>

              <!-- Suggested / Catalog Parts -->
              <h3 class="mt-6 mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">1. Search / Add Part</h3>
              <div class="grid gap-3 md:grid-cols-2">
                <article *ngFor="let part of card()?.suggestedParts" class="rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm">
                  <div class="flex items-start justify-between">
                    <div>
                      <h4 class="text-lg font-black text-slate-900">{{ part.name }}</h4>
                      <div class="mt-0.5 text-sm font-medium text-slate-500">{{ part.sku }} · {{ part.warehouseName }}</div>
                    </div>
                    <span class="inline-flex rounded-md px-2 py-1 text-xs font-bold" [ngClass]="part.stock > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'">
                      Qty: {{ part.stock }}
                    </span>
                  </div>
                  <div class="mt-4 grid grid-cols-2 gap-2">
                    <button class="rounded-xl bg-red-600 py-2.5 text-sm font-black text-white active:bg-red-700 shadow-sm" (click)="requestPart(part)">Request Part</button>
                    <button class="rounded-xl border-2 border-slate-200 bg-white py-2.5 text-sm font-black text-slate-700 active:bg-slate-50" (click)="markPartUsed(part)">Mark Used</button>
                  </div>
                </article>
              </div>

              <!-- Active Requests & Dispatches (Strict workflow states) -->
              <h3 class="mt-8 mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">2. Active Requests, Issued & Arrived</h3>
              <div class="grid gap-3 md:grid-cols-2">
                
                <!-- Requested Parts (Pending) -->
                <article *ngFor="let request of card()?.partRequests" class="rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm">
                  <div class="flex items-start justify-between">
                    <div>
                      <h4 class="font-black text-slate-900">{{ request.itemName }}</h4>
                      <div class="text-sm font-medium text-slate-500">Qty Requested: {{ request.qty }}</div>
                    </div>
                    <span class="rounded bg-slate-100 px-2.5 py-1 text-xs font-black uppercase text-slate-600 border border-slate-200">
                      {{ request.status }}
                    </span>
                  </div>
                </article>
                
                <!-- Issued / Arrived / Received Parts -->
                <article *ngFor="let part of arrivedOrReceivedParts()" class="rounded-2xl border-2 border-red-200 bg-red-50/50 p-4 shadow-sm">
                  <div class="flex items-start justify-between mb-3">
                    <div>
                      <h4 class="font-black text-red-950">{{ part.itemName }}</h4>
                      <div class="text-sm font-bold text-red-700">Qty Issued: {{ part.qty }}</div>
                    </div>
                    <span class="rounded bg-red-100 px-2.5 py-1 text-xs font-black uppercase text-red-800 border border-red-300">
                      {{ part.status }}
                    </span>
                  </div>
                  
                  <button *ngIf="part.status === 'arrived' || part.status === 'on_the_way'" class="w-full rounded-xl bg-red-600 py-2.5 text-sm font-black text-white active:bg-red-700 shadow-sm" (click)="confirmArrived(part)">
                    Confirm Arrived
                  </button>
                  
                  <div *ngIf="part.status === 'received'" class="grid grid-cols-2 gap-2">
                    <button class="rounded-xl bg-red-600 py-2.5 text-sm font-black text-white active:bg-red-700 shadow-sm" (click)="markIssuedPartUsed(part)">Mark Installed</button>
                    <button class="rounded-xl bg-white border-2 border-red-200 py-2.5 text-sm font-black text-red-700 active:bg-red-50" (click)="openReturn(part)">Return Unused</button>
                  </div>
                </article>

                <div *ngIf="!card()?.partRequests?.length && !arrivedOrReceivedParts().length" class="col-span-2 rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center text-sm font-bold text-slate-400">
                  No active parts requests or dispatches.
                </div>
              </div>

              <!-- Return Form (Inline action) -->
              <div *ngIf="returnPart()" class="mt-6 rounded-2xl border-2 border-slate-800 bg-slate-900 p-5 text-white shadow-lg">
                <h3 class="text-lg font-black text-white mb-4">Return {{ returnPart()?.itemName }} to Stock</h3>
                <div class="grid gap-4 md:grid-cols-2">
                  <div>
                    <label class="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Reason</label>
                    <select class="w-full rounded-xl border-none bg-slate-800 py-3 text-white focus:ring-2 focus:ring-red-500" [(ngModel)]="returnReason">
                      <option>Wrong part</option><option>Not needed anymore</option><option>Part damaged</option><option>Other</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Condition</label>
                    <select class="w-full rounded-xl border-none bg-slate-800 py-3 text-white focus:ring-2 focus:ring-red-500" [(ngModel)]="returnCondition">
                      <option>Good / Unopened</option><option>Opened</option><option>Damaged</option>
                    </select>
                  </div>
                </div>
                <div class="mt-4 flex gap-2">
                  <button class="flex-1 rounded-xl bg-red-600 py-3 text-sm font-black text-white active:bg-red-700" (click)="submitReturn()">Submit Return Request</button>
                  <button class="rounded-xl bg-slate-800 px-4 py-3 text-sm font-bold text-white active:bg-slate-700" (click)="returnPart.set(null)">Cancel</button>
                </div>
              </div>
            </div>

            <!-- ASK CUSTOMER -->
            <div *ngSwitchCase="'customer'">
              <div class="mb-4">
                <h2 class="text-2xl font-black text-slate-900">Ask Customer</h2>
                <p class="text-sm font-medium text-slate-500">Create and send approval decisions directly to the customer portal.</p>
              </div>
              
              <div class="rounded-2xl border-2 border-slate-200 bg-white p-5 space-y-4 shadow-sm">
                <div>
                  <label class="mb-1.5 block text-sm font-bold text-slate-700">Service / Title</label>
                  <input class="block w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-base font-bold focus:border-red-500 focus:bg-white focus:ring-0" placeholder="E.g., Replace Brake Pads" [(ngModel)]="decisionTitle" />
                </div>
                <div>
                  <label class="mb-1.5 block text-sm font-bold text-slate-700">Customer Explanation</label>
                  <textarea class="block w-full min-h-[100px] rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-base font-medium focus:border-red-500 focus:bg-white focus:ring-0" placeholder="Why does the vehicle need this?" [(ngModel)]="decisionExplanation"></textarea>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="mb-1.5 block text-sm font-bold text-slate-700">Importance / Category</label>
                    <select class="block w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-base font-bold focus:border-red-500 focus:bg-white focus:ring-0" [(ngModel)]="decisionImportance">
                      <option value="normal">Normal</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical (Safety Alert)</option>
                    </select>
                  </div>
                  <div>
                    <label class="mb-1.5 block text-sm font-bold text-slate-700">Estimated Price</label>
                    <input class="block w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-base font-bold focus:border-red-500 focus:bg-white focus:ring-0" type="number" [(ngModel)]="decisionPrice" />
                  </div>
                </div>
                
                <div *ngIf="decisionImportance === 'critical'" class="rounded-xl bg-red-50 p-4 border border-red-200 animate-pulse">
                  <label class="mb-1.5 block text-sm font-black text-red-700">Safety Warning Message (Required)</label>
                  <textarea class="block w-full min-h-[80px] rounded-xl border-2 border-red-300 bg-white px-4 py-3 text-base font-medium text-red-900 focus:border-red-500 focus:ring-0" placeholder="Explain the risk if rejected..." [(ngModel)]="decisionWarning"></textarea>
                </div>
                
                <p *ngIf="decisionError()" class="rounded-xl bg-red-100 p-3 text-sm font-bold text-red-800">{{ decisionError() }}</p>
                
                <div class="pt-4 border-t-2 border-slate-100 grid gap-3 sm:grid-cols-2 mt-2">
                  <button class="rounded-xl bg-red-600 py-3.5 text-base font-black text-white active:bg-red-700 shadow-md" (click)="createDecisionFromCard()">Send Approval Request</button>
                  <button class="rounded-xl bg-slate-100 py-3.5 text-base font-black text-slate-700 active:bg-slate-200" (click)="markAction('Draft decision request saved.')">Draft Request</button>
                </div>
              </div>

              <h3 class="mt-8 mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">Pending Customer Decisions</h3>
              <div class="grid gap-3">
                <article *ngFor="let request of card()?.pendingDecisions" class="rounded-2xl border-2 border-orange-200 bg-orange-50/50 p-4 flex items-center justify-between shadow-sm">
                  <div>
                    <div class="font-black text-orange-950">{{ request.workOrderNumber }}</div>
                    <div class="text-sm font-bold text-orange-700 mt-0.5">{{ request.items.length }} decisions pending</div>
                  </div>
                  <span class="rounded bg-orange-200 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-orange-900 border border-orange-300">{{ request.status }}</span>
                </article>
                <div *ngIf="!card()?.pendingDecisions?.length" class="rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center text-sm font-bold text-slate-400">
                  No decisions pending.
                </div>
              </div>
            </div>

            <!-- BLOCKER -->
            <div *ngSwitchCase="'blocker'">
              <div class="mb-4">
                <h2 class="text-2xl font-black text-red-600">Report Blocker</h2>
                <p class="text-sm font-medium text-slate-500">Raise blocker to stop the clock and notify the Team Leader.</p>
              </div>
              
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                <button *ngFor="let reason of blockerReasons" 
                  class="rounded-xl border-2 p-4 text-center transition-colors shadow-sm"
                  [ngClass]="selectedBlockerReason() === reason ? 'border-red-600 bg-red-50 text-red-900 font-black' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'"
                  (click)="selectedBlockerReason.set(reason)">
                  <span class="text-sm font-bold">{{ reason }}</span>
                </button>
              </div>
              
              <div class="rounded-2xl border-2 border-slate-200 bg-white p-5 space-y-4 shadow-sm">
                <div>
                  <label class="mb-1.5 block text-sm font-bold text-slate-700">Detailed Blocker Description</label>
                  <textarea class="block w-full min-h-[120px] rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-base font-medium focus:border-red-500 focus:bg-white focus:ring-0" placeholder="Provide notes..." [(ngModel)]="blockerDetails"></textarea>
                </div>
                <button class="w-full rounded-xl bg-red-600 py-4 text-lg font-black text-white active:bg-red-700 shadow-md transition-colors" (click)="reportBlocker()">
                  Submit & Stop Task Time
                </button>
              </div>
            </div>

            <!-- NOTES -->
            <div *ngSwitchCase="'note'">
              <div class="mb-4">
                <h2 class="text-2xl font-black text-slate-900">Notes</h2>
                <p class="text-sm font-medium text-slate-500">Add internal context or customer-facing progress notes.</p>
              </div>
              
              <div class="flex rounded-xl bg-slate-200 p-1 mb-4">
                <button class="flex-1 rounded-lg py-3 text-sm font-bold transition-all" [ngClass]="noteType() === 'internal' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600'" (click)="noteType.set('internal')">Internal Staff Only</button>
                <button class="flex-1 rounded-lg py-3 text-sm font-bold transition-all" [ngClass]="noteType() === 'customer' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600'" (click)="noteType.set('customer')">Customer Portal Visible</button>
              </div>
              
              <div class="rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm">
                <textarea class="block w-full min-h-[160px] rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-base font-medium focus:border-red-500 focus:bg-white focus:ring-0" placeholder="Write updates..." [(ngModel)]="techNoteText"></textarea>
                <button class="mt-4 w-full rounded-xl bg-red-600 py-3.5 text-base font-black text-white active:bg-red-700" (click)="saveNote()">Save Note</button>
              </div>
            </div>

            <!-- HISTORY -->
            <div *ngSwitchCase="'history'">
              <div class="mb-4">
                <h2 class="text-2xl font-black text-slate-900">Technical Timeline</h2>
                <p class="text-sm font-medium text-slate-500">Audit trail of operations on this vehicle.</p>
              </div>
              
              <div class="relative border-l-2 border-red-200 ml-4 pl-6 space-y-8 py-4">
                <article *ngFor="let event of card()?.history" class="relative">
                  <div class="absolute -left-[35px] top-1 h-4 w-4 rounded-full bg-red-600 border-4 border-slate-50"></div>
                  <h4 class="text-base font-black text-slate-900">{{ event.title }}</h4>
                  <p class="mt-1 text-sm font-medium text-slate-600">{{ event.message }}</p>
                  
                  <div *ngIf="event.decisionRequest" class="mt-3 rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
                    <div class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Decisions Recorded</div>
                    <div class="space-y-2">
                      <div *ngFor="let item of event.decisionRequest.items" class="flex items-center justify-between text-sm">
                        <span class="font-bold text-slate-700">{{ item.title }}</span>
                        <span class="font-black" [ngClass]="item.decisionStatus === 'APPROVED' ? 'text-emerald-600' : 'text-red-600'">{{ item.decisionStatus }}</span>
                      </div>
                    </div>
                  </div>
                </article>
              </div>
              
              <div *ngIf="!card()?.history?.length" class="rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center text-sm font-bold text-slate-400">
                No recorded operations history.
              </div>
            </div>

            <!-- FINISH (Finish Gate Validation) -->
            <div *ngSwitchCase="'finish'">
              <div class="mb-4">
                <h2 class="text-2xl font-black text-slate-900">Finish Gate</h2>
                <p class="text-sm font-medium text-slate-500">Strict checks required to complete the repair assignment.</p>
              </div>
              
              <div class="rounded-2xl border-2 border-slate-200 bg-white overflow-hidden mb-6 shadow-sm">
                <div *ngFor="let check of finishCheckList(); let last = last" class="flex items-center justify-between p-4" [ngClass]="{'border-b-2 border-slate-100': !last}">
                  <div class="flex items-center gap-3">
                    <div class="flex h-6 w-6 items-center justify-center rounded-full" [ngClass]="check.ok ? 'bg-emerald-100 text-emerald-600' : (check.severity === 'danger' ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-slate-100 text-slate-400')">
                      <svg *ngIf="check.ok" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                      <svg *ngIf="!check.ok" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                    </div>
                    <span class="text-sm font-bold" [ngClass]="check.ok ? 'text-slate-900' : 'text-slate-500'">{{ check.label }}</span>
                  </div>
                  <button *ngIf="!check.ok" class="rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-xs font-black text-red-700 active:bg-red-100" (click)="fixFinishCheck(check.target)">Fix</button>
                </div>
              </div>

              <!-- Gate Error Warning Banner -->
              <div *ngIf="finishBlocked()" class="mb-4 rounded-xl border-2 border-red-200 bg-red-50 p-4 text-red-950">
                <div class="font-black text-red-700 flex items-center gap-1.5 mb-1 text-sm uppercase tracking-wide">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                  Finish Gate Blocked
                </div>
                <ul class="list-disc list-inside text-sm font-semibold space-y-1">
                  <li *ngFor="let check of getPendingChecks()">{{ check.warning }}</li>
                </ul>
              </div>
              
              <button class="w-full rounded-xl py-4 text-lg font-black transition-colors shadow-md" [ngClass]="finishBlocked() ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-red-600 text-white active:bg-red-700'" (click)="finishTask()">
                {{ finishBlocked() ? "Fix pending items to complete" : finishButtonLabel() }}
              </button>
            </div>

            <!-- REWORK (QC returned) -->
            <div *ngSwitchCase="'rework'">
              <div class="mb-4">
                <h2 class="text-2xl font-black text-red-600">Rework Requested</h2>
                <p class="text-sm font-medium text-slate-500">Correction items required by QC or Team Leader.</p>
              </div>
              
              <div class="grid gap-4">
                <article *ngFor="let feedback of card()?.reworkFeedback" class="rounded-2xl border-2 border-red-200 bg-red-50 p-5 shadow-sm">
                  <div class="text-xs font-bold uppercase tracking-wider text-red-600 mb-2">Returned By: {{ feedback.returnedBy }}</div>
                  <p class="text-base font-bold text-red-900">{{ feedback.reason }}</p>
                  <div class="mt-3 rounded-xl bg-white p-4 border border-red-100 shadow-inner">
                    <div class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1 font-black">Required Fix</div>
                    <div class="font-bold text-slate-900 text-sm">{{ feedback.requiredCorrection }}</div>
                  </div>
                  <div class="mt-4 flex gap-2">
                    <button class="flex-1 rounded-xl bg-red-600 py-3 text-sm font-black text-white active:bg-red-700 shadow-sm" (click)="recordAction('rework.corrected', 'Rework correction completed.')">Mark Completed</button>
                    <button class="rounded-xl bg-white border-2 border-red-200 px-4 py-3 text-sm font-bold text-red-800 active:bg-red-50" (click)="open('note')">Add Note</button>
                  </div>
                </article>
                <div *ngIf="!card()?.reworkFeedback?.length" class="rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center text-sm font-bold text-slate-400">
                  No active rework corrections.
                </div>
              </div>
            </div>

          </ng-container>
        </section>
      </div>
      <mop-technician-nav active="card"></mop-technician-nav>
    </section>
  `,
  styles: [`
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  `]
})
export class TechnicianWorkCardComponent implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly route = inject(ActivatedRoute);
  readonly card = signal<TechnicianWorkCardDto | null>(null);
  readonly panel = signal<WorkCardPanel>("inspect");
  readonly diagnostic = signal<DiagnosticCodeSuggestionDto | null>(null);
  readonly decisionError = signal("");
  readonly actionMessage = signal("");
  readonly quickResult = signal("OK");
  readonly checklistSelections = signal<Record<string, string>>({});
  readonly selectedBlockerReason = signal("Waiting part");
  readonly noteType = signal<"internal" | "customer">("internal");
  readonly returnPart = signal<TechnicianIssuedPartDto | null>(null);

  // Quick Inspection Signal States
  readonly complaintConfirmed = signal(true);
  readonly quickWarnings = signal(false);
  readonly quickLeaks = signal(false);
  quickOdometer = 12000;
  quickVisual = "Good";
  quickTechNote = "";
  quickNextStep = "none";

  // POS / catalog
  readonly catalog = signal<SellableItemDto[]>([]);

  // Form binds
  diagnosticInput = "P0301";
  decisionTitle = "Brake Disc Replacement";
  decisionExplanation = "Brake disc damage may affect vehicle safety and braking stability.";
  decisionImportance: "normal" | "medium" | "high" | "critical" = "critical";
  decisionPrice = 2500;
  decisionWarning = "Rejecting this critical brake repair may affect vehicle safety. Your rejection will be recorded in the service history.";
  returnReason = "Not needed anymore";
  returnCondition = "Good";
  blockerDetails = "";
  techNoteText = "";

  readonly lifecycleStages = LIFECYCLE_STAGES;

  readonly lifecycleInfo = computed<LifecycleStageInfo>(() => {
    return getLifecycleStage(this.card()?.job);
  });

  readonly actions: Array<{ id: WorkCardPanel; svgPath: string; label: string }> = [
    { id: "inspect", svgPath: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', label: "Inspect" },
    { id: "quick", svgPath: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', label: "Quick Insp" },
    { id: "codes", svgPath: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M7 9h10"/><path d="M7 15h10"/>', label: "OBD" },
    { id: "pos", svgPath: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>', label: "Services / POS" },
    { id: "parts", svgPath: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>', label: "Parts" },
    { id: "customer", svgPath: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>', label: "Ask Cust" },
    { id: "blocker", svgPath: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>', label: "Blocker" },
    { id: "note", svgPath: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>', label: "Note" },
    { id: "history", svgPath: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', label: "History" },
    { id: "rework", svgPath: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>', label: "Rework" },
    { id: "finish", svgPath: '<path d="M20 6 9 17l-5-5"/>', label: "Finish" }
  ];

  readonly blockerReasons = ["Waiting part", "Waiting customer", "Need team leader", "Tool missing", "Safety issue", "Unclear diagnosis", "Other"];
  readonly checklistStates = ["OK", "Needs Attention", "Critical", "Not Checked", "Not Applicable"];

  async ngOnInit() {
    const queryParams = this.route.snapshot.queryParamMap;
    const taskId = queryParams.get("taskId");
    const requestedPanel = queryParams.get("panel");
    if (this.isPanel(requestedPanel)) this.panel.set(requestedPanel);
    
    await this.loadPOSCatalog();
    await this.reloadCard();
    this.diagnostic.set(this.card()?.diagnosticCodes?.[0] || null);
  }

  // Check if pricing is visible (technician usually can see basePrice, unless locked/simulated otherwise)
  hasPricingPermission() {
    // Return true for sandbox demo, but can be simulated based on permissions if needed
    return true;
  }

  async loadPOSCatalog() {
    try {
      // Fetch catalog
      const items = await firstValueFrom(this.api.get<any[]>("/finance/catalog"));
      this.catalog.set(items.map(item => ({
        id: item.id,
        name: item.name,
        type: item.type.toLowerCase(),
        description: item.description,
        basePrice: Number(item.basePrice),
        approvalRequired: item.approvalRequired
      })));
    } catch {
      // Fallback list of predefined workshop items (Technician can use them, but not edit)
      this.catalog.set([
        { id: "pos_insp_01", name: "Quick Diagnostic Service", type: "service", basePrice: 150, approvalRequired: false },
        { id: "pos_insp_02", name: "Full Electrical Scan", type: "service", basePrice: 350, approvalRequired: true },
        { id: "pos_maint_01", name: "Tire Rotation & Balance", type: "service", basePrice: 200, approvalRequired: false },
        { id: "pos_maint_02", name: "Brake Pad Installation Labor", type: "labor", basePrice: 300, approvalRequired: false },
        { id: "pos_part_01", name: "Front Brake Pads Set (Cars)", type: "part", basePrice: 1200, approvalRequired: true },
        { id: "pos_part_02", name: "Heavy Duty Air Filter", type: "part", basePrice: 450, approvalRequired: true },
        { id: "pos_pkg_01", name: "Standard Tune-Up Package", type: "package", basePrice: 850, approvalRequired: true }
      ]);
    }
  }

  async addPosItem(item: SellableItemDto) {
    const job = this.card()?.job;
    if (!job) return;

    this.markAction(`Added ${item.name} to draft list.`);

    // If item requires customer approval, create draft customer decision
    if (item.approvalRequired) {
      try {
        await firstValueFrom(
          this.api.post("/customer-decisions", {
            workOrderId: job.workOrderId,
            taskId: job.taskId,
            source: "technician_task",
            items: [{
              title: item.name,
              customerExplanation: `Technician recommended during repair: ${item.description || item.name}`,
              importance: "normal",
              estimatedPrice: Number(item.basePrice || 0),
              quantity: 1,
              unitPrice: Number(item.basePrice || 0),
              laborPrice: item.type === "service" ? 50 : 0
            }]
          })
        );
        this.markAction(`Decision created for ${item.name}. Approvals updated.`);
      } catch {
        this.markAction(`Pre-saved decision draft for ${item.name}.`);
      }
    } else {
      // Direct part or service action timeline log
      if (item.type === "part") {
        await this.recordAction("part.requested", `Requested Part: ${item.name}`, { itemId: item.id, qty: 1 });
      } else {
        await this.recordAction("note.created", `Added Service: ${item.name}`);
      }
    }
    await this.reloadCard();
  }

  // Submit Quick Inspection (Triage flow)
  async submitQuickInspection() {
    this.markAction("Quick inspection submitted.");
    await this.recordAction("inspection.saved", "Quick Inspection completed.", {
      complaintConfirmed: this.complaintConfirmed(),
      odometer: this.quickOdometer,
      visual: this.quickVisual,
      warnings: this.quickWarnings(),
      leaks: this.quickLeaks(),
      note: this.quickTechNote,
      nextStep: this.quickNextStep
    });

    // Submitting submitted check effect
    const nextPanel = this.quickNextStep;
    if (nextPanel === "fault") {
      this.open("inspect"); // Go to full inspection/faults
    } else if (nextPanel !== "none" && this.isPanel(nextPanel)) {
      if (nextPanel === "customer") {
        this.decisionTitle = `Inspection Recommendation - ${this.quickTechNote || 'Repair Request'}`;
        this.decisionExplanation = `Diagnostic observations check: ${this.quickVisual} visual. Warnings: ${this.quickWarnings() ? 'Yes' : 'No'}. Notes: ${this.quickTechNote}`;
        this.open("customer");
      } else if (nextPanel === "blocker") {
        this.blockerDetails = `Inspection triage blocker: ${this.quickTechNote}`;
        this.open("blocker");
      } else {
        this.open(nextPanel);
      }
    } else {
      this.open("finish");
    }
    await this.reloadCard();
  }

  open(panel: WorkCardPanel) {
    this.panel.set(panel);
    this.actionMessage.set("");
  }

  markAction(message: string) {
    this.actionMessage.set(message);
  }

  async recordAction(action: string, message: string, related?: unknown) {
    this.actionMessage.set(message);
    const job = this.card()?.job;
    if (!job) return;
    try {
      await firstValueFrom(
        this.api.post("/technician/action", {
          taskId: job.taskId,
          action,
          detail: message,
          related
        })
      );
    } catch {
      this.actionMessage.set(`${message} Local preview saved.`);
    }
  }

  selectQuickResult(result: string) {
    this.quickResult.set(result);
  }

  saveQuickCheck() {
    void this.recordAction("inspection.saved", `Quick check saved: ${this.quickResult()}`, { result: this.quickResult() });
  }

  checklistSelection(system: string) {
    return this.checklistSelections()[system];
  }

  setChecklistState(system: string, state: string) {
    this.checklistSelections.set({ ...this.checklistSelections(), [system]: state });
  }

  async loadCode() {
    this.diagnostic.set(await firstValueFrom(this.api.get<DiagnosticCodeSuggestionDto>(`/technician/diagnostic-code?code=${encodeURIComponent(this.diagnosticInput)}`)));
    this.markAction(`${this.diagnosticInput.toUpperCase()} loaded.`);
  }

  openFaultFromCode() {
    const code = this.diagnostic();
    if (!code) return;
    this.quickTechNote = `Fault diagnosed from code ${code.code}: ${code.possibleIssue}. Fix recommendation: ${code.suggestedFix}`;
    this.quickNextStep = "fault";
    this.open("quick");
  }

  checklistSystems() {
    const category = this.card()?.job.category;
    if (category === "Motorcycles") return ["Engine", "Chain", "Brakes", "Tires", "Lights", "Clutch", "Sprocket"];
    if (category === "Heavy Equipment") return ["Hydraulic", "Engine", "Safety Lockout", "Hour Meter", "Field Tools", "Seals", "Filters"];
    return ["Engine", "Brakes", "Fluids", "Tires", "Electrical", "Battery", "AC"];
  }

  diagnosticSamples() {
    const category = this.card()?.job.category;
    if (category === "Motorcycles") return ["ECU01"];
    if (category === "Heavy Equipment") return ["HYD01"];
    return ["P0301", "P0420", "P0171"];
  }

  // Detailed Checklist for Finish Gate
  finishCheckList(): Array<{ label: string; ok: boolean; warning: string; target: WorkCardPanel; severity: "warning" | "danger" }> {
    const checks = this.card()?.finishChecks;
    if (!checks) return [];
    return [
      { label: "Full Inspection completed?", ok: checks.inspectionRequiredDone, warning: "Cannot finish: Full/Quick Inspection is incomplete.", target: "inspect", severity: "warning" },
      { label: "Active parts requests resolved?", ok: !checks.partRequestsPending, warning: "Cannot finish: Parts request is still pending warehouse review.", target: "parts", severity: "warning" },
      { label: "Issued parts received?", ok: !checks.issuedPartsNotReceived, warning: "Cannot finish: Parts issued but not received by technician.", target: "parts", severity: "warning" },
      { label: "All received parts resolved?", ok: !checks.receivedPartsNotResolved, warning: "Cannot finish: Parts received but not marked as Used or Returned.", target: "parts", severity: "warning" },
      { label: "Returns accepted by Inventory Manager?", ok: !checks.returnPendingInventoryReview, warning: "Cannot finish: Unused part returns are pending warehouse acceptance.", target: "parts", severity: "danger" },
      { label: "Customer decisions resolved?", ok: !checks.customerDecisionsPending, warning: "Cannot finish: Customer decision approvals are still pending.", target: "customer", severity: "warning" },
      { label: "No open blockers reported?", ok: !checks.blockersOpen, warning: "Cannot finish: Open blocker flags must be resolved.", target: "blocker", severity: "danger" },
      { label: "No critical rejected safety concerns?", ok: !checks.criticalRejectedItemExists, warning: "Cannot finish: A critical safety concern was rejected by the customer.", target: "customer", severity: "danger" }
    ];
  }

  finishBlocked() {
    return this.finishCheckList().some((check) => !check.ok);
  }

  getPendingChecks() {
    return this.finishCheckList().filter(check => !check.ok);
  }

  fixFinishCheck(panel: WorkCardPanel) {
    this.open(panel);
  }

  finishTask() {
    if (this.finishBlocked()) return;
    const action = this.card()?.finishOutcome === "qc" ? "task.sent_to_qc" : "task.sent_to_team_review";
    void this.recordAction(action, `Task sent to ${this.card()?.finishOutcome === "qc" ? "QC" : "Team Review"}.`);
  }

  finishButtonLabel() {
    return this.card()?.finishOutcome === "qc" ? "Send to QC" : "Send to Team Review";
  }

  requestPart(part: InventoryItemDto) {
    void this.recordAction("part.requested", `${part.name} requested.`, { itemId: part.id });
  }

  markPartUsed(part: InventoryItemDto) {
    if (part.stock <= 0) return;
    void this.recordAction("part.marked_used", `${part.name} marked used.`, { itemId: part.id });
  }

  arrivedOrReceivedParts() {
    return (this.card()?.issuedParts || []).filter((part) => part.status === "on_the_way" || part.status === "arrived" || part.status === "received" || part.status === "return_pending");
  }

  async confirmArrived(part: TechnicianIssuedPartDto) {
    await this.recordAction("part.arrived", `${part.itemName} arrival confirmed.`, { issuedItemId: part.id });
    await this.reloadCard();
  }

  async markIssuedPartUsed(part: TechnicianIssuedPartDto) {
    await this.recordAction("part.marked_used", `${part.itemName} marked used.`, { issuedItemId: part.id });
    await this.reloadCard();
  }

  openReturn(part: TechnicianIssuedPartDto) {
    this.returnPart.set(part);
  }

  async submitReturn() {
    const part = this.returnPart();
    if (!part) return;
    await this.recordAction("part.return_requested", `${part.itemName} return requested.`, {
      issuedItemId: part.id,
      reason: this.returnReason,
      condition: this.returnCondition
    });
    this.returnPart.set(null);
    await this.reloadCard();
  }

  reportBlocker() {
    void this.recordAction("blocker.reported", `${this.selectedBlockerReason()}: ${this.blockerDetails || 'No description'}`, {
      reason: this.selectedBlockerReason(),
      details: this.blockerDetails
    });
    this.blockerDetails = "";
  }

  saveNote() {
    const noteAct = this.noteType() === "customer" ? "customer_visible_note.created" : "note.created";
    void this.recordAction(noteAct, this.techNoteText || "Empty note added.");
    this.techNoteText = "";
  }

  saveFullCheck() {
    const checklistStr = Object.entries(this.checklistSelections())
      .map(([sys, val]) => `${sys}: ${val}`)
      .join(", ");
    void this.recordAction("inspection.saved", `Full inspection completed. Systems checked: ${checklistStr || 'None'}`);
  }

  private isPanel(panel: string | null): panel is WorkCardPanel {
    return Boolean(panel && this.actions.some((action) => action.id === panel));
  }

  async createDecisionFromCard() {
    this.decisionError.set("");
    const job = this.card()?.job;
    if (!job) return;
    if (!this.decisionTitle.trim() || !this.decisionExplanation.trim()) {
      this.decisionError.set("Title and explanation are required.");
      return;
    }
    try {
      const created = await firstValueFrom(
        this.api.post<{ id: string }>("/customer-decisions", {
          workOrderId: job.workOrderId,
          taskId: job.taskId,
          source: "technician_task",
          items: [{
            title: this.decisionTitle,
            customerExplanation: this.decisionExplanation,
            importance: this.decisionImportance,
            estimatedPrice: Number(this.decisionPrice || 0),
            criticalWarningRequired: this.decisionImportance === "critical",
            criticalWarningText: this.decisionImportance === "critical" ? this.decisionWarning : undefined
          }]
        })
      );
      await firstValueFrom(this.api.post(`/customer-decisions/${created.id}/send`, {}));
      this.decisionTitle = "";
      this.decisionExplanation = "";
      this.markAction("Decision sent to customer.");
    } catch (e) {
      this.decisionError.set("Permission error: customer decisions requires staff credentials.");
    }
    await this.reloadCard();
  }

  private async reloadCard() {
    const taskId = this.route.snapshot.queryParamMap.get("taskId");
    const query = taskId ? `?taskId=${encodeURIComponent(taskId)}` : "";
    this.card.set(await firstValueFrom(this.api.get<TechnicianWorkCardDto>(`/technician/work-card${query}`)));
  }
}
