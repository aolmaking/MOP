import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import type { CreateDecisionRequestItemDto, CustomerDecisionImportance, CustomerDecisionRequestDto } from "@mop/shared";
import { firstValueFrom } from "rxjs";
import { ApiClient } from "../../core/api/api-client.service";

@Component({
  selector: "mop-customer-decisions",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="px-5 py-8 lg:px-8">
      <header class="mop-panel p-6">
        <span class="mop-pill">Customer Decision Request</span>
        <h1 class="mt-4 text-3xl font-black tracking-normal">WhatsApp-to-Portal decision flow</h1>
        <p class="mt-2 max-w-3xl text-sm leading-6 text-ink-500">
          WhatsApp grabs attention. MOP records structured approve/reject decisions with timestamps, warnings, and service history.
        </p>
      </header>

      <div class="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <section class="mop-panel p-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-xl font-black">Create request</h2>
              <p class="mt-1 text-sm text-ink-500">Every item must be customer-safe and decision-ready before sending.</p>
            </div>
            <span class="mop-pill">{{ draftItems().length }} items</span>
          </div>

          <label class="mt-5 block text-sm font-bold">Work Order ID</label>
          <input class="mt-2 w-full rounded-md border border-black/10 px-3 py-2 text-sm" [(ngModel)]="workOrderId" />

          <div class="mt-5 rounded-lg border border-black/10 bg-[#f9f7f3] p-4">
            <div class="grid gap-3">
              <input class="rounded-md border border-black/10 px-3 py-2 text-sm" placeholder="Customer-facing title" [(ngModel)]="draftTitle" />
              <textarea class="min-h-24 rounded-md border border-black/10 px-3 py-2 text-sm" placeholder="Customer-facing explanation" [(ngModel)]="draftExplanation"></textarea>
              <div class="grid gap-3 sm:grid-cols-2">
                <select class="rounded-md border border-black/10 px-3 py-2 text-sm" [(ngModel)]="draftImportance">
                  <option value="normal">Normal</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                <input class="rounded-md border border-black/10 px-3 py-2 text-sm" type="number" placeholder="Estimated price" [(ngModel)]="draftPrice" />
              </div>
              <textarea
                *ngIf="draftImportance === 'critical'"
                class="min-h-20 rounded-md border border-signal-red/30 bg-signal-rose px-3 py-2 text-sm"
                placeholder="Critical warning required"
                [(ngModel)]="draftWarning"
              ></textarea>
              <button class="mop-button-secondary" (click)="addItem()">Add item to request</button>
            </div>
          </div>

          <div class="mt-4 grid gap-3">
            <article *ngFor="let item of draftItems(); let index = index" class="rounded-lg border border-black/10 bg-white p-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="font-black">{{ item.title }}</div>
                  <p class="mt-1 text-sm text-ink-500">{{ item.customerExplanation }}</p>
                </div>
                <button class="mop-button-secondary px-3 py-1" (click)="removeItem(index)">Remove</button>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <span class="mop-pill">{{ item.importance }}</span>
                <span class="mop-pill">{{ item.estimatedPrice }} EGP</span>
                <span *ngIf="item.criticalWarningRequired" class="mop-pill border-signal-red/20 bg-signal-rose text-signal-red">critical warning</span>
              </div>
            </article>
          </div>

          <p *ngIf="error()" class="mt-4 rounded-md border border-signal-red/20 bg-signal-rose p-3 text-sm font-semibold text-signal-red">{{ error() }}</p>
          <button class="mop-button-primary mt-5 w-full" (click)="createRequest()">Generate WhatsApp message</button>
        </section>

        <section class="grid gap-4">
          <article *ngFor="let request of requests()" class="mop-card">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="text-sm font-bold text-signal-red">{{ request.workOrderNumber }}</div>
                <h2 class="mt-1 text-xl font-black">{{ request.assetName }} · {{ request.assetIdentifier }}</h2>
                <p class="mt-1 text-sm text-ink-500">{{ request.customerName }} · {{ request.branchName }}</p>
              </div>
              <span class="mop-pill">{{ request.status }}</span>
            </div>

            <div class="mt-4 grid gap-3">
              <div *ngFor="let item of request.items" class="rounded-lg border border-black/10 bg-[#f9f7f3] p-4">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div class="font-black">{{ item.title }}</div>
                    <p class="mt-1 text-sm text-ink-500">{{ item.customerExplanation }}</p>
                  </div>
                  <span class="mop-pill">{{ item.decisionStatus }}</span>
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                  <span class="mop-pill">{{ item.importance }}</span>
                  <span class="mop-pill">{{ item.estimatedPrice }} EGP</span>
                  <span *ngIf="item.criticalWarningRequired" class="mop-pill border-signal-red/20 bg-signal-rose text-signal-red">critical</span>
                </div>
              </div>
            </div>

            <details class="mt-4 rounded-lg border border-black/10 bg-black/[0.03] p-4">
              <summary class="cursor-pointer text-sm font-black">WhatsApp message and secure link</summary>
              <pre class="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink-700">{{ request.whatsappMessage }}</pre>
              <div class="mt-3 rounded-md bg-white p-3 text-sm font-semibold text-signal-red">{{ request.secureLink }}</div>
            </details>

            <button *ngIf="request.status === 'draft'" class="mop-button-primary mt-4" (click)="sendRequest(request.id)">Send WhatsApp link</button>
          </article>
        </section>
      </div>
    </section>
  `
})
export class CustomerDecisionsComponent implements OnInit {
  private readonly api = inject(ApiClient);
  readonly requests = signal<CustomerDecisionRequestDto[]>([]);
  readonly draftItems = signal<CreateDecisionRequestItemDto[]>([]);
  readonly error = signal("");

  workOrderId = "wo1024";
  draftTitle = "Brake Pads Replacement";
  draftExplanation = "Front pads are worn and need replacement to restore braking performance.";
  draftImportance: CustomerDecisionImportance = "high";
  draftPrice = 1200;
  draftWarning = "";

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.requests.set(await firstValueFrom(this.api.get<CustomerDecisionRequestDto[]>("/customer-decisions")));
  }

  addItem() {
    this.error.set("");
    if (!this.draftTitle.trim() || !this.draftExplanation.trim()) {
      this.error.set("Title and explanation are required.");
      return;
    }
    if (this.draftImportance === "critical" && !this.draftWarning.trim()) {
      this.error.set("Critical items require a warning message.");
      return;
    }
    this.draftItems.update((items) => [
      ...items,
      {
        title: this.draftTitle.trim(),
        customerExplanation: this.draftExplanation.trim(),
        importance: this.draftImportance,
        estimatedPrice: Number(this.draftPrice || 0),
        criticalWarningRequired: this.draftImportance === "critical",
        criticalWarningText: this.draftImportance === "critical" ? this.draftWarning.trim() : undefined
      }
    ]);
    this.draftTitle = "";
    this.draftExplanation = "";
    this.draftImportance = "normal";
    this.draftPrice = 0;
    this.draftWarning = "";
  }

  removeItem(index: number) {
    this.draftItems.update((items) => items.filter((_, itemIndex) => itemIndex !== index));
  }

  async createRequest() {
    this.error.set("");
    if (!this.draftItems().length) {
      this.error.set("Add at least one decision item.");
      return;
    }
    await firstValueFrom(
      this.api.post<CustomerDecisionRequestDto>("/customer-decisions", {
        workOrderId: this.workOrderId,
        source: "technician_task",
        items: this.draftItems()
      })
    );
    this.draftItems.set([]);
    await this.load();
  }

  async sendRequest(id: string) {
    await firstValueFrom(this.api.post<CustomerDecisionRequestDto>(`/customer-decisions/${id}/send`, {}));
    await this.load();
  }
}
