import { sectionRegistryByType } from "./section-registry";
import type {
  BuilderConfigPrecedenceStep,
  BuilderConfiguration,
  BuilderOwnerModel,
  BuilderPreset,
  BuilderPreviewIdentity,
  DesignTokens,
  FeaturePolicy,
  FormFieldSchema,
  FormSchema,
  MessageTemplate,
  PageSection,
  PageTemplate,
  RoleExperienceSetting,
  WorkflowPolicy
} from "./types";

export const BUILDER_SCHEMA_VERSION = 2;
export const BUILDER_BASE_TEMPLATE_VERSION = "mop-builder-base-v7.2";
const now = "2026-07-07T00:00:00.000Z";

export const defaultDesignTokens: DesignTokens = {
  primaryColor: "#0f766e",
  accentColor: "#f59e0b",
  backgroundColor: "#f6f7f4",
  surfaceColor: "#ffffff",
  textColor: "#101418",
  successColor: "#15803d",
  warningColor: "#d97706",
  dangerColor: "#dc2626",
  radius: "soft",
  density: "comfortable",
  iconStyle: "line",
  themeMode: "light",
  buttonStyle: "solid",
  customerPortalTheme: "branded",
  staffWorkspaceTheme: "operational"
};

function section(id: string, type: string, order: number, enabled: boolean, locked: boolean, safetyCritical: boolean, title: string, settings?: Record<string, unknown>): PageSection {
  const registry = sectionRegistryByType[type];
  const defaultSettings = registry?.defaultSettings || {};
  return {
    id,
    type,
    order,
    enabled,
    locked,
    safetyCritical,
    title,
    settings: { ...defaultSettings, ...(settings || {}) },
    defaultSettings: { ...defaultSettings }
  };
}

function page(input: Omit<PageTemplate, "templateSchemaVersion" | "baseTemplateVersion" | "createdFromBaseVersion" | "lastMigratedAt">): PageTemplate {
  return {
    ...input,
    templateSchemaVersion: BUILDER_SCHEMA_VERSION,
    baseTemplateVersion: BUILDER_BASE_TEMPLATE_VERSION,
    createdFromBaseVersion: BUILDER_BASE_TEMPLATE_VERSION,
    lastMigratedAt: now
  };
}

export const defaultPageTemplates: PageTemplate[] = [
  page({
    pageKey: "technician.home",
    role: "technician",
    layout: "simple",
    versionId: "draft-1",
    branchOverrideAllowed: false,
    sections: [
      section("tech-current", "current_job_card", 1, true, true, true, "Current Job"),
      section("tech-work", "technician_work_queue", 2, true, true, true, "My Work"),
      section("tech-quick", "quick_service_card", 3, true, false, false, "Quick Service")
    ]
  }),
  page({
    pageKey: "technician.work_card",
    role: "technician",
    layout: "simple",
    versionId: "draft-1",
    branchOverrideAllowed: false,
    sections: [
      section("work-parts", "parts_lifecycle_panel", 1, true, true, true, "Parts"),
      section("work-decision", "customer_decision_panel", 2, true, true, true, "Ask Customer", { showPrices: false }),
      section("work-critical", "critical_warning_acknowledgement", 3, true, true, true, "Critical Warning"),
      section("work-finish", "finish_gate_panel", 4, true, true, true, "Finish")
    ]
  }),
  page({
    pageKey: "inventory.home",
    role: "inventory_manager",
    layout: "board",
    versionId: "draft-1",
    branchOverrideAllowed: true,
    sections: [
      section("inv-requests", "inventory_request_queue", 1, true, true, true, "Technician Requests"),
      section("inv-alerts", "inventory_stock_alerts", 2, true, false, false, "Stock Alerts")
    ]
  }),
  page({
    pageKey: "branch.home",
    role: "branch_manager",
    layout: "board",
    versionId: "draft-1",
    branchOverrideAllowed: true,
    sections: [
      section("branch-attention", "branch_attention_cards", 1, true, true, true, "Attention"),
      section("branch-stock", "inventory_stock_alerts", 2, true, false, false, "Stock Risk", { compact: true })
    ]
  }),
  page({
    pageKey: "team_leader.home",
    role: "team_leader",
    layout: "board",
    versionId: "draft-1",
    branchOverrideAllowed: true,
    sections: [
      section("tl-review", "team_review_queue", 1, true, true, true, "Team Review")
    ]
  }),
  page({
    pageKey: "customer.portal.home",
    role: "customer",
    layout: "portal",
    versionId: "draft-1",
    branchOverrideAllowed: true,
    sections: [
      section("cust-status", "customer_status_summary", 1, true, true, true, "Service Status"),
      section("cust-decision", "customer_decision_panel", 2, true, true, true, "Your Decisions", { customerCopy: true }),
      section("cust-history", "safe_history_timeline", 3, true, false, false, "Safe History")
    ]
  })
];

