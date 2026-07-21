import { sectionRegistryByType } from "./section-registry";
import type { BuilderConfiguration, BuilderPageKey, BuilderValidationIssue, BuilderValidationResult, DesignTokens } from "./types";

const requiredPageSections: Partial<Record<BuilderPageKey, string[]>> = {
  "technician.home": ["current_job_card", "technician_work_queue"],
  "technician.work_card": ["parts_lifecycle_panel", "customer_decision_panel", "critical_warning_acknowledgement", "finish_gate_panel"],
  "inventory.home": ["inventory_request_queue"],
  "branch.home": ["branch_attention_cards"],
  "team_leader.home": ["team_review_queue"],
  "customer.portal.home": ["customer_status_summary", "customer_decision_panel"]
};

export function validateBuilderConfiguration(config: BuilderConfiguration): BuilderValidationResult {
  const issues: BuilderValidationIssue[] = [];
  const featureByKey = new Map(config.featurePolicies.map((policy) => [policy.key, policy]));

  if (!config.designTokens.primaryColor || !config.designTokens.accentColor) {
    issues.push(issue("theme.colors.required", "error", "theme", "Primary and accent colors are required.", true));
  }
  issues.push(...validateDesignTokens(config.designTokens));
  if (!config.schemaVersion || !config.baseTemplateVersion) {
    issues.push(issue("migration.schema_version.missing", "error", "publish", "Builder configuration must include schema and base template versions.", true));
  }

  for (const [pageKey, sectionTypes] of Object.entries(requiredPageSections) as Array<[BuilderPageKey, string[]]>) {
    const page = config.pageTemplates.find((template) => template.pageKey === pageKey);
    if (!page) {
      issues.push(issue(`page.${pageKey}.missing`, "error", "page", `${pageKey} is required and cannot be removed.`, true));
      continue;
    }
    for (const sectionType of sectionTypes) {
      const section = page.sections.find((item) => item.type === sectionType);
      if (!section || !section.enabled) {
        issues.push(issue(`section.${pageKey}.${sectionType}.required`, "error", "section", `${sectionType} is required on ${pageKey}.`, true, pageKey, sectionType));
      }
    }
  }

  for (const page of config.pageTemplates) {
    const orders = new Set<number>();
    for (const section of page.sections) {
      const registry = sectionRegistryByType[section.type];
      if (!registry) {
        issues.push(issue(`section.${section.type}.unknown`, "error", "section", `${section.type} is not registered in the Builder component registry.`, true, page.pageKey, section.type));
        continue;
      }
      if (!registry.allowedPages.includes(page.pageKey)) {
        issues.push(issue(`section.${section.type}.page_not_allowed`, "error", "section", `${section.type} is not allowed on ${page.pageKey}.`, true, page.pageKey, section.type));
      }
      if (!registry.allowedRoles.includes(page.role)) {
        issues.push(issue(`section.${section.type}.role_not_allowed`, "error", "section", `${section.type} is not allowed for ${page.role}.`, true, page.pageKey, section.type));
      }
      if (registry.forbiddenRoles.includes(page.role)) {
        issues.push(issue(`section.${section.type}.role_forbidden`, "error", "section", `${section.type} is forbidden for ${page.role}.`, true, page.pageKey, section.type));
      }
      if ((registry.safetyCritical || section.safetyCritical || section.locked) && !section.enabled) {
        issues.push(issue(`section.${section.type}.safety_hidden`, "error", "section", `${section.title} is safety-critical and cannot be hidden.`, true, page.pageKey, section.type));
      }
      if (page.role === "customer" && registry.internalOnly) {
        issues.push(issue(`section.${section.type}.customer_internal`, "error", "access", `Customer pages cannot contain internal section ${section.type}.`, true, page.pageKey, section.type));
      }
      if (page.pageKey.startsWith("customer.") && !registry.customerSafe) {
        issues.push(issue(`section.${section.type}.not_customer_safe`, "error", "access", `${section.type} is not customer-safe.`, true, page.pageKey, section.type));
      }
      for (const feature of registry.requiredFeatures) {
        const featurePolicy = featureByKey.get(feature);
        if (featurePolicy && !featurePolicy.enabled && section.enabled) {
          issues.push(issue(`section.${section.type}.feature_disabled.${feature}`, "error", "feature", `${section.type} requires ${feature} while that feature is disabled.`, true, page.pageKey, section.type, feature));
        }
      }
      if (!section.title?.trim()) {
        issues.push(issue(`section.${section.type}.title_required`, "error", "section", `${section.type} must have a visible label.`, true, page.pageKey, section.type));
      }
      issues.push(...unsafeValueIssues(section.settings, `section.${section.type}.settings`, "section", page.pageKey, section.type));
      if (orders.has(section.order)) {
        issues.push(issue(`section.${page.pageKey}.duplicate_order.${section.order}`, "warning", "section", `${page.pageKey} has duplicate section order ${section.order}.`, false, page.pageKey, section.type));
      }
      orders.add(section.order);
    }
    const enabledCount = page.sections.filter((section) => section.enabled).length;
    if (page.role === "technician" && enabledCount > 5) {
      issues.push(issue(`page.${page.pageKey}.technician_density`, "warning", "page", `${page.pageKey} has ${enabledCount} enabled sections. Technician UI may become too dense.`, false, page.pageKey));
    }
    if (!page.templateSchemaVersion || !page.baseTemplateVersion || !page.createdFromBaseVersion) {
      issues.push(issue(`page.${page.pageKey}.migration_fields`, "error", "page", `${page.pageKey} must include schema migration fields.`, true, page.pageKey));
    }
  }

  for (const policy of config.featurePolicies) {
    if (policy.enabled) {
      for (const dependency of policy.dependencies) {
        const dependencyPolicy = featureByKey.get(dependency);
        if (!dependencyPolicy?.enabled) {
          issues.push(issue(`feature.${policy.key}.dependency.${dependency}`, "error", "feature", `${policy.key} requires ${dependency} to be enabled.`, true, undefined, undefined, policy.key));
        }
      }
    }
    if (policy.safetyLocked && !policy.enabled) {
      issues.push(issue(`feature.${policy.key}.safety_disabled`, "error", "feature", `${policy.key} is safety locked and cannot be disabled.`, true, undefined, undefined, policy.key));
    }
    if (policy.key === "quick_service.enabled" && policy.enabled) {
      const value = policy.value as Record<string, unknown>;
      const serviceTypes = Array.isArray(value.serviceTypes) ? value.serviceTypes : [];
      if (!serviceTypes.length) {
        issues.push(issue("feature.quick_service.service_types", "error", "feature", "Quick Service must be limited to configured service types.", true, undefined, undefined, policy.key));
      }
    }
  }

  for (const policy of config.workflowPolicies) {
    if (policy.safetyLocked && policy.value === false) {
      issues.push(issue(`workflow.${policy.key}.safety_disabled`, "error", "workflow", `${policy.key} is required for operational safety.`, true, undefined, undefined, policy.key));
    }
  }

  for (const schema of config.formSchemas) {
    for (const field of schema.fields) {
      if (!field.fieldId) {
        issues.push(issue(`form.${schema.key}.${field.key}.field_id`, "error", "form", `${field.label} must have a stable field_id.`, true));
      }
      if (field.core && !field.required) {
        issues.push(issue(`form.${schema.key}.${field.key}.core_optional`, "warning", "form", `${field.label} is a core field. Making it optional may weaken data quality.`, false));
      }
      if (field.core && field.archived) {
        issues.push(issue(`form.${schema.key}.${field.key}.core_archived`, "error", "form", `${field.label} is a core field and cannot be archived.`, true));
      }
      if (field.archived && field.required) {
        issues.push(issue(`form.${schema.key}.${field.key}.archived_required`, "error", "form", `${field.label} cannot be archived and required for new forms at the same time.`, true));
      }
      if (field.customerVisible && field.rolesVisibleTo.includes("inventory_manager")) {
        issues.push(issue(`form.${schema.key}.${field.key}.visibility_review`, "warning", "form", `${field.label} is customer-visible and also visible to Inventory Manager. Review privacy wording.`, false));
      }
      if (!field.label?.trim()) {
        issues.push(issue(`form.${schema.key}.${field.key}.label_required`, "error", "form", `${field.key} needs a visible label.`, true));
      }
      issues.push(...unsafeValueIssues(field, `form.${schema.key}.${field.key}`, "form"));
    }
  }

  for (const template of config.messageTemplates) {
    issues.push(...unsafeValueIssues(template.content, `message.${template.key}.content`, "message", undefined, undefined, undefined, template.key));
    for (const variable of template.requiredVariables) {
      if (!template.content.includes(`{{${variable}}}`)) {
        issues.push(issue(`message.${template.key}.${variable}.missing`, "error", "message", `${template.label} must include {{${variable}}}.`, true, undefined, undefined, undefined, template.key));
      }
    }
    if (template.key.includes("critical_warning") && !/acknowledge|warning|required/i.test(template.content)) {
      issues.push(issue(`message.${template.key}.acknowledgement`, "error", "message", "Critical warning messages must include acknowledgement or warning wording.", true, undefined, undefined, undefined, template.key));
    }
  }

  const errors = issues.filter((item) => item.severity === "error");
  return {
    valid: errors.length === 0,
    errors,
    warnings: issues.filter((item) => item.severity === "warning")
  };
}

