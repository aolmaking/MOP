import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, signal } from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { AuthStore } from "../../core/auth/auth.store";
import { ApiClient } from "../../core/api/api-client.service";

@Component({
  selector: "mop-dashboard",
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="min-h-screen bg-[#f8fafc] px-4 py-6 md:px-8">
      <div class="mx-auto max-w-7xl space-y-6">
        <!-- Header Cockpit Banner -->
        <header class="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 md:p-8 text-white shadow-xl">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="space-y-2">
              <div class="flex items-center gap-3">
                <span class="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-black uppercase tracking-wider text-amber-400 border border-amber-500/30">
                  {{ auth.session()?.tenantName || "Workshop Owner Console" }}
                </span>
                <span class="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 border border-emerald-500/30">
                  Tenant Active
                </span>
              </div>
              <h1 class="text-3xl md:text-4xl font-black tracking-tight text-white">
                {{ route.snapshot.data["title"] || "Workshop Control Cockpit" }}
              </h1>
              <p class="max-w-2xl text-sm text-slate-300">
                {{ route.snapshot.data["subtitle"] || "Manage organization access, role permissions, brand design, workflows, pricing, and reports across all branches." }}
              </p>
            </div>

            <div class="rounded-xl border border-white/10 bg-white/10 p-4 text-xs space-y-1.5 backdrop-blur-md">
              <div class="font-bold text-slate-200">Owner Identity: <span class="text-amber-400 font-extrabold">{{ auth.session()?.user?.name || "Tenant Owner" }}</span></div>
              <div class="text-slate-300">Tenant Slug: <span class="font-mono text-slate-100">{{ auth.session()?.tenantSlug || "apex" }}</span></div>
              <div class="text-slate-300">Active Role: <span class="font-bold text-emerald-400">{{ auth.session()?.role || "tenant_owner" }}</span></div>
            </div>
          </div>
        </header>

        <!-- Operational Health Summary Cards Grid -->
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <a [routerLink]="['/work-orders']" class="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md hover:border-indigo-400">
            <div class="flex items-center justify-between">
              <span class="text-xs font-extrabold uppercase text-slate-400">Open Work Orders</span>
              <span class="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-black text-indigo-600">Active Jobs</span>
            </div>
            <div class="mt-3 text-3xl font-black text-slate-900 group-hover:text-indigo-600 transition">{{ metrics().openWorkOrders }}</div>
            <p class="mt-1 text-xs text-slate-500">Click to view active vehicles & lifecycle stage</p>
          </a>

          <a [routerLink]="['/customer-decisions']" class="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md hover:border-amber-400">
            <div class="flex items-center justify-between">
              <span class="text-xs font-extrabold uppercase text-slate-400">Waiting Approvals</span>
              <span class="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-600">Customer Pending</span>
            </div>
            <div class="mt-3 text-3xl font-black text-slate-900 group-hover:text-amber-600 transition">{{ metrics().waitingCustomerApprovals }}</div>
            <p class="mt-1 text-xs text-slate-500">Quotes & repair decisions awaiting response</p>
          </a>

          <a [routerLink]="['/inventory-requests']" class="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md hover:border-rose-400">
            <div class="flex items-center justify-between">
              <span class="text-xs font-extrabold uppercase text-slate-400">Waiting Parts</span>
              <span class="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-black text-rose-600">Inventory Needed</span>
            </div>
            <div class="mt-3 text-3xl font-black text-slate-900 group-hover:text-rose-600 transition">{{ metrics().waitingParts }}</div>
            <p class="mt-1 text-xs text-slate-500">Technician part requisitions awaiting fulfillment</p>
          </a>

          <a [routerLink]="['/invoices-payments']" class="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md hover:border-emerald-400">
            <div class="flex items-center justify-between">
              <span class="text-xs font-extrabold uppercase text-slate-400">Payment Pending</span>
              <span class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-600">Finance Gate</span>
            </div>
            <div class="mt-3 text-3xl font-black text-slate-900 group-hover:text-emerald-600 transition">{{ metrics().paymentPending }}</div>
            <p class="mt-1 text-xs text-slate-500">Work orders ready for checkout & invoice payment</p>
          </a>
        </div>

        <!-- 13 Owner Control Hub Grid -->
        <section class="space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-black text-slate-900 tracking-tight">13 Owner Control & Configuration Centers</h2>
            <span class="text-xs font-bold text-slate-500">Workshop Operational & Design Control</span>
          </div>

          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <a
              *ngFor="let hub of ownerHubs"
              [routerLink]="['/' + hub.route]"
              class="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:border-indigo-500"
            >
              <div class="flex items-center justify-between">
                <span class="rounded-xl bg-slate-100 p-3 text-slate-800 font-black text-sm group-hover:bg-indigo-600 group-hover:text-white transition">
                  {{ hub.num }}
                </span>
                <span class="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-extrabold text-slate-600 uppercase tracking-wider">
                  {{ hub.badge }}
                </span>
              </div>
              <h3 class="mt-4 text-lg font-black text-slate-900 group-hover:text-indigo-600 transition">{{ hub.title }}</h3>
              <p class="mt-2 text-xs text-slate-500 leading-relaxed">{{ hub.desc }}</p>
              <div class="mt-4 flex items-center gap-1 text-xs font-bold text-indigo-600 group-hover:translate-x-1 transition">
                <span>Configure Area</span>
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
              </div>
            </a>
          </div>
        </section>
      </div>
    </section>
  `
})
export class DashboardComponent implements OnInit {
  readonly auth = inject(AuthStore);
  readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiClient);

  readonly metrics = signal({
    openWorkOrders: 12,
    waitingCustomerApprovals: 3,
    waitingParts: 4,
    paymentPending: 2,
    lowStock: 5,
    builderDraftStatus: "Customized Draft"
  });

  readonly ownerHubs = [
    { num: "01", title: "Owner Home", route: "tenant", badge: "Cockpit View", desc: "Central workshop health monitor, operational stats, low stock alerts, and builder status." },
    { num: "02", title: "Organization & Access", route: "users-access", badge: "Staff & Scopes", desc: "Add staff users, assign roles, branch scope, warehouse scope, category scope, and create teams." },
    { num: "03", title: "Configuration & Permissions", route: "builder-configuration-permissions", badge: "Role Matrix", desc: "Role templates, user overrides, permission matrix, route guards, and platform lock boundaries." },
    { num: "04", title: "Workshop Builder", route: "builder-brand-theme", badge: "Brand & Theme", desc: "Logo, brand colors, primary accent, card density, border radius, and design tokens across all pages." },
    { num: "05", title: "Page Builder", route: "builder-page-builder", badge: "Page Layouts", desc: "Reorder sections, hide optional blocks, rename section titles, and customize view density." },
    { num: "06", title: "Role Experience Studio", route: "builder-role-experience", badge: "Role UX Modes", desc: "Simple vs advanced mode per role, landing pages, visible shortcuts, and navigation density." },
    { num: "07", title: "Workflow & Feature Studio", route: "builder-workflow-feature", badge: "Workflows", desc: "Enable/disable Quick Inspection, Quick Service, Team Leader QC review, and delivery payment locks." },
    { num: "08", title: "Forms & Fields", route: "builder-forms-fields", badge: "Custom Fields", desc: "Add custom fields to Quick Inspection, Part Requisitions, Asset intake, and invoice notes." },
    { num: "09", title: "Messages & Templates", route: "builder-messages-templates", badge: "Notifications", desc: "Customize WhatsApp decision templates, approval request links, and customer status SMS." },
    { num: "10", title: "Pricing & Financial Config", route: "pricing-catalog", badge: "Pricing & VAT", desc: "Service catalog prices, labor rates, package deals, tax rules, deposit thresholds, and payment methods." },
    { num: "11", title: "Reports & Analytics", route: "reports", badge: "Analytics Hub", desc: "Company-wide operations, branch comparison, technician performance, inventory risk, and finance reports." },
    { num: "12", title: "Audit & Change History", route: "builder-audit-rollback", badge: "Audit Trail", desc: "Track every permission change, builder publish event, pricing edit, and policy rollback with actor timestamps." },
    { num: "13", title: "Publish Center & Preview", route: "builder-publish-center", badge: "Impact Safety", desc: "Validate drafts, analyze cross-page impact preview, confirm reasons, and publish live changes safely." }
  ];

  ngOnInit() {
    void this.loadMetrics();
  }

  async loadMetrics() {
    try {
      const data = await this.api.get<any>("/reports/dashboard-summary").toPromise();
      if (data) {
        this.metrics.set({
          openWorkOrders: data.openWorkOrders ?? 12,
          waitingCustomerApprovals: data.waitingCustomerApprovals ?? 3,
          waitingParts: data.waitingParts ?? 4,
          paymentPending: data.paymentPending ?? 2,
          lowStock: data.lowStock ?? 5,
          builderDraftStatus: data.builderDraftStatus ?? "Customized Draft"
        });
      }
    } catch {
      // Fallback to default metrics if summary API is not available
    }
  }
}
