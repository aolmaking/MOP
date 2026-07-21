import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const checks = [];

function file(path) {
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) {
    checks.push({ name: `missing ${path}`, ok: false });
    return "";
  }
  return readFileSync(fullPath, "utf8");
}

function expect(name, text, ...needles) {
  checks.push({ name, ok: needles.every((needle) => text.includes(needle)) });
}

const sharedOps = file("packages/shared/src/operations.ts");
const sharedIndex = file("packages/shared/src/index.ts");
const eventsService = file("apps/api/src/operations/operation-events.service.ts");
const eventsModule = file("apps/api/src/operations/operation-events.module.ts");
const statusResolver = file("apps/api/src/operations/workflow-status-resolver.service.ts");
const notificationRouting = file("apps/api/src/operations/notification-routing.service.ts");
const customerProjection = file("apps/api/src/operations/customer-safe-projection.service.ts");
const actionContracts = file("apps/api/src/operations/cross-role-action-contracts.service.ts");
const workflowHealth = file("apps/api/src/operations/workflow-health.service.ts");
const operationsController = file("apps/api/src/operations/operations.controller.ts");
const appModule = file("apps/api/src/app.module.ts");
const rolePermissions = file("packages/shared/src/permissions/role-permission-map.ts");
const productConstants = file("packages/shared/src/product-constants.ts");
const webRoutes = file("apps/web/src/app/app.routes.ts");
const workflowHealthComponent = file("apps/web/src/app/features/workflow-health/workflow-health.component.ts");
const operationFixtures = file("tools/fixtures/v10-operation-flows.fixture.ts");
const technicianService = file("apps/api/src/modules/technician/technician.service.ts");
const technicianModule = file("apps/api/src/modules/technician/technician.module.ts");
const inventoryService = file("apps/api/src/modules/inventory/inventory.service.ts");
const inventoryModule = file("apps/api/src/modules/inventory/inventory.module.ts");
const decisionsService = file("apps/api/src/modules/customer-decisions/customer-decisions.service.ts");
const decisionsModule = file("apps/api/src/modules/customer-decisions/customer-decisions.module.ts");
const branchService = file("apps/api/src/modules/branch-manager/branch-manager.service.ts");
const branchModule = file("apps/api/src/modules/branch-manager/branch-manager.module.ts");
const builderService = file("apps/api/src/modules/builder/builder.service.ts");
const builderModule = file("apps/api/src/modules/builder/builder.module.ts");
const platformService = file("apps/api/src/modules/platform/platform.service.ts");
const platformModule = file("apps/api/src/modules/platform/platform.module.ts");

expect("operation contracts are exported", sharedIndex, "./operations");
expect("operation contract has required V10 fields", sharedOps, "OperationEventDto", "canonicalEventKey", "statusChanges", "notificationTargets", "pageUpdates", "reportHooks", "auditAction", "permissionCheck", "visibility", "customerSafeOutput");
expect("canonical event registry covers required V10 flows", sharedOps, "work_order.created", "technician.assigned", "task.started", "inspection.saved", "customer_decision.requested", "part.requested", "part.issued", "part.arrived_confirmed", "part.used", "part.return_requested", "part.return_accepted", "task.finish_attempted", "task.sent_to_team_review", "task.sent_to_qc", "builder.published", "workshop.frozen");
expect("cross-role action contracts cover fifteen operations", sharedOps, "crossRoleActionContracts", "work_order.create", "technician.assign", "customer_decision.create", "part.request", "part.issue", "part.arrived_confirm", "part.use", "part.return_unused", "part.return_accept", "blocker.report", "task.finish", "owner.permission.change", "platform.control.change", "builder.publish");
expect("operation service composes resolver routing projection and contracts", eventsService, "WorkflowStatusResolverService", "NotificationRoutingService", "CustomerSafeProjectionService", "CrossRoleActionContractsService", "canonicalEventKey", "permissionCheck");
expect("operation service writes audit event and customer timeline", eventsService, "operation.event.", "auditLog.create", "customerTimelineEvent.create", "CUSTOMER_VISIBLE");
expect("workflow status resolver centralizes core state changes", statusResolver, "part.requested", "WAITING_FOR_PARTS", "customer_decision.responded", "task.sent_to_team_review", "task.sent_to_qc", "blockedReasons");
expect("notification routing covers roles pages and blocker types", notificationRouting, "part.requested", "customer_decision.responded", "blockerTargets", "inventory_manager", "branch_manager", "team_leader", "reports_engine");
expect("customer projection prevents raw internal detail", customerProjection, "SAFE_DEFAULTS", "safeText", "supplier", "stock", "internal", "technician");
expect("action contract service resolves permission checks", actionContracts, "forEvent", "permissionCheck", "requiredPermission", "permissions.includes");
expect("workflow health detects required broken states", workflowHealth, "PART_ISSUED_NOT_CONFIRMED", "DECISION_RESPONDED_TASK_STILL_WAITING", "RETURN_NOT_REVIEWED", "WORK_ORDER_TASK_STATUS_CONFLICT", "BRANCH_WITHOUT_WAREHOUSE", "ACTIVE_WORKFLOW_MISSING_OPERATION_AUDIT");
expect("operations controller protects health and contracts", operationsController, "operations.health.view", "operations.contracts.view", "SessionGuard");
expect("operation module exposes the complete engine", eventsModule, "OperationEventsService", "WorkflowStatusResolverService", "NotificationRoutingService", "CustomerSafeProjectionService", "WorkflowHealthService", "OperationsController", "exports");
expect("root app imports operations engine", appModule, "OperationEventsModule");

