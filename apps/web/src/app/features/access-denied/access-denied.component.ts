import { CommonModule } from "@angular/common";
import { Component, inject } from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { AuthStore } from "../../core/auth/auth.store";

@Component({
  selector: "mop-access-denied",
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="px-5 py-8 lg:px-8">
      <div class="mop-panel mx-auto max-w-2xl p-8">
        <span class="mop-pill">Access Denied</span>
        <h1 class="mt-4 text-3xl font-black tracking-normal">You do not have access to {{ blockedRouteLabel() }}.</h1>
        <p class="mt-3 text-sm leading-6 text-ink-500">
          {{ deniedReason() }}
        </p>
        <a class="mop-button-primary mt-6" [routerLink]="['/', auth.allowedNavigation()[0]?.id || '']">Back to allowed workspace</a>
      </div>
    </section>
  `
})
export class AccessDeniedComponent {
  readonly auth = inject(AuthStore);
  readonly route = inject(ActivatedRoute);

  blockedRouteLabel() {
    const route = this.route.snapshot.queryParamMap.get("route") || "unknown";
    const labels: Record<string, string> = {
      billing: "Billing",
      reports: "Reports",
      inventory: "Inventory Admin",
      "inventory-home": "Inventory Home",
      "inventory-requests": "Technician Requests",
      "inventory-catalog": "Inventory POS / Catalog Control",
      "inventory-quantity": "Quantity Control & Stock Status",
      "inventory-returns": "Returns / Movements",
      "inventory-reports": "Reports & Stock Insights",
      control: "Control",
      permissions: "Role Permissions",
      pos: "Direct POS",
      customers: "Customer Management",
      "users-access": "Users & Access",
      "work-card": "Technician Work Card",
      "my-work": "Technician My Work",
      technician: "Technician Home"
    };
    return labels[route] || route;
  }

  deniedReason() {
    const route = this.route.snapshot.queryParamMap.get("route") || "unknown";
    const restrictedTo: Record<string, string> = {
      billing: "Branch Manager",
      reports: "Manager or Data Analyst",
      inventory: "Inventory Manager",
      "inventory-home": "Inventory Manager",
      "inventory-requests": "Inventory Manager",
      "inventory-catalog": "Inventory Manager",
      "inventory-quantity": "Inventory Manager",
      "inventory-returns": "Inventory Manager",
      "inventory-reports": "Inventory Manager",
      control: "Tenant Admin",
      permissions: "Tenant Admin",
      pos: "authorized Branch roles",
      customers: "Branch Manager",
      "users-access": "Tenant Admin",
      "work-card": "Technician",
      "my-work": "Technician",
      technician: "Technician"
    };
    return `This action is restricted to ${restrictedTo[route] || "another authorized role"}.`;
  }
}
