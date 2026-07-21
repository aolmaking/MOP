import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, signal } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { ApiClient } from "../../core/api/api-client.service";
import { AuthStore } from "../../core/auth/auth.store";

interface ReportsOverview {
  scope: { role: string; branchIds: string[]; warehouseIds: string[]; readOnly: boolean };
  metrics: Array<{ key: string; label: string; value: string | number; suffix?: string; tone: string }>;
  statusBreakdown: Array<{ label: string; value: number }>;
  branches: Array<{ id: string; label: string; workOrders: number; open: number; revenue: number }>;
  technicians: Array<{ id: string; name: string; tasks: number; readyQc: number; blocked: number }>;
  recentActivity: Array<{ id: string; actor: string; action: string; target: string; at: string }>;
}

@Component({
  selector: "mop-reports",
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="min-h-screen bg-[#f4f6f8] px-4 py-6 lg:ml-72 lg:px-8">
      <header class="mx-auto flex max-w-[1500px] flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-5">
        <div><p class="text-xs font-bold uppercase text-emerald-700">Read-only intelligence</p><h1 class="mt-1 text-3xl font-black">{{ title() }}</h1><p class="mt-2 text-sm text-black/50">Metrics are filtered by the current tenant, role, and assigned operational scope.</p></div>
        <button *ngIf="canExport()" class="mop-button-secondary" type="button" (click)="exportCsv()">Export CSV</button>
      </header>
      <div *ngIf="error()" class="mx-auto mt-5 max-w-[1500px] rounded-md border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{{ error() }}</div>

      <ng-container *ngIf="data() as report">
        <section class="mx-auto mt-6 grid max-w-[1500px] gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article *ngFor="let metric of report.metrics" class="min-w-0 rounded-md border border-black/10 bg-white p-4">
            <p class="text-xs font-bold uppercase text-black/45">{{ metric.label }}</p><p class="mt-3 break-words text-2xl font-black">{{ metric.value }} <span class="text-sm text-black/40">{{ metric.suffix }}</span></p>
          </article>
        </section>
        <section class="mx-auto mt-6 grid max-w-[1500px] gap-6 xl:grid-cols-2">
          <div>
            <h2 class="text-lg font-black">Work status</h2>
            <div class="mt-3 grid gap-2 rounded-md border border-black/10 bg-white p-4">
              <div *ngFor="let row of report.statusBreakdown" class="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-black/5 py-2 last:border-0"><span class="capitalize">{{ row.label }}</span><strong>{{ row.value }}</strong></div>
              <p *ngIf="!report.statusBreakdown.length" class="py-5 text-center text-sm text-black/40">No work-order data in this scope.</p>
            </div>
          </div>
          <div>
            <h2 class="text-lg font-black">Branch performance</h2>
            <div class="mt-3 overflow-x-auto rounded-md border border-black/10 bg-white">
              <table class="w-full min-w-[520px] text-left text-sm"><thead class="bg-black/[0.03] text-xs uppercase text-black/45"><tr><th class="p-3">Branch</th><th class="p-3">Work Orders</th><th class="p-3">Open</th><th class="p-3">Revenue</th></tr></thead><tbody><tr *ngFor="let row of report.branches" class="border-t border-black/10"><td class="p-3 font-bold">{{ row.label }}</td><td class="p-3">{{ row.workOrders }}</td><td class="p-3">{{ row.open }}</td><td class="p-3">{{ row.revenue | number }} EGP</td></tr></tbody></table>
            </div>
          </div>
        </section>
        <section class="mx-auto mt-6 grid max-w-[1500px] gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div>
            <h2 class="text-lg font-black">Technician workload</h2>
            <div class="mt-3 overflow-x-auto rounded-md border border-black/10 bg-white">
              <table class="w-full min-w-[560px] text-left text-sm"><thead class="bg-black/[0.03] text-xs uppercase text-black/45"><tr><th class="p-3">Technician</th><th class="p-3">Tasks</th><th class="p-3">Ready QC</th><th class="p-3">Blocked</th></tr></thead><tbody><tr *ngFor="let row of report.technicians" class="border-t border-black/10"><td class="p-3 font-bold">{{ row.name }}</td><td class="p-3">{{ row.tasks }}</td><td class="p-3">{{ row.readyQc }}</td><td class="p-3">{{ row.blocked }}</td></tr></tbody></table>
            </div>
          </div>
          <div>
            <h2 class="text-lg font-black">Recent audited activity</h2>
            <div class="mt-3 grid max-h-96 gap-0 overflow-y-auto rounded-md border border-black/10 bg-white">
              <div *ngFor="let row of report.recentActivity" class="border-b border-black/10 p-3 last:border-0"><p class="text-sm font-bold">{{ label(row.action) }}</p><p class="mt-1 text-xs text-black/45">{{ row.actor }} · {{ row.at | date:'short' }}</p></div>
            </div>
          </div>
        </section>
      </ng-container>
    </main>
  `
})
export class ReportsComponent implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly route = inject(ActivatedRoute);
  readonly auth = inject(AuthStore);
  readonly data = signal<ReportsOverview | null>(null);
  readonly error = signal("");

  async ngOnInit() {
    try { this.data.set(await firstValueFrom(this.api.get<ReportsOverview>("/reports/overview"))); }
    catch (error: any) { this.error.set(error?.error?.message || "Reports could not be loaded for this scope."); }
  }

  title() { return String(this.route.snapshot.data["title"] || "Reports & Analytics"); }
  canExport() { return this.auth.hasAnyPermission(["reports.export", "reports.export.csv", "reports.export.excel"]); }
  label(value: string) { return value.replaceAll("_", " ").replaceAll(".", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

  exportCsv() {
    const report = this.data();
    if (!report) return;
    const rows = [["Metric", "Value"], ...report.metrics.map((metric) => [metric.label, `${metric.value}${metric.suffix ? ` ${metric.suffix}` : ""}`])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `mop-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
}
