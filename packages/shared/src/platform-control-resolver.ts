import type { PlatformControlPolicyDto, PlatformEffectiveControlResultDto, PlatformWorkshopStatus } from "./platform";

export interface PlatformControlResolutionContext {
  tenantStatus?: PlatformWorkshopStatus;
  controlKey?: string;
  moduleKey?: string;
  featureKey?: string;
  roleKey?: string;
  userStatus?: "active" | "locked" | "disabled" | "read_only";
  policies?: PlatformControlPolicyDto[];
}

export const platformControlHierarchy = [
  "platform_hard_safety_rules",
  "platform_emergency_controls",
  "platform_global_controls",
  "platform_plan_entitlements",
  "platform_tenant_overrides",
  "tenant_owner_settings",
  "published_builder_configuration",
  "role_permission_template",
  "user_scope",
  "runtime_workflow_record_rules"
] as const;

export function resolveEffectivePlatformControls(context: PlatformControlResolutionContext): PlatformEffectiveControlResultDto {
  if (context.tenantStatus && ["frozen", "suspended", "archived"].includes(context.tenantStatus)) {
    return {
      allowed: false,
      reason: "TENANT_BLOCKED_BY_PLATFORM",
      message: "Workshop access is blocked by Platform Super Admin control.",
      source: "tenant_status",
      canTenantOverride: false
    };
  }

  if (context.tenantStatus === "read_only") {
    return {
      allowed: false,
      reason: "TENANT_READ_ONLY_BY_PLATFORM",
      message: "Workshop is visible but write actions are locked by Platform Super Admin control.",
      source: "platform_control",
      canTenantOverride: false
    };
  }

  if (context.userStatus && ["locked", "disabled"].includes(context.userStatus)) {
    return {
      allowed: false,
      reason: "USER_ACCESS_LOCKED_BY_PLATFORM",
      message: "User access is locked by Platform Super Admin control.",
      source: "platform_control",
      canTenantOverride: false
    };
  }

  const keys = [context.controlKey, context.moduleKey, context.featureKey, context.roleKey].filter(Boolean) as string[];
  const blockingPolicy = (context.policies || []).find((policy) => {
    if (!policy.active) return false;
    const applies = !keys.length || keys.some((key) => policy.controlKey === key || policy.id.includes(key));
    if (!applies) return false;
    if (policy.controlType && ["hard_disable", "soft_disable", "locked", "frozen", "archived", "hidden"].includes(policy.controlType)) return true;
    return policy.value === false || policy.value === "disabled" || policy.value === "locked";
  });

  if (blockingPolicy) {
    return {
      allowed: false,
      reason: "CAPABILITY_DISABLED_BY_PLATFORM",
      message: `${blockingPolicy.controlKey} is controlled by Platform Super Admin.`,
      source: "platform_control",
      canTenantOverride: false
    };
  }

  return {
    allowed: true,
    reason: "ALLOWED",
    message: "No blocking platform control matched.",
    source: "platform_control",
    canTenantOverride: false
  };
}
