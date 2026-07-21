import { CommonModule } from "@angular/common";
import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import type {
  FinalInvoiceDto,
  FinanceConfigurationDto,
  FinanceDashboardDto,
  FinanceWorkOrderDto,
  SellableItemDto,
  SellableItemType
} from "@mop/shared";
import { firstValueFrom } from "rxjs";
import { FinanceApiService } from "../../core/api/finance-api.service";
import { AuthStore } from "../../core/auth/auth.store";

type FinancePage = "catalog" | "configuration" | "dashboard" | "invoices" | "rules" | "customer";

@Component({
  selector: "mop-finance",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="min-h-screen bg-[#f4f6f8] px-4 py-5 text-ink-950 lg:ml-72 lg:px-8 lg:py-8">
      <header class="mx-auto flex max-w-[1500px] flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-5">
        <div>
          <p class="text-xs font-bold uppercase text-emerald-700">Financial Operations</p>
          <h1 class="mt-1 text-3xl font-black">{{ pageTitle() }}</h1>
          <p class="mt-2 max-w-2xl text-sm text-black/55">{{ pageSubtitle() }}</p>
        </div>
        <div class="flex items-center gap-2 text-sm">
          <span class="rounded-md border border-black/10 bg-white px-3 py-2 font-bold">{{ currency() }}</span>
          <span *ngIf="configuration()?.platform?.forceReadOnly" class="rounded-md bg-amber-100 px-3 py-2 font-bold text-amber-900">Platform read-only</span>
        </div>
      </header>

      <section *ngIf="loading()" class="mx-auto max-w-[1500px] py-16 text-center text-sm font-bold text-black/50">Loading financial workspace...</section>
      <section *ngIf="error()" class="mx-auto mt-5 max-w-[1500px] rounded-md border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{{ error() }}</section>
      <section *ngIf="notice()" class="mx-auto mt-5 max-w-[1500px] rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">{{ notice() }}</section>

      <ng-container *ngIf="!loading()">
        <section *ngIf="page() === 'dashboard' && dashboard()" class="mx-auto mt-6 max-w-[1500px]">
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <article *ngFor="let metric of dashboardMetrics()" class="min-w-0 rounded-md border border-black/10 bg-white p-4">
              <p class="text-xs font-bold uppercase text-black/45">{{ metric.label }}</p>
              <p class="mt-3 break-words text-2xl font-black">{{ metric.value }}</p>
              <p class="mt-1 text-xs text-black/45">{{ metric.note }}</p>
            </article>
          </div>
          <div class="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <section class="min-w-0">
              <h2 class="text-lg font-black">Recent invoices</h2>
              <div class="mt-3 overflow-x-auto rounded-md border border-black/10 bg-white">
                <table class="w-full min-w-[680px] text-left text-sm">
                  <thead class="bg-black/[0.03] text-xs uppercase text-black/50">
                    <tr><th class="p-3">Invoice</th><th class="p-3">Customer</th><th class="p-3">Status</th><th class="p-3">Total</th><th class="p-3">Balance</th></tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let invoice of dashboard()!.recentInvoices" class="border-t border-black/10">
                      <td class="p-3 font-bold">{{ invoice.number }}</td>
                      <td class="p-3">{{ invoice.customerName }}</td>
                      <td class="p-3"><span class="rounded bg-black/5 px-2 py-1 text-xs font-bold">{{ label(invoice.status) }}</span></td>
                      <td class="p-3">{{ money(invoice.total) }}</td>
                      <td class="p-3 font-bold" [class.text-red-700]="invoice.balance > 0">{{ money(invoice.balance) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
            <section>
              <h2 class="text-lg font-black">Revenue by branch</h2>
              <div class="mt-3 grid gap-2">
                <div *ngFor="let branch of dashboard()!.branchRevenue" class="flex items-center justify-between gap-4 rounded-md border border-black/10 bg-white p-4">
                  <span class="truncate font-semibold">{{ branch.branchName }}</span><strong>{{ money(branch.amount) }}</strong>
                </div>
                <div *ngIf="!dashboard()!.branchRevenue.length" class="rounded-md border border-dashed border-black/20 p-6 text-sm text-black/45">Revenue appears after final invoices are issued.</div>
              </div>
            </section>
          </div>
        </section>

        <section *ngIf="page() === 'catalog'" class="mx-auto mt-6 grid max-w-[1500px] gap-6 xl:grid-cols-[360px_1fr]">
          <form class="self-start rounded-md border border-black/10 bg-white p-5" (ngSubmit)="saveCatalogItem()">
            <h2 class="text-lg font-black">Add sellable item</h2>
            <label class="mt-4 block text-xs font-bold uppercase text-black/50">Name</label>
            <input class="mop-input mt-1 w-full" name="name" [(ngModel)]="catalogForm.name" required maxlength="160">
            <label class="mt-3 block text-xs font-bold uppercase text-black/50">Type</label>
            <select class="mop-input mt-1 w-full" name="type" [(ngModel)]="catalogForm.type">
              <option *ngFor="let type of sellableTypes" [value]="type">{{ label(type) }}</option>
            </select>
            <div class="mt-3 grid grid-cols-2 gap-3">
              <label class="text-xs font-bold uppercase text-black/50">Base price<input class="mop-input mt-1 w-full" name="price" type="number" min="0" step="0.01" [(ngModel)]="catalogForm.basePrice"></label>
              <label class="text-xs font-bold uppercase text-black/50">Category<input class="mop-input mt-1 w-full" name="category" [(ngModel)]="catalogForm.category"></label>
            </div>
            <label class="mt-4 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="taxable" [(ngModel)]="catalogForm.taxable"> Taxable</label>
            <label class="mt-2 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="approval" [(ngModel)]="catalogForm.approvalRequired"> Requires customer approval</label>
            <label class="mt-2 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="customer" [(ngModel)]="catalogForm.customerVisible"> Visible to customer</label>
            <button class="mop-button-primary mt-5 w-full" type="submit" [disabled]="saving()">Add to catalog</button>
          </form>

          <section class="min-w-0">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2 class="text-lg font-black">Catalog <span class="text-black/35">({{ catalog().length }})</span></h2>
              <input class="mop-input w-full sm:w-64" placeholder="Search catalog" [(ngModel)]="search">
            </div>
            <div class="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              <article *ngFor="let item of filteredCatalog()" class="min-w-0 rounded-md border border-black/10 bg-white p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0"><p class="truncate font-black">{{ item.name }}</p><p class="mt-1 text-xs font-semibold uppercase text-black/45">{{ label(item.type) }} · {{ item.category || 'All categories' }}</p></div>
                  <span class="h-2.5 w-2.5 shrink-0 rounded-full" [class.bg-emerald-500]="item.active" [class.bg-black/20]="!item.active"></span>
                </div>
                <p class="mt-5 text-2xl font-black">{{ money(item.effectivePrice) }}</p>
                <div class="mt-4 flex flex-wrap gap-2 text-xs font-bold">
                  <span class="rounded bg-black/5 px-2 py-1">{{ item.taxable ? 'Taxable' : 'No tax' }}</span>
                  <span class="rounded bg-black/5 px-2 py-1">{{ item.approvalRequired ? 'Approval required' : 'Direct' }}</span>
                  <span class="rounded bg-black/5 px-2 py-1">{{ item.customerVisible ? 'Customer visible' : 'Internal' }}</span>
                </div>
              </article>
            </div>
          </section>
        </section>

        <section *ngIf="page() === 'configuration' && configuration()" class="mx-auto mt-6 max-w-4xl">
          <form class="rounded-md border border-black/10 bg-white p-5 sm:p-7" (ngSubmit)="saveConfiguration()">
            <div class="grid gap-5 md:grid-cols-2">
              <label class="text-sm font-bold">Currency<input class="mop-input mt-2 w-full" name="currency" maxlength="3" [(ngModel)]="configForm.currency"></label>
              <label class="text-sm font-bold">Invoice number pattern<input class="mop-input mt-2 w-full" name="pattern" [(ngModel)]="configForm.invoiceNumberPattern"><span class="mt-1 block text-xs font-normal text-black/45">Use {{ '{year}' }}, {{ '{branch}' }}, and required {{ '{seq}' }}.</span></label>
              <label class="text-sm font-bold">Tax rate %<input class="mop-input mt-2 w-full" name="taxRate" type="number" min="0" max="100" step="0.01" [(ngModel)]="configForm.taxRate"></label>
              <label class="text-sm font-bold">Branch discount limit %<input class="mop-input mt-2 w-full" name="discount" type="number" min="0" max="100" [(ngModel)]="configForm.maxBranchDiscountPercent"></label>
            </div>
            <div class="mt-6 grid gap-3 sm:grid-cols-2">
              <label *ngFor="let toggle of configToggles" class="flex items-start gap-3 border-t border-black/10 py-3 text-sm">
                <input class="mt-1" type="checkbox" [name]="toggle.key" [(ngModel)]="configForm[toggle.key]">
                <span><strong class="block">{{ toggle.label }}</strong><span class="text-xs text-black/45">{{ toggle.note }}</span></span>
              </label>
            </div>
            <label class="mt-5 block text-sm font-bold">Invoice terms<textarea class="mop-input mt-2 min-h-28 w-full" name="terms" [(ngModel)]="configForm.invoiceTerms"></textarea></label>
            <button class="mop-button-primary mt-5" type="submit" [disabled]="saving() || configuration()!.platform.forceReadOnly">Save financial policy</button>
          </form>
        </section>

        <section *ngIf="page() === 'invoices' || page() === 'customer'" class="mx-auto mt-6 max-w-[1500px]">
          <div class="grid gap-6 xl:grid-cols-[420px_1fr]">
            <section>
              <div class="flex items-center justify-between"><h2 class="text-lg font-black">{{ page() === 'customer' ? 'My invoices' : 'Invoices' }}</h2><span class="text-sm font-bold text-black/40">{{ invoices().length }}</span></div>
              <div class="mt-3 grid gap-2">
                <button *ngFor="let invoice of invoices()" type="button" (click)="selectInvoice(invoice)" class="w-full rounded-md border p-4 text-left transition" [class.border-emerald-600]="selectedInvoice()?.id === invoice.id" [class.bg-emerald-50]="selectedInvoice()?.id === invoice.id" [class.border-black/10]="selectedInvoice()?.id !== invoice.id" [class.bg-white]="selectedInvoice()?.id !== invoice.id">
                  <div class="flex items-center justify-between gap-3"><strong>{{ invoice.number }}</strong><span class="text-xs font-bold uppercase">{{ label(invoice.status) }}</span></div>
                  <p class="mt-1 truncate text-sm text-black/50">{{ invoice.customerName }} · {{ invoice.workOrderNumber }}</p>
                  <div class="mt-3 flex justify-between text-sm"><span>{{ money(invoice.total) }}</span><strong [class.text-red-700]="invoice.balance > 0">{{ money(invoice.balance) }} due</strong></div>
                </button>
                <div *ngIf="!invoices().length" class="rounded-md border border-dashed border-black/20 p-8 text-center text-sm text-black/45">No final invoices in this scope yet.</div>
              </div>
            </section>

            <section *ngIf="selectedInvoice() as invoice" class="min-w-0 rounded-md border border-black/10 bg-white">
              <div class="flex flex-wrap items-start justify-between gap-4 border-b border-black/10 p-5">
                <div><p class="text-xs font-bold uppercase text-black/40">Final invoice</p><h2 class="mt-1 text-2xl font-black">{{ invoice.number }}</h2><p class="mt-1 text-sm text-black/50">{{ invoice.customerName }} · Work order {{ invoice.workOrderNumber }}</p></div>
                <div class="text-right"><p class="text-xs font-bold uppercase text-black/40">Balance due</p><p class="mt-1 text-2xl font-black" [class.text-red-700]="invoice.balance > 0">{{ money(invoice.balance) }}</p><span class="text-xs font-bold uppercase">{{ label(invoice.status) }}</span></div>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full min-w-[640px] text-left text-sm">
                  <thead class="bg-black/[0.02] text-xs uppercase text-black/45"><tr><th class="p-4">Item</th><th class="p-4">Qty</th><th class="p-4">Unit</th><th class="p-4">Tax</th><th class="p-4 text-right">Total</th></tr></thead>
                  <tbody><tr *ngFor="let line of invoice.lines" class="border-t border-black/10"><td class="p-4 font-semibold">{{ line.title }}</td><td class="p-4">{{ line.quantity }}</td><td class="p-4">{{ money(line.unitPrice) }}</td><td class="p-4">{{ money(line.taxAmount) }}</td><td class="p-4 text-right font-bold">{{ money(line.total) }}</td></tr></tbody>
                </table>
              </div>
              <div class="ml-auto grid max-w-sm gap-2 p-5 text-sm">
                <div class="flex justify-between"><span>Subtotal</span><strong>{{ money(invoice.subtotal) }}</strong></div>
                <div class="flex justify-between"><span>Discount</span><strong>-{{ money(invoice.discount) }}</strong></div>
                <div class="flex justify-between"><span>Tax</span><strong>{{ money(invoice.tax) }}</strong></div>
                <div class="flex justify-between border-t border-black/10 pt-3 text-lg"><span>Total</span><strong>{{ money(invoice.total) }}</strong></div>
                <div class="flex justify-between text-emerald-700"><span>Paid</span><strong>{{ money(invoice.paid) }}</strong></div>
              </div>
              <form *ngIf="canRecordPayment() && invoice.balance > 0" class="grid gap-3 border-t border-black/10 bg-black/[0.02] p-5 sm:grid-cols-[1fr_1fr_auto]" (ngSubmit)="recordPayment(invoice)">
                <input class="mop-input" name="amount" type="number" min="0.01" step="0.01" [max]="invoice.balance" [(ngModel)]="paymentForm.amount" placeholder="Amount">
                <select class="mop-input" name="method" [(ngModel)]="paymentForm.method"><option *ngFor="let method of configuration()?.paymentMethods" [value]="method">{{ label(method) }}</option></select>
                <button class="mop-button-primary" type="submit" [disabled]="saving()">Record payment</button>
              </form>
            </section>
          </div>
        </section>

        <section *ngIf="page() === 'rules'" class="mx-auto mt-6 max-w-4xl">
          <div class="grid gap-4 md:grid-cols-2">
            <article class="rounded-md border border-black/10 bg-white p-5"><h2 class="text-lg font-black">Discount guard</h2><p class="mt-2 text-sm text-black/55">Branch discounts above {{ configuration()?.discountApprovalThreshold }}% become approval requests. Technicians cannot apply discounts by default.</p></article>
            <article class="rounded-md border border-black/10 bg-white p-5"><h2 class="text-lg font-black">Refund guard</h2><p class="mt-2 text-sm text-black/55">Issued invoices stay immutable. Approved corrections create credit notes and preserve the original invoice.</p></article>
            <article class="rounded-md border border-black/10 bg-white p-5"><h2 class="text-lg font-black">Delivery lock</h2><p class="mt-2 text-sm text-black/55">{{ configuration()?.allowUnpaidDelivery ? 'Owner policy permits unpaid delivery where platform allows it.' : 'Full payment is required before delivery.' }}</p></article>
            <article class="rounded-md border border-black/10 bg-white p-5"><h2 class="text-lg font-black">Platform authority</h2><p class="mt-2 text-sm text-black/55">Platform controls always override Owner finance settings, permissions, refunds, reports, and delivery overrides.</p></article>
          </div>
        </section>
      </ng-container>
    </main>
  `
})
export class FinanceComponent implements OnInit {
  private readonly api = inject(FinanceApiService);
  private readonly route = inject(ActivatedRoute);
  readonly auth = inject(AuthStore);

  readonly page = signal<FinancePage>("dashboard");
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal("");
  readonly notice = signal("");
  readonly configuration = signal<FinanceConfigurationDto | null>(null);
  readonly dashboard = signal<FinanceDashboardDto | null>(null);
  readonly catalog = signal<SellableItemDto[]>([]);
  readonly invoices = signal<FinalInvoiceDto[]>([]);
  readonly selectedInvoice = signal<FinalInvoiceDto | null>(null);
  readonly selectedWorkOrder = signal<FinanceWorkOrderDto | null>(null);

  search = "";
  readonly sellableTypes: SellableItemType[] = ["inspection", "service", "labor", "part", "package", "extra_fee"];
  catalogForm = { name: "", type: "service" as SellableItemType, basePrice: 0, category: "", taxable: false, approvalRequired: true, customerVisible: true };
  configForm: any = {};
  paymentForm = { amount: 0, method: "cash" };
  readonly configToggles = [
    { key: "taxEnabled", label: "Tax calculation", note: "Apply the configured rate only to taxable items." },
    { key: "depositAllowed", label: "Deposits", note: "Allow advance payment before final invoice." },
    { key: "allowUnpaidDelivery", label: "Unpaid delivery override", note: "Available only when the platform permits it." },
    { key: "allowPartialPaidDelivery", label: "Partial payment delivery", note: "Allow handover after a partial payment." },
    { key: "customerInvoiceVisible", label: "Customer invoice visibility", note: "Show selling prices and payment state to the customer." },
    { key: "technicianPriceVisible", label: "Technician price visibility", note: "Never reveals inventory cost or margin." },
    { key: "inventoryPriceEditable", label: "Inventory selling price edits", note: "Allows authorized Inventory Managers to manage selling price." }
  ];

  readonly currency = computed(() => this.configuration()?.currency || this.dashboard()?.currency || "EGP");
  readonly filteredCatalog = computed(() => {
    const query = this.search.trim().toLowerCase();
    return query ? this.catalog().filter((item) => `${item.name} ${item.type} ${item.category}`.toLowerCase().includes(query)) : this.catalog();
  });
  readonly dashboardMetrics = computed(() => {
    const data = this.dashboard();
    if (!data) return [];
    return [
      { label: "Today revenue", value: this.money(data.todayRevenue), note: "Confirmed payments" },
      { label: "Month revenue", value: this.money(data.monthRevenue), note: "Current month" },
      { label: "Unpaid invoices", value: String(data.unpaidInvoices), note: this.money(data.overdueAmount) + " overdue" },
      { label: "Average invoice", value: this.money(data.averageInvoiceValue), note: "Issued invoices" },
      { label: "Refunds", value: this.money(data.refunds), note: this.money(data.discountsGiven) + " discounts" }
    ];
  });

  async ngOnInit() {
    this.page.set((this.route.snapshot.data["financePage"] || "dashboard") as FinancePage);
    await this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set("");
    try {
      if (this.auth.hasPermission("finance.configuration.view")) {
        const config = await firstValueFrom(this.api.configuration());
        this.configuration.set(config);
        this.configForm = { ...config };
        this.paymentForm.method = config.paymentMethods[0] || "cash";
      }
      if (this.page() === "dashboard") this.dashboard.set(await firstValueFrom(this.api.dashboard()));
      if (this.page() === "catalog") this.catalog.set(await firstValueFrom(this.api.catalog()));
      if (this.page() === "invoices" || this.page() === "customer") {
        const rows = await firstValueFrom(this.api.invoices());
        this.invoices.set(rows);
        this.selectedInvoice.set(rows[0] || null);
        this.paymentForm.amount = rows[0]?.balance || 0;
      }
    } catch (error: any) {
      this.error.set(error?.error?.message || "Financial data could not be loaded.");
    } finally {
      this.loading.set(false);
    }
  }

  async saveCatalogItem() {
    this.saving.set(true);
    this.clearMessages();
    try {
      await firstValueFrom(this.api.saveCatalogItem(this.catalogForm));
      this.catalogForm = { name: "", type: "service", basePrice: 0, category: "", taxable: false, approvalRequired: true, customerVisible: true };
      this.catalog.set(await firstValueFrom(this.api.catalog()));
      this.notice.set("Catalog item created. Existing approved prices were not changed.");
    } catch (error: any) {
      this.error.set(error?.error?.message || "Catalog item could not be saved.");
    } finally {
      this.saving.set(false);
    }
  }

  async saveConfiguration() {
    this.saving.set(true);
    this.clearMessages();
    try {
      const config = await firstValueFrom(this.api.saveConfiguration(this.configForm));
      this.configuration.set(config);
      this.configForm = { ...config };
      this.notice.set("Financial policy saved and audited.");
    } catch (error: any) {
      this.error.set(error?.error?.message || "Financial policy could not be saved.");
    } finally {
      this.saving.set(false);
    }
  }

  selectInvoice(invoice: FinalInvoiceDto) {
    this.selectedInvoice.set(invoice);
    this.paymentForm.amount = invoice.balance;
  }

  async recordPayment(invoice: FinalInvoiceDto) {
    this.saving.set(true);
    this.clearMessages();
    try {
      await firstValueFrom(this.api.recordPayment(invoice.id, this.paymentForm));
      const rows = await firstValueFrom(this.api.invoices());
      this.invoices.set(rows);
      this.selectedInvoice.set(rows.find((row) => row.id === invoice.id) || null);
      this.notice.set("Payment recorded. Delivery gate was recalculated.");
    } catch (error: any) {
      this.error.set(error?.error?.message || "Payment could not be recorded.");
    } finally {
      this.saving.set(false);
    }
  }

  canRecordPayment() {
    return this.auth.hasPermission("finance.payment.record") && this.configuration()?.platform.paymentRecordingEnabled;
  }

  pageTitle() {
    const titles: Record<FinancePage, string> = {
      catalog: "Pricing Catalog",
      configuration: "Financial Configuration",
      dashboard: "Financial Dashboard",
      invoices: this.auth.session()?.roleId === "branch_manager" ? "Branch Invoices" : "Invoices & Payments",
      rules: "Discounts & Refund Rules",
      customer: "Invoice & Payment"
    };
    return titles[this.page()];
  }

  pageSubtitle() {
    const subtitles: Record<FinancePage, string> = {
      catalog: "One source for services, labor, packages, fees, and inventory-linked selling prices.",
      configuration: "Tax, discounts, payment methods, invoice numbering, visibility, and delivery policy.",
      dashboard: "Company revenue, collections, unpaid balances, refunds, and branch performance.",
      invoices: "Locked final invoices, payment collection, and branch-scoped balances.",
      rules: "Approval thresholds and immutable correction rules for discounts and refunds.",
      customer: "Transparent selling prices, final invoices, receipts, and payment status."
    };
    return subtitles[this.page()];
  }

  money(value: number) {
    return new Intl.NumberFormat("en-EG", { style: "currency", currency: this.currency(), maximumFractionDigits: 2 }).format(value || 0);
  }

  label(value: string) {
    return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private clearMessages() {
    this.error.set("");
    this.notice.set("");
  }
}
