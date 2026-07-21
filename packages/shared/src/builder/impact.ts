import type { BuilderConfiguration, BuilderImpactPreview, BuilderRiskLevel, BuilderValidationIssue } from "./types";
import { validateBuilderConfiguration } from "./validation";

const HIGH_RISK_KEYS = [
  "customer_portal.enabled",
  "customer_decision.critical_warning",
  "inventory.parts_lifecycle",
  "finish_gate.",
  "inventory.arrived_confirmation_required",
  "inventory.return_unused_enabled"
];

export function buildBuilderImpactPreview(config: BuilderConfiguration): BuilderImpactPreview {
  const validation = validateBuilderConfiguration(config);
  const affectedPages = [...new Set([
    ...config.pageTemplates.map((page) => page.pageKey),
    ...config.featurePolicies.flatMap((policy) => policy.affectedPages),
    ...config.workflowPolicies.flatMap((policy) => policy.affectedPages)
  ])];
  const affectedRoles = [...new Set([
    ...config.pageTemplates.map((page) => page.role),
    ...config.featurePolicies.flatMap((policy) => policy.affectedRoles),
    ...config.workflowPolicies.flatMap((policy) => policy.affectedRoles)
  ])];
  const affectedServiceTypes = serviceTypes(config);
  const customerPortalBehavior = customerPortalNotes(config);
  const riskReasons = riskReasonList(config, validation.errors);
  return {
    affectedPages,
    affectedRoles,
    affectedUsersCount: estimateAffectedUsers(affectedRoles),
    affectedBranches: ["All tenant branches", "Branch overrides later"],
    affectedServiceTypes,
    customerPortalBehavior,
    validationIssues: [...validation.errors, ...validation.warnings],
    riskLevel: riskLevel(riskReasons),
    riskReasons
  };
}

function serviceTypes(config: BuilderConfiguration) {
  const quickService = config.featurePolicies.find((policy) => policy.key === "quick_service.enabled");
  const value = quickService?.value as Record<string, unknown> | undefined;
  return Array.isArray(value?.serviceTypes) ? value.serviceTypes.map(String) : ["Standard work orders"];
}

function customerPortalNotes(config: BuilderConfiguration) {
  const notes: string[] = [];
  const portal = config.featurePolicies.find((policy) => policy.key === "customer_portal.enabled");
  notes.push(portal?.enabled ? "Customer portal remains visible." : "Customer portal visibility is disabled.");
  const customerPage = config.pageTemplates.find((page) => page.pageKey === "customer.portal.home");
  if (customerPage?.sections.some((section) => section.type === "safe_history_timeline" && section.enabled)) {
    notes.push("Safe technical history remains customer-visible.");
  }
  if (customerPage?.sections.some((section) => section.type === "customer_decision_panel" && !section.enabled)) {
    notes.push("Customer decision panel is hidden on portal and publish should be blocked.");
  }
  return notes;
}

function riskReasonList(config: BuilderConfiguration, errors: BuilderValidationIssue[]) {
  const reasons: string[] = [];
  if (errors.length) reasons.push("Validation has blocking errors.");
  for (const policy of config.featurePolicies) {
    if (HIGH_RISK_KEYS.some((key) => policy.key === key || policy.key.startsWith(key)) && (!policy.enabled || policy.safetyLocked)) {
      reasons.push(`${policy.key} affects operational safety.`);
    }
  }
  for (const policy of config.workflowPolicies) {
    if (HIGH_RISK_KEYS.some((key) => policy.key.startsWith(key)) || policy.safetyLocked) {
      reasons.push(`${policy.key} affects workflow safety.`);
    }
  }
  if (config.pageTemplates.some((page) => page.sections.some((section) => section.safetyCritical && !section.enabled))) {
    reasons.push("A safety-critical section is hidden.");
  }
  if (config.messageTemplates.some((template) => template.safetyLocked && template.content !== template.defaultContent)) {
    reasons.push("A safety-locked message template changed.");
  }
  if (config.formSchemas.some((schema) => schema.fields.some((field) => field.core && field.archived))) {
    reasons.push("A core field is archived.");
  }
  if (!reasons.length) reasons.push("Presentation or optional layout changes only.");
  return [...new Set(reasons)];
}

function riskLevel(reasons: string[]): BuilderRiskLevel {
  if (reasons.some((reason) => /blocking|safety|core field|workflow|portal visibility/i.test(reason))) return "high";
  if (reasons.length > 1) return "medium";
  return "low";
}

function estimateAffectedUsers(roles: string[]) {
  const weights: Record<string, number> = {
    technician: 12,
    inventory_manager: 3,
    branch_manager: 4,
    team_leader: 3,
    customer: 250,
    tenant_admin: 2,
    tenant_owner: 1,
    data_analyst: 2
  };
  return roles.reduce((total, role) => total + (weights[role] || 1), 0);
}