export const defaultRoleExperiences: RoleExperienceSetting[] = [
  { role: "technician", mode: "simple", defaultLandingPage: "technician.home", visibleNavigation: ["technician.home", "technician.my_work", "technician.work_card"], shortcuts: ["request_part", "ask_customer", "finish"], density: "comfortable", actionButtonStyle: "icon_text", labels: { finish: "Finish" } },
  { role: "inventory_manager", mode: "advanced", defaultLandingPage: "inventory.home", visibleNavigation: ["inventory.home", "inventory.requests", "inventory.catalog", "inventory.quantity", "inventory.returns", "inventory.reports"], shortcuts: ["issue_part", "reject_request", "adjust_stock"], density: "compact", actionButtonStyle: "icon_text", labels: {} },
  { role: "branch_manager", mode: "advanced", defaultLandingPage: "branch.home", visibleNavigation: ["branch.home", "branch.intake", "branch.work_orders", "branch.workspace", "branch.decisions", "branch.delivery"], shortcuts: ["assign_technician", "send_reminder", "mark_ready_delivery"], density: "comfortable", actionButtonStyle: "icon_text", labels: {} },
  { role: "team_leader", mode: "advanced", defaultLandingPage: "team_leader.home", visibleNavigation: ["team_leader.home"], shortcuts: ["approve_review", "send_rework"], density: "compact", actionButtonStyle: "icon_text", labels: {} },
  { role: "customer", mode: "simple", defaultLandingPage: "customer.portal.home", visibleNavigation: ["customer.portal.home"], shortcuts: ["respond_decision"], density: "comfortable", actionButtonStyle: "text", labels: {} }
];

export const defaultFeaturePolicies: FeaturePolicy[] = [
  { key: "customer_portal.enabled", enabled: true, value: true, affectedRoles: ["customer"], affectedPages: ["customer.portal.home"], dependencies: [], safetyLocked: true },
  { key: "customer_decision.enabled", enabled: true, value: true, affectedRoles: ["technician", "branch_manager", "customer"], affectedPages: ["technician.work_card", "branch.decisions", "customer.portal.home"], dependencies: ["customer_portal.enabled"], safetyLocked: true },
  { key: "customer_decision.critical_warning", enabled: true, value: true, affectedRoles: ["technician", "customer"], affectedPages: ["technician.work_card", "customer.portal.home"], dependencies: ["customer_decision.enabled"], safetyLocked: true },
  { key: "inventory.parts_lifecycle", enabled: true, value: true, affectedRoles: ["technician", "inventory_manager", "branch_manager"], affectedPages: ["technician.work_card", "inventory.requests", "branch.workspace"], dependencies: [], safetyLocked: true },
  { key: "inventory.thresholds", enabled: true, value: true, affectedRoles: ["inventory_manager", "branch_manager"], affectedPages: ["inventory.home", "inventory.quantity", "branch.home"], dependencies: ["inventory.parts_lifecycle"], safetyLocked: false },
  { key: "quick_service.enabled", enabled: true, value: { serviceTypes: ["oil_change", "battery_check"] }, affectedRoles: ["technician"], affectedPages: ["technician.home", "technician.work_card"], dependencies: ["inventory.parts_lifecycle"], safetyLocked: false },
  { key: "team_leader.review", enabled: true, value: true, affectedRoles: ["team_leader", "technician"], affectedPages: ["team_leader.home", "technician.work_card"], dependencies: [], safetyLocked: false }
] ;

