export type BuilderRole =
  | "tenant_owner"
  | "tenant_admin"
  | "technician"
  | "inventory_manager"
  | "branch_manager"
  | "team_leader"
  | "customer"
  | "data_analyst";

export type BuilderPageKey =
  | "builder.home"
  | "builder.brand_theme"
  | "builder.page_builder"
  | "builder.role_experience"
  | "builder.workflow_feature"
  | "builder.forms_fields"
  | "builder.messages_templates"
  | "builder.organization_access"
  | "builder.publish_center"
  | "builder.audit_rollback"
  | "technician.home"
  | "technician.my_work"
  | "technician.work_card"
  | "inventory.home"
  | "inventory.requests"
  | "inventory.catalog"
  | "inventory.quantity"
  | "inventory.returns"
  | "inventory.reports"
  | "branch.home"
  | "branch.intake"
  | "branch.work_orders"
  | "branch.workspace"
  | "branch.decisions"
  | "branch.delivery"
  | "team_leader.home"
  | "customer.portal.home"
  | "work_order.workspace";

export type BuilderVersionStatus = "draft" | "published" | "archived";
export type BuilderDevicePreview = "desktop" | "tablet" | "mobile";
export type BuilderDensity = "comfortable" | "compact";
export type BuilderRadius = "sharp" | "soft" | "round";
export type BuilderIconStyle = "line" | "filled";
export type BuilderThemeMode = "light" | "dark" | "system";
export type BuilderValidationSeverity = "error" | "warning";
export type BuilderPolicyValue = boolean | string | number | string[] | Record<string, unknown>;
export type BuilderFieldType = "text" | "number" | "select" | "checkbox" | "date" | "image" | "file" | "textarea";
export type MessageTemplateChannel = "whatsapp" | "portal" | "sms" | "email";
export type BuilderRiskLevel = "low" | "medium" | "high";
export type BuilderChangeArea = "brand" | "pages" | "roles" | "workflow" | "forms" | "messages" | "organization" | "publish";
export type BuilderPresetCategory = "starter" | "category" | "role" | "portal" | "speed";

export interface DesignTokens {
  logoUrl?: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  successColor: string;
  warningColor: string;
  dangerColor: string;
  radius: BuilderRadius;
  density: BuilderDensity;
  iconStyle: BuilderIconStyle;
  themeMode: BuilderThemeMode;
  buttonStyle: "solid" | "soft" | "outline";
  customerPortalTheme: "branded" | "minimal";
  staffWorkspaceTheme: "operational" | "dense";
}

export interface PageBlock {
  id: string;
  type: string;
  enabled: boolean;
  locked?: boolean;
  archived?: boolean;
  hiddenAt?: string;
  settings: Record<string, unknown>;
}

export interface PageSection {
  id: string;
  type: string;
  order: number;
  enabled: boolean;
  locked: boolean;
  safetyCritical: boolean;
  title: string;
  settings: Record<string, unknown>;
  defaultSettings?: Record<string, unknown>;
  hiddenAt?: string;
  hiddenReason?: string;
  restoredAt?: string;
  duplicatedFromSectionId?: string;
  blocks?: PageBlock[];
}

export interface PageTemplate {
  pageKey: BuilderPageKey;
  role: BuilderRole;
  layout: "simple" | "advanced" | "board" | "portal" | "builder";
  versionId: string;
  templateSchemaVersion: number;
  baseTemplateVersion: string;
  createdFromBaseVersion: string;
  lastMigratedAt?: string;
  branchOverrideAllowed?: boolean;
  sections: PageSection[];
}

export interface ComponentRegistryItem {
  type: string;
  label: string;
  description: string;
  allowedPages: BuilderPageKey[];
  allowedRoles: BuilderRole[];
  forbiddenRoles: BuilderRole[];
  requiredPermissions: string[];
  requiredFeatures: string[];
  requiredData: string[];
  removable: boolean;
  reorderable: boolean;
  duplicatable: boolean;
  safetyCritical: boolean;
  customerSafe: boolean;
  customerVisible: boolean;
  internalOnly: boolean;
  defaultSettings: Record<string, unknown>;
}

export interface RoleExperienceSetting {
  role: BuilderRole;
  mode: "simple" | "advanced";
  defaultLandingPage: BuilderPageKey;
  visibleNavigation: BuilderPageKey[];
  shortcuts: string[];
  density: BuilderDensity;
  actionButtonStyle: "text" | "icon" | "icon_text";
  labels: Record<string, string>;
}

export interface FeaturePolicy {
  key: string;
  enabled: boolean;
  value: BuilderPolicyValue;
  affectedRoles: BuilderRole[];
  affectedPages: BuilderPageKey[];
  dependencies: string[];
  safetyLocked: boolean;
}

export interface WorkflowPolicy {
  key: string;
  value: BuilderPolicyValue;
  affectedRoles: BuilderRole[];
  affectedPages: BuilderPageKey[];
  safetyLocked: boolean;
}

export interface FormFieldOption {
  label: string;
  value: string;
}

export interface FormFieldSchema {
  fieldId: string;
  key: string;
  label: string;
  type: BuilderFieldType;
  required: boolean;
  defaultValue?: string | number | boolean;
  placeholder?: string;
  helpText?: string;
  validationRules?: string[];
  core: boolean;
  customerVisible: boolean;
  rolesVisibleTo: BuilderRole[];
  categoryScope?: string[];
  searchable: boolean;
  reportableLater: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  options?: FormFieldOption[];
}

