export type OwnerPermissionSource =
  | "platform_control"
  | "plan_limit"
  | "tenant_configuration"
  | "role_template"
  | "user_override"
  | "user_scope"
  | "workflow_rule"
  | "record_rule";

export type OwnerPermissionCellState = "allowed" | "denied" | "inherited" | "locked_by_platform" | "locked_by_plan" | "requires_higher_role" | "not_available";

export interface OwnerPermissionDefinition {
  code: string;
  label: string;
  group: string;
  description: string;
}

export interface OwnerPermissionCellDto {
  permission: string;
  state: OwnerPermissionCellState;
  effectiveValue: boolean;
  source: OwnerPermissionSource;
  locked: boolean;
  reason?: string;
}

export interface OwnerRoleTemplateDto {
  id: string;
  name: string;
  baseRole: string;
  systemDefault: boolean;
  usersCount: number;
  permissions: OwnerPermissionCellDto[];
}

export interface OwnerUserPermissionDto {
  userId: string;
  name: string;
  role: string;
  templateId?: string;
  branchScope: string[];
  warehouseScope: string[];
  categoryScope: string[];
  teamScope: string[];
  reportScope: string[];
  builderScope: string[];
  overridesCount: number;
  permissions: OwnerPermissionCellDto[];
}

export interface OwnerScopeRuleDto {
  targetType: "role" | "user";
  targetId: string;
  branchScope: string[];
  warehouseScope: string[];
  categoryScope: string[];
  teamScope: string[];
  customerScope: string[];
  reportScope: string[];
  builderScope: string[];
}

export interface OwnerLockedControlDto {
  controlName: string;
  controlKey: string;
  currentValue: string;
  source: "platform_control" | "plan_limit";
  reason?: string;
  ownerCanChange: false;
}

export interface OwnerPermissionChangeHistoryDto {
  id: string;
  whoChanged: string;
  whatChanged: string;
  before?: unknown;
  after?: unknown;
  affectedUsers: number;
  reason?: string;
  timestamp: string;
  rollbackAvailable: boolean;
}

export interface OwnerPermissionImpactPreviewDto {
  affectedUsers: number;
  affectedRoles: string[];
  affectedPages: string[];
  affectedActions: string[];
  platformConflicts: Array<{ permission: string; reason: string }>;
  canApply: boolean;
}

export interface OwnerConfigurationSectionDto {
  id: string;
  label: string;
  description: string;
  permissionGroups: string[];
  routeIds: string[];
  controlledByPlatformKeys: string[];
}

export interface OwnerConfigurationPermissionsDto {
  configurationSections: OwnerConfigurationSectionDto[];
  permissionGroups: string[];
  permissionDefinitions: OwnerPermissionDefinition[];
  roleTemplates: OwnerRoleTemplateDto[];
  userPermissions: OwnerUserPermissionDto[];
  matrixRows: OwnerRoleTemplateDto[];
  scopeRules: OwnerScopeRuleDto[];
  lockedByPlatform: OwnerLockedControlDto[];
  changeHistory: OwnerPermissionChangeHistoryDto[];
  draftImpact: OwnerPermissionImpactPreviewDto;
}

export interface OwnerConfigurationDraftDto {
  roleTemplates: OwnerRoleTemplateDto[];
  userPermissions: OwnerUserPermissionDto[];
  scopeRules: OwnerScopeRuleDto[];
  reason?: string;
}