export const defaultWorkflowPolicies: WorkflowPolicy[] = [
  { key: "finish_gate.block_pending_customer_decision", value: true, affectedRoles: ["technician"], affectedPages: ["technician.work_card"], safetyLocked: true },
  { key: "finish_gate.block_arrived_part_not_used_or_returned", value: true, affectedRoles: ["technician"], affectedPages: ["technician.work_card"], safetyLocked: true },
  { key: "finish_gate.block_return_pending", value: true, affectedRoles: ["technician"], affectedPages: ["technician.work_card"], safetyLocked: true },
  { key: "finish_gate.block_inspection_missing", value: true, affectedRoles: ["technician"], affectedPages: ["technician.work_card"], safetyLocked: true },
  { key: "finish_gate.block_open_blocker", value: true, affectedRoles: ["technician"], affectedPages: ["technician.work_card"], safetyLocked: true },
  { key: "inventory.arrived_confirmation_required", value: true, affectedRoles: ["technician", "inventory_manager"], affectedPages: ["technician.work_card", "inventory.requests"], safetyLocked: true },
  { key: "inventory.return_unused_enabled", value: true, affectedRoles: ["technician", "inventory_manager"], affectedPages: ["technician.work_card", "inventory.returns"], safetyLocked: true },
  { key: "customer_decision.technician_can_send_directly", value: false, affectedRoles: ["technician", "branch_manager"], affectedPages: ["technician.work_card", "branch.decisions"], safetyLocked: false },
  { key: "team_leader.scope_mode", value: "assigned_technicians", affectedRoles: ["team_leader"], affectedPages: ["team_leader.home"], safetyLocked: false }
] ;

function field(input: Omit<FormFieldSchema, "fieldId" | "createdAt" | "updatedAt" | "searchable" | "reportableLater" | "archived"> & Partial<Pick<FormFieldSchema, "fieldId" | "searchable" | "reportableLater" | "archived">>): FormFieldSchema {
  return {
    ...input,
    fieldId: input.fieldId || `fld_${input.key}`,
    searchable: input.searchable ?? true,
    reportableLater: input.reportableLater ?? true,
    archived: input.archived ?? false,
    createdAt: now,
    updatedAt: now
  };
}

export const defaultFormSchemas: FormSchema[] = [
  {
    key: "asset_registration.cars",
    label: "Cars Asset Intake",
    target: "asset_registration",
    fields: [
      field({ key: "plate_number", label: "Plate Number", type: "text", required: true, placeholder: "ABC 1234", helpText: "Primary legal identifier.", validationRules: ["required", "max:32"], core: true, customerVisible: true, rolesVisibleTo: ["branch_manager", "tenant_admin", "technician"], categoryScope: ["Cars"] }),
      field({ key: "vin", label: "VIN", type: "text", required: false, placeholder: "Vehicle identification number", validationRules: ["max:64"], core: false, customerVisible: false, rolesVisibleTo: ["branch_manager", "tenant_admin"], categoryScope: ["Cars"] }),
      field({ key: "mileage", label: "Mileage", type: "number", required: true, defaultValue: 0, placeholder: "0", helpText: "Required for service history and reports.", validationRules: ["min:0"], core: false, customerVisible: true, rolesVisibleTo: ["branch_manager", "tenant_admin", "technician"], categoryScope: ["Cars"] }),
      field({ key: "fuel_level", label: "Fuel Level", type: "select", required: false, placeholder: "Select fuel level", core: false, customerVisible: false, rolesVisibleTo: ["branch_manager", "technician", "tenant_admin"], categoryScope: ["Cars"], options: [{ label: "Low", value: "low" }, { label: "Half", value: "half" }, { label: "Full", value: "full" }] })
    ]
  },
  {
    key: "part_request.default",
    label: "Part Request",
    target: "part_request",
    fields: [
      field({ key: "item_id", label: "Item", type: "text", required: true, placeholder: "Select item", validationRules: ["required"], core: true, customerVisible: false, rolesVisibleTo: ["technician", "inventory_manager", "tenant_admin"] }),
      field({ key: "qty", label: "Qty", type: "number", required: true, defaultValue: 1, validationRules: ["required", "min:1"], core: true, customerVisible: false, rolesVisibleTo: ["technician", "inventory_manager", "tenant_admin"] }),
      field({ key: "reason", label: "Reason", type: "textarea", required: true, placeholder: "Why is this part needed?", validationRules: ["required", "max:500"], core: true, customerVisible: false, rolesVisibleTo: ["technician", "inventory_manager", "branch_manager", "tenant_admin"] })
    ]
  }
];

function message(input: Omit<MessageTemplate, "defaultContent" | "versionHistory">): MessageTemplate {
  return {
    ...input,
    defaultContent: input.content,
    versionHistory: [
      { versionId: "default", content: input.content, changedAt: now, changedBy: "system", reason: "Default template." }
    ]
  };
}

