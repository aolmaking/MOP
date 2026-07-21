import {
  AccountStatus,
  AccountType,
  AuditActorType,
  BranchWarehouseAccessType,
  CategoryCode,
  DecisionChannel,
  DecisionImportance,
  DecisionRequestStatus,
  DecisionSource,
  FinancialLineStatus,
  InvoiceStatus,
  IssuedItemStatus,
  InventoryItemStatus,
  PartRequestStatus,
  PaymentMethod,
  PaymentStatus,
  PortalStatus,
  PrismaClient,
  ReturnRequestStatus,
  SellableItemType,
  Severity,
  StaffStatus,
  StockMovementType,
  TaskStatus,
  TenantStatus,
  TimelineVisibility,
  WorkOrderStatus
} from "@prisma/client";
import { scryptSync } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const prismaDir = dirname(fileURLToPath(import.meta.url));
const databaseDir = resolve(prismaDir, "..");
const rootDir = resolve(databaseDir, "../..");

for (const envPath of [
  join(rootDir, ".env"),
  join(rootDir, "apps/api/.env"),
  join(databaseDir, ".env"),
  join(prismaDir, ".env")
]) {
  if (!existsSync(envPath)) continue;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const prisma = new PrismaClient();
const demoPassword = "0000000";

function demoPasswordHash(identifier: string) {
  const salt = `mop-demo:${identifier}`;
  return `scrypt$${salt}$${scryptSync(demoPassword, salt, 64).toString("hex")}`;
}

const ownerReportPermissions = [
  "reports.view",
  "reports.company.view",
  "reports.company.branch_compare.view",
  "reports.feature_adoption.view",
  "reports.feature_usage.view",
  "reports.builder_adoption.view",
  "reports.user_activity.view",
  "reports.configuration_health.view",
  "reports.permissions_audit.view",
  "reports.finance_snapshot.view",
  "reports.finance.view",
  "reports.inventory.value.view",
  "reports.personal.view",
  "reports.export",
  "reports.export.csv",
  "reports.export.pdf",
  "reports.export.excel",
  "reports.drilldown.work_order",
  "reports.drilldown.user",
  "reports.drilldown.inventory_item",
  "reports.configure_visibility",
  "reports.audit.view"
];

const branchReportPermissions = [
  "reports.view",
  "reports.branch.operations.view",
  "reports.branch.work_orders.view",
  "reports.branch.delays.view",
  "reports.branch.delivery.view",
  "reports.branch.payment_snapshot.view",
  "reports.branch.team_summary.view",
  "reports.export.csv",
  "reports.drilldown.work_order"
];

const teamReportPermissions = [
  "reports.team.view",
  "reports.team.technician_performance.view",
  "reports.team.parts_activity.view",
  "reports.team.blockers.view",
  "reports.team.customer_decisions.view",
  "reports.team.diagnostic_codes.view",
  "reports.team.drilldown",
  "reports.drilldown.user"
];

const inventoryReportPermissions = [
  "reports.inventory.view",
  "reports.inventory.stock_health.view",
  "reports.inventory.movements.view",
  "reports.inventory.consumption.view",
  "reports.inventory.returns.view",
  "reports.inventory.supplier.view",
  "reports.inventory.export",
  "reports.drilldown.inventory_item",
  "reports.drilldown.work_order"
];

const technicianReportPermissions = [
  "reports.technician.self.view",
  "reports.technician.task_summary.view",
  "reports.technician.parts_activity.view"
];

const ownerFinancePermissions = [
  "finance.catalog.view",
  "finance.catalog.manage",
  "finance.configuration.view",
  "finance.configuration.manage",
  "finance.invoice.view",
  "finance.invoice.issue",
  "finance.payment.view",
  "finance.payment.record",
  "finance.discount.apply",
  "finance.discount.approve",
  "finance.refund.request",
  "finance.refund.approve",
  "finance.reports.view",
  "finance.export",
  "finance.cost.view",
  "finance.margin.view"
];

const rolePages: Record<string, string[]> = {
  platform_super_admin: ["platform", "platform-add-workshop", "platform-reports", "platform-live-view", "platform-control", "audit"],
  tenant_owner: [
    "builder-home",
    "builder-brand-theme",
    "builder-page-builder",
    "builder-role-experience",
    "builder-workflow-feature",
    "builder-forms-fields",
    "builder-messages-templates",
    "builder-organization-access",
    "builder-configuration-permissions",
    "builder-publish-center",
    "builder-audit-rollback",
    "workflow-health",
    "pricing-catalog",
    "financial-configuration",
    "financial-dashboard",
    "invoices-payments",
    "discounts-refunds",
    "users-access",
    "customers",
    "customer-decisions",
    "work-orders",
    "inventory",
    "reports",
    "audit"
  ],
  tenant_admin: [
    "builder-home",
    "builder-brand-theme",
    "builder-page-builder",
    "builder-role-experience",
    "builder-workflow-feature",
    "builder-forms-fields",
    "builder-messages-templates",
    "builder-organization-access",
    "builder-configuration-permissions",
    "builder-publish-center",
    "builder-audit-rollback",
    "workflow-health",
    "pricing-catalog",
    "financial-configuration",
    "financial-dashboard",
    "invoices-payments",
    "discounts-refunds",
    "users-access",
    "customers",
    "customer-decisions",
    "work-orders",
    "inventory",
    "reports",
    "audit"
  ],
  branch_manager: ["branch-home", "branch-intake", "branch-work-orders", "branch-workspace", "branch-decisions", "branch-invoices", "branch-delivery"],
  technician: ["technician", "my-work", "work-card"],
  team_leader: ["work-orders", "team-review"],
  inventory_manager: ["inventory-home", "inventory-requests", "inventory-catalog", "inventory-quantity", "inventory-returns", "inventory-reports"],
  data_analyst: ["analytics-home", "analytics-operations", "analytics-people", "analytics-inventory-customer", "reports"],
  customer: ["customer", "customer-finance"]
};

const rolePermissions: Record<string, string[]> = {
  platform_super_admin: [
    "platform.tenant.read",
    "platform.tenant.create",
    "platform.tenant.update",
    "platform.live_view.open",
    "platform.control.apply",
    "platform.control.rollback",
    "platform.reports.view",
    "reports.platform.workshops.view",
    "reports.platform.export",
    "tenant.workspace.read",
    "tenant.users.read",
    "tenant.users.create",
    "builder.read",
    "builder.brand.edit",
    "builder.pages.edit",
    "builder.role_experience.edit",
    "builder.workflow.edit",
    "builder.forms.edit",
    "builder.messages.edit",
    "builder.organization.edit",
    "builder.preview",
    "builder.validate",
    "builder.publish",
    "builder.rollback",
    "builder.audit.view",
    "audit.read",
    ...ownerReportPermissions,
    ...branchReportPermissions,
    ...teamReportPermissions,
    ...inventoryReportPermissions,
    "control.manage",
    "permissions.manage",
    "customer_decision.view_staff",
    "customer_decision.create",
    "customer_decision.send",
    "customer_decision.manual_record",
    ...ownerFinancePermissions
  ],
  tenant_owner: [
    "tenant.workspace.read",
    "tenant.users.read",
    "tenant.users.create",
    "tenant.users.update",
    "builder.read",
    "builder.brand.edit",
    "builder.pages.edit",
    "builder.role_experience.edit",
    "builder.workflow.edit",
    "builder.forms.edit",
    "builder.messages.edit",
    "builder.organization.edit",
    "builder.preview",
    "builder.validate",
    "builder.publish",
    "builder.rollback",
    "builder.audit.view",
    "configuration.permissions.view",
    "configuration.permissions.edit",
    "configuration.templates.edit",
    "configuration.user_overrides.edit",
    "organization.users.invite",
    "organization.branches.manage",
    "organization.warehouses.manage",
    "branch.customer.read",
    "branch.customer.create",
    "branch.asset.register",
    "asset.ownership.transfer",
    "workorders.view",
    "inventory.view",
    "audit.read",
    ...ownerReportPermissions,
    ...branchReportPermissions,
    ...teamReportPermissions,
    ...inventoryReportPermissions,
    "control.manage",
    "permissions.manage",
    "customer_decision.view_staff",
    "customer_decision.create",
    "customer_decision.send",
    "customer_decision.manual_record",
    ...ownerFinancePermissions
  ],
  tenant_admin: [
    "tenant.workspace.read",
    "tenant.users.read",
    "tenant.users.create",
    "tenant.users.update",
    "builder.read",
    "builder.brand.edit",
    "builder.pages.edit",
    "builder.role_experience.edit",
    "builder.workflow.edit",
    "builder.forms.edit",
    "builder.messages.edit",
    "builder.organization.edit",
    "builder.preview",
    "builder.validate",
    "builder.publish",
    "builder.rollback",
    "builder.audit.view",
    "configuration.permissions.view",
    "configuration.permissions.edit",
    "configuration.templates.edit",
    "configuration.user_overrides.edit",
    "organization.users.invite",
    "organization.branches.manage",
    "organization.warehouses.manage",
    "branch.customer.read",
    "branch.customer.create",
    "branch.asset.register",
    "asset.ownership.transfer",
    "workorders.view",
    "inventory.view",
    "audit.read",
    ...ownerReportPermissions,
    ...branchReportPermissions,
    ...teamReportPermissions,
    ...inventoryReportPermissions,
    "control.manage",
    "permissions.manage",
    "customer_decision.view_staff",
    "customer_decision.create",
    "customer_decision.send",
    "customer_decision.manual_record",
    ...ownerFinancePermissions
  ],
  branch_manager: [
    "branch.operations.view",
    "branch.intake.manage",
    "branch.delivery.view",
    "branch.customer.read",
    "branch.customer.create",
    "branch.asset.register",
    "branch.work_order.create",
    "branch.work_order.assign",
    "branch.work_order.priority.update",
    "branch.work_order.cancel.approve",
    "branch.blocker.escalate",
    "branch.delivery.mark_ready",
    "branch.customer.notify",
    "workorders.view",
    "quotation.recordDecision",
    "pos.directSale",
    "branch.payment.record",
    ...branchReportPermissions,
    "customer_decision.view_staff",
    "customer_decision.create",
    "customer_decision.send",
    "customer_decision.manual_record",
    "finance.invoice.view",
    "finance.invoice.issue",
    "finance.payment.view",
    "finance.payment.record",
    "finance.discount.apply",
    "finance.refund.request"
  ],
  technician: [
    "task.view_assigned",
    "task.start",
    "task.pause",
    "task.complete",
    "task.blocker.report",
    "task.note.create",
    "task.customer_visible_note.create",
    "parts.request",
    "parts.mark_used",
    "parts.search",
    "parts.view_branch_availability",
    "inspection.submit",
    "inspection.execute",
    "diagnostic_code.add",
    "diagnostic_code.create_fault",
    "fault.create",
    "fault.set_severity",
    "fault.recommend_action",
    "asset.history.view_technical",
    "invoice.view_running_if_allowed",
    "qc.feedback.view",
    "cancellation.initiate_customer_request_if_allowed",
    "customer_decision.view_staff",
    "customer_decision.create",
    "customer_decision.send",
    ...technicianReportPermissions
  ],
  team_leader: [
    "workorders.view",
    "task.review",
    "task.return_for_rework",
    "customer_decision.view_staff",
    ...teamReportPermissions,
    "reports.technician.self.view",
    "reports.technician.task_summary.view",
    "reports.technician.parts_activity.view"
  ],
  inventory_manager: [
    "inventory.view",
    "inventory.home.view",
    "inventory.requests.view",
    "inventory.request.approve",
    "inventory.request.issue",
    "inventory.request.reject",
    "inventory.catalog.view",
    "inventory.item.create",
    "inventory.item.edit",
    "inventory.item.archive",
    "inventory.item.delete_if_unused",
    "inventory.item.upload_image",
    "inventory.item.set_compatibility",
    "inventory.item.set_min_stock",
    "inventory.item.set_pos_visible",
    "inventory.item.set_work_order_usable",
    "inventory.stock.view",
    "inventory.stock.adjust",
    "inventory.stock.return",
    "inventory.stock.return.accept",
    "inventory.stock.return.damaged",
    "inventory.stock.return.reject",
    "inventory.stock.ledger.view",
    "inventory.transfer.create",
    "inventory.transfer.receive",
    "inventory.transfer.cancel",
    "inventory.supplier_order.create",
    "inventory.supplier_order.submit",
    "inventory.supplier_order.receive",
    "inventory.low_stock.view",
    "inventory.reports.view_inventory",
    "inventory.reports.view",
    "finance.catalog.view",
    ...inventoryReportPermissions
  ],
  data_analyst: [
    "workorders.view",
    ...ownerReportPermissions,
    ...branchReportPermissions,
    ...teamReportPermissions,
    ...inventoryReportPermissions
  ],
  customer: ["customer.portal.view", "customer.asset.view_own", "customer.work_order.view_summary", "customer.history.view_safe", "customer_decision.view_own", "customer_decision.respond", "finance.invoice.view", "finance.payment.view"]
};

async function assertSeedRuntimeReady() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Copy .env.example to .env at the project root before seeding.");
  }
  await prisma.$connect();
  const requiredModels = ["tenant", "financeAuditEvent", "account", "staffUser", "customer", "workOrder", "inventoryItem"];
  const missingModels = requiredModels.filter((model) => typeof (prisma as any)[model]?.deleteMany !== "function");
  if (missingModels.length) {
    throw new Error(`Generated Prisma Client is out of sync. Missing delegates: ${missingModels.join(", ")}. Run pnpm db:generate again.`);
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database connection failed.";
    throw new Error(`Database is not reachable with the configured DATABASE_URL. ${message}`);
  }
}

