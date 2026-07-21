import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, signal } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import type { CustomerDecisionRequestDto, WorkOrderDto } from "@mop/shared";
import { firstValueFrom } from "rxjs";
import { ApiClient } from "../../core/api/api-client.service";

@Component({
  selector: "mop-work-orders",
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="px-5 py-8 lg:px-8">
      <header class="mop-panel p-6">
        <span class="mop-pill">{{ route.snapshot.data["customerPortal"] ? "Customer Portal" : "Work Orders" }}</span>
        <h1 class="mt-4 text-3xl font-black tracking-normal">{{ route.snapshot.data["customerPortal"] ? "Owned asset service summary" : "Operational work orders" }}</h1>
        <p class="mt-2 text-sm text-ink-500">{{ route.snapshot.data["customerPortal"] ? "Safe service updates, decisions, and asset work visible to the current customer only." : "Rows are filtered by backend record-level scope." }}</p>
      </header>

      <section *ngIf="route.snapshot.data['customerPortal']" class="mop-panel mt-5 p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-xl font-black">Customer Decisions</h2>
            <p class="mt-1 text-sm text-ink-500">Open the secure MOP link from WhatsApp to approve or reject service items.</p>
          </div>
          <span class="mop-pill">{{ decisions().length }} requests</span>
        </div>
        <div class="mt-4 grid gap-3 md:grid-cols-2">
          <article *ngFor="let decision of decisions()" class="rounded-lg border border-black/10 bg-[#f9f7f3] p-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-sm font-bold text-signal-red">{{ decision.workOrderNumber }}</div>
                <h3 class="mt-1 text-lg font-black">{{ decision.assetName }} · {{ decision.assetIdentifier }}</h3>
              </div>
              <span class="mop-pill">{{ decision.status }}</span>
            </div>
            <details class="mt-3 rounded-md bg-white p-3">
              <summary class="cursor-pointer text-sm font-black">Expand Decisions</summary>
              <div class="mt-3 grid gap-2">
                <div *ngFor="let item of decision.items" class="rounded-md bg-black/[0.04] p-3 text-sm">
                  <div class="font-black">{{ item.title }}</div>
                  <div class="mt-1 text-ink-500">{{ item.decisionStatus }} · {{ item.estimatedPrice }} EGP</div>
                  <div *ngIf="item.criticalWarningRequired && item.warningAcknowledged" class="mt-2 rounded-md bg-signal-rose px-3 py-2 text-xs font-bold text-signal-red">
                    Critical warning acknowledged.
                  </div>
                </div>
              </div>
            </details>
            <a *ngIf="decision.secureLink && decision.status !== 'responded'" class="mop-button-primary mt-4 block text-center" [href]="decision.secureLink">Open Decision</a>
            <p *ngIf="decision.status === 'responded'" class="mt-4 rounded-md bg-green-50 p-3 text-sm font-semibold text-signal-green">Your decision was recorded.</p>
          </article>
          <div *ngIf="!decisions().length" class="rounded-md bg-black/[0.04] p-4 text-sm font-semibold text-ink-500">No pending customer decisions.</div>
        </div>
      </section>

      <div class="mt-5 grid gap-4">
        <article *ngFor="let wo of workOrders()" class="mop-card">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="text-sm font-bold text-signal-red">{{ wo.number }}</div>
              <h2 class="mt-1 text-xl font-black">{{ wo.assetName }} · {{ wo.identifier }}</h2>
              <p class="mt-1 text-sm text-ink-500">{{ wo.customerName }} · {{ wo.branchName }}</p>
            </div>
            <span class="mop-pill">{{ wo.statusLabel }}</span>
          </div>
          <p *ngIf="route.snapshot.data['customerPortal']" class="mt-4 rounded-md bg-black/[0.04] p-3 text-sm leading-6 text-ink-700">
            {{ wo.customerSummary || "Your branch will share safe service updates here when action is needed." }}
          </p>
          <div *ngIf="!route.snapshot.data['customerPortal']" class="mt-5 grid grid-cols-3 gap-3 text-sm">
            <div class="rounded-md bg-black/[0.04] p-3"><div class="font-black">{{ wo.total }}</div><div class="text-ink-500">Total</div></div>
            <div class="rounded-md bg-black/[0.04] p-3"><div class="font-black">{{ wo.paid }}</div><div class="text-ink-500">Paid</div></div>
            <div class="rounded-md bg-black/[0.04] p-3"><div class="font-black">{{ wo.balance }}</div><div class="text-ink-500">Balance</div></div>
          </div>
        </article>
      </div>
    </section>
  `
})
export class WorkOrdersComponent implements OnInit {
  private readonly api = inject(ApiClient);
  readonly route = inject(ActivatedRoute);
  readonly workOrders = signal<WorkOrderDto[]>([]);
  readonly decisions = signal<CustomerDecisionRequestDto[]>([]);

  async ngOnInit() {
    this.workOrders.set(await firstValueFrom(this.api.get<WorkOrderDto[]>("/work-orders")));
    if (this.route.snapshot.data["customerPortal"]) {
      this.decisions.set(await firstValueFrom(this.api.get<CustomerDecisionRequestDto[]>("/customer-decisions/my")));
    }
  }
}