export const defaultMessageTemplates: MessageTemplate[] = [
  message({
    key: "customer_decision.whatsapp",
    label: "WhatsApp Decision Message",
    channel: "whatsapp",
    content: "Hello {{customer_name}}, your {{asset_identifier}} at {{branch_name}} needs a service decision. Open this secure link: {{decision_link}}",
    requiredVariables: ["customer_name", "asset_identifier", "branch_name", "decision_link"],
    allowedVariables: ["customer_name", "asset_name", "asset_identifier", "work_order_id", "decision_link", "branch_name"],
    customerVisible: true,
    safetyLocked: true
  }),
  message({
    key: "critical_warning.portal",
    label: "Critical Warning",
    channel: "portal",
    content: "This item is marked critical. Please acknowledge the safety warning before rejecting or continuing.",
    requiredVariables: [],
    allowedVariables: ["customer_name", "asset_identifier", "branch_name"],
    customerVisible: true,
    safetyLocked: true
  }),
  message({
    key: "ready_delivery.whatsapp",
    label: "Ready For Delivery",
    channel: "whatsapp",
    content: "Hello {{customer_name}}, your {{asset_identifier}} is ready for delivery at {{branch_name}}.",
    requiredVariables: ["customer_name", "asset_identifier", "branch_name"],
    allowedVariables: ["customer_name", "asset_identifier", "branch_name", "work_order_id"],
    customerVisible: true,
    safetyLocked: false
  })
];

export const defaultPreviewIdentities: BuilderPreviewIdentity[] = [
  { id: "preview-tech-ahmed", displayName: "Technician Ahmed", role: "technician", branchName: "Nasr City Branch", scenarioFixtureKeys: ["technician-work-card", "customer-decision", "inventory-lifecycle"] },
  { id: "preview-customer-omar", displayName: "Customer Omar", role: "customer", branchName: "Nasr City Branch", scenarioFixtureKeys: ["customer-decision", "delivery-payment-snapshot"] },
  { id: "preview-inventory-mona", displayName: "Inventory Manager Mona", role: "inventory_manager", branchName: "Nasr City Branch", scenarioFixtureKeys: ["inventory-lifecycle", "multi-warehouse"] },
  { id: "preview-branch-khaled", displayName: "Branch Manager Khaled", role: "branch_manager", branchName: "Nasr City Branch", scenarioFixtureKeys: ["branch-manager-attention", "customer-decision"] },
  { id: "preview-team-youssef", displayName: "Team Leader Youssef", role: "team_leader", branchName: "Nasr City Branch", scenarioFixtureKeys: ["team-leader-review", "technician-work-card"] },
  { id: "preview-admin-salma", displayName: "Tenant Admin Salma", role: "tenant_admin", branchName: "Head Office", scenarioFixtureKeys: ["identity", "branch-manager-attention"] }
];

export const defaultConfigPrecedence: BuilderConfigPrecedenceStep[] = [
  { order: 1, key: "platform_safety_rules", label: "Platform safety rules", canBeOverriddenByBuilder: false },
  { order: 2, key: "platform_default_template", label: "Platform default template", canBeOverriddenByBuilder: false },
  { order: 3, key: "tenant_published_configuration", label: "Tenant published configuration", canBeOverriddenByBuilder: true },
  { order: 4, key: "branch_override", label: "Branch override when allowed", canBeOverriddenByBuilder: true },
  { order: 5, key: "role_experience_settings", label: "Role experience settings", canBeOverriddenByBuilder: true },
  { order: 6, key: "session_permissions_scopes", label: "User/session permissions and scopes", canBeOverriddenByBuilder: false },
  { order: 7, key: "runtime_record_workflow_rules", label: "Runtime record and workflow rules", canBeOverriddenByBuilder: false }
];

export const defaultOwnerModel: BuilderOwnerModel = {
  tenantOwnerRole: "tenant_owner",
  tenantAdminRole: "tenant_admin",
  ownerOnlyFutureActions: ["subscription.manage", "tenant.delete", "tenant.ownership.transfer", "builder.high_risk.approve"]
};

export const builderPresets: BuilderPreset[] = [
  { id: "default-workshop", label: "Default Workshop", category: "starter", description: "Balanced safe setup for mixed service operations.", previewPage: "technician.home", recommendedFor: ["General workshops"], riskLevel: "low" },
  { id: "car-service-center", label: "Car Service Center", category: "category", description: "Cars-first intake fields and technician simple mode.", previewPage: "technician.work_card", recommendedFor: ["Car service centers"], riskLevel: "medium" },
  { id: "motorcycle-workshop", label: "Motorcycle Workshop", category: "category", description: "Motorcycle-focused asset fields and compact technician cards.", previewPage: "technician.home", recommendedFor: ["Motorcycle workshops"], riskLevel: "medium" },
  { id: "heavy-equipment-service", label: "Heavy Equipment Service", category: "category", description: "Heavy equipment operations with branch and safety emphasis.", previewPage: "branch.home", recommendedFor: ["Heavy equipment teams"], riskLevel: "medium" },
  { id: "fast-service-workshop", label: "Fast Service Workshop", category: "speed", description: "Quick Service visible with stricter allowed service types.", previewPage: "technician.home", recommendedFor: ["Oil change and fast service"], riskLevel: "medium" },
  { id: "premium-customer-portal", label: "Premium Customer Portal", category: "portal", description: "Customer portal clarity with safe history and branded message tone.", previewPage: "customer.portal.home", recommendedFor: ["Premium customer experience"], riskLevel: "low" },
  { id: "simple-technician-mode", label: "Simple Technician Mode", category: "role", description: "Reduced technician density for the simplest execution flow.", previewPage: "technician.home", recommendedFor: ["New teams and high-volume branches"], riskLevel: "low" }
];

