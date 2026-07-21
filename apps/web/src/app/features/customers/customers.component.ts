import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, signal } from "@angular/core";
import type { CustomerDto } from "@mop/shared";
import { firstValueFrom } from "rxjs";
import { ApiClient } from "../../core/api/api-client.service";

@Component({
  selector: "mop-customers",
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="px-5 py-8 lg:px-8">
      <header class="mop-panel p-6">
        <span class="mop-pill">Customer Ownership Foundation</span>
        <h1 class="mt-4 text-3xl font-black tracking-normal">Customers and portal accounts</h1>
        <p class="mt-2 text-sm text-ink-500">Customer records are mandatory. Portal accounts remain configurable and invite based.</p>
      </header>

      <div class="mop-grid mt-5">
        <article *ngFor="let customer of customers()" class="mop-card">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-xl font-black">{{ customer.fullName }}</h2>
              <p class="mt-1 text-sm text-ink-500">{{ customer.phone }}</p>
            </div>
            <span class="mop-pill">{{ customer.portalStatus }}</span>
          </div>
          <div class="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div class="rounded-md bg-black/[0.04] p-3">
              <div class="font-black">{{ customer.assetCount }}</div>
              <div class="text-ink-500">Linked assets</div>
            </div>
            <div class="rounded-md bg-black/[0.04] p-3">
              <div class="font-black">{{ customer.branchName || "Tenant" }}</div>
              <div class="text-ink-500">Scope</div>
            </div>
          </div>
        </article>
      </div>
    </section>
  `
})
export class CustomersComponent implements OnInit {
  private readonly api = inject(ApiClient);
  readonly customers = signal<CustomerDto[]>([]);

  async ngOnInit() {
    this.customers.set(await firstValueFrom(this.api.get<CustomerDto[]>("/customers")));
  }
}