function issue(
  id: string,
  severity: BuilderValidationIssue["severity"],
  area: BuilderValidationIssue["area"],
  message: string,
  blocking: boolean,
  pageKey?: BuilderValidationIssue["pageKey"],
  sectionType?: string,
  policyKey?: string,
  templateKey?: string
): BuilderValidationIssue {
  return { id, severity, area, message, blocking, pageKey, sectionType, policyKey, templateKey };
}

function validateDesignTokens(tokens: DesignTokens): BuilderValidationIssue[] {
  const issues: BuilderValidationIssue[] = [];
  if (tokens.successColor.toLowerCase() === tokens.dangerColor.toLowerCase()) {
    issues.push(issue("theme.success_danger.same", "error", "theme", "Success and danger colors cannot be the same.", true));
  }
  if (tokens.textColor.toLowerCase() === tokens.backgroundColor.toLowerCase()) {
    issues.push(issue("theme.text_background.same", "error", "theme", "Text color cannot match the background color.", true));
  }
  const contrast = contrastRatio(tokens.textColor, tokens.backgroundColor);
  if (contrast < 4.5) {
    issues.push(issue("theme.contrast.low", "warning", "theme", `Text/background contrast is ${contrast.toFixed(2)}. Aim for 4.5 or higher.`, false));
  }
  return issues;
}

