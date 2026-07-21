import { Routes } from "@angular/router";
import { authGuard } from "./core/auth/auth.guard";
import { AccessDeniedComponent } from "./features/access-denied/access-denied.component";
import { AuditComponent } from "./features/audit/audit.component";
import { BranchManagerComponent } from "./features/branch-manager/branch-manager.component";
import { BuilderComponent } from "./features/builder/builder.component";
import { CustomersComponent } from "./features/customers/customers.component";
import { CustomerDecisionPublicComponent } from "./features/customer-decision-public/customer-decision-public.component";
import { CustomerDecisionsComponent } from "./features/customer-decisions/customer-decisions.component";
import { DashboardComponent } from "./features/dashboard/dashboard.component";
import { IdentityGatewayComponent } from "./features/identity-gateway/identity-gateway.component";
import { InvitationComponent } from "./features/invitation/invitation.component";
import { InventoryComponent } from "./features/inventory/inventory.component";
import { PlatformCommandCenterComponent } from "./features/platform/platform-command-center.component";
import { TechnicianHomeComponent } from "./features/technician/technician-home.component";
import { TechnicianMyWorkComponent } from "./features/technician/technician-my-work.component";
import { TechnicianWorkCardComponent } from "./features/technician/technician-work-card.component";
import { TeamReviewComponent } from "./features/team-leader/team-review.component";
import { UsersAccessComponent } from "./features/users-access/users-access.component";
import { WorkOrdersComponent } from "./features/work-orders/work-orders.component";
import { WorkflowHealthComponent } from "./features/workflow-health/workflow-health.component";
import { ReportsComponent } from "./features/reports/reports.component";
import { FinanceComponent } from "./features/finance/finance.component";

