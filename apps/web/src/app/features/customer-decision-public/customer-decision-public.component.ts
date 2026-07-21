import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import type { CustomerDecisionPublicDto, SubmitDecisionItemDto } from "@mop/shared";
import { firstValueFrom } from "rxjs";
import { ApiClient } from "../../core/api/api-client.service";

@Component({
  selector: "mop-customer-decision-public",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="min-h-screen bg-[#f7f3ed] px-4 py-6">
      <div class="mx-auto max-w-3xl">
        <div class="rounded-lg bg-ink-950 p-6 text-white shadow-panel">
          <div class="text-xs font-semibold uppercase text-white/50">{{ decision()?.tenantName || "MOP" }}</div>
          <h1 class="mt-4 text-3xl font-black tracking-normal">Service Decision</h1>
          <p class="mt-2 text-sm leading-6 text-white/70">
            Please review each item and choose approve or reject. Critical rejections require acknowledgement.
          </p>
        </div>

        <p *ngIf="error()" class="mt-4 rounded-md border border-signal-red/20 bg-signal-rose p-3 text-sm font-semibold text-signal-red">{{ error() }}</p>

        <ng-container *ngIf="decision() as request">
          <section class="mop-panel mt-4 p-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="text-sm font-bold text-signal-red">{{ request.workOrderNumber }}</div>
                <h2 class="mt-1 text-2xl font-black">{{ request.assetName }} · {{ request.assetIdentifier }}</h2>
                <p class="mt-1 text-sm text-ink-500">{{ request.branchName }}</p>
              </div>
              <span class="mop-pill">{{ request.status }}</span>
            </div>
          </section>

          <div class="mt-4 grid gap-4">
            <article *ngFor="let item of request.items" class="mop-card">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span class="mop-pill" [ngClass]="item.importance === 'critical' ? 'border-signal-red/20 bg-signal-rose text-signal-red' : ''">{{ item.importance }}</span>
                  <h3 class="mt-4 text-xl font-black">{{ item.title }}</h3>
                </div>
                <div class="text-right">
                  <div class="text-xs font-semibold uppercase text-ink-500">Estimated cost</div>
                  <div class="mt-1 text-xl font-black">{{ item.estimatedPrice }} EGP</div>
                </div>
              </div>

              <div class="mt-5 rounded-lg bg-black/[0.04] p-4">
                <div class="text-sm font-black">Why this matters</div>
                <p class="mt-2 text-sm leading-6 text-ink-700">{{ item.customerExplanation }}</p>
              </div>

              <div *ngIf="isRejectedCritical(item.id, item.criticalWarningRequired)" class="mt-4 rounded-lg border border-signal-red/25 bg-signal-rose p-4">
                <div class="font-black text-signal-red">Critical warning</div>
                <p class="mt-2 text-sm leading-6 text-ink-700">{{ item.criticalWarningText }}</p>
                <label class="mt-3 flex items-start gap-2 text-sm font-semibold">
                  <input type="checkbox" class="mt-1" [checked]="warningAcknowledged(item.id)" (change)="setWarningAcknowledged(item.id, $any($event.target).checked)" />
                  I understand this rejection will be recorded in the service history.
                </label>
              </div>

              <div class="mt-4 grid gap-3 sm:grid-cols-2">
                <button class="mop-button-secondary" [disabled]="request.status === 'responded'" [ngClass]="itemDecision(item.id) === 'approved' || item.decisionStatus === 'approved' ? 'bg-signal-green text-white' : ''" (click)="setDecision(item.id, 'approved')">Approve</button>
                <button class="mop-button-secondary" [disabled]="request.status === 'responded'" [ngClass]="itemDecision(item.id) === 'rejected' || item.decisionStatus === 'rejected' ? 'bg-signal-red text-white' : ''" (click)="setDecision(item.id, 'rejected')">Reject</button>
              </div>
            </article>
          </div>

          <section *ngIf="request.status !== 'responded'; else alreadyRecorded" class="mop-panel mt-4 p-5">
            <label class="text-sm font-bold">Optional note to the branch</label>
            <textarea class="mt-2 min-h-24 w-full rounded-md border border-black/10 px-3 py-2 text-sm" [(ngModel)]="customerNote"></textarea>
            <button class="mop-button-primary mt-4 w-full" (click)="submit()">Submit decisions</button>
          </section>
          <ng-template #alreadyRecorded>
            <section class="mop-panel mt-4 p-5 text-center">
              <h2 class="text-xl font-black">Your decision is already recorded.</h2>
              <p class="mt-2 text-sm text-ink-500">The branch can continue with approved items and will follow up if needed.</p>
            </section>
          </ng-template>
        </ng-container>

        <section *ngIf="submitted()" class="mop-panel mt-4 p-6 text-center">
          <h2 class="text-2xl font-black">Thank you. Your decisions have been recorded.</h2>
          <p class="mt-2 text-sm text-ink-500">Approved work can now continue. The branch may contact you if follow-up is required.</p>
        </section>
      </div>
    </section>
  `
})
export class CustomerDecisionPublicComponent implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly route = inject(ActivatedRoute);
  readonly decision = signal<CustomerDecisionPublicDto | null>(null);
  readonly decisions = signal<Record<string, SubmitDecisionItemDto>>({});
  readonly error = signal("");
  readonly submitted = signal(false);
  customerNote = "";

  async ngOnInit() {
    const token = this.route.snapshot.paramMap.get("token") || "";
    this.decision.set(await firstValueFrom(this.api.get<CustomerDecisionPublicDto>(`/customer-decisions/public/${token}`)));
  }

  itemDecision(itemId: string) {
    return this.decisions()[itemId]?.decision;
  }

  setDecision(itemId: string, decision: "approved" | "rejected") {
    this.decisions.update((value) => ({ ...value, [itemId]: { ...(value[itemId] || { itemId }), itemId, decision } }));
  }

  warningAcknowledged(itemId: string) {
    return Boolean(this.decisions()[itemId]?.warningAcknowledged);
  }

  setWarningAcknowledged(itemId: string, warningAcknowledged: boolean) {
    this.decisions.update((value) => ({ ...value, [itemId]: { ...(value[itemId] || { itemId, decision: "rejected" }), warningAcknowledged } }));
  }

  isRejectedCritical(itemId: string, critical: boolean) {
    return critical && this.itemDecision(itemId) === "rejected";
  }

  async submit() {
    this.error.set("");
    const request = this.decision();
    if (!request) return;
    const decisions = request.items.map((item) => this.decisions()[item.id]).filter(Boolean);
    if (decisions.length !== request.items.length) {
      this.error.set("Please approve or reject every item.");
      return;
    }
    const missingCriticalAck = request.items.some((item) => item.criticalWarningRequired && this.decisions()[item.id]?.decision === "rejected" && !this.decisions()[item.id]?.warningAcknowledged);
    if (missingCriticalAck) {
      this.error.set("Critical rejection requires warning acknowledgement.");
      return;
    }
    const token = this.route.snapshot.paramMap.get("token") || "";
    await firstValueFrom(this.api.post(`/customer-decisions/public/${token}/submit`, { customerNote: this.customerNote, decisions }));
    this.submitted.set(true);
    this.decision.set(null);
  }
}