function unsafeValueIssues(
  value: unknown,
  idPrefix: string,
  area: BuilderValidationIssue["area"],
  pageKey?: BuilderValidationIssue["pageKey"],
  sectionType?: string,
  policyKey?: string,
  templateKey?: string
) {
  const text = JSON.stringify(value || "");
  const unsafePatterns = [
    /<script/i,
    /<\/?[a-z][\s\S]*>/i,
    /javascript:/i,
    /\bon[a-z]+\s*=/i,
    /\bselect\s+.+\bfrom\b/i,
    /\binsert\s+into\b/i,
    /\bupdate\s+.+\bset\b/i,
    /\bdelete\s+from\b/i,
    /<iframe/i,
    /externalScript/i,
    /customApiCall/i,
    /rawHtml/i,
    /customJs/i
  ];
  if (unsafePatterns.some((pattern) => pattern.test(text))) {
    return [issue(`${idPrefix}.unsafe_raw_code`, "error", area, "Builder customization cannot include raw HTML, JavaScript, SQL, iframes, external scripts, or custom API calls.", true, pageKey, sectionType, policyKey, templateKey)];
  }
  return [];
}

function contrastRatio(foreground: string, background: string) {
  const fg = luminance(foreground);
  const bg = luminance(background);
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

function luminance(hex: string) {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function parseHex(hex: string) {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return undefined;
  return [0, 2, 4].map((start) => parseInt(normalized.slice(start, start + 2), 16));
}
