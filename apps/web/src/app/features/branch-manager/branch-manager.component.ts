import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import type {
  BranchDeliveryStatusDto,
  BranchDecisionQueueDto,
  BranchIntakeOptionsDto,
  BranchIntakeResultDto,
  BranchManagerHomeDto,
  BranchWorkspaceDto,
  BranchWorkOrdersBoardDto,
  CategoryCode
} from "@mop/shared";
import { BranchManagerApiService } from "../../core/api/branch-manager-api.service";

type BranchPage = "home" | "intake" | "work-orders" | "workspace" | "decisions" | "delivery";

@Component({
  selector: "mop-branch-manager",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="px-5 py-8 lg:px-8">
      <header class="overflow-hidden rounded-lg bg-ink-950 text-white shadow-panel">
        <div class="grid gap-6 p-6 lg:grid-cols-[1.35fr_0.65fr] lg:p-8">
          <div>
            <div class="text-xs font-semibold uppercase text-white/50">Branch Manager</div>
            <h1 class="mt-4 text-3xl font-black tracking-normal lg:text-4xl">Daily operations control</h1>
            <p class="mt-3 max-w-3xl text-sm leading-6 text-white/65">
              One branch-safe layer for customer intake, technician outputs, inventory delays, customer decisions, payment locks, and delivery readiness.
            </p>
          </div>
          <div class="rounded-lg border border-white/10 bg-white/10 p-4">
            <div class="text-sm font-bold text-white/70">Scope</div>
            <div class="mt-2 text-2xl font-black">{{ home()?.branchNames?.join(", ") || "Branch workspace" }}</div>
            <div class="mt-3 text-xs text-white/55">V5 keeps Branch Manager out of technician execution and inventory control.</div>
          </div>
        </div>
      </header>

      <nav class="mt-5 grid gap-2 rounded-lg border border-black/10 bg-white p-2 shadow-sm md:grid-cols-3 xl:grid-cols-6">
        <a *ngFor="let item of nav" [routerLink]="['/' + item.route]" class="rounded-md px-3 py-3 text-center text-sm font-black transition"
          [ngClass]="page() === item.id ? 'bg-ink-950 text-white' : 'bg-black/[0.03] text-ink-700 hover:bg-black/[0.06]'">
          {{ item.label }}
        </a>
      </nav>

      <div *ngIf="loading()" class="mop-panel mt-5 p-8 text-center text-sm font-bold text-ink-500">Loading branch operations...</div>
      <div *ngIf="error()" class="mt-5 rounded-lg border border-signal-red/20 bg-signal-rose p-4 text-sm font-bold text-signal-red">{{ error() }}</div>

      <ng-container [ngSwitch]="page()">
        <section *ngSwitchCase="'home'" class="mt-5 grid gap-5">
          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <a *ngFor="let card of home()?.attentionCards || []" [routerLink]="[card.route]" class="mop-card min-h-36"
              [ngClass]="toneClass(card.tone)">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="text-sm font-black text-ink-700">{{ card.label }}</div>
                  <div class="mt-3 text-4xl font-black">{{ card.count }}</div>
                </div>
                <span class="mop-pill">{{ card.nextAction }}</span>
              </div>
              <div class="mt-4 flex gap-2 text-xs font-bold text-ink-500">
                <span *ngIf="card.overdue">{{ card.overdue }} overdue</span>
                <span *ngIf="card.critical">{{ card.critical }} critical</span>
                <span *ngIf="!card.overdue && !card.critical">Live branch signal</span>
              </div>
            </a>
          </div>

          <div class="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
            <section class="mop-panel p-5">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 class="text-xl font-black">Urgent work orders</h2>
                  <p class="mt-1 text-sm text-ink-500">Exceptions from customer decisions, parts, blockers, and priority.</p>
                </div>
                <a routerLink="/branch-work-orders" class="mop-button-secondary">Open Board</a>
              </div>
              <div class="mt-4 grid gap-3">
                <article *ngFor="let wo of home()?.urgentWorkOrders || []" class="rounded-lg border border-black/10 bg-white p-4">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div class="text-sm font-bold text-signal-red">{{ wo.number }}</div>
                      <h3 class="mt-1 text-lg font-black">{{ wo.customerName }} - {{ wo.assetName }} {{ wo.assetIdentifier }}</h3>
                      <p class="mt-1 text-sm text-ink-500">{{ wo.statusLabel }} - {{ wo.nextAction }}</p>
                    </div>
                    <a [routerLink]="['/branch-workspace']" [queryParams]="{ workOrderId: wo.id }" class="mop-button-primary">Open</a>
                  </div>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <span class="mop-pill">Customer: {{ wo.customerDecisionState }}</span>
                    <span class="mop-pill">Parts: {{ wo.partsState }}</span>
                    <span class="mop-pill">Payment: {{ wo.paymentState }}</span>
                  </div>
                </article>
                <div *ngIf="!home()?.urgentWorkOrders?.length" class="rounded-lg bg-black/[0.04] p-6 text-center text-sm font-bold text-ink-500">No urgent branch exceptions right now.</div>
              </div>
            </section>

            <section class="mop-panel p-5">
              <h2 class="text-xl font-black">Technician load</h2>
              <div class="mt-4 grid gap-3">
                <div *ngFor="let row of home()?.technicianLoad || []" class="rounded-lg bg-black/[0.04] p-4">
                  <div class="flex items-center justify-between gap-3">
                    <div class="font-black">{{ row.technicianName }}</div>
                    <span class="mop-pill">{{ row.activeJobs }} active</span>
                  </div>
                  <div class="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div class="rounded-md bg-white p-3"><b>{{ row.blockedJobs }}</b><div class="text-ink-500">Blocked</div></div>
                    <div class="rounded-md bg-white p-3"><b>{{ row.waitingParts }}</b><div class="text-ink-500">Waiting Parts</div></div>
                  </div>
                </div>
                <div *ngIf="!home()?.technicianLoad?.length" class="rounded-lg bg-black/[0.04] p-4 text-sm font-bold text-ink-500">No active technician load.</div>
              </div>
            </section>
          </div>
        </section>

        <section *ngSwitchCase="'intake'" class="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <form class="mop-panel p-5" (ngSubmit)="createIntake()">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-xl font-black">Customer intake wizard</h2>
                <p class="mt-1 text-sm text-ink-500">Customer, asset ownership, work order, assignment, communication preference.</p>
              </div>
              <button class="mop-button-primary" type="submit">Create Work Order</button>
            </div>

            <div class="mt-5 grid gap-4">
              <div class="rounded-lg border border-black/10 bg-[#f9f7f3] p-4">
                <div class="font-black">1. Customer</div>
                <div class="mt-3 grid gap-3 md:grid-cols-2">
                  <button type="button" class="mop-button-secondary" [ngClass]="customerMode() === 'existing' ? 'bg-ink-950 text-white' : ''" (click)="customerMode.set('existing')">Existing</button>
                  <button type="button" class="mop-button-secondary" [ngClass]="customerMode() === 'new' ? 'bg-ink-950 text-white' : ''" (click)="customerMode.set('new')">New</button>
                </div>
                <select *ngIf="customerMode() === 'existing'" class="mt-3 w-full rounded-md border border-black/10 bg-white p-3 text-sm" [(ngModel)]="selectedCustomerId" name="selectedCustomerId">
                  <option value="">Select customer</option>
                  <option *ngFor="let customer of options()?.customers || []" [value]="customer.id">{{ customer.fullName }} - {{ customer.phone }}</option>
                </select>
                <div *ngIf="customerMode() === 'new'" class="mt-3 grid gap-3">
                  <input class="rounded-md border border-black/10 p-3 text-sm" placeholder="Customer name" [(ngModel)]="customerName" name="customerName" />
                  <input class="rounded-md border border-black/10 p-3 text-sm" placeholder="Phone" [(ngModel)]="customerPhone" name="customerPhone" />
                  <input class="rounded-md border border-black/10 p-3 text-sm" placeholder="Email optional" [(ngModel)]="customerEmail" name="customerEmail" />
                </div>
              </div>

              <div class="rounded-lg border border-black/10 bg-[#f9f7f3] p-4">
                <div class="font-black">2. Asset and ownership</div>
                <div class="mt-3 grid gap-3 md:grid-cols-2">
                  <button type="button" class="mop-button-secondary" [ngClass]="assetMode() === 'existing' ? 'bg-ink-950 text-white' : ''" (click)="assetMode.set('existing')">Existing Asset</button>
                  <button type="button" class="mop-button-secondary" [ngClass]="assetMode() === 'new' ? 'bg-ink-950 text-white' : ''" (click)="assetMode.set('new')">New Asset</button>
                </div>
                <select *ngIf="assetMode() === 'existing'" class="mt-3 w-full rounded-md border border-black/10 bg-white p-3 text-sm" [(ngModel)]="selectedAssetId" name="selectedAssetId">
                  <option value="">Select asset</option>
                  <option *ngFor="let asset of options()?.assets || []" [value]="asset.id">{{ asset.name }} - {{ asset.primaryIdentifier }} - Owner: {{ asset.ownerName }}</option>
                </select>
                <label *ngIf="assetMode() === 'existing'" class="mt-3 flex items-center gap-2 text-sm font-bold text-ink-700">
                  <input type="checkbox" [(ngModel)]="ownershipTransfer" name="ownershipTransfer" />
                  Confirm ownership transfer if old owner differs
                </label>
                <div *ngIf="assetMode() === 'new'" class="mt-3 grid gap-3">
                  <input class="rounded-md border border-black/10 p-3 text-sm" placeholder="Asset name" [(ngModel)]="assetName" name="assetName" />
                  <input class="rounded-md border border-black/10 p-3 text-sm" placeholder="Identifier / plate / serial" [(ngModel)]="assetIdentifier" name="assetIdentifier" />
                  <select class="rounded-md border border-black/10 bg-white p-3 text-sm" [(ngModel)]="assetCategory" name="assetCategory">
                    <option>Cars</option>
                    <option>Motorcycles</option>
                    <option>Heavy Equipment</option>
                  </select>
                </div>
              </div>

              <div class="rounded-lg border border-black/10 bg-[#f9f7f3] p-4">
                <div class="font-black">3. Work order and assignment</div>
                <textarea class="mt-3 min-h-24 w-full rounded-md border border-black/10 p-3 text-sm" placeholder="Customer complaint" [(ngModel)]="complaint" name="complaint"></textarea>
                <div class="mt-3 grid gap-3 md:grid-cols-2">
                  <select class="rounded-md border border-black/10 bg-white p-3 text-sm" [(ngModel)]="priority" name="priority">
                    <option>normal</option>
                    <option>high</option>
                    <option>critical</option>
                    <option>low</option>
                  </select>
                  <select class="rounded-md border border-black/10 bg-white p-3 text-sm" [(ngModel)]="technicianId" name="technicianId">
                    <option value="">Assign later</option>
                    <option *ngFor="let tech of options()?.technicians || []" [value]="tech.id">{{ tech.name }} - {{ tech.activeJobs }} active</option>
                  </select>
                </div>
              </div>

              <div class="rounded-lg border border-black/10 bg-[#f9f7f3] p-4">
                <div class="font-black">4. Communication</div>
                <div class="mt-3 grid gap-3 md:grid-cols-2">
                  <select class="rounded-md border border-black/10 bg-white p-3 text-sm" [(ngModel)]="communicationPreference" name="communicationPreference">
                    <option *ngFor="let preference of options()?.communicationPreferences || []">{{ preference }}</option>
                  </select>
                  <label class="flex items-center gap-2 rounded-md bg-white p-3 text-sm font-bold text-ink-700">
                    <input type="checkbox" [(ngModel)]="portalInvite" name="portalInvite" />
                    Send portal invite
                  </label>
                </div>
              </div>
            </div>
          </form>

          <aside class="mop-panel p-5">
            <h2 class="text-xl font-black">Intake result</h2>
            <div *ngIf="intakeResult(); else noIntake" class="mt-4 rounded-lg bg-green-50 p-5 text-sm text-signal-green">
              <div class="text-lg font-black">{{ intakeResult()?.workOrderNumber }}</div>
              <div class="mt-2">Customer, asset, work order, and assignment are linked.</div>
              <a [routerLink]="['/branch-workspace']" [queryParams]="{ workOrderId: intakeResult()?.workOrderId }" class="mop-button-primary mt-4">Open Workspace</a>
            </div>
            <ng-template #noIntake>
              <div class="mt-4 rounded-lg bg-black/[0.04] p-5 text-sm font-semibold text-ink-500">Create an intake to see the new work order here.</div>
            </ng-template>
          </aside>
        </section>

        <section *ngSwitchCase="'work-orders'" class="mt-5 grid gap-4">
          <div *ngFor="let group of board()?.groups || []" class="mop-panel p-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 class="text-xl font-black">{{ group.label }}</h2>
                <p class="mt-1 text-sm text-ink-500">{{ group.count }} work orders in this state.</p>
              </div>
              <span class="mop-pill">{{ group.count }}</span>
            </div>
            <div class="mt-4 grid gap-3 xl:grid-cols-2">
              <article *ngFor="let wo of group.workOrders" class="rounded-lg border border-black/10 bg-white p-4">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div class="text-sm font-bold text-signal-red">{{ wo.number }}</div>
                    <h3 class="mt-1 text-lg font-black">{{ wo.customerName }} - {{ wo.assetName }}</h3>
                    <p class="mt-1 text-sm text-ink-500">{{ wo.assetIdentifier }} - Technician: {{ wo.assignedTechnicianNames.join(", ") || "Unassigned" }}</p>
                  </div>
                  <a [routerLink]="['/branch-workspace']" [queryParams]="{ workOrderId: wo.id }" class="mop-button-primary">Open</a>
                </div>
                <div class="mt-4 grid gap-2 text-xs font-bold md:grid-cols-4">
                  <span class="rounded-md bg-black/[0.04] p-2">Customer: {{ wo.customerDecisionState }}</span>
                  <span class="rounded-md bg-black/[0.04] p-2">Parts: {{ wo.partsState }}</span>
                  <span class="rounded-md bg-black/[0.04] p-2">Payment: {{ wo.paymentState }}</span>
                  <span class="rounded-md bg-black/[0.04] p-2">Delivery: {{ wo.deliveryState }}</span>
                </div>
                <div class="mt-3 rounded-md bg-[#f9f7f3] p-3 text-sm font-semibold text-ink-700">Next: {{ wo.nextAction }}</div>
              </article>
              <div *ngIf="!group.workOrders.length" class="rounded-lg bg-black/[0.04] p-5 text-sm font-bold text-ink-500">No work orders in this group.</div>
            </div>
          </div>
        </section>

        <ng-container *ngSwitchCase="'workspace'">
        <section class="mt-5 grid gap-5" *ngIf="workspace() as ws">
          <div class="mop-panel p-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="text-sm font-bold text-signal-red">{{ ws.workOrder.number }}</div>
                <h2 class="mt-1 text-2xl font-black">{{ ws.customer.fullName }} - {{ ws.asset.name }} {{ ws.asset.primaryIdentifier }}</h2>
                <p class="mt-1 text-sm text-ink-500">{{ ws.workOrder.statusLabel }} - {{ ws.workOrder.nextAction }}</p>
              </div>
              <span class="mop-pill">{{ ws.workOrder.priority }}</span>
            </div>
          </div>

          <div class="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
            <section class="mop-panel p-5">
              <h3 class="text-xl font-black">Operational actions</h3>
              <div class="mt-4 grid gap-3 md:grid-cols-2">
                <select class="rounded-md border border-black/10 bg-white p-3 text-sm" [(ngModel)]="workspaceTechnicianId" name="workspaceTechnicianId">
                  <option value="">Select technician</option>
                  <option *ngFor="let tech of ws.availableTechnicians" [value]="tech.id">{{ tech.name }} - {{ tech.activeJobs }} active</option>
                </select>
                <button class="mop-button-primary" (click)="workspaceAction('assign_technician', { technicianId: workspaceTechnicianId })">Assign / Reassign</button>
                <select class="rounded-md border border-black/10 bg-white p-3 text-sm" [(ngModel)]="workspacePriority" name="workspacePriority">
                  <option>normal</option>
                  <option>high</option>
                  <option>critical</option>
                  <option>low</option>
                </select>
                <button class="mop-button-secondary" (click)="workspaceAction('change_priority', { priority: workspacePriority })">Change Priority</button>
                <button class="mop-button-secondary" (click)="workspaceAction('send_customer_reminder', {})">Send Reminder</button>
                <button class="mop-button-secondary" (click)="workspaceAction('escalate_blocker', { note: workspaceNote || 'Branch Manager escalation.' })">Escalate Blocker</button>
                <input class="rounded-md border border-black/10 p-3 text-sm md:col-span-2" placeholder="Manual branch note" [(ngModel)]="workspaceNote" name="workspaceNote" />
                <button class="mop-button-secondary" (click)="workspaceAction('record_manual_note', { note: workspaceNote })">Record Note</button>
                <button class="mop-button-secondary" (click)="workspaceAction('mark_ready_delivery', {})">Mark Ready for Delivery</button>
              </div>
            </section>

            <section class="mop-panel p-5">
              <h3 class="text-xl font-black">Customer and asset</h3>
              <div class="mt-4 grid gap-3 text-sm">
                <div class="rounded-md bg-black/[0.04] p-3"><b>{{ ws.customer.phone }}</b><div class="text-ink-500">{{ ws.customer.preferredContact }} - {{ ws.customer.portalStatus }}</div></div>
                <div class="rounded-md bg-black/[0.04] p-3"><b>{{ ws.asset.category }}</b><div class="text-ink-500">{{ ws.asset.primaryIdentifier }}</div></div>
              </div>
            </section>
          </div>

          <div class="grid gap-5 xl:grid-cols-2">
            <section class="mop-panel p-5">
              <h3 class="text-xl font-black">Technician activity</h3>
              <div class="mt-4 grid gap-3">
                <div *ngFor="let task of ws.technicianActivity" class="rounded-lg bg-black/[0.04] p-4">
                  <div class="font-black">{{ task.title }}</div>
                  <div class="mt-2 text-sm text-ink-500">{{ task.status }} - {{ task.assignedTechnicians.join(", ") || "Unassigned" }}</div>
                  <div *ngIf="task.blockersOpen" class="mt-2 text-sm font-bold text-signal-red">{{ task.blockersOpen }} open blockers</div>
                </div>
              </div>
            </section>

            <section class="mop-panel p-5">
              <h3 class="text-xl font-black">Parts and inventory impact</h3>
              <div class="mt-4 grid gap-3">
                <div *ngFor="let part of ws.parts" class="rounded-lg bg-black/[0.04] p-4">
                  <div class="font-black">{{ part.itemName }} x{{ part.qty }}</div>
                  <div class="mt-2 text-sm text-ink-500">{{ part.status }} - {{ part.warehouseName || "Warehouse" }}</div>
                </div>
                <div *ngIf="!ws.parts.length" class="rounded-lg bg-black/[0.04] p-4 text-sm font-bold text-ink-500">No part requests yet.</div>
              </div>
            </section>
          </div>

          <div class="grid gap-5 xl:grid-cols-3">
            <section class="mop-panel p-5">
              <h3 class="text-xl font-black">Customer decisions</h3>
              <div class="mt-4 grid gap-3">
                <div *ngFor="let decision of ws.customerDecisions" class="rounded-lg bg-black/[0.04] p-4">
                  <div class="font-black">{{ decision.status }}</div>
                  <div class="mt-1 text-sm text-ink-500">{{ decision.items.length }} items - expires {{ decision.expiresAt | date:'short' }}</div>
                </div>
              </div>
            </section>
            <section class="mop-panel p-5">
              <h3 class="text-xl font-black">QC / rework</h3>
              <div class="mt-4 rounded-lg bg-black/[0.04] p-4 text-sm">
                <div class="font-black">{{ ws.qc.state }}</div>
                <div class="mt-1 text-ink-500">Team leader review: {{ ws.qc.teamLeaderReview }}</div>
              </div>
            </section>
            <section class="mop-panel p-5">
              <h3 class="text-xl font-black">Payment and delivery</h3>
              <div class="mt-4 rounded-lg bg-black/[0.04] p-4 text-sm">
                <div class="font-black">{{ ws.paymentDelivery.deliveryAllowed ? "Allowed" : "Blocked" }}</div>
                <div class="mt-1 text-ink-500">Remaining: {{ ws.paymentDelivery.remainingAmount }} EGP</div>
              </div>
            </section>
          </div>

          <section class="mop-panel p-5">
            <h3 class="text-xl font-black">Branch-safe timeline</h3>
            <div class="mt-4 grid gap-3">
              <div *ngFor="let event of ws.timeline" class="rounded-lg bg-black/[0.04] p-4">
                <div class="font-black">{{ event.title }}</div>
                <div class="mt-1 text-sm text-ink-500">{{ event.message }}</div>
              </div>
            </div>
          </section>
        </section>
        </ng-container>

        <section *ngSwitchCase="'decisions'" class="mt-5 grid gap-5">
          <div class="grid gap-4 md:grid-cols-3">
            <div class="mop-card"><div class="text-sm text-ink-500">Pending</div><div class="mt-2 text-3xl font-black">{{ decisions()?.pending || 0 }}</div></div>
            <div class="mop-card"><div class="text-sm text-ink-500">Overdue</div><div class="mt-2 text-3xl font-black">{{ decisions()?.overdue || 0 }}</div></div>
            <div class="mop-card"><div class="text-sm text-ink-500">Critical rejected</div><div class="mt-2 text-3xl font-black">{{ decisions()?.criticalRejected || 0 }}</div></div>
          </div>
          <article *ngFor="let decision of decisions()?.decisions || []" class="mop-panel p-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="text-sm font-bold text-signal-red">{{ decision.workOrderNumber }}</div>
                <h2 class="mt-1 text-xl font-black">{{ decision.customerName }} - {{ decision.assetName }} {{ decision.assetIdentifier }}</h2>
                <p class="mt-1 text-sm text-ink-500">{{ decision.nextAction }}</p>
              </div>
              <span class="mop-pill">{{ decision.status }}</span>
            </div>
            <div class="mt-4 grid gap-3 md:grid-cols-4">
              <button class="mop-button-secondary" (click)="decisionAction(decision.id, 'send_reminder', {})">Send Reminder</button>
              <button class="mop-button-secondary" (click)="decisionAction(decision.id, 'manual_note', { note: decisionNote || 'Manual follow-up recorded.' })">Record Note</button>
              <button class="mop-button-secondary" (click)="decisionAction(decision.id, 'escalate_critical', {})">Escalate Critical</button>
              <button class="mop-button-secondary" (click)="decisionAction(decision.id, 'notify_technician', {})">Notify Technician</button>
            </div>
            <input class="mt-3 w-full rounded-md border border-black/10 p-3 text-sm" placeholder="Decision follow-up note" [(ngModel)]="decisionNote" name="decisionNote" />
            <details class="mt-4 rounded-lg bg-black/[0.04] p-4">
              <summary class="cursor-pointer text-sm font-black">Decision package</summary>
              <div class="mt-3 grid gap-3">
                <div *ngFor="let item of decision.items" class="rounded-md bg-white p-3 text-sm">
                  <div class="font-black">{{ item.title }}</div>
                  <div class="mt-1 text-ink-500">{{ item.decisionStatus }} - {{ item.estimatedPrice }} EGP</div>
                  <div *ngIf="item.criticalWarningRequired" class="mt-2 rounded-md bg-signal-rose p-2 text-xs font-bold text-signal-red">Critical warning tracked</div>
                </div>
              </div>
            </details>
          </article>
        </section>

        <section *ngSwitchCase="'delivery'" class="mt-5 grid gap-5">
          <div class="grid gap-4 md:grid-cols-3">
            <div class="mop-card"><div class="text-sm text-ink-500">Ready</div><div class="mt-2 text-3xl font-black">{{ delivery()?.readyForDelivery || 0 }}</div></div>
            <div class="mop-card"><div class="text-sm text-ink-500">Payment Pending</div><div class="mt-2 text-3xl font-black">{{ delivery()?.paymentPending || 0 }}</div></div>
            <div class="mop-card"><div class="text-sm text-ink-500">Blocked</div><div class="mt-2 text-3xl font-black">{{ delivery()?.blocked || 0 }}</div></div>
          </div>

          <article *ngFor="let row of delivery()?.rows || []" class="mop-panel p-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="text-sm font-bold text-signal-red">{{ row.workOrderNumber }}</div>
                <h2 class="mt-1 text-xl font-black">{{ row.customerName }} - {{ row.assetName }} {{ row.assetIdentifier }}</h2>
                <p class="mt-1 text-sm text-ink-500">{{ row.statusLabel }} - Remaining {{ row.remainingAmount }} EGP</p>
              </div>
              <span class="mop-pill">{{ row.deliveryAllowed ? "Allowed" : "Blocked" }}</span>
            </div>
            <div class="mt-4 grid gap-2 md:grid-cols-5">
              <div *ngFor="let check of row.handoverChecklist" class="rounded-md p-3 text-sm font-bold" [ngClass]="check.ok ? 'bg-green-50 text-signal-green' : 'bg-signal-rose text-signal-red'">
                {{ check.label }}
              </div>
            </div>
            <div *ngIf="row.deliveryBlockedReasons.length" class="mt-3 rounded-md bg-signal-rose p-3 text-sm font-bold text-signal-red">
              {{ row.deliveryBlockedReasons.join(" - ") }}
            </div>
            <div class="mt-4 flex flex-wrap gap-3">
              <button class="mop-button-secondary" (click)="deliveryAction(row.workOrderId, 'notify_customer')">Notify Customer</button>
              <button class="mop-button-primary" (click)="deliveryAction(row.workOrderId, 'mark_ready_delivery')">Mark Ready</button>
            </div>
          </article>
        </section>
      </ng-container>
    </section>
  `
})
export class BranchManagerComponent implements OnInit {
  private readonly branchApi = inject(BranchManagerApiService);
  private readonly route = inject(ActivatedRoute);

  readonly page = signal<BranchPage>("home");
  readonly loading = signal(false);
  readonly error = signal("");
  readonly home = signal<BranchManagerHomeDto | null>(null);
  readonly options = signal<BranchIntakeOptionsDto | null>(null);
  readonly intakeResult = signal<BranchIntakeResultDto | null>(null);
  readonly board = signal<BranchWorkOrdersBoardDto | null>(null);
  readonly workspace = signal<BranchWorkspaceDto | null>(null);
  readonly decisions = signal<BranchDecisionQueueDto | null>(null);
  readonly delivery = signal<BranchDeliveryStatusDto | null>(null);

  readonly customerMode = signal<"existing" | "new">("existing");
  readonly assetMode = signal<"existing" | "new">("existing");

  readonly nav: Array<{ id: BranchPage; route: string; label: string }> = [
    { id: "home", route: "branch-home", label: "Home" },
    { id: "intake", route: "branch-intake", label: "Intake" },
    { id: "work-orders", route: "branch-work-orders", label: "Work Orders" },
    { id: "workspace", route: "branch-workspace", label: "Workspace" },
    { id: "decisions", route: "branch-decisions", label: "Decisions" },
    { id: "delivery", route: "branch-delivery", label: "Delivery" }
  ];

  selectedCustomerId = "";
  customerName = "";
  customerPhone = "";
  customerEmail = "";
  selectedAssetId = "";
  assetName = "";
  assetIdentifier = "";
  assetCategory: CategoryCode = "Cars";
  ownershipTransfer = false;
  complaint = "";
  priority: "low" | "normal" | "high" | "critical" = "normal";
  technicianId = "";
  portalInvite = true;
  communicationPreference = "whatsapp";
  workspaceTechnicianId = "";
  workspacePriority: "low" | "normal" | "high" | "critical" = "normal";
  workspaceNote = "";
  decisionNote = "";

  async ngOnInit() {
    this.page.set((this.route.snapshot.data["branchPage"] as BranchPage) || "home");
    await this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set("");
    try {
      const current = this.page();
      if (current !== "home" && !this.home()) {
        this.home.set(await this.branchApi.home());
      }
      if (current === "home") this.home.set(await this.branchApi.home());
      if (current === "intake") this.options.set(await this.branchApi.intakeOptions());
      if (current === "work-orders") this.board.set(await this.branchApi.workOrders());
      if (current === "workspace") await this.loadWorkspace();
      if (current === "decisions") this.decisions.set(await this.branchApi.decisions());
      if (current === "delivery") this.delivery.set(await this.branchApi.delivery());
    } catch (error: any) {
      this.error.set(error?.error?.message || error?.message || "Branch Manager request failed.");
    } finally {
      this.loading.set(false);
    }
  }

  async loadWorkspace() {
    const id = this.route.snapshot.queryParamMap.get("workOrderId") || this.workspace()?.workOrder.id || await this.firstWorkOrderId();
    if (!id) {
      this.workspace.set(null);
      return;
    }
    const ws = await this.branchApi.workspace(id);
    this.workspace.set(ws);
    this.workspacePriority = ws.workOrder.priority;
    this.workspaceTechnicianId = ws.assignedTeam[0]?.id || "";
  }

  async firstWorkOrderId() {
    const board = await this.branchApi.workOrders();
    this.board.set(board);
    return board.groups.flatMap((group: BranchWorkOrdersBoardDto["groups"][number]) => group.workOrders)[0]?.id || "";
  }

  async createIntake() {
    this.error.set("");
    try {
      const result = await this.branchApi.createIntake({
        customer: this.customerMode() === "existing"
          ? { mode: "existing", customerId: this.selectedCustomerId }
          : { mode: "new", fullName: this.customerName, phone: this.customerPhone, email: this.customerEmail, communicationConsent: true },
        asset: this.assetMode() === "existing"
          ? { mode: "existing", assetId: this.selectedAssetId, ownershipTransfer: this.ownershipTransfer }
          : { mode: "new", name: this.assetName, primaryIdentifier: this.assetIdentifier, category: this.assetCategory },
        workOrder: { complaint: this.complaint, priority: this.priority },
        assignment: { technicianId: this.technicianId || undefined },
        communication: { portalInvite: this.portalInvite, preference: this.communicationPreference }
      });
      this.intakeResult.set(result);
      this.options.set(await this.branchApi.intakeOptions());
    } catch (error: any) {
      this.error.set(error?.error?.message || error?.message || "Intake failed.");
    }
  }

  async workspaceAction(action: string, body: Record<string, unknown>) {
    const id = this.workspace()?.workOrder.id;
    if (!id) return;
    await this.postAndReload(`/branch-manager/work-orders/${id}/action`, { action, ...body }, "Workspace action failed.");
    await this.loadWorkspace();
  }

  async decisionAction(id: string, action: string, body: Record<string, unknown>) {
    await this.postAndReload(`/branch-manager/decisions/${id}/action`, { action, ...body }, "Decision action failed.");
    this.decisions.set(await this.branchApi.decisions());
  }

  async deliveryAction(id: string, action: string) {
    await this.postAndReload(`/branch-manager/delivery/${id}/action`, { action }, "Delivery action failed.");
    this.delivery.set(await this.branchApi.delivery());
  }

  async postAndReload(path: string, body: unknown, fallback: string) {
    this.error.set("");
    try {
      await this.postByPath(path, body);
      this.home.set(await this.branchApi.home());
    } catch (error: any) {
      this.error.set(error?.error?.message || error?.message || fallback);
    }
  }

  private postByPath(path: string, body: unknown) {
    const id = path.split("/").filter(Boolean).at(-2) || "";
    if (path.includes("/work-orders/")) return this.branchApi.workOrderAction(id, body as Record<string, unknown>);
    if (path.includes("/decisions/")) return this.branchApi.decisionAction(id, body as Record<string, unknown>);
    if (path.includes("/delivery/")) return this.branchApi.deliveryAction(id, body as Record<string, unknown>);
    throw new Error("Unsupported branch API action path.");
  }

  toneClass(tone: string) {
    const map: Record<string, string> = {
      red: "border-signal-red/20 bg-signal-rose",
      gold: "border-signal-gold/25 bg-[#fff4df]",
      green: "border-signal-green/20 bg-green-50",
      blue: "border-signal-blue/20 bg-blue-50",
      neutral: "bg-white"
    };
    return map[tone] || map["neutral"];
  }
}