async function main() {
  await assertSeedRuntimeReady();
  await prisma.financeAuditEvent.deleteMany();
  await prisma.creditNote.deleteMany();
  await prisma.refundRequest.deleteMany();
  await prisma.discountRequest.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoiceLine.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.runningInvoiceLine.deleteMany();
  await prisma.runningInvoice.deleteMany();
  await prisma.quotationItem.deleteMany();
  await prisma.quotation.deleteMany();
  await prisma.priceCatalogEntry.deleteMany();
  await prisma.sellableItem.deleteMany();
  await prisma.financeConfiguration.deleteMany();
  await prisma.invoiceSequence.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.customerTimelineEvent.deleteMany();
  await prisma.customerDecisionItem.deleteMany();
  await prisma.customerDecisionRequest.deleteMany();
  await prisma.partReturnRequest.deleteMany();
  await prisma.issuedItem.deleteMany();
  await prisma.inventoryTransfer.deleteMany();
  await prisma.supplierOrder.deleteMany();
  await prisma.partRequest.deleteMany();
  await prisma.warehouseStockBalance.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.taskAssignment.deleteMany();
  await prisma.workOrderAssignment.deleteMany();
  await prisma.subtask.deleteMany();
  await prisma.task.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.safeTechnicalHistory.deleteMany();
  await prisma.assetOwnershipHistory.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.staffUser.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.rolePage.deleteMany();
  await prisma.permissionTemplate.deleteMany();
  await prisma.branchWarehouseAccess.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.controlSetting.deleteMany();
  await prisma.tenant.deleteMany();

  const tenant = await prisma.tenant.create({
    data: {
      id: "tenant_apex",
      name: "Apex Motors",
      slug: "apex",
      status: TenantStatus.ACTIVE,
      portalEnabled: true,
      customerRegistrationCode: "APEX2026",
      customerRegistrationEnabled: true
    }
  });
  const builderDefaultsUrl = new URL("../../shared/src/builder/defaults.ts", import.meta.url);
  const builderDefaults = (await import(builderDefaultsUrl.href)) as {
    createDefaultBuilderConfiguration: (tenantId: string) => Record<string, any>;
    applyBuilderPreset: (config: Record<string, any>, presetId: string) => Record<string, any>;
  };
  const demoBuilder = builderDefaults.applyBuilderPreset(
    builderDefaults.createDefaultBuilderConfiguration(tenant.id),
    "car-service-center"
  );
  demoBuilder.designTokens = {
    ...demoBuilder.designTokens,
    brandName: "Apex Motors",
    primaryColor: "#17324d",
    accentColor: "#f59e0b",
    density: "comfortable"
  };
  const demoBuilderSnapshot = JSON.parse(JSON.stringify(demoBuilder));
  await prisma.tenantBuilderConfiguration.create({
    data: {
      tenantId: tenant.id,
      schemaVersion: demoBuilder.schemaVersion,
      baseTemplateVersion: demoBuilder.baseTemplateVersion,
      lastMigratedAt: new Date("2026-07-01T09:00:00Z"),
      activeVersionId: demoBuilder.activeVersionId,
      draftVersionId: demoBuilder.draftVersionId,
      configPrecedence: demoBuilder.configPrecedence,
      ownerModel: demoBuilder.ownerModel,
      previewIdentities: demoBuilder.previewIdentities,
      designTokens: demoBuilder.designTokens,
      pageTemplates: demoBuilder.pageTemplates,
      roleExperiences: demoBuilder.roleExperiences,
      featurePolicies: demoBuilder.featurePolicies,
      workflowPolicies: demoBuilder.workflowPolicies,
      formSchemas: demoBuilder.formSchemas,
      messageTemplates: demoBuilder.messageTemplates
    }
  });
  await prisma.tenantBuilderVersion.createMany({
    data: [
      {
        tenantId: tenant.id,
        versionId: demoBuilder.activeVersionId,
        status: "published",
        versionNumber: 1,
        schemaVersion: demoBuilder.schemaVersion,
        baseTemplateVersion: demoBuilder.baseTemplateVersion,
        snapshot: demoBuilderSnapshot,
        riskLevel: "low",
        reason: "Apex Motors branded release-candidate baseline.",
        publishedBy: "u_owner",
        publishedAt: new Date("2026-07-01T09:00:00Z")
      },
      {
        tenantId: tenant.id,
        versionId: demoBuilder.draftVersionId,
        status: "draft",
        versionNumber: 2,
        schemaVersion: demoBuilder.schemaVersion,
        baseTemplateVersion: demoBuilder.baseTemplateVersion,
        snapshot: demoBuilderSnapshot,
        riskLevel: "low",
        reason: "Editable release-candidate demonstration draft."
      }
    ]
  });
  await prisma.tenantBuilderAuditEvent.create({
    data: {
      tenantId: tenant.id,
      actorId: "u_owner",
      actorName: "Ahmed Tenant Owner",
      action: "builder.published",
      targetType: "builder_version",
      targetId: demoBuilder.activeVersionId,
      reason: "Published Apex Motors brand and car-service experience.",
      affectedPages: ["technician.home", "technician.work_card", "customer.portal.home"],
      affectedRoles: ["technician", "customer"],
      riskLevel: "low"
    }
  });

  const branchNasr = await prisma.branch.create({
    data: { id: "branch_nasr", tenantId: tenant.id, name: "Nasr City Branch" }
  });
  const branchAlex = await prisma.branch.create({
    data: { id: "branch_maadi", tenantId: tenant.id, name: "Maadi Branch" }
  });

  const whQuick = await prisma.warehouse.create({
    data: {
      id: "wh_quick",
      tenantId: tenant.id,
      branchId: branchNasr.id,
      name: "Nasr Quick Stock",
      categories: [CategoryCode.CARS, CategoryCode.MOTORCYCLES]
    }
  });
  const whMain = await prisma.warehouse.create({
    data: {
      id: "wh_main",
      tenantId: tenant.id,
      branchId: branchNasr.id,
      name: "Nasr Main Warehouse",
      categories: [CategoryCode.CARS, CategoryCode.HEAVY_EQUIPMENT]
    }
  });
  const whAlex = await prisma.warehouse.create({
    data: {
      id: "wh_central",
      tenantId: tenant.id,
      branchId: branchAlex.id,
      name: "Central Warehouse",
      categories: [CategoryCode.CARS, CategoryCode.MOTORCYCLES, CategoryCode.HEAVY_EQUIPMENT]
    }
  });

  await prisma.branchWarehouseAccess.createMany({
    data: [
      { tenantId: tenant.id, branchId: branchNasr.id, warehouseId: whQuick.id, accessType: BranchWarehouseAccessType.PRIMARY, priority: 1 },
      { tenantId: tenant.id, branchId: branchNasr.id, warehouseId: whMain.id, accessType: BranchWarehouseAccessType.BACKUP, priority: 2 },
      { tenantId: tenant.id, branchId: branchNasr.id, warehouseId: whAlex.id, accessType: BranchWarehouseAccessType.SHARED, priority: 3 },
      { tenantId: tenant.id, branchId: branchAlex.id, warehouseId: whAlex.id, accessType: BranchWarehouseAccessType.SHARED, priority: 1 }
    ]
  });

  for (const [role, pages] of Object.entries(rolePages)) {
    await prisma.rolePage.createMany({
      data: pages.map((pageId) => ({ tenantId: role === "platform_super_admin" ? null : tenant.id, role, pageId }))
    });
  }

  for (const [role, permissions] of Object.entries(rolePermissions)) {
    const template = await prisma.permissionTemplate.create({
      data: {
        id: `tpl_${role}`,
        tenantId: role === "platform_super_admin" ? null : tenant.id,
        code: role,
        label: role.replace(/_/g, " ")
      }
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        tenantId: role === "platform_super_admin" ? null : tenant.id,
        role,
        permission,
        permissionTemplateId: template.id
      }))
    });
  }

  const platformAccount = await prisma.account.create({
    data: {
      id: "acc_platform_nour",
      accountType: AccountType.PLATFORM,
      loginIdentifier: "platform_super_admin",
      passwordHash: demoPasswordHash("platform_super_admin"),
      status: AccountStatus.ACTIVE
    }
  });
  await prisma.staffUser.create({
    data: {
      id: "u_super",
      accountId: platformAccount.id,
      name: "Nour Platform Admin",
      email: "platform_super_admin@mop.local",
      role: "platform_super_admin",
      status: StaffStatus.ACTIVE,
      branchScope: [],
      warehouseScope: [],
      categoryScope: []
    }
  });

  const staffSeed = [
    {
      id: "u_admin",
      accountId: "acc_staff_salma",
      login: "tenant_admin",
      name: "Salma",
      role: "tenant_admin",
      branches: [branchNasr.id, branchAlex.id],
      warehouses: [whQuick.id, whMain.id, whAlex.id],
      categories: [CategoryCode.CARS, CategoryCode.MOTORCYCLES, CategoryCode.HEAVY_EQUIPMENT]
    },
    {
      id: "u_branch",
      accountId: "acc_staff_khaled",
      login: "branch_manager",
      name: "Khaled",
      role: "branch_manager",
      branches: [branchNasr.id],
      warehouses: [whQuick.id],
      categories: [CategoryCode.CARS, CategoryCode.MOTORCYCLES]
    },
    {
      id: "u_tech",
      accountId: "acc_staff_ahmed",
      login: "technician",
      name: "Ahmed Hassan",
      role: "technician",
      branches: [branchNasr.id],
      warehouses: [whQuick.id],
      categories: [CategoryCode.CARS, CategoryCode.MOTORCYCLES]
    },
    {
      id: "u_lead",
      accountId: "acc_staff_youssef",
      login: "team_leader",
      name: "Youssef",
      role: "team_leader",
      branches: [branchNasr.id],
      warehouses: [],
      categories: [CategoryCode.CARS, CategoryCode.HEAVY_EQUIPMENT]
    },
    {
      id: "u_stock",
      accountId: "acc_staff_mona",
      login: "inventory_manager",
      name: "Mona Said",
      role: "inventory_manager",
      branches: [branchNasr.id],
      warehouses: [whQuick.id, whMain.id, whAlex.id],
      categories: [CategoryCode.CARS, CategoryCode.HEAVY_EQUIPMENT]
    },
    {
      id: "u_analyst",
      accountId: "acc_staff_dina",
      login: "data_analyst",
      name: "Dina Data Analyst",
      role: "data_analyst",
      branches: [branchNasr.id, branchAlex.id],
      warehouses: [],
      categories: [CategoryCode.CARS, CategoryCode.MOTORCYCLES, CategoryCode.HEAVY_EQUIPMENT]
    }
  ];

  for (const staff of staffSeed) {
    await prisma.account.create({
      data: {
        id: staff.accountId,
        tenantId: tenant.id,
        accountType: AccountType.TENANT_STAFF,
        loginIdentifier: staff.login,
        passwordHash: demoPasswordHash(staff.login),
        status: AccountStatus.ACTIVE
      }
    });
    await prisma.staffUser.create({
      data: {
        id: staff.id,
        tenantId: tenant.id,
        accountId: staff.accountId,
        name: staff.name,
        email: staff.login,
        role: staff.role,
        status: StaffStatus.ACTIVE,
        branchScope: staff.branches,
        warehouseScope: staff.warehouses,
        categoryScope: staff.categories,
        teamScope: staff.role === "team_leader" ? ["team_nasr"] : [],
        managedTechnicianIds: staff.role === "team_leader" ? ["u_tech"] : [],
        permissionTemplateId: `tpl_${staff.role}`
      }
    });
  }

  await prisma.account.create({
    data: {
      id: "acc_customer_omar",
      tenantId: tenant.id,
      accountType: AccountType.CUSTOMER,
      loginIdentifier: "customer",
      passwordHash: demoPasswordHash("customer"),
      status: AccountStatus.ACTIVE
    }
  });

  const customer = await prisma.customer.create({
    data: {
      id: "cust_omar",
      tenantId: tenant.id,
      accountId: "acc_customer_omar",
      branchId: branchNasr.id,
      fullName: "Omar Ali",
      phone: "+20 100 000 0001",
      email: "omar@example.com",
      portalStatus: PortalStatus.ENABLED,
      communicationConsent: true,
      createdByStaffUserId: "u_branch"
    }
  });

  const asset = await prisma.asset.create({
    data: {
      id: "asset_corolla_001",
      tenantId: tenant.id,
      branchId: branchNasr.id,
      currentOwnerCustomerId: customer.id,
      category: CategoryCode.CARS,
      name: "Toyota Corolla",
      primaryIdentifier: "ABC-123",
      secondaryIdentifier: "VIN-9988"
    }
  });

  await prisma.assetOwnershipHistory.create({
    data: {
      assetId: asset.id,
      customerId: customer.id,
      fromDate: new Date("2025-12-02"),
      transferReason: "Seed current owner."
    }
  });

  const motorcycleAsset = await prisma.asset.create({
    data: {
      id: "asset_yamaha_778",
      tenantId: tenant.id,
      branchId: branchNasr.id,
      currentOwnerCustomerId: customer.id,
      category: CategoryCode.MOTORCYCLES,
      name: "Yamaha Motorcycle",
      primaryIdentifier: "MTR-778",
      secondaryIdentifier: "MC-VIN-778"
    }
  });

  const equipmentAsset = await prisma.asset.create({
    data: {
      id: "asset_cat_eq9001",
      tenantId: tenant.id,
      branchId: branchAlex.id,
      currentOwnerCustomerId: customer.id,
      category: CategoryCode.HEAVY_EQUIPMENT,
      name: "CAT Excavator",
      primaryIdentifier: "EQ-9001",
      secondaryIdentifier: "SERIAL-EQ-9001"
    }
  });

  await prisma.assetOwnershipHistory.createMany({
    data: [
      { assetId: motorcycleAsset.id, customerId: customer.id, fromDate: new Date("2026-01-15"), transferReason: "Seed motorcycle owner." },
      { assetId: equipmentAsset.id, customerId: customer.id, fromDate: new Date("2026-02-20"), transferReason: "Seed equipment owner." }
    ]
  });

  await prisma.safeTechnicalHistory.createMany({
    data: [
      {
        assetId: asset.id,
        dateLabel: "Today",
        title: "Brake inspection started",
        summary: "Brake system inspection started; customer-safe update only.",
        severity: Severity.HIGH
      },
      {
        assetId: asset.id,
        dateLabel: "Last month",
        title: "Oil and filter service",
        summary: "Engine oil and oil filter replacement completed.",
        severity: Severity.NORMAL
      }
    ]
  });

  const workOrder = await prisma.workOrder.create({
    data: {
      id: "wo1021",
      tenantId: tenant.id,
      branchId: branchNasr.id,
      assetId: asset.id,
      customerId: customer.id,
      number: "WO-1021",
      category: CategoryCode.CARS,
      status: WorkOrderStatus.IN_PROGRESS,
      statusLabel: "In Progress",
      priority: Severity.HIGH,
      complaint: "Brake noise at low speed",
      total: 7600,
      paid: 0,
      balance: 7600,
      customerVisible: true,
      customerSummary: "Brake service is in progress."
    }
  });

  await prisma.workOrderAssignment.create({
    data: { workOrderId: workOrder.id, staffUserId: "u_tech", assignmentRole: "technician" }
  });

  const task = await prisma.task.create({
    data: {
      id: "task_brake",
      tenantId: tenant.id,
      branchId: branchNasr.id,
      workOrderId: workOrder.id,
      assetId: asset.id,
      customerId: customer.id,
      title: "Brake system inspection",
      type: "Inspection",
      status: TaskStatus.IN_PROGRESS,
      severity: Severity.HIGH,
      category: CategoryCode.CARS,
      estimateMinutes: 35
    }
  });

  await prisma.taskAssignment.create({ data: { taskId: task.id, staffUserId: "u_tech" } });
  await prisma.subtask.createMany({
    data: [
      { taskId: task.id, title: "Inspect front pads", done: true, sortOrder: 1 },
      { taskId: task.id, title: "Measure disc wear", done: true, sortOrder: 2 },
      { taskId: task.id, title: "Prepare customer approval note", done: false, sortOrder: 3 }
    ]
  });

  const decisionLink = "http://localhost:4200/decision/demo-cdr-1021";
  const whatsappMessage = [
    "Hello Omar Ali,",
    "We inspected your Toyota Corolla - ABC-123.",
    "",
    "Your decision is needed for the following items:",
    "",
    "1. Brake Pads Replacement",
    "Importance: high",
    "Estimated cost: 1,200 EGP",
    "",
    "2. Brake Disc Replacement",
    "Importance: critical",
    "Estimated cost: 2,500 EGP",
    "",
    "Please open the secure link below to approve or reject each item:",
    decisionLink,
    "",
    "Thank you,",
    "Apex Motors"
  ].join("\n");

  const decisionRequest = await prisma.customerDecisionRequest.create({
    data: {
      id: "cdr_1021",
      tenantId: tenant.id,
      workOrderId: workOrder.id,
      taskId: task.id,
      assetId: asset.id,
      customerId: customer.id,
      createdByStaffUserId: "u_tech",
      source: DecisionSource.TECHNICIAN_TASK,
      status: DecisionRequestStatus.SENT,
      decisionToken: "demo-cdr-1021",
      secureLink: decisionLink,
      whatsappMessage,
      channelEntry: DecisionChannel.WHATSAPP_LINK,
      sentAt: new Date("2026-07-03T11:20:00Z"),
      expiresAt: new Date("2026-07-05T11:20:00Z"),
      items: {
        create: [
          {
            title: "Brake Pads Replacement",
            customerExplanation: "Front pads are worn and need replacement to restore braking performance.",
            importance: DecisionImportance.HIGH,
            estimatedPrice: 1200,
            sortOrder: 1
          },
          {
            title: "Brake Disc Replacement",
            customerExplanation: "Brake disc damage may affect vehicle safety and braking stability.",
            importance: DecisionImportance.CRITICAL,
            estimatedPrice: 2500,
            criticalWarningRequired: true,
            criticalWarningText: "Rejecting this critical brake repair may affect vehicle safety. Your rejection will be recorded in the service history.",
            sortOrder: 2
          }
        ]
      }
    }
  });

  await prisma.customerTimelineEvent.create({
    data: {
      tenantId: tenant.id,
      customerId: customer.id,
      assetId: asset.id,
      workOrderId: workOrder.id,
      decisionRequestId: decisionRequest.id,
      visibility: TimelineVisibility.CUSTOMER_VISIBLE,
      title: "Decision request sent",
      message: "A secure service decision link was sent for brake repair items.",
      source: "customer_decision.sent",
      occurredAt: new Date("2026-07-03T11:20:00Z")
    }
  });

  const oil = await prisma.inventoryItem.create({
    data: {
      id: "item_oil_5w30",
      tenantId: tenant.id,
      warehouseId: whQuick.id,
      name: "Engine Oil 5W-30",
      sku: "CAR-OIL-5W30",
      barcode: "893000501",
      type: "Consumable",
      catalogCategory: "Fluids",
      subCategory: "Engine Oil",
      compatibleCategories: [CategoryCode.CARS],
      stock: 24,
      minStock: 12,
      criticalStock: 4,
      price: 1800,
      cost: 1200,
      status: InventoryItemStatus.ACTIVE
    }
  });

  const acFilter = await prisma.inventoryItem.create({
    data: {
      id: "item_oil_filter",
      tenantId: tenant.id,
      warehouseId: whQuick.id,
      name: "Oil Filter",
      sku: "CAR-OIL-FILTER",
      barcode: "893000511",
      type: "Part",
      catalogCategory: "Filters",
      subCategory: "Oil Filter",
      compatibleCategories: [CategoryCode.CARS],
      stock: 2,
      minStock: 5,
      criticalStock: 2,
      price: 480,
      cost: 250,
      status: InventoryItemStatus.LOW_STOCK
    }
  });

  const brakePads = await prisma.inventoryItem.create({
    data: {
      id: "item_brake_pads",
      tenantId: tenant.id,
      warehouseId: whQuick.id,
      name: "Front Brake Pads",
      sku: "CAR-BRK-PAD-FRT",
      barcode: "893000521",
      type: "Part",
      catalogCategory: "Brakes",
      subCategory: "Pads",
      compatibleCategories: [CategoryCode.CARS],
      stock: 4,
      minStock: 5,
      criticalStock: 2,
      price: 1200,
      cost: 750,
      status: InventoryItemStatus.LOW_STOCK
    }
  });

  const battery = await prisma.inventoryItem.create({
    data: {
      id: "item_battery_60ah",
      tenantId: tenant.id,
      warehouseId: whQuick.id,
      name: "Car Battery",
      sku: "CAR-BAT-60AH",
      barcode: "893000531",
      type: "Part",
      catalogCategory: "Electrical",
      subCategory: "Battery",
      compatibleCategories: [CategoryCode.CARS],
      stock: 0,
      minStock: 3,
      criticalStock: 1,
      price: 3200,
      cost: 2400,
      status: InventoryItemStatus.LOW_STOCK
    }
  });

  const motorcycleChain = await prisma.inventoryItem.create({
    data: {
      id: "item_motorcycle_chain",
      tenantId: tenant.id,
      warehouseId: whQuick.id,
      name: "Motorcycle Chain",
      sku: "MOTO-CHAIN-001",
      barcode: "893000541",
      type: "Part",
      catalogCategory: "Drivetrain",
      subCategory: "Chain",
      compatibleCategories: [CategoryCode.MOTORCYCLES],
      stock: 5,
      minStock: 2,
      criticalStock: 1,
      price: 650,
      cost: 420,
      status: InventoryItemStatus.ACTIVE
    }
  });

  const hydraulicHose = await prisma.inventoryItem.create({
    data: {
      id: "item_hydraulic_hose",
      tenantId: tenant.id,
      warehouseId: whAlex.id,
      name: "Hydraulic Hose",
      sku: "HE-HYD-HOSE",
      barcode: "893000551",
      type: "Part",
      catalogCategory: "Hydraulics",
      subCategory: "Hose",
      compatibleCategories: [CategoryCode.HEAVY_EQUIPMENT],
      stock: 3,
      minStock: 2,
      criticalStock: 1,
      price: 1850,
      cost: 1100,
      status: InventoryItemStatus.ACTIVE
    }
  });

  await prisma.financeConfiguration.create({
    data: {
      tenantId: tenant.id,
      currency: "EGP",
      taxEnabled: false,
      taxRate: 14,
      invoiceNumberPattern: "INV-{branch}-{year}-{seq}",
      invoiceTerms: "Payment is due before vehicle delivery unless an authorized policy override applies.",
      paymentMethods: ["cash", "card", "bank_transfer", "wallet"],
      depositAllowed: true,
      maxBranchDiscountPercent: 10,
      discountApprovalThreshold: 10,
      customerInvoiceVisible: true,
      technicianPriceVisible: true,
      inventoryPriceEditable: false
    }
  });

  const brakeService = await prisma.sellableItem.create({
    data: {
      id: "sell_brake_service",
      tenantId: tenant.id,
      type: SellableItemType.SERVICE,
      name: "Brake Pads Replacement",
      description: "Customer-approved brake pad replacement service.",
      category: "Cars",
      basePrice: 250,
      taxable: false,
      technicianCanAdd: true,
      branchManagerCanDiscount: true
    }
  });
  const computerInspection = await prisma.sellableItem.create({
    data: {
      id: "sell_computer_inspection",
      tenantId: tenant.id,
      type: SellableItemType.INSPECTION,
      name: "Computer Diagnostic",
      category: "Cars",
      basePrice: 150,
      taxable: false,
      technicianCanAdd: true
    }
  });
  const brakePart = await prisma.sellableItem.create({
    data: {
      id: "sell_brake_pads",
      tenantId: tenant.id,
      inventoryItemId: brakePads.id,
      type: SellableItemType.PART,
      name: brakePads.name,
      category: brakePads.catalogCategory,
      basePrice: brakePads.price,
      taxable: false,
      technicianCanAdd: true
    }
  });
  await prisma.priceCatalogEntry.createMany({
    data: [
      { tenantId: tenant.id, sellableItemId: brakeService.id, price: 250, currency: "EGP", createdBy: "u_owner" },
      { tenantId: tenant.id, sellableItemId: computerInspection.id, price: 150, currency: "EGP", createdBy: "u_owner" },
      { tenantId: tenant.id, sellableItemId: brakePart.id, price: brakePads.price, currency: "EGP", createdBy: "u_owner" },
      { tenantId: tenant.id, sellableItemId: brakeService.id, branchId: branchNasr.id, price: 225, currency: "EGP", createdBy: "u_owner" }
    ]
  });

  await prisma.warehouseStockBalance.createMany({
    data: [
      { tenantId: tenant.id, warehouseId: whQuick.id, itemId: oil.id, availableQty: 24, lowThreshold: 12, criticalThreshold: 4 },
      { tenantId: tenant.id, warehouseId: whQuick.id, itemId: acFilter.id, availableQty: 2, lowThreshold: 5, criticalThreshold: 2 },
      { tenantId: tenant.id, warehouseId: whQuick.id, itemId: brakePads.id, availableQty: 4, lowThreshold: 5, criticalThreshold: 2 },
      { tenantId: tenant.id, warehouseId: whMain.id, itemId: brakePads.id, availableQty: 12, lowThreshold: 5, criticalThreshold: 2 },
      { tenantId: tenant.id, warehouseId: whAlex.id, itemId: brakePads.id, availableQty: 20, lowThreshold: 5, criticalThreshold: 2 },
      { tenantId: tenant.id, warehouseId: whQuick.id, itemId: battery.id, availableQty: 0, lowThreshold: 3, criticalThreshold: 1 },
      { tenantId: tenant.id, warehouseId: whQuick.id, itemId: motorcycleChain.id, availableQty: 5, lowThreshold: 2, criticalThreshold: 1 },
      { tenantId: tenant.id, warehouseId: whAlex.id, itemId: hydraulicHose.id, availableQty: 3, lowThreshold: 2, criticalThreshold: 1 }
    ]
  });

  await prisma.partRequest.create({
    data: {
      id: "req_003",
      tenantId: tenant.id,
      branchId: branchNasr.id,
      workOrderId: workOrder.id,
      taskId: task.id,
      technicianId: "u_tech",
      itemId: acFilter.id,
      warehouseId: whQuick.id,
      preferredWarehouseId: whQuick.id,
      qty: 1,
      urgency: Severity.NORMAL,
      reason: "Oil Filter requested for quick service validation.",
      status: PartRequestStatus.PENDING_WAREHOUSE,
      total: 480
    }
  });

  const issuedRequest = await prisma.partRequest.create({
    data: {
      id: "req_issued_brake",
      tenantId: tenant.id,
      branchId: branchNasr.id,
      workOrderId: workOrder.id,
      taskId: task.id,
      technicianId: "u_tech",
      itemId: brakePads.id,
      warehouseId: whMain.id,
      preferredWarehouseId: whMain.id,
      fulfillmentWarehouseId: whMain.id,
      qty: 1,
      urgency: Severity.HIGH,
      reason: "Brake pads worn; technician needs replacement part.",
      status: PartRequestStatus.ISSUED,
      total: 1200,
      issuedAt: new Date("2026-07-03T12:35:00Z")
    }
  });

  const issuedItem = await prisma.issuedItem.create({
    data: {
      id: "iss_brake_001",
      tenantId: tenant.id,
      requestId: issuedRequest.id,
      warehouseId: whMain.id,
      itemId: brakePads.id,
      workOrderId: workOrder.id,
      taskId: task.id,
      technicianId: "u_tech",
      qty: 1,
      status: IssuedItemStatus.ARRIVED,
      issuedBy: "u_stock",
      issuedAt: new Date("2026-07-03T12:35:00Z")
    }
  });

  await prisma.partReturnRequest.create({
    data: {
      id: "ret_oil_filter_001",
      tenantId: tenant.id,
      issuedItemId: issuedItem.id,
      warehouseId: whMain.id,
      itemId: brakePads.id,
      workOrderId: workOrder.id,
      taskId: task.id,
      technicianId: "u_tech",
      qty: 1,
      reason: "Customer rejected this part after issue.",
      condition: "Good",
      status: ReturnRequestStatus.PENDING_INVENTORY_REVIEW
    }
  });

  await prisma.stockMovement.createMany({
    data: [
      {
        tenantId: tenant.id,
        warehouseId: whMain.id,
        itemId: brakePads.id,
        type: StockMovementType.ISSUED_TO_TASK,
        qty: -1,
        beforeQty: 12,
        afterQty: 11,
        source: workOrder.id,
        reason: "Technician request approved and dispatched.",
        createdBy: "u_stock",
        createdAt: new Date("2026-07-03T12:35:00Z")
      },
      {
        tenantId: tenant.id,
        warehouseId: whQuick.id,
        itemId: acFilter.id,
        type: StockMovementType.REQUESTED,
        qty: 1,
        beforeQty: 2,
        afterQty: 2,
        source: "req_003",
        reason: "Technician requested Oil Filter.",
        createdBy: "u_tech",
        createdAt: new Date("2026-07-03T12:30:00Z")
      }
    ]
  });

  const paidWorkOrder = await prisma.workOrder.create({
    data: {
      id: "wo_paid_demo",
      tenantId: tenant.id,
      branchId: branchNasr.id,
      assetId: asset.id,
      customerId: customer.id,
      number: "WO-1018",
      category: CategoryCode.CARS,
      status: WorkOrderStatus.DELIVERED,
      statusLabel: "Delivered",
      priority: Severity.NORMAL,
      complaint: "Scheduled computer diagnostic and brake service",
      total: 1575,
      paid: 1575,
      balance: 0,
      customerVisible: true,
      customerSummary: "Service completed, paid, and delivered."
    }
  });
  const paidTask = await prisma.task.create({
    data: {
      id: "task_paid_demo",
      tenantId: tenant.id,
      branchId: branchNasr.id,
      workOrderId: paidWorkOrder.id,
      assetId: asset.id,
      customerId: customer.id,
      title: "Computer diagnostic and brake service",
      type: "Service",
      status: TaskStatus.COMPLETED,
      severity: Severity.NORMAL,
      category: CategoryCode.CARS,
      estimateMinutes: 60,
      invoiceImpact: 1575,
      partsTotal: 1200
    }
  });
  await prisma.workOrderAssignment.create({
    data: { workOrderId: paidWorkOrder.id, staffUserId: "u_tech", assignmentRole: "technician" }
  });
  await prisma.taskAssignment.create({
    data: { taskId: paidTask.id, staffUserId: "u_tech" }
  });
  const paidRunningInvoice = await prisma.runningInvoice.create({
    data: {
      id: "running_invoice_paid_demo",
      tenantId: tenant.id,
      workOrderId: paidWorkOrder.id,
      customerId: customer.id,
      branchId: branchNasr.id,
      status: "FINALIZED",
      subtotal: 1575,
      total: 1575,
      paid: 1575,
      remaining: 0,
      lines: {
        create: [
          {
            sourceType: "task",
            sourceId: paidTask.id,
            sellableItemId: computerInspection.id,
            title: "Computer Diagnostic",
            lineType: SellableItemType.INSPECTION,
            quantity: 1,
            unitPrice: 150,
            total: 150,
            status: FinancialLineStatus.FINALIZED,
            priceLocked: true
          },
          {
            sourceType: "task",
            sourceId: paidTask.id,
            sellableItemId: brakeService.id,
            title: "Brake Pads Replacement",
            lineType: SellableItemType.SERVICE,
            quantity: 1,
            unitPrice: 225,
            total: 225,
            status: FinancialLineStatus.FINALIZED,
            priceLocked: true
          },
          {
            sourceType: "inventory_item",
            sourceId: brakePads.id,
            sellableItemId: brakePart.id,
            title: "Front Brake Pads",
            lineType: SellableItemType.PART,
            quantity: 1,
            unitPrice: 1200,
            total: 1200,
            status: FinancialLineStatus.FINALIZED,
            priceLocked: true
          }
        ]
      }
    }
  });
  const paidInvoice = await prisma.invoice.create({
    data: {
      id: "invoice_paid_demo",
      tenantId: tenant.id,
      workOrderId: paidWorkOrder.id,
      customerId: customer.id,
      branchId: branchNasr.id,
      number: "INV-NASR-2026-0018",
      status: InvoiceStatus.PAID,
      locked: true,
      subtotal: 1575,
      total: 1575,
      paid: 1575,
      balance: 0,
      terms: "Paid in full before delivery.",
      issuedBy: "u_manager",
      issuedAt: new Date("2026-07-02T15:20:00Z"),
      immutableVersion: 1,
      lines: {
        create: [
          {
            sellableItemId: computerInspection.id,
            title: "Computer Diagnostic",
            lineType: SellableItemType.INSPECTION,
            qty: 1,
            source: paidTask.id,
            unitPrice: 150,
            total: 150,
            status: FinancialLineStatus.FINALIZED,
            lockedUnitPrice: 150
          },
          {
            sellableItemId: brakeService.id,
            title: "Brake Pads Replacement",
            lineType: SellableItemType.SERVICE,
            qty: 1,
            source: paidTask.id,
            unitPrice: 225,
            total: 225,
            status: FinancialLineStatus.FINALIZED,
            lockedUnitPrice: 225
          },
          {
            sellableItemId: brakePart.id,
            title: "Front Brake Pads",
            lineType: SellableItemType.PART,
            qty: 1,
            source: brakePads.id,
            unitPrice: 1200,
            total: 1200,
            status: FinancialLineStatus.FINALIZED,
            lockedUnitPrice: 1200
          }
        ]
      }
    }
  });
  await prisma.payment.create({
    data: {
      id: "payment_paid_demo",
      tenantId: tenant.id,
      invoiceId: paidInvoice.id,
      workOrderId: paidWorkOrder.id,
      branchId: branchNasr.id,
      customerId: customer.id,
      amount: 1575,
      method: PaymentMethod.CARD,
      reference: "DEMO-POS-0018",
      createdBy: "u_manager",
      note: `Final payment for ${paidRunningInvoice.id}.`,
      status: PaymentStatus.CONFIRMED,
      receivedAt: new Date("2026-07-02T15:35:00Z")
    }
  });

  const deltaTenant = await prisma.tenant.create({
    data: {
      id: "tenant_delta",
      name: "Delta Service",
      slug: "delta",
      status: TenantStatus.ACTIVE,
      portalEnabled: true,
      customerRegistrationCode: "DELTA2026",
      customerRegistrationEnabled: true
    }
  });
  const deltaBranch = await prisma.branch.create({
    data: { id: "branch_delta_main", tenantId: deltaTenant.id, name: "Delta Main Branch" }
  });
  const deltaWarehouse = await prisma.warehouse.create({
    data: {
      id: "wh_delta_main",
      tenantId: deltaTenant.id,
      branchId: deltaBranch.id,
      name: "Delta Main Warehouse",
      categories: [CategoryCode.CARS]
    }
  });
  for (const role of ["tenant_owner", "technician"]) {
    const template = await prisma.permissionTemplate.create({
      data: { id: `tpl_delta_${role}`, tenantId: deltaTenant.id, code: role, label: role.replaceAll("_", " ") }
    });
    await prisma.rolePage.createMany({
      data: (rolePages[role] || []).map((pageId) => ({ tenantId: deltaTenant.id, role, pageId }))
    });
    await prisma.rolePermission.createMany({
      data: (rolePermissions[role] || []).map((permission) => ({
        tenantId: deltaTenant.id,
        role,
        permission,
        permissionTemplateId: template.id
      }))
    });
  }
  await prisma.account.createMany({
    data: [
      {
        id: "acc_delta_owner",
        tenantId: deltaTenant.id,
        accountType: AccountType.TENANT_STAFF,
        loginIdentifier: "tenant_owner",
        passwordHash: demoPasswordHash("tenant_owner"),
        status: AccountStatus.ACTIVE
      },
      {
        id: "acc_delta_tech",
        tenantId: deltaTenant.id,
        accountType: AccountType.TENANT_STAFF,
        loginIdentifier: "delta_technician",
        passwordHash: demoPasswordHash("delta_technician"),
        status: AccountStatus.ACTIVE
      },
      {
        id: "acc_delta_customer",
        tenantId: deltaTenant.id,
        accountType: AccountType.CUSTOMER,
        loginIdentifier: "delta_customer",
        passwordHash: demoPasswordHash("delta_customer"),
        status: AccountStatus.ACTIVE
      }
    ]
  });
  await prisma.staffUser.createMany({
    data: [
      {
        id: "u_delta_owner",
        tenantId: deltaTenant.id,
        accountId: "acc_delta_owner",
        name: "Delta Owner",
        email: "tenant_owner@mop.local",
        role: "tenant_owner",
        isTenantOwner: true,
        status: StaffStatus.ACTIVE,
        branchScope: [],
        warehouseScope: [],
        categoryScope: [CategoryCode.CARS],
        permissionTemplateId: "tpl_delta_tenant_owner"
      },
      {
        id: "u_delta_tech",
        tenantId: deltaTenant.id,
        accountId: "acc_delta_tech",
        name: "Delta Technician",
        email: "delta_technician@mop.local",
        role: "technician",
        status: StaffStatus.ACTIVE,
        branchScope: [deltaBranch.id],
        warehouseScope: [deltaWarehouse.id],
        categoryScope: [CategoryCode.CARS],
        permissionTemplateId: "tpl_delta_technician"
      }
    ]
  });
  await prisma.customer.create({
    data: {
      id: "cust_delta",
      tenantId: deltaTenant.id,
      accountId: "acc_delta_customer",
      branchId: deltaBranch.id,
      fullName: "Delta Customer",
      phone: "+201099999999",
      portalStatus: PortalStatus.ENABLED,
      communicationConsent: true
    }
  });

  const frozenTenant = await prisma.tenant.create({
    data: {
      id: "tenant_frozen_demo",
      name: "North Star Workshop",
      slug: "north-star-frozen",
      status: TenantStatus.FROZEN,
      portalEnabled: false,
      customerRegistrationCode: "NORTHFROZEN",
      customerRegistrationEnabled: false
    }
  });

  await prisma.controlSetting.createMany({
    data: [
      { tenantId: tenant.id, key: "customerPortalEnabled", value: true },
      { tenantId: tenant.id, key: "staffCreationPolicy", value: "Tenant Admin Only" },
      { tenantId: tenant.id, key: "auditLogging", value: true },
      { tenantId: tenant.id, key: "technicianUiMode", value: "Simple" },
      { tenantId: tenant.id, key: "quickServiceEnabled", value: true },
      { tenantId: tenant.id, key: "quickServiceInspectionPolicy", value: "Per service type" },
      { tenantId: tenant.id, key: "computerCodesEnabled", value: true },
      { tenantId: tenant.id, key: "computerCodeSuggestions", value: "Placeholder" },
      { tenantId: tenant.id, key: "videoGuideLinksEnabled", value: true },
      { tenantId: tenant.id, key: "customerVisibleTechnicalNotes", value: true },
      { tenantId: tenant.id, key: "technicianCanSendDecisionRequest", value: true },
      { tenantId: tenant.id, key: "technicianCanMarkUsed", value: true },
      { tenantId: tenant.id, key: "technicianCanViewPrices", value: true },
      { tenantId: tenant.id, key: "branchManagerReviewBeforeCustomerSend", value: false },
      { tenantId: tenant.id, key: "teamLeaderReviewPolicy", value: "Per service type" },
      { tenantId: tenant.id, key: "timeTrackingMode", value: "Optional" },
      { tenantId: tenant.id, key: "partsConsumptionTiming", value: "Issue then use" },
      { tenantId: tenant.id, key: "barcodeQrEnabled", value: true },
      { tenantId: tenant.id, key: "minimumStockEnabled", value: true },
      { tenantId: tenant.id, key: "supplierOrderApprovalRequired", value: true },
      { tenantId: tenant.id, key: "transferApprovalRequired", value: false },
      { tenantId: tenant.id, key: "returnsRequireReason", value: true },
      { tenantId: tenant.id, key: "lowStockBehavior", value: "Suggest supplier order" },
      { tenantId: tenant.id, key: "catalogFlexibility", value: "Standard" },
      { tenantId: frozenTenant.id, key: "platformFreezeReason", value: "Payment hold demonstration fixture" },
      { tenantId: frozenTenant.id, key: "customerPortalEnabled", value: false }
    ]
  });

  await prisma.auditLog.createMany({
    data: [
      {
        tenantId: tenant.id,
        actorType: AuditActorType.SYSTEM,
        actorName: "System Automation",
        action: "audit.bootstrap",
        targetType: "system",
        targetId: "mop_v4",
        reason: "Seed production architecture baseline."
      },
      {
        tenantId: tenant.id,
        actorType: AuditActorType.TENANT_STAFF,
        actorId: "u_admin",
        actorName: "Salma Tenant Admin",
        action: "user.created",
        targetType: "user",
        targetId: "u_tech",
        reason: "Created technician account with branch/category scope."
      },
      {
        tenantId: tenant.id,
        actorType: AuditActorType.TENANT_STAFF,
        actorId: "u_manager",
        actorName: "Khaled Branch Manager",
        action: "payment.confirmed",
        targetType: "invoice",
        targetId: paidInvoice.id,
        reason: "Release candidate fixture: final payment confirmed before delivery."
      },
      {
        tenantId: frozenTenant.id,
        actorType: AuditActorType.PLATFORM,
        actorId: "u_platform",
        actorName: "MOP Platform Admin",
        action: "tenant.frozen",
        targetType: "tenant",
        targetId: frozenTenant.id,
        reason: "Release candidate fixture for platform freeze and restore acceptance."
      }
    ]
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