export interface FormSchema {
  key: string;
  label: string;
  target: "customer_intake" | "asset_registration" | "inspection" | "quick_service" | "computer_codes" | "part_request" | "return_unused" | "customer_decision_request";
  fields: FormFieldSchema[];
}

export interface MessageTemplate {
  key: string;
  label: string;
  channel: MessageTemplateChannel;
  content: string;
  defaultContent: string;
  requiredVariables: string[];
  allowedVariables: string[];
  customerVisible: boolean;
  safetyLocked: boolean;
  versionHistory: Array<{
    versionId: string;
    content: string;
    changedAt: string;
    changedBy: string;
    reason?: string;
  }>;
}

export interface BuilderVersion {
  id: string;
  status: BuilderVersionStatus;
  versionNumber: number;
  createdAt: string;
  publishedAt?: string;
  publishedBy?: string;
  reason?: string;
}

export interface BuilderConfiguration {
  tenantId: string;
  schemaVersion: number;
  baseTemplateVersion: string;
  lastMigratedAt?: string;
  activeVersionId: string;
  draftVersionId: string;
  versions: BuilderVersion[];
  designTokens: DesignTokens;
  pageTemplates: PageTemplate[];
  roleExperiences: RoleExperienceSetting[];
  featurePolicies: FeaturePolicy[];
  workflowPolicies: WorkflowPolicy[];
  formSchemas: FormSchema[];
  messageTemplates: MessageTemplate[];
  previewIdentities: BuilderPreviewIdentity[];
  configPrecedence: BuilderConfigPrecedenceStep[];
  ownerModel: BuilderOwnerModel;
}

export interface BuilderValidationIssue {
  id: string;
  severity: BuilderValidationSeverity;
  area: "theme" | "page" | "section" | "role" | "feature" | "workflow" | "form" | "message" | "access" | "publish";
  message: string;
  pageKey?: BuilderPageKey;
  sectionType?: string;
  policyKey?: string;
  templateKey?: string;
  blocking: boolean;
}

export interface BuilderValidationResult {
  valid: boolean;
  errors: BuilderValidationIssue[];
  warnings: BuilderValidationIssue[];
}

export interface BuilderPreviewRequest {
  pageKey: BuilderPageKey;
  asRole: BuilderRole;
  asIdentityId?: string;
  device?: BuilderDevicePreview;
  versionId?: string;
}

export interface BuilderPreviewResponse {
  configVersionId: string;
  page: PageTemplate;
  designTokens: DesignTokens;
  roleExperience?: RoleExperienceSetting;
  previewIdentity?: BuilderPreviewIdentity;
  device: BuilderDevicePreview;
  previewMode: true;
  readonlyActions: string[];
  scenarioFixtureKeys: string[];
  scenarioFixtures: Record<string, unknown>;
  validation: BuilderValidationResult;
}

export interface BuilderHomeDto {
  activeVersionId: string;
  draftVersionId: string;
  lastPublishedAt?: string;
  publishedVersionCount: number;
  draftChangeCount: number;
  pagesCustomized: number;
  rolesAffected: BuilderRole[];
  validation: BuilderValidationResult;
  impact: BuilderImpactPreview;
}

export interface BuilderDraftUpdateDto {
  designTokens?: Partial<DesignTokens>;
  pageTemplates?: PageTemplate[];
  roleExperiences?: RoleExperienceSetting[];
  featurePolicies?: FeaturePolicy[];
  workflowPolicies?: WorkflowPolicy[];
  formSchemas?: FormSchema[];
  messageTemplates?: MessageTemplate[];
  reason?: string;
}

export interface BuilderPublishResult {
  activeVersionId: string;
  publishedAt: string;
  validation: BuilderValidationResult;
  impact: BuilderImpactPreview;
}

export interface BuilderRollbackResult {
  activeVersionId: string;
  rolledBackToVersionId: string;
  validation: BuilderValidationResult;
}

export interface BuilderPreviewIdentity {
  id: string;
  displayName: string;
  role: BuilderRole;
  branchName?: string;
  scenarioFixtureKeys: string[];
}

export interface BuilderConfigPrecedenceStep {
  order: number;
  key: string;
  label: string;
  canBeOverriddenByBuilder: boolean;
}

export interface BuilderOwnerModel {
  tenantOwnerRole: "tenant_owner";
  tenantAdminRole: "tenant_admin";
  ownerOnlyFutureActions: string[];
}

export interface BuilderPreset {
  id: string;
  label: string;
  category: BuilderPresetCategory;
  description: string;
  previewPage: BuilderPageKey;
  recommendedFor: string[];
  riskLevel: BuilderRiskLevel;
}

export interface BuilderImpactPreview {
  affectedPages: BuilderPageKey[];
  affectedRoles: BuilderRole[];
  affectedUsersCount: number;
  affectedBranches: string[];
  affectedServiceTypes: string[];
  customerPortalBehavior: string[];
  validationIssues: BuilderValidationIssue[];
  riskLevel: BuilderRiskLevel;
  riskReasons: string[];
}