export const appRoutes: Routes = [
  { path: "", component: IdentityGatewayComponent },
  { path: "invite/:token", component: InvitationComponent },
  { path: "platform", component: PlatformCommandCenterComponent, canActivate: [authGuard], data: { routeId: "platform", platformPage: "workshops" } },
  { path: "platform-add-workshop", component: PlatformCommandCenterComponent, canActivate: [authGuard], data: { routeId: "platform-add-workshop", platformPage: "add-workshop" } },
  { path: "platform-reports", component: PlatformCommandCenterComponent, canActivate: [authGuard], data: { routeId: "platform-reports", platformPage: "reports" } },
  { path: "platform-live-view", component: PlatformCommandCenterComponent, canActivate: [authGuard], data: { routeId: "platform-live-view", platformPage: "live-view" } },
  { path: "platform-control", component: PlatformCommandCenterComponent, canActivate: [authGuard], data: { routeId: "platform-control", platformPage: "control" } },
  { path: "tenant", component: DashboardComponent, canActivate: [authGuard], data: { routeId: "tenant", title: "Tenant Workspace", subtitle: "Identity, categories, branches, and operational health." } },
  { path: "workflow-health", component: WorkflowHealthComponent, canActivate: [authGuard], data: { routeId: "workflow-health" } },
  { path: "pricing-catalog", component: FinanceComponent, canActivate: [authGuard], data: { routeId: "pricing-catalog", financePage: "catalog" } },
  { path: "financial-configuration", component: FinanceComponent, canActivate: [authGuard], data: { routeId: "financial-configuration", financePage: "configuration" } },
  { path: "financial-dashboard", component: FinanceComponent, canActivate: [authGuard], data: { routeId: "financial-dashboard", financePage: "dashboard" } },
  { path: "invoices-payments", component: FinanceComponent, canActivate: [authGuard], data: { routeId: "invoices-payments", financePage: "invoices" } },
  { path: "discounts-refunds", component: FinanceComponent, canActivate: [authGuard], data: { routeId: "discounts-refunds", financePage: "rules" } },
  { path: "branch-invoices", component: FinanceComponent, canActivate: [authGuard], data: { routeId: "branch-invoices", financePage: "invoices" } },
  { path: "customer-finance", component: FinanceComponent, canActivate: [authGuard], data: { routeId: "customer-finance", financePage: "customer" } },
  { path: "builder-home", component: BuilderComponent, canActivate: [authGuard], data: { routeId: "builder-home", builderPage: "home" } },
  { path: "builder-brand-theme", component: BuilderComponent, canActivate: [authGuard], data: { routeId: "builder-brand-theme", builderPage: "brand-theme" } },
  { path: "builder-page-builder", component: BuilderComponent, canActivate: [authGuard], data: { routeId: "builder-page-builder", builderPage: "page-builder" } },
  { path: "builder-role-experience", component: BuilderComponent, canActivate: [authGuard], data: { routeId: "builder-role-experience", builderPage: "role-experience" } },
  { path: "builder-workflow-feature", component: BuilderComponent, canActivate: [authGuard], data: { routeId: "builder-workflow-feature", builderPage: "workflow-feature" } },
  { path: "builder-forms-fields", component: BuilderComponent, canActivate: [authGuard], data: { routeId: "builder-forms-fields", builderPage: "forms-fields" } },
  { path: "builder-messages-templates", component: BuilderComponent, canActivate: [authGuard], data: { routeId: "builder-messages-templates", builderPage: "messages-templates" } },
  { path: "builder-organization-access", component: BuilderComponent, canActivate: [authGuard], data: { routeId: "builder-organization-access", builderPage: "organization-access" } },
  { path: "builder-configuration-permissions", component: BuilderComponent, canActivate: [authGuard], data: { routeId: "builder-configuration-permissions", builderPage: "configuration-permissions" } },
  { path: "builder-publish-center", component: BuilderComponent, canActivate: [authGuard], data: { routeId: "builder-publish-center", builderPage: "publish-center" } },
  { path: "builder-audit-rollback", component: BuilderComponent, canActivate: [authGuard], data: { routeId: "builder-audit-rollback", builderPage: "audit-rollback" } },
  { path: "users-access", component: UsersAccessComponent, canActivate: [authGuard], data: { routeId: "users-access" } },
  { path: "customers", component: CustomersComponent, canActivate: [authGuard], data: { routeId: "customers" } },
  { path: "customer-decisions", component: CustomerDecisionsComponent, canActivate: [authGuard], data: { routeId: "customer-decisions" } },
  { path: "branch", component: BranchManagerComponent, canActivate: [authGuard], data: { routeId: "branch", branchPage: "home" } },
  { path: "branch-home", component: BranchManagerComponent, canActivate: [authGuard], data: { routeId: "branch-home", branchPage: "home" } },
  { path: "branch-intake", component: BranchManagerComponent, canActivate: [authGuard], data: { routeId: "branch-intake", branchPage: "intake" } },
  { path: "branch-work-orders", component: BranchManagerComponent, canActivate: [authGuard], data: { routeId: "branch-work-orders", branchPage: "work-orders" } },
  { path: "branch-workspace", component: BranchManagerComponent, canActivate: [authGuard], data: { routeId: "branch-workspace", branchPage: "workspace" } },
  { path: "branch-decisions", component: BranchManagerComponent, canActivate: [authGuard], data: { routeId: "branch-decisions", branchPage: "decisions" } },
  { path: "branch-delivery", component: BranchManagerComponent, canActivate: [authGuard], data: { routeId: "branch-delivery", branchPage: "delivery" } },
  { path: "work-orders", component: WorkOrdersComponent, canActivate: [authGuard], data: { routeId: "work-orders" } },
  { path: "quotations", component: DashboardComponent, canActivate: [authGuard], data: { routeId: "quotations", title: "Quotation Decisions", subtitle: "Customer approvals, rejections, critical warnings, and WhatsApp decision logging." } },
  { path: "pos", component: DashboardComponent, canActivate: [authGuard], data: { routeId: "pos", title: "Direct POS", subtitle: "Counter sales and non-work-order item checkout for authorized branch roles." } },
  { path: "billing", component: DashboardComponent, canActivate: [authGuard], data: { routeId: "billing", title: "Billing & Delivery Gate", subtitle: "Payments, locked invoices, refunds, and delivery release controls." } },
  { path: "inventory", component: InventoryComponent, canActivate: [authGuard], data: { routeId: "inventory", inventoryPage: "catalog" } },
  { path: "inventory-home", component: InventoryComponent, canActivate: [authGuard], data: { routeId: "inventory-home", inventoryPage: "home" } },
  { path: "inventory-requests", component: InventoryComponent, canActivate: [authGuard], data: { routeId: "inventory-requests", inventoryPage: "requests" } },
  { path: "inventory-catalog", component: InventoryComponent, canActivate: [authGuard], data: { routeId: "inventory-catalog", inventoryPage: "catalog" } },
  { path: "inventory-quantity", component: InventoryComponent, canActivate: [authGuard], data: { routeId: "inventory-quantity", inventoryPage: "quantity" } },
  { path: "inventory-returns", component: InventoryComponent, canActivate: [authGuard], data: { routeId: "inventory-returns", inventoryPage: "returns" } },
  { path: "inventory-reports", component: InventoryComponent, canActivate: [authGuard], data: { routeId: "inventory-reports", inventoryPage: "reports" } },
  { path: "reports", component: ReportsComponent, canActivate: [authGuard], data: { routeId: "reports", title: "Reports & Analytics" } },
  { path: "analytics-home", component: ReportsComponent, canActivate: [authGuard], data: { routeId: "analytics-home", title: "Analytics Home" } },
  { path: "analytics-operations", component: ReportsComponent, canActivate: [authGuard], data: { routeId: "analytics-operations", title: "Operations Analytics" } },
  { path: "analytics-people", component: ReportsComponent, canActivate: [authGuard], data: { routeId: "analytics-people", title: "People Performance" } },
  { path: "analytics-inventory-customer", component: ReportsComponent, canActivate: [authGuard], data: { routeId: "analytics-inventory-customer", title: "Inventory & Customer Decisions" } },
  { path: "control", component: DashboardComponent, canActivate: [authGuard], data: { routeId: "control", title: "Control Center", subtitle: "Tenant modules, categories, role toggles, and dependency impact controls." } },
  { path: "permissions", component: DashboardComponent, canActivate: [authGuard], data: { routeId: "permissions", title: "Role Permissions", subtitle: "Role to page to action matrix with backend-owned permission templates." } },
  { path: "technician", component: TechnicianHomeComponent, canActivate: [authGuard], data: { routeId: "technician" } },
  { path: "my-work", component: TechnicianMyWorkComponent, canActivate: [authGuard], data: { routeId: "my-work" } },
  { path: "work-card", component: TechnicianWorkCardComponent, canActivate: [authGuard], data: { routeId: "work-card" } },
  { path: "task", redirectTo: "work-card" },
  { path: "parts-pos", redirectTo: "work-card" },
  { path: "inspection", redirectTo: "work-card" },
  { path: "team-review", component: TeamReviewComponent, canActivate: [authGuard], data: { routeId: "team-review" } },
  { path: "audit", component: AuditComponent, canActivate: [authGuard], data: { routeId: "audit" } },
  { path: "customer", component: WorkOrdersComponent, canActivate: [authGuard], data: { routeId: "customer", customerPortal: true } },
  { path: "decision/:token", component: CustomerDecisionPublicComponent },
  { path: "access-denied", component: AccessDeniedComponent },
  { path: "**", redirectTo: "" }
];