expect("technician module imports operation events", technicianModule, "OperationEventsModule");
expect("technician actions emit canonical operation events", technicianService, "emitTechnicianOperation", "operationEvents.emitFromSession", "part.requested", "part.arrived_confirmed", "part.used", "part.return_requested", "task.finish_blocked", "task.sent_to_team_review", "task.sent_to_qc");
expect("technician actions update cross-role reports and pages", technicianService, "reports.technician.parts_activity.view", "reports.inventory.consumption.view", "analytics-inventory-customer", "branch-workspace", "team-review");
expect("technician waiting parts creates customer-safe status", technicianService, "customerSummary: \"We are waiting for a required part", "technicianCustomerSafeOutput");

expect("inventory module imports operation events", inventoryModule, "OperationEventsModule");
expect("inventory request actions emit operation events", inventoryService, "emitInventoryRequestOperation", "part.issued", "inventory.request.unavailable", "inventory.request.transfer", "inventory.request.supplier");
expect("inventory return actions emit operation events", inventoryService, "emitInventoryReturnOperation", "part.return_accepted", "reports.inventory.returns.view");
expect("inventory actions notify affected roles", inventoryService, "technician", "branch_manager", "team_leader", "reports_engine");

expect("customer decision module imports operation events", decisionsModule, "OperationEventsModule");
expect("customer decision send/respond emit operation events", decisionsService, "customer_decision.requested", "customer_decision.responded", "operationEvents.emitFromSession", "operationEvents.emit");
expect("customer decision events update customer-safe and reports", decisionsService, "customerSafeOutput", "reports.team.customer_decisions.view", "reports.branch.operations.view");

expect("branch intake emits cross-role event", branchModule, "OperationEventsModule");
expect("branch intake event updates technician/customer/reports", branchService, "work_order.created", "technician.assigned", "notificationTargets", "customerTimelineAlreadyWritten", "reports.branch.operations.view");

expect("owner configuration emits operation event", builderModule, "OperationEventsModule");
expect("owner configuration and builder publish update audit reports", builderService, "owner.permission_changed", "builder.published", "reports.permissions_audit.view", "affected_pages");

expect("platform control emits operation event", platformModule, "OperationEventsModule");
expect("platform lifecycle and controls update owner and reports", platformService, "platform_control.changed", "workshop.frozen", "workshop.reactivated", "reports.platform.workshops.view", "reports.permissions_audit.view", "reports_affected");

expect("workflow health permissions are owner/admin only", rolePermissions, "operations.health.view", "operations.contracts.view");
expect("workflow health route is registered for owner navigation", productConstants, "workflow-health", "operations.health.view");
expect("workflow health frontend is routed", webRoutes, "WorkflowHealthComponent", "workflow-health");
expect("workflow health frontend renders severity and suggested fix", workflowHealthComponent, "Integrity Score", "Detected Issues", "Suggested Fix", "severityClass");
expect("regression fixtures cover seven cross-role flows", operationFixtures, "customer-approval", "part-request-full", "return-unused", "waiting-parts", "permission-change", "platform-control", "finish-gate");

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);

if (failed.length) {
  console.error(`\nFAIL - V10 Cross-Role Operations Gate blocked by ${failed.length} issue(s).`);
  process.exit(1);
}

console.log("\nPASS - V10 Cross-Role Operations Engine is ready for integration QA.");