export function createDefaultBuilderConfiguration(tenantId = "demo-tenant"): BuilderConfiguration {
  return {
    tenantId,
    schemaVersion: BUILDER_SCHEMA_VERSION,
    baseTemplateVersion: BUILDER_BASE_TEMPLATE_VERSION,
    lastMigratedAt: now,
    activeVersionId: "published-1",
    draftVersionId: "draft-1",
    versions: [
      { id: "published-1", status: "published", versionNumber: 1, createdAt: now, publishedAt: now, publishedBy: "system", reason: "Default operationally safe builder baseline." },
      { id: "draft-1", status: "draft", versionNumber: 2, createdAt: now, reason: "Editable draft." }
    ],
    designTokens: { ...defaultDesignTokens },
    pageTemplates: clone(defaultPageTemplates),
    roleExperiences: clone(defaultRoleExperiences),
    featurePolicies: clone(defaultFeaturePolicies),
    workflowPolicies: clone(defaultWorkflowPolicies),
    formSchemas: clone(defaultFormSchemas),
    messageTemplates: clone(defaultMessageTemplates),
    previewIdentities: clone(defaultPreviewIdentities),
    configPrecedence: clone(defaultConfigPrecedence),
    ownerModel: clone(defaultOwnerModel)
  };
}

export function defaultPageTemplateFor(pageKey: PageTemplate["pageKey"]) {
  const template = defaultPageTemplates.find((item) => item.pageKey === pageKey);
  return template ? clone(template) : undefined;
}

export function applyBuilderPreset(config: BuilderConfiguration, presetId: string): BuilderConfiguration {
  const next = clone(config);
  if (presetId === "simple-technician-mode") {
    next.roleExperiences = next.roleExperiences.map((role) => role.role === "technician" ? { ...role, mode: "simple", density: "comfortable", shortcuts: ["request_part", "ask_customer", "finish"] } : role);
    next.pageTemplates = next.pageTemplates.map((template) => template.role === "technician" ? { ...template, sections: template.sections.map((section) => section.type === "quick_service_card" ? { ...section, enabled: false, hiddenAt: now, hiddenReason: "Simple Technician Mode preset" } : section) } : template);
  }
  if (presetId === "fast-service-workshop") {
    next.featurePolicies = next.featurePolicies.map((policy) => policy.key === "quick_service.enabled" ? { ...policy, enabled: true, value: { serviceTypes: ["oil_change", "battery_check", "tire_rotation"] } } : policy);
    next.pageTemplates = next.pageTemplates.map((template) => template.pageKey === "technician.home" ? { ...template, sections: template.sections.map((section) => section.type === "quick_service_card" ? { ...section, enabled: true, hiddenAt: undefined, hiddenReason: undefined } : section) } : template);
  }
  if (presetId === "premium-customer-portal") {
    next.designTokens = { ...next.designTokens, customerPortalTheme: "branded", radius: "soft", accentColor: "#b7791f" };
    next.pageTemplates = next.pageTemplates.map((template) => template.pageKey === "customer.portal.home" ? { ...template, sections: template.sections.map((section) => section.type === "safe_history_timeline" ? { ...section, enabled: true } : section) } : template);
  }
  if (presetId === "car-service-center") {
    next.designTokens = { ...next.designTokens, primaryColor: "#123c69", accentColor: "#f59e0b" };
  }
  if (presetId === "motorcycle-workshop") {
    next.designTokens = { ...next.designTokens, primaryColor: "#111827", accentColor: "#ef4444", density: "compact" };
  }
  if (presetId === "heavy-equipment-service") {
    next.designTokens = { ...next.designTokens, primaryColor: "#374151", accentColor: "#eab308" };
  }
  return next;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
